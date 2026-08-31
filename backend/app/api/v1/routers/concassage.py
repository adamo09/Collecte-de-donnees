"""Concassage : événements équipements et sorties de pièces (ch. 9)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, text

from app.core.dependances import SessionBD, UtilisateurConnecte, verifier_acces_site
from app.models.collecte import EvenementEquipement, SortiePiece
from app.models.enums import (
    EVENEMENTS_EQUIPEMENT_AVEC_CAUSE,
    StatutValidation,
    TypeEvenementEquipement,
)
from app.schemas.collecte import (
    EvenementEquipementEntree,
    EvenementEquipementSortie,
    SortiePieceEntree,
    SortiePieceSortie,
)
from app.schemas.communs import Page
from app.services.collecte import enregistrer

routeur = APIRouter(prefix="/concassage", tags=["Concassage"])


@routeur.post(
    "/evenements",
    response_model=EvenementEquipementSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer un événement équipement",
)
def declarer_evenement(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    demande: EvenementEquipementEntree,
) -> EvenementEquipement:
    """Le principe de suivi est identique pour tous les niveaux.

    La distinction entre marche à charge et marche à vide est indispensable
    au calcul ultérieur du coût énergétique à la tonne (ch. 9).
    """
    verifier_acces_site(utilisateur, demande.site_id)

    if (
        demande.type_evenement in EVENEMENTS_EQUIPEMENT_AVEC_CAUSE
        and demande.cause_code is None
        and not demande.cause
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"Un événement « {demande.type_evenement.value} » doit porter un "
                "motif codifié (cause_code)."
            ),
        )
    if (
        demande.type_evenement == TypeEvenementEquipement.MARCHE_A_CHARGE
        and demande.production_t is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Une marche à charge sans tonnage traité ne permet aucun calcul "
                "de coût à la tonne : renseigner production_t."
            ),
        )

    evenement, _ = enregistrer(session, EvenementEquipement, demande, utilisateur)
    return evenement


@routeur.get(
    "/evenements",
    response_model=Page[EvenementEquipementSortie],
    summary="Rechercher des événements équipements",
)
def lister_evenements(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    equipement_id: uuid.UUID | None = None,
    type_evenement: TypeEvenementEquipement | None = None,
    du: datetime | None = None,
    au: datetime | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[EvenementEquipementSortie]:
    requete = select(EvenementEquipement)
    if site_id is not None:
        verifier_acces_site(utilisateur, site_id)
        requete = requete.where(EvenementEquipement.site_id == site_id)
    if equipement_id is not None:
        requete = requete.where(EvenementEquipement.equipement_id == equipement_id)
    if type_evenement is not None:
        requete = requete.where(EvenementEquipement.type_evenement == type_evenement)
    if du is not None:
        requete = requete.where(EvenementEquipement.heure_debut >= du)
    if au is not None:
        requete = requete.where(EvenementEquipement.heure_debut <= au)
    if statut is not None:
        requete = requete.where(EvenementEquipement.statut == statut)

    total = session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()
    lignes = session.execute(
        requete.order_by(EvenementEquipement.heure_debut.desc())
        .limit(limite)
        .offset(decalage)
    ).scalars()
    return Page[EvenementEquipementSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[EvenementEquipementSortie.model_validate(e) for e in lignes],
    )


@routeur.post(
    "/sorties-piece",
    response_model=SortiePieceSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer une sortie magasin",
)
def enregistrer_sortie(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: SortiePieceEntree
) -> SortiePiece:
    """Le rattachement au niveau, à la ligne et au site n'est pas saisi.

    Il se déduit de l'équipement concerné : une seule information à fournir,
    aucune incohérence possible (ch. 9.1).
    """
    sortie, _ = enregistrer(session, SortiePiece, demande, utilisateur)
    return sortie


@routeur.get(
    "/sorties-piece",
    response_model=Page[SortiePieceSortie],
    summary="Rechercher des sorties magasin",
)
def lister_sorties(
    session: SessionBD,
    _: UtilisateurConnecte,
    equipement_id: uuid.UUID | None = None,
    engin_id: uuid.UUID | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[SortiePieceSortie]:
    requete = select(SortiePiece)
    if equipement_id is not None:
        requete = requete.where(SortiePiece.equipement_id == equipement_id)
    if engin_id is not None:
        requete = requete.where(SortiePiece.engin_id == engin_id)
    if statut is not None:
        requete = requete.where(SortiePiece.statut == statut)

    total = session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()
    lignes = session.execute(
        requete.order_by(SortiePiece.date_sortie.desc()).limit(limite).offset(decalage)
    ).scalars()
    return Page[SortiePieceSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[SortiePieceSortie.model_validate(s) for s in lignes],
    )
