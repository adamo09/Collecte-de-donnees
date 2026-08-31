"""CP03 — Marinage : événements engins, rotations de dumpers, pesage (ch. 8)."""

import uuid
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.dependances import (
    ExigeSuperviseur,
    SessionBD,
    UtilisateurConnecte,
    verifier_acces_site,
)
from app.models.collecte import CampagnePesage, EvenementEngin, RotationDumper
from app.models.enums import (
    EVENEMENTS_ENGIN_AVEC_CAUSE,
    NatureQuantite,
    StatutValidation,
    TypeEvenementEngin,
)
from app.models.referentiels import Engin
from app.schemas.collecte import (
    CampagnePesageEntree,
    CampagnePesageSortie,
    EvenementEnginEntree,
    EvenementEnginSortie,
    RotationDumperEntree,
    RotationDumperSortie,
)
from app.schemas.communs import Page
from app.services.collecte import enregistrer

routeur = APIRouter(prefix="/marinage", tags=["CP03 — Marinage"])


def _compter(session: Session, requete) -> int:
    return session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()


# =====================================================================
# Événements engins (ch. 8.1)
# =====================================================================


@routeur.post(
    "/evenements-engin",
    response_model=EvenementEnginSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer un événement engin",
)
def declarer_evenement_engin(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: EvenementEnginEntree
) -> EvenementEngin:
    """Journalise un événement : début, arrêt, panne, reprise, ravitaillement…

    Aucune durée n'est saisie : les temps de marche et d'arrêt se déduisent
    par agrégation de ce journal (principe 2 du ch. 2).
    """
    verifier_acces_site(utilisateur, demande.site_id)

    # Un arrêt sans motif codifié n'est pas exploitable statistiquement.
    if (
        demande.type_evenement in EVENEMENTS_ENGIN_AVEC_CAUSE
        and demande.cause_code is None
        and not demande.cause
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"Un événement « {demande.type_evenement.value} » doit porter un "
                "motif codifié (cause_code). Le motif libre reste possible mais "
                "doit rester l'exception."
            ),
        )

    evenement, _ = enregistrer(session, EvenementEngin, demande, utilisateur)
    return evenement


@routeur.get(
    "/evenements-engin",
    response_model=Page[EvenementEnginSortie],
    summary="Rechercher des événements engins",
)
def lister_evenements_engin(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    engin_id: uuid.UUID | None = None,
    type_evenement: TypeEvenementEngin | None = None,
    cause_code: str | None = None,
    centre_cout_reel: str | None = None,
    du: datetime | None = None,
    au: datetime | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[EvenementEnginSortie]:
    requete = select(EvenementEngin)
    if site_id is not None:
        verifier_acces_site(utilisateur, site_id)
        requete = requete.where(EvenementEngin.site_id == site_id)
    if engin_id is not None:
        requete = requete.where(EvenementEngin.engin_id == engin_id)
    if type_evenement is not None:
        requete = requete.where(EvenementEngin.type_evenement == type_evenement)
    if cause_code is not None:
        requete = requete.where(EvenementEngin.cause_code == cause_code)
    if centre_cout_reel is not None:
        requete = requete.where(EvenementEngin.centre_cout_reel == centre_cout_reel)
    if du is not None:
        requete = requete.where(EvenementEngin.horodatage >= du)
    if au is not None:
        requete = requete.where(EvenementEngin.horodatage <= au)
    if statut is not None:
        requete = requete.where(EvenementEngin.statut == statut)

    total = _compter(session, requete)
    lignes = session.execute(
        requete.order_by(EvenementEngin.horodatage.desc()).limit(limite).offset(decalage)
    ).scalars()
    return Page[EvenementEnginSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[EvenementEnginSortie.model_validate(e) for e in lignes],
    )


# =====================================================================
# Rotations de dumpers (ch. 8.2)
# =====================================================================


@routeur.post(
    "/rotations",
    response_model=RotationDumperSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer une rotation de dumper",
)
def enregistrer_rotation(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: RotationDumperEntree
) -> RotationDumper:
    """Enregistre un passage au point de déversement.

    En l'absence de pesée, la quantité est estimée à partir de la capacité
    nominale du dumper, issue de la campagne de pesage. Les deux valeurs ne
    sont jamais confondues (principe 3 du ch. 2).
    """
    verifier_acces_site(utilisateur, demande.site_id)

    complements: dict = {}
    if (
        demande.nature_quantite == NatureQuantite.ESTIMATION
        and demande.quantite_estimee_t is None
    ):
        # Ce cas est déjà refusé par le schéma ; conservé pour le jour où
        # l'estimation serait rendue automatique.
        dumper = session.get(Engin, demande.dumper_id)
        if dumper is None or dumper.capacite_nominale is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "Aucune capacité nominale connue pour ce dumper : réaliser "
                    "une campagne de pesage ou saisir la quantité."
                ),
            )
        complements["quantite_estimee_t"] = dumper.capacite_nominale

    rotation, _ = enregistrer(
        session, RotationDumper, demande, utilisateur, champs_supplementaires=complements
    )
    return rotation


