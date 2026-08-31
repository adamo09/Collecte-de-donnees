"""Coûts et affectation du parc (ch. 11).

Ces deux tables collectent les éléments que le gestionnaire externe
utilisera pour construire les coûts par famille et par engin. Elles ne
portent aucune règle de calcul : le système enregistre des montants et des
durées, il ne les impute pas.
"""

import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, text

from app.core.dependances import ExigeSuperviseur, SessionBD, UtilisateurConnecte
from app.models.collecte import AffectationReelleEngin, ChargeEngin
from app.models.enums import NatureCharge, StatutValidation
from app.models.referentiels import Engin
from app.schemas.collecte import (
    CATEGORIES_CHARGE,
    AffectationReelleEntree,
    AffectationReelleSortie,
    ChargeEnginEntree,
    ChargeEnginSortie,
)
from app.schemas.communs import Page
from app.services.collecte import enregistrer

routeur = APIRouter(prefix="/parc", tags=["Parc — coûts et affectations"])


@routeur.get("/categories-charge", summary="Catégories de charges proposées")
def categories_charge() -> dict:
    """Liste indicative alimentant les listes déroulantes.

    Elle n'est pas contraignante : une catégorie nouvelle est acceptée, mais
    elle ne sera pas regroupée avec les autres dans les exports.
    """
    return {"categories": list(CATEGORIES_CHARGE)}


@routeur.post(
    "/charges",
    response_model=ChargeEnginSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer une charge engin",
)
def enregistrer_charge(
    session: SessionBD, utilisateur: ExigeSuperviseur, demande: ChargeEnginEntree
) -> ChargeEngin:
    """Enregistre une charge administrative ou de fonctionnement.

    Pour une charge annuelle, renseigner periode_debut et periode_fin : c'est
    ce qui permettra au gestionnaire d'étaler une assurance sur les mois
    concernés plutôt que sur le seul mois de son paiement.
    """
    if session.get(Engin, demande.engin_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engin inconnu.")
    charge, _ = enregistrer(session, ChargeEngin, demande, utilisateur)
    return charge


@routeur.get(
    "/charges", response_model=Page[ChargeEnginSortie], summary="Rechercher des charges"
)
def lister_charges(
    session: SessionBD,
    _: UtilisateurConnecte,
    engin_id: uuid.UUID | None = None,
    nature: NatureCharge | None = None,
    categorie: str | None = None,
    du: date | None = None,
    au: date | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[ChargeEnginSortie]:
    requete = select(ChargeEngin)
    if engin_id is not None:
        requete = requete.where(ChargeEngin.engin_id == engin_id)
    if nature is not None:
        requete = requete.where(ChargeEngin.nature == nature)
    if categorie is not None:
        requete = requete.where(ChargeEngin.categorie == categorie.strip().lower())
    if du is not None:
        requete = requete.where(ChargeEngin.date_charge >= du)
    if au is not None:
        requete = requete.where(ChargeEngin.date_charge <= au)
    if statut is not None:
        requete = requete.where(ChargeEngin.statut == statut)

    total = session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()
    lignes = session.execute(
        requete.order_by(ChargeEngin.date_charge.desc()).limit(limite).offset(decalage)
    ).scalars()
    return Page[ChargeEnginSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[ChargeEnginSortie.model_validate(c) for c in lignes],
    )


@routeur.post(
    "/affectations-reelles",
    response_model=AffectationReelleSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer l'activité réellement réalisée par un engin",
)
def declarer_affectation(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: AffectationReelleEntree
) -> AffectationReelleEngin:
    """Distingue l'activité réelle de l'affectation analytique de référence.

    Un dumper habituellement affecté au marinage peut intervenir
    ponctuellement en stockage/vente ; son coût doit alors suivre l'activité
    réelle, pas la fiche engin (ch. 11.2).
    """
    if session.get(Engin, demande.engin_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engin inconnu.")
    affectation, _ = enregistrer(session, AffectationReelleEngin, demande, utilisateur)
    return affectation


@routeur.get(
    "/affectations-reelles",
    response_model=Page[AffectationReelleSortie],
    summary="Rechercher des affectations réelles",
)
def lister_affectations(
    session: SessionBD,
    _: UtilisateurConnecte,
    engin_id: uuid.UUID | None = None,
    centre_cout_reel: str | None = None,
    du: date | None = None,
    au: date | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[AffectationReelleSortie]:
    requete = select(AffectationReelleEngin)
    if engin_id is not None:
        requete = requete.where(AffectationReelleEngin.engin_id == engin_id)
    if centre_cout_reel is not None:
        requete = requete.where(
            AffectationReelleEngin.centre_cout_reel == centre_cout_reel
        )
    if du is not None:
        requete = requete.where(AffectationReelleEngin.date_activite >= du)
    if au is not None:
        requete = requete.where(AffectationReelleEngin.date_activite <= au)
    if statut is not None:
        requete = requete.where(AffectationReelleEngin.statut == statut)

    total = session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()
    lignes = session.execute(
        requete.order_by(AffectationReelleEngin.date_activite.desc())
        .limit(limite)
        .offset(decalage)
    ).scalars()
    return Page[AffectationReelleSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[AffectationReelleSortie.model_validate(a) for a in lignes],
    )
