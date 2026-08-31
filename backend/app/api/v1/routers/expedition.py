"""CP09 — Stockage, pont-bascule et vente (ch. 10)."""

import uuid
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, text

from app.core.dependances import SessionBD, UtilisateurConnecte, verifier_acces_site
from app.models.collecte import PeseePontBascule, Vente
from app.models.enums import StatutValidation
from app.schemas.collecte import PeseeEntree, PeseeSortie, VenteEntree, VenteSortie
from app.schemas.communs import Page
from app.services.collecte import enregistrer

routeur = APIRouter(prefix="/expedition", tags=["CP09 — Stockage et vente"])


@routeur.post(
    "/pesees",
    response_model=PeseeSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer une pesée au pont-bascule",
)
def enregistrer_pesee(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: PeseeEntree
) -> PeseePontBascule:
    """Le mode de récupération du poids conditionne la fiabilité du module.

    Trois modes coexistent, distingués par ``source_collecte`` :
    ``interface_systeme`` pour un interfaçage direct avec l'indicateur de
    pesage, ``import_fichier`` pour un fichier produit par le logiciel de
    pesée existant, ``saisie_directe`` pour une ressaisie manuelle. Cette
    distinction doit rester visible du gestionnaire (ch. 10.2).
    """
    verifier_acces_site(utilisateur, demande.site_id)
    pesee, _ = enregistrer(session, PeseePontBascule, demande, utilisateur)
    return pesee


@routeur.get(
    "/pesees", response_model=Page[PeseeSortie], summary="Rechercher des pesées"
)
def lister_pesees(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    client: str | None = None,
    numero_bon: str | None = None,
    du: datetime | None = None,
    au: datetime | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[PeseeSortie]:
    requete = select(PeseePontBascule)
    if site_id is not None:
        verifier_acces_site(utilisateur, site_id)
        requete = requete.where(PeseePontBascule.site_id == site_id)
    if client is not None:
        requete = requete.where(PeseePontBascule.client.ilike(f"%{client}%"))
    if numero_bon is not None:
        requete = requete.where(PeseePontBascule.numero_bon == numero_bon)
    if du is not None:
        requete = requete.where(PeseePontBascule.horodatage >= du)
    if au is not None:
        requete = requete.where(PeseePontBascule.horodatage <= au)
    if statut is not None:
        requete = requete.where(PeseePontBascule.statut == statut)

    total = session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()
    lignes = session.execute(
        requete.order_by(PeseePontBascule.horodatage.desc()).limit(limite).offset(decalage)
    ).scalars()
    return Page[PeseeSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[PeseeSortie.model_validate(p) for p in lignes],
    )


@routeur.post(
    "/ventes",
    response_model=VenteSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer une vente",
)
def enregistrer_vente(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: VenteEntree
) -> Vente:
    verifier_acces_site(utilisateur, demande.site_id)

    if demande.pesee_id is not None:
        pesee = session.get(PeseePontBascule, demande.pesee_id)
        if pesee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La pesée rattachée à cette vente est introuvable.",
            )
        if pesee.site_id != demande.site_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="La pesée rattachée appartient à un autre site.",
            )

    vente, _ = enregistrer(session, Vente, demande, utilisateur)
    return vente


@routeur.get(
    "/ventes", response_model=Page[VenteSortie], summary="Rechercher des ventes"
)
def lister_ventes(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    produit_id: uuid.UUID | None = None,
    du: date | None = None,
    au: date | None = None,
    statut: StatutValidation | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[VenteSortie]:
    requete = select(Vente)
    if site_id is not None:
        verifier_acces_site(utilisateur, site_id)
        requete = requete.where(Vente.site_id == site_id)
    if produit_id is not None:
        requete = requete.where(Vente.produit_id == produit_id)
    if du is not None:
        requete = requete.where(Vente.date_vente >= du)
    if au is not None:
        requete = requete.where(Vente.date_vente <= au)
    if statut is not None:
        requete = requete.where(Vente.statut == statut)

    total = session.execute(
        select(text("count(*)")).select_from(requete.subquery())
    ).scalar_one()
    lignes = session.execute(
        requete.order_by(Vente.date_vente.desc()).limit(limite).offset(decalage)
    ).scalars()
    return Page[VenteSortie](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[VenteSortie.model_validate(v) for v in lignes],
    )
