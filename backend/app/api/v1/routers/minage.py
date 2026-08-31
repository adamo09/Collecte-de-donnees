"""CP02 — Minage, prestation externe (ch. 7).

Le système se limite à la traçabilité du document et au rattachement du
coût au tir concerné. La saisie manuelle avec photo jointe prend cinq
minutes par facture et ne présente aucun risque d'erreur d'extraction :
l'OCR reste une évolution possible, pas une exigence de V1.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Query, status
from sqlalchemy import select, text

from app.core.dependances import SessionBD, UtilisateurConnecte, verifier_acces_site
from app.models.collecte import MinageEnginMobilise, PrestationMinage
from app.models.enums import StatutValidation
from app.schemas.collecte import PrestationMinageEntree, PrestationMinageSortie
from app.schemas.communs import Page
from app.services.collecte import enregistrer

routeur = APIRouter(prefix="/minage", tags=["CP02 — Minage"])


@routeur.post(
    "/prestations",
    response_model=PrestationMinageSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer une prestation de minage",
)
def enregistrer_prestation(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: PrestationMinageEntree
) -> PrestationMinage:
    verifier_acces_site(utilisateur, demande.site_id)

    engins = demande.engins_mobilises
    donnees = demande.model_copy(update={"engins_mobilises": []})
    prestation, cree = enregistrer(session, PrestationMinage, donnees, utilisateur)

    if cree and engins:
        for engin in engins:
            session.add(
                MinageEnginMobilise(
                    prestation_id=prestation.id,
                    engin_id=engin.engin_id,
                    duree_heures=engin.duree_heures,
                )
            )
        session.commit()
        session.refresh(prestation)
    return prestation


@routeur.get(
    "/prestations",
    response_model=Page[PrestationMinageSortie],
    summary="Rechercher des prestations de minage",
)
def lister_prestations(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    tir_id: uuid.UUID | None = None,
    du: date | None = None,
    au: date | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=500),
    decalage: int = Query(default=0, ge=0),
) -> Page[PrestationMinageSortie]:
    requete = select(PrestationMinage)
    if site_id is not None:
        verifier_acces_site(utilisateur, site_id)
        requete = requete.where(PrestationMinage.site_id == site_id)
    if tir_id is not None:
        requete = requete.where(PrestationMinage.tir_id == tir_id)
    if du is not None:
        requete = requete.where(PrestationMinage.date_prestation >= du)
    if au is not None:
        requete = requete.where(PrestationMinage.date_prestation <= au)
    if statut is not None:
        requete = requete.where(PrestationMinage.statut == statut)

    total = session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()
    lignes = session.execute(
        requete.order_by(PrestationMinage.date_prestation.desc())
        .limit(limite)
        .offset(decalage)
    ).scalars()
    return Page[PrestationMinageSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[PrestationMinageSortie.model_validate(p) for p in lignes],
    )