@routeur.get(
    "/rotations",
    response_model=Page[RotationDumperSortie],
    summary="Rechercher des rotations",
)
def lister_rotations(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    dumper_id: uuid.UUID | None = None,
    du: datetime | None = None,
    au: datetime | None = None,
    nature_quantite: NatureQuantite | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[RotationDumperSortie]:
    requete = select(RotationDumper)
    if site_id is not None:
        verifier_acces_site(utilisateur, site_id)
        requete = requete.where(RotationDumper.site_id == site_id)
    if dumper_id is not None:
        requete = requete.where(RotationDumper.dumper_id == dumper_id)
    if du is not None:
        requete = requete.where(RotationDumper.horodatage >= du)
    if au is not None:
        requete = requete.where(RotationDumper.horodatage <= au)
    if nature_quantite is not None:
        requete = requete.where(RotationDumper.nature_quantite == nature_quantite)
    if statut is not None:
        requete = requete.where(RotationDumper.statut == statut)

    total = _compter(session, requete)
    lignes = session.execute(
        requete.order_by(RotationDumper.horodatage.desc()).limit(limite).offset(decalage)
    ).scalars()
    return Page[RotationDumperSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[RotationDumperSortie.model_validate(r) for r in lignes],
    )


@routeur.get(
    "/rotations/synthese-journaliere",
    summary="Rotations par dumper et par jour",
)
def synthese_rotations(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int,
    jour: date,
) -> list[dict]:
    """Nombre de rotations et tonnages du jour, pesé et estimé séparés.

    Aucun total agrégeant les deux n'est produit : additionner un tonnage
    pesé et un tonnage estimé ôterait toute crédibilité au coût à la tonne
    calculé en aval.
    """
    verifier_acces_site(utilisateur, site_id)

    lignes = session.execute(
        select(
            Engin.numero_parc,
            func.count(RotationDumper.id).label("nb_rotations"),
            func.sum(RotationDumper.poids_reel_t).label("tonnage_pese"),
            func.sum(RotationDumper.quantite_estimee_t).label("tonnage_estime"),
            func.min(RotationDumper.horodatage).label("premier_passage"),
            func.max(RotationDumper.horodatage).label("dernier_passage"),
        )
        .join(Engin, Engin.id == RotationDumper.dumper_id)
        .where(
            RotationDumper.site_id == site_id,
            func.date(RotationDumper.horodatage) == jour,
        )
        .group_by(Engin.numero_parc)
        .order_by(Engin.numero_parc)
    ).all()

    return [
        {
            "dumper": ligne.numero_parc,
            "nb_rotations": ligne.nb_rotations,
            "tonnage_pese_t": float(ligne.tonnage_pese) if ligne.tonnage_pese else None,
            "tonnage_estime_t": float(ligne.tonnage_estime) if ligne.tonnage_estime else None,
            "premier_passage": ligne.premier_passage,
            "dernier_passage": ligne.dernier_passage,
        }
        for ligne in lignes
    ]


# =====================================================================
# Campagne de pesage (ch. 8.3)
# =====================================================================


@routeur.post(
    "/campagnes-pesage",
    response_model=CampagnePesageSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer une campagne de pesage",
)
def enregistrer_campagne(
    session: SessionBD, utilisateur: ExigeSuperviseur, demande: CampagnePesageEntree
) -> CampagnePesage:
    """Consigne les pesées à vide et en charge qui fixeront la capacité de référence."""
    campagne, _cree = enregistrer(session, CampagnePesage, demande, utilisateur)
    return campagne


@routeur.post(
    "/campagnes-pesage/{campagne_id}/appliquer",
    summary="Reporter la capacité retenue sur la fiche engin",
)
def appliquer_capacite(
    session: SessionBD, utilisateur: ExigeSuperviseur, campagne_id: uuid.UUID
) -> dict:
    """Reporte la capacité retenue d'une campagne validée sur l'engin.

    Le report est explicite et non automatique : c'est la capacité de
    référence qui servira à estimer tous les tonnages non pesés du dumper,
    elle mérite une décision.
    """
    campagne = session.get(CampagnePesage, campagne_id)
    if campagne is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Campagne inconnue."
        )
    if campagne.capacite_retenue_t is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Cette campagne ne porte aucune capacité retenue.",
        )
    if StatutValidation(campagne.statut) != StatutValidation.VALIDEE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Seule une campagne validée peut alimenter la capacité "
                "nominale d'un engin."
            ),
        )

    engin = session.get(Engin, campagne.engin_id)
    if engin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engin inconnu.")

    ancienne = engin.capacite_nominale
    engin.capacite_nominale = campagne.capacite_retenue_t
    engin.unite_capacite = engin.unite_capacite or "t"
    session.commit()

    return {
        "engin": engin.numero_parc,
        "ancienne_capacite_t": float(ancienne) if ancienne is not None else None,
        "nouvelle_capacite_t": float(campagne.capacite_retenue_t),
        "message": (
            "Les rotations estimées enregistrées avant ce report conservent "
            "l'ancienne valeur : elles ne sont pas recalculées."
        ),
    }
