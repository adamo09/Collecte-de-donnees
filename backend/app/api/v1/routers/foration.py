"""CP01 — Foration (ch. 6).

Le suivi porte sur chaque trou individuellement, selon un cycle en deux
scans : le premier crée l'enregistrement lorsque la foreuse est positionnée
et le taillant posé, le second le clôture en fin de forage. Entre les deux,
le trou reste ouvert dans le système.
"""

import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.config import parametres
from app.core.dependances import SessionBD, UtilisateurConnecte, verifier_acces_site
from app.models.collecte import TrouForage
from app.models.enums import StatutValidation
from app.schemas.collecte import (
    TrouForagePremierScan,
    TrouForageSecondScan,
    TrouForageSortie,
    TrouNonCloture,
)
from app.schemas.communs import Page
from app.services.reference import generer_reference_trou

routeur = APIRouter(prefix="/foration", tags=["CP01 — Foration"])


@routeur.post(
    "/trous",
    response_model=TrouForageSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Premier scan — ouvrir un trou",
)
def premier_scan(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: TrouForagePremierScan
) -> TrouForage:
    """Ouvre un trou de forage.

    L'identifiant vient du terminal : renvoyer deux fois le même premier scan
    ne crée pas de doublon, il retourne le trou déjà ouvert.
    """
    verifier_acces_site(utilisateur, demande.site_id)

    existant = session.get(TrouForage, demande.id)
    if existant is not None:
        return existant

    donnees = demande.model_dump()
    donnees.pop("id")
    if donnees.get("saisi_le") is None:
        donnees["saisi_le"] = datetime.now(UTC)

    trou = TrouForage(
        id=demande.id,
        auteur_id=utilisateur.id,
        recu_le=datetime.now(UTC),
        statut=StatutValidation.BRUTE,
        **donnees,
    )
    session.add(trou)
    trou.reference = generer_reference_trou(session, trou)
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Trou refusé par la base : {erreur.orig}",
        ) from erreur
    session.refresh(trou)
    return trou


@routeur.post(
    "/trous/{trou_id}/cloture",
    response_model=TrouForageSortie,
    summary="Second scan — clôturer un trou",
)
def second_scan(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    trou_id: uuid.UUID,
    demande: TrouForageSecondScan,
) -> TrouForage:
    """Clôture un trou ouvert.

    Un trou déjà clôturé n'est pas reclôturé : la correction d'une donnée
    existante passe par le workflow de validation, qui exige un motif.
    """
    trou = session.get(TrouForage, trou_id)
    if trou is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trou inconnu. Le premier scan n'a peut-être pas été synchronisé.",
        )
    verifier_acces_site(utilisateur, trou.site_id)

    if trou.heure_fin is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Ce trou ({trou.reference}) est déjà clôturé depuis "
                f"{trou.heure_fin:%d/%m/%Y %H:%M}. Toute correction passe par "
                "le workflow de validation."
            ),
        )
    if demande.heure_fin < trou.heure_debut:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="L'heure de fin ne peut pas précéder l'heure de début du forage.",
        )
    if (
        demande.compteur_fin is not None
        and trou.compteur_debut is not None
        and demande.compteur_fin < trou.compteur_debut
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Le compteur de fin est inférieur au compteur relevé au premier scan.",
        )

    for champ in (
        "heure_fin",
        "compteur_fin",
        "metres_lineaires",
        "numero_taillant",
        "numero_tige",
    ):
        valeur = getattr(demande, champ)
        if valeur is not None:
            setattr(trou, champ, valeur)
    if demande.commentaire:
        trou.commentaire = demande.commentaire
    if demande.piece_jointe_url:
        trou.piece_jointe_url = demande.piece_jointe_url
    trou.cloture_le = datetime.now(UTC)

    session.commit()
    session.refresh(trou)
    return trou


@routeur.get(
    "/trous", response_model=Page[TrouForageSortie], summary="Rechercher des trous"
)
def lister_trous(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    foreuse_id: uuid.UUID | None = None,
    tir_id: uuid.UUID | None = None,
    du: date | None = Query(default=None, description="Date de foration minimale"),
    au: date | None = Query(default=None, description="Date de foration maximale"),
    statut: StatutValidation | None = None,
    non_clotures_seulement: bool = False,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[TrouForageSortie]:
    requete = select(TrouForage)
    if site_id is not None:
        verifier_acces_site(utilisateur, site_id)
        requete = requete.where(TrouForage.site_id == site_id)
    elif utilisateur.site_id is not None and utilisateur.role.value in {
        "agent_terrain",
        "superviseur",
    }:
        requete = requete.where(TrouForage.site_id == utilisateur.site_id)

    if foreuse_id is not None:
        requete = requete.where(TrouForage.foreuse_id == foreuse_id)
    if tir_id is not None:
        requete = requete.where(TrouForage.tir_id == tir_id)
    if du is not None:
        requete = requete.where(TrouForage.date_foration >= du)
    if au is not None:
        requete = requete.where(TrouForage.date_foration <= au)
    if statut is not None:
        requete = requete.where(TrouForage.statut == statut)
    if non_clotures_seulement:
        requete = requete.where(TrouForage.heure_fin.is_(None))

    total = session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()
    lignes = session.execute(
        requete.order_by(TrouForage.heure_debut.desc()).limit(limite).offset(decalage)
    ).scalars()

    return Page[TrouForageSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[TrouForageSortie.model_validate(t) for t in lignes],
    )


@routeur.get(
    "/trous/non-clotures",
    response_model=list[TrouNonCloture],
    summary="Trous restés ouverts — écran de contrôle quotidien",
)
def trous_non_clotures(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    au_dela_de_heures: float | None = Query(
        default=None,
        description=(
            "Ne retenir que les trous ouverts depuis plus de N heures. "
            "Par défaut, le seuil d'alerte configuré."
        ),
    ),
) -> list[TrouNonCloture]:
    """Anomalie la plus probable du module foration (ch. 6).

    L'opérateur oublie de clôturer, ou son terminal se décharge. Cet écran
    est à surveiller dès le premier jour du pilote.
    """
    seuil = (
        au_dela_de_heures
        if au_dela_de_heures is not None
        else parametres.delai_alerte_trou_non_cloture_heures
    )
    conditions = ["anciennete_heures >= :seuil"]
    parametres_sql: dict = {"seuil": seuil}

    if site_id is not None:
        verifier_acces_site(utilisateur, site_id)
        conditions.append("site_id = :site_id")
        parametres_sql["site_id"] = site_id
    elif utilisateur.site_id is not None and utilisateur.role.value in {
        "agent_terrain",
        "superviseur",
    }:
        conditions.append("site_id = :site_id")
        parametres_sql["site_id"] = utilisateur.site_id

    lignes = session.execute(
        text(
            "SELECT id, reference, site, foreuse, operateur_matricule, date_foration, "
            "       heure_debut, anciennete_heures, statut "
            "FROM v_pilotage_trous_non_clotures "
            f"WHERE {' AND '.join(conditions)} "
            "ORDER BY anciennete_heures DESC"
        ),
        parametres_sql,
    ).mappings()
    return [TrouNonCloture.model_validate(dict(ligne)) for ligne in lignes]


@routeur.get(
    "/trous/{trou_id}", response_model=TrouForageSortie, summary="Consulter un trou"
)
def consulter_trou(
    session: SessionBD, utilisateur: UtilisateurConnecte, trou_id: uuid.UUID
) -> TrouForage:
    trou = session.get(TrouForage, trou_id)
    if trou is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trou inconnu.")
    verifier_acces_site(utilisateur, trou.site_id)
    return trou
