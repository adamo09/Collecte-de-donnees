"""Synchronisation hors ligne : ingestion des lots et rafraîchissement des
référentiels (ch. 12)."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.config import parametres
from app.core.dependances import SessionBD, UtilisateurConnecte, verifier_acces_site
from app.models.collecte import Tir
from app.models.referentiels import (
    CauseArret,
    CentreDeCout,
    Engin,
    EquipementConcassage,
    Personnel,
    Produit,
    Site,
)
from app.models.tracabilite import LotSynchronisation, VersionReferentiel
from app.schemas.synchronisation import (
    EtatReferentiels,
    LotSynchronisationEntree,
    LotSynchronisationSortie,
    ParametragePoste,
    VersionReferentielSortie,
)
from app.services.synchronisation import LotTropVolumineux, ingerer_lot

routeur = APIRouter(prefix="/synchronisation", tags=["Synchronisation"])


@routeur.post(
    "/lots",
    response_model=LotSynchronisationSortie,
    summary="Transmettre un lot de données collectées",
)
def transmettre_lot(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    lot: LotSynchronisationEntree,
) -> LotSynchronisationSortie:
    """Ingère un lot produit hors ligne par un terminal.

    L'opération est idempotente : renvoyer un lot déjà reçu retourne la
    réponse d'origine sans rien réinsérer. Un enregistrement invalide n'ôte
    rien aux autres — le terminal reçoit le sort de chacun d'eux et ne
    conserve dans sa file que ce qui a réellement été rejeté.
    """
    try:
        return ingerer_lot(
            session, lot, utilisateur, parametres.taille_max_lot_synchronisation
        )
    except LotTropVolumineux as erreur:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=str(erreur)
        ) from erreur


@routeur.get(
    "/lots/{lot_id}",
    response_model=LotSynchronisationSortie,
    summary="Consulter le sort d'un lot",
)
def consulter_lot(
    session: SessionBD, utilisateur: UtilisateurConnecte, lot_id: uuid.UUID
) -> LotSynchronisationSortie:
    """Permet à un terminal de vérifier qu'un lot est bien arrivé.

    C'est l'outil de diagnostic prévu au ch. 12 : sans lui, l'absence d'une
    donnée reste indiscernable entre un oubli de l'opérateur, un terminal en
    panne et un échec de transmission.
    """
    from app.services.synchronisation import _rejouer_reponse

    lot = session.get(LotSynchronisation, lot_id)
    if lot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ce lot n'a jamais été reçu par le serveur.",
        )
    return _rejouer_reponse(session, lot)


@routeur.get(
    "/versions",
    response_model=EtatReferentiels,
    summary="Versions courantes des référentiels",
)
def versions_referentiels(session: SessionBD, _: UtilisateurConnecte) -> EtatReferentiels:
    """Le terminal compare ces numéros à sa copie locale.

    Un appel de quelques octets remplace le téléchargement complet des
    référentiels à chaque démarrage.
    """
    lignes = session.execute(
        select(VersionReferentiel).order_by(VersionReferentiel.nom_referentiel)
    ).scalars()
    return EtatReferentiels(
        versions=[
            VersionReferentielSortie.model_validate(ligne, from_attributes=True)
            for ligne in lignes
        ]
    )


@routeur.get(
    "/parametrage",
    response_model=ParametragePoste,
    summary="Tout ce qu'un terminal doit connaître pour travailler hors ligne",
)
def parametrage_poste(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = Query(
        default=None, description="Site visé ; par défaut, celui du compte."
    ),
) -> ParametragePoste:
    """Renvoie en un appel le référentiel filtré sur un site.

    Le filtrage n'est pas un détail d'optimisation : une grille de boutons
    doit porter la dizaine de dumpers du site, pas les cent du parc (ch. 8.2).
    """
    site_vise = site_id if site_id is not None else utilisateur.site_id
    if site_vise is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun site précisé et aucun site rattaché à ce compte.",
        )
    verifier_acces_site(utilisateur, site_vise)

    site = session.get(Site, site_vise)
    if site is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Site inconnu."
        )

    engins = session.execute(
        select(Engin).where(Engin.site_id == site_vise, Engin.actif).order_by(Engin.numero_parc)
    ).scalars()
    equipements = session.execute(
        select(EquipementConcassage)
        .where(EquipementConcassage.site_id == site_vise, EquipementConcassage.actif)
        .order_by(EquipementConcassage.designation)
    ).scalars()
    personnel = session.execute(
        select(Personnel).where(Personnel.site_id == site_vise, Personnel.actif)
        .order_by(Personnel.nom_prenoms)
    ).scalars()
    produits = session.execute(
        select(Produit).where(Produit.actif).order_by(Produit.code)
    ).scalars()
    causes = session.execute(
        select(CauseArret).where(CauseArret.actif).order_by(CauseArret.code)
    ).scalars()
    centres = session.execute(
        select(CentreDeCout).where(CentreDeCout.actif).order_by(CentreDeCout.code)
    ).scalars()
    # Tirs récents du site : ce sont eux auxquels un trou peut être rattaché.
    tirs = session.execute(
        select(Tir)
        .where(Tir.site_id == site_vise)
        .order_by(Tir.date_tir.desc().nullslast())
        .limit(50)
    ).scalars()
    versions = session.execute(
        select(VersionReferentiel).order_by(VersionReferentiel.nom_referentiel)
    ).scalars()

    return ParametragePoste(
        site_id=site.id,
        site_code=site.code,
        versions=[
            VersionReferentielSortie.model_validate(v, from_attributes=True) for v in versions
        ],
        engins=[
            {
                "id": str(e.id),
                "numero_parc": e.numero_parc,
                "matricule": e.matricule,
                "famille": e.famille.value if hasattr(e.famille, "value") else e.famille,
                "capacite_nominale": float(e.capacite_nominale) if e.capacite_nominale else None,
                "unite_capacite": e.unite_capacite,
                "unite_compteur": e.unite_compteur,
                "compteur_actuel": float(e.compteur_actuel) if e.compteur_actuel else None,
                "centre_cout_reference": e.centre_cout_reference,
                "qr_token": e.qr_token,
            }
            for e in engins
        ],
        equipements=[
            {
                "id": str(q.id),
                "designation": q.designation,
                "type": q.type.value if hasattr(q.type, "value") else q.type,
                "ligne": q.ligne,
                "niveau": (q.niveau.value if hasattr(q.niveau, "value") else q.niveau)
                if q.niveau
                else None,
                "qr_token": q.qr_token,
            }
            for q in equipements
        ],
        personnel=[
            {"matricule": p.matricule, "nom_prenoms": p.nom_prenoms, "fonction": p.fonction}
            for p in personnel
        ],
        produits=[
            {
                "id": str(pr.id),
                "code": pr.code,
                "libelle": pr.libelle,
                "granulometrie": pr.granulometrie,
            }
            for pr in produits
        ],
        causes_arret=[
            {"code": c.code, "libelle": c.libelle, "categorie": c.categorie} for c in causes
        ],
        centres_de_cout=[{"code": c.code, "libelle": c.libelle} for c in centres],
        tirs_ouverts=[
            {
                "id": str(t.id),
                "numero_t": t.numero_t,
                "date_tir": t.date_tir.isoformat() if t.date_tir else None,
            }
            for t in tirs
        ],
    )
