"""Gestion des référentiels (ch. 4).

Sans eux, une rotation de dumper n'est qu'une chaîne de caractères : ils
doivent être constitués et validés avant toute mise en service terrain.
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.dependances import ExigeAdmin, ExigeSuperviseur, SessionBD, UtilisateurConnecte
from app.models.collecte import Tir
from app.models.enums import FamilleEngin
from app.models.referentiels import (
    CauseArret,
    CentreDeCout,
    Engin,
    EquipementConcassage,
    Personnel,
    Produit,
    ProduitParcours,
    Site,
)
from app.models.tracabilite import AuditModification
from app.schemas.modifications import (
    CauseArretModification,
    CentreDeCoutModification,
    EquipementModification,
    PersonnelModification,
    ProduitModification,
    SiteModification,
    TirModification,
)
from app.schemas.referentiels import (
    CauseArretEntree,
    CauseArretSortie,
    CentreDeCoutEntree,
    CentreDeCoutSortie,
    EnginEntree,
    EnginModification,
    EnginSortie,
    EquipementEntree,
    EquipementSortie,
    PersonnelEntree,
    PersonnelSortie,
    ProduitEntree,
    ProduitSortie,
    SiteEntree,
    SiteSortie,
    TirEntree,
    TirSortie,
)
from app.services.referentiels import appliquer_modification

routeur = APIRouter(prefix="/referentiels", tags=["Référentiels"])


def _conflit(erreur: IntegrityError, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)


# =====================================================================
# Sites et centres de coûts
# =====================================================================


@routeur.get("/sites", response_model=list[SiteSortie], summary="Lister les sites")
def lister_sites(
    session: SessionBD, _: UtilisateurConnecte, inclure_inactifs: bool = False
) -> list[Site]:
    requete = select(Site).order_by(Site.code)
    if not inclure_inactifs:
        requete = requete.where(Site.actif)
    return list(session.execute(requete).scalars())


@routeur.post(
    "/sites",
    response_model=SiteSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un site",
)
def creer_site(session: SessionBD, _: ExigeAdmin, demande: SiteEntree) -> Site:
    site = Site(**demande.model_dump())
    session.add(site)
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(erreur, f"Le code site « {demande.code} » existe déjà.") from erreur
    session.refresh(site)
    return site


@routeur.get(
    "/centres-de-cout",
    response_model=list[CentreDeCoutSortie],
    summary="Lister les centres de coûts",
)
def lister_centres(session: SessionBD, _: UtilisateurConnecte) -> list[CentreDeCout]:
    return list(
        session.execute(select(CentreDeCout).order_by(CentreDeCout.code)).scalars()
    )


@routeur.post(
    "/centres-de-cout",
    response_model=CentreDeCoutSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un centre de coûts",
)
def creer_centre(
    session: SessionBD, _: ExigeAdmin, demande: CentreDeCoutEntree
) -> CentreDeCout:
    centre = CentreDeCout(**demande.model_dump())
    session.add(centre)
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(erreur, f"Le centre « {demande.code} » existe déjà.") from erreur
    session.refresh(centre)
    return centre


# =====================================================================
# Parc d'engins
# =====================================================================


@routeur.get("/engins", response_model=list[EnginSortie], summary="Lister les engins")
def lister_engins(
    session: SessionBD,
    _: UtilisateurConnecte,
    site_id: int | None = None,
    famille: FamilleEngin | None = None,
    inclure_inactifs: bool = False,
) -> list[Engin]:
    requete = select(Engin).order_by(Engin.numero_parc)
    if site_id is not None:
        requete = requete.where(Engin.site_id == site_id)
    if famille is not None:
        requete = requete.where(Engin.famille == famille)
    if not inclure_inactifs:
        requete = requete.where(Engin.actif)
    return list(session.execute(requete).scalars())


@routeur.get(
    "/engins/{engin_id}", response_model=EnginSortie, summary="Consulter un engin"
)
def consulter_engin(session: SessionBD, _: UtilisateurConnecte, engin_id: uuid.UUID) -> Engin:
    engin = session.get(Engin, engin_id)
    if engin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engin inconnu.")
    return engin


@routeur.get(
    "/engins/par-qr/{qr_token}",
    response_model=EnginSortie,
    summary="Identifier un engin par son QR code",
)
def engin_par_qr(session: SessionBD, _: UtilisateurConnecte, qr_token: str) -> Engin:
    """Résolution d'une étiquette QR scannée sur le terrain.

    Les étiquettes se dégradent vite en carrière : lorsque le scan échoue,
    l'agent doit pouvoir retomber sur la recherche par numéro de parc
    (ch. 4.1). C'est ce que fait /engins/par-numero-parc.
    """
    engin = session.execute(
        select(Engin).where(Engin.qr_token == qr_token)
    ).scalar_one_or_none()
    if engin is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Étiquette QR inconnue. Saisir le numéro de parc à la place.",
        )
    return engin


@routeur.get(
    "/engins/par-numero-parc/{numero_parc}",
    response_model=EnginSortie,
    summary="Identifier un engin par son numéro de parc (repli du QR)",
)
def engin_par_numero_parc(
    session: SessionBD, _: UtilisateurConnecte, numero_parc: str
) -> Engin:
    engin = session.execute(
        select(Engin).where(Engin.numero_parc == numero_parc.strip().upper())
    ).scalar_one_or_none()
    if engin is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Numéro de parc inconnu."
        )
    return engin


@routeur.post(
    "/engins",
    response_model=EnginSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un engin",
)
def creer_engin(session: SessionBD, _: ExigeAdmin, demande: EnginEntree) -> Engin:
    engin = Engin(**demande.model_dump())
    # Le jeton QR est dérivé du numéro de parc : l'étiquette reste lisible
    # et reproductible si elle doit être regravée.
    engin.qr_token = f"ENG:{demande.numero_parc.strip().upper()}"
    session.add(engin)
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(
            erreur, f"Le numéro de parc « {demande.numero_parc} » existe déjà."
        ) from erreur
    session.refresh(engin)
    return engin


@routeur.patch(
    "/engins/{engin_id}", response_model=EnginSortie, summary="Modifier un engin"
)
def modifier_engin(
    session: SessionBD, _: ExigeAdmin, engin_id: uuid.UUID, demande: EnginModification
) -> Engin:
    engin = session.get(Engin, engin_id)
    if engin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engin inconnu.")
    for champ, valeur in demande.model_dump(exclude_unset=True).items():
        setattr(engin, champ, valeur)
    session.commit()
    session.refresh(engin)
    return engin


# =====================================================================
# Équipements de concassage
# =====================================================================


@routeur.get(
    "/equipements", response_model=list[EquipementSortie], summary="Lister les équipements"
)
def lister_equipements(
    session: SessionBD,
    _: UtilisateurConnecte,
    site_id: int | None = None,
    inclure_inactifs: bool = False,
) -> list[EquipementConcassage]:
    requete = select(EquipementConcassage).order_by(EquipementConcassage.designation)
    if site_id is not None:
        requete = requete.where(EquipementConcassage.site_id == site_id)
    if not inclure_inactifs:
        requete = requete.where(EquipementConcassage.actif)
    return list(session.execute(requete).scalars())


@routeur.post(
    "/equipements",
    response_model=EquipementSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un équipement",
)
def creer_equipement(
    session: SessionBD, _: ExigeAdmin, demande: EquipementEntree
) -> EquipementConcassage:
    equipement = EquipementConcassage(**demande.model_dump())
    session.add(equipement)
    session.flush()
    equipement.qr_token = f"EQP:{equipement.id}"
    session.commit()
    session.refresh(equipement)
    return equipement


# =====================================================================
# Personnel
# =====================================================================


@routeur.get(
    "/personnel", response_model=list[PersonnelSortie], summary="Lister le personnel"
)
def lister_personnel(
    session: SessionBD,
    _: UtilisateurConnecte,
    site_id: int | None = None,
    inclure_inactifs: bool = False,
) -> list[Personnel]:
    requete = select(Personnel).order_by(Personnel.nom_prenoms)
    if site_id is not None:
        requete = requete.where(Personnel.site_id == site_id)
    if not inclure_inactifs:
        requete = requete.where(Personnel.actif)
    return list(session.execute(requete).scalars())


@routeur.post(
    "/personnel",
    response_model=PersonnelSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer un agent",
)
def creer_personnel(
    session: SessionBD, _: ExigeAdmin, demande: PersonnelEntree
) -> Personnel:
    agent = Personnel(**demande.model_dump())
    session.add(agent)
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(
            erreur, f"Le matricule « {demande.matricule} » existe déjà."
        ) from erreur
    session.refresh(agent)
    return agent


# =====================================================================
# Produits et parcours de concassage
# =====================================================================


@routeur.get("/produits", response_model=list[ProduitSortie], summary="Lister les produits")
def lister_produits(
    session: SessionBD, _: UtilisateurConnecte, inclure_inactifs: bool = False
) -> list[Produit]:
    requete = select(Produit).order_by(Produit.code)
    if not inclure_inactifs:
        requete = requete.where(Produit.actif)
    return list(session.execute(requete).scalars())


@routeur.post(
    "/produits",
    response_model=ProduitSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un produit et son parcours",
)
def creer_produit(session: SessionBD, _: ExigeAdmin, demande: ProduitEntree) -> Produit:
    donnees = demande.model_dump()
    parcours = donnees.pop("parcours", [])
    produit = Produit(**donnees)
    session.add(produit)
    session.flush()
    for etape in parcours:
        session.add(ProduitParcours(produit_id=produit.id, **etape))
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(
            erreur,
            f"Le code produit « {demande.code} » existe déjà, ou son parcours "
            "comporte deux fois le même niveau.",
        ) from erreur
    session.refresh(produit)
    return produit


# =====================================================================
# Causes d'arrêt
# =====================================================================


@routeur.get(
    "/causes-arret",
    response_model=list[CauseArretSortie],
    summary="Lister les motifs d'arrêt codifiés",
)
def lister_causes(
    session: SessionBD, _: UtilisateurConnecte, inclure_inactifs: bool = False
) -> list[CauseArret]:
    requete = select(CauseArret).order_by(CauseArret.categorie, CauseArret.code)
    if not inclure_inactifs:
        requete = requete.where(CauseArret.actif)
    return list(session.execute(requete).scalars())


@routeur.post(
    "/causes-arret",
    response_model=CauseArretSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Ajouter un motif d'arrêt",
)
def creer_cause(
    session: SessionBD, _: ExigeSuperviseur, demande: CauseArretEntree
) -> CauseArret:
    """La nomenclature s'enrichit avec l'usage terrain, sans migration (ch. 4.4)."""
    cause = CauseArret(**demande.model_dump())
    session.add(cause)
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(erreur, f"Le code « {demande.code} » existe déjà.") from erreur
    session.refresh(cause)
    return cause


# =====================================================================
# Tirs (référence commune à CP01 et CP02)
# =====================================================================


@routeur.get("/tirs", response_model=list[TirSortie], summary="Lister les tirs")
def lister_tirs(
    session: SessionBD,
    _: UtilisateurConnecte,
    site_id: int | None = None,
    limite: int = Query(default=100, le=500),
) -> list[Tir]:
    requete = select(Tir).order_by(Tir.date_tir.desc().nullslast()).limit(limite)
    if site_id is not None:
        requete = requete.where(Tir.site_id == site_id)
    return list(session.execute(requete).scalars())


@routeur.post(
    "/tirs",
    response_model=TirSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer un tir",
)
def creer_tir(session: SessionBD, _: ExigeSuperviseur, demande: TirEntree) -> Tir:
    tir = Tir(**demande.model_dump())
    session.add(tir)
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(
            erreur, f"Le tir « {demande.numero_t} » existe déjà sur ce site."
        ) from erreur
    session.refresh(tir)
    return tir


# =====================================================================
# Modification des référentiels
#
# Aucun référentiel n'est supprimé : les données collectées y renvoient et
# une suppression romprait l'historique. Un référentiel qui n'a plus cours
# est désactivé — il disparaît des listes de saisie sans effacer le passé.
#
# Chaque modification est journalisée : changer le centre de coût de
# référence d'un engin déplace des coûts dans les exports du gestionnaire,
# et cela doit pouvoir être retracé.
# =====================================================================


def _modifier(
    session,
    objet,
    nom_table: str,
    cle: str,
    demande,
    utilisateur,
    motif: str | None = None,
):
    """Applique une modification partielle, la journalise et valide."""
    if objet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Enregistrement inconnu."
        )
    appliquer_modification(
        session,
        objet,
        nom_table,
        cle,
        demande.model_dump(exclude_unset=True, exclude_none=False),
        utilisateur,
        motif,
    )
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(erreur, f"Modification refusée : {erreur.orig}") from erreur
    session.refresh(objet)
    return objet


@routeur.patch("/sites/{site_id}", response_model=SiteSortie, summary="Modifier un site")
def modifier_site(
    session: SessionBD, utilisateur: ExigeAdmin, site_id: int, demande: SiteModification
) -> Site:
    return _modifier(
        session, session.get(Site, site_id), "site", str(site_id), demande, utilisateur
    )


@routeur.patch(
    "/centres-de-cout/{code}",
    response_model=CentreDeCoutSortie,
    summary="Modifier un centre de coûts",
)
def modifier_centre(
    session: SessionBD,
    utilisateur: ExigeAdmin,
    code: str,
    demande: CentreDeCoutModification,
) -> CentreDeCout:
    return _modifier(
        session, session.get(CentreDeCout, code), "centre_de_cout", code, demande, utilisateur
    )


@routeur.patch(
    "/personnel/{matricule}", response_model=PersonnelSortie, summary="Modifier un agent"
)
def modifier_personnel(
    session: SessionBD,
    utilisateur: ExigeAdmin,
    matricule: str,
    demande: PersonnelModification,
) -> Personnel:
    """Le matricule n'est pas modifiable : c'est la clé à laquelle chaque
    déclaration terrain se rattache. Un agent qui part est désactivé."""
    return _modifier(
        session, session.get(Personnel, matricule), "personnel", matricule, demande, utilisateur
    )


@routeur.patch(
    "/equipements/{equipement_id}",
    response_model=EquipementSortie,
    summary="Modifier un équipement",
)
def modifier_equipement(
    session: SessionBD,
    utilisateur: ExigeAdmin,
    equipement_id: uuid.UUID,
    demande: EquipementModification,
) -> EquipementConcassage:
    return _modifier(
        session,
        session.get(EquipementConcassage, equipement_id),
        "equipement_concassage",
        str(equipement_id),
        demande,
        utilisateur,
    )


@routeur.patch(
    "/produits/{produit_id}", response_model=ProduitSortie, summary="Modifier un produit"
)
def modifier_produit(
    session: SessionBD,
    utilisateur: ExigeAdmin,
    produit_id: uuid.UUID,
    demande: ProduitModification,
) -> Produit:
    """Le parcours fourni remplace entièrement l'ancien : une séquence se
    remplace, elle ne se modifie pas élément par élément."""
    produit = session.get(Produit, produit_id)
    if produit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produit inconnu.")

    donnees = demande.model_dump(exclude_unset=True)
    parcours = donnees.pop("parcours", None)

    appliquer_modification(
        session, produit, "produit", str(produit_id), donnees, utilisateur
    )

    if parcours is not None:
        ancien = " → ".join(
            f"{e.ordre}:{e.niveau.value if hasattr(e.niveau, 'value') else e.niveau}"
            for e in produit.parcours
        )
        produit.parcours.clear()
        session.flush()
        for etape in parcours:
            session.add(ProduitParcours(produit_id=produit.id, **etape))
        session.add(
            AuditModification(
                table_cible="produit_parcours",
                enregistrement=str(produit_id),
                champ="parcours",
                ancienne_valeur=ancien or None,
                nouvelle_valeur=" → ".join(
                    f"{e['ordre']}:{e['niveau']}" for e in parcours
                ) or None,
                auteur_id=utilisateur.id,
            )
        )

    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise _conflit(
            erreur, "Modification refusée : le parcours comporte deux fois le même niveau."
        ) from erreur
    session.refresh(produit)
    return produit


@routeur.patch(
    "/causes-arret/{code}",
    response_model=CauseArretSortie,
    summary="Modifier un motif d'arrêt",
)
def modifier_cause(
    session: SessionBD,
    utilisateur: ExigeSuperviseur,
    code: str,
    demande: CauseArretModification,
) -> CauseArret:
    """Le code n'est pas modifiable : les événements déjà déclarés y
    renvoient, et le renommer fausserait toute statistique d'arrêts."""
    return _modifier(
        session, session.get(CauseArret, code), "cause_arret", code, demande, utilisateur
    )


@routeur.patch("/tirs/{tir_id}", response_model=TirSortie, summary="Modifier un tir")
def modifier_tir(
    session: SessionBD,
    utilisateur: ExigeSuperviseur,
    tir_id: uuid.UUID,
    demande: TirModification,
) -> Tir:
    return _modifier(
        session, session.get(Tir, tir_id), "tir", str(tir_id), demande, utilisateur
    )
