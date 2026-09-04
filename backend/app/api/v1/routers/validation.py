"""Workflow de contrôle, correction et journal d'audit (ch. 5)."""

import uuid

from fastapi import APIRouter, HTTPException, Path, Query, status
from sqlalchemy import select, text

from app.core.dependances import (
    ExigeSuperviseur,
    SessionBD,
    UtilisateurConnecte,
    verifier_acces_site,
)
from app.models.enums import StatutValidation
from app.models.tracabilite import AuditModification
from app.schemas.communs import Page
from app.schemas.validation import (
    ChangementStatutLot,
    DemandeChangementStatut,
    DemandeCorrection,
    LigneAudit,
    LigneFileValidation,
    ResultatChangementStatut,
    ResultatChangementStatutLot,
)
from app.services.validation import (
    MODELES_VALIDABLES,
    ChampNonCorrigeable,
    MotifRequis,
    TransitionInterdite,
    appliquer_correction,
    changer_statut,
    obtenir_site,
    resoudre_modele,
)

routeur = APIRouter(prefix="/validation", tags=["Contrôle et validation"])

DescriptionTable = Path(
    description="Table de collecte visée, par exemple « trou_forage » ou « rotation_dumper »."
)


def _modele_ou_404(nom_table: str):
    try:
        return resoudre_modele(nom_table)
    except KeyError as erreur:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(erreur)) from erreur


@routeur.get("/tables", summary="Tables soumises au workflow de validation")
def lister_tables() -> dict:
    return {"tables": sorted(MODELES_VALIDABLES)}


@routeur.get(
    "/file",
    response_model=Page[LigneFileValidation],
    summary="File d'attente du contrôle",
)
def file_validation(
    session: SessionBD,
    utilisateur: UtilisateurConnecte,
    site_id: int | None = None,
    statut: StatutValidation | None = Query(default=None, description="brute ou controlee"),
    table_cible: str | None = None,
    limite: int = Query(default=200, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[LigneFileValidation]:
    """Tout ce qui reste à contrôler ou à valider, toutes tables confondues.

    Le total est compté à part, et c'est le point important : la file est
    ordonnée du plus ancien au plus récent, si bien qu'un plafond sans total
    escamote les données du jour derrière un arriéré. Le contrôleur croirait
    sa file à jour alors qu'il n'en voit que le début.
    """
    conditions: list[str] = []
    parametres_sql: dict = {"limite": limite}

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

    if statut is not None:
        conditions.append("statut = :statut")
        parametres_sql["statut"] = statut.value
    if table_cible is not None:
        _modele_ou_404(table_cible)
        conditions.append("table_cible = :table_cible")
        parametres_sql["table_cible"] = table_cible

    clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = session.execute(
        text(f"SELECT count(*) FROM v_pilotage_file_validation {clause}"),
        parametres_sql,
    ).scalar_one()

    lignes = session.execute(
        text(
            "SELECT table_cible, id, site_id, statut, saisi_le, recu_le, auteur_id "
            f"FROM v_pilotage_file_validation {clause} "
            "ORDER BY recu_le ASC LIMIT :limite OFFSET :decalage"
        ),
        {**parametres_sql, "decalage": decalage},
    ).mappings()
    return Page[LigneFileValidation](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[LigneFileValidation.model_validate(dict(ligne)) for ligne in lignes],
    )


@routeur.post(
    "/{table_cible}/{enregistrement_id}/statut",
    summary="Faire avancer une donnée dans son cycle de validation",
)
def modifier_statut(
    session: SessionBD,
    utilisateur: ExigeSuperviseur,
    demande: DemandeChangementStatut,
    table_cible: str = DescriptionTable,
    enregistrement_id: uuid.UUID = Path(),
) -> ResultatChangementStatut:
    """Applique une transition de statut.

    Le cycle nominal est brute → contrôlée → validée. Seul un contrôleur peut
    valider. Une donnée déjà validée ne peut redescendre qu'en contrôlée, et
    uniquement sur motif : elle a pu être exportée au gestionnaire.
    """
    modele = _modele_ou_404(table_cible)
    objet = session.get(modele, enregistrement_id)
    if objet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enregistrement inconnu.")

    site = obtenir_site(objet)
    if site is not None:
        verifier_acces_site(utilisateur, site)

    try:
        ancien, nouveau = changer_statut(
            session, objet, table_cible, demande.nouveau_statut, utilisateur, demande.motif
        )
    except (TransitionInterdite, MotifRequis) as erreur:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(erreur)) from erreur

    session.commit()
    return ResultatChangementStatut(
        id=enregistrement_id,
        applique=True,
        ancien_statut=ancien,
        nouveau_statut=nouveau,
    )


@routeur.post(
    "/{table_cible}/statut-lot",
    response_model=ResultatChangementStatutLot,
    summary="Traiter une sélection issue de la file de validation",
)
def modifier_statut_lot(
    session: SessionBD,
    utilisateur: ExigeSuperviseur,
    demande: ChangementStatutLot,
    table_cible: str = DescriptionTable,
) -> ResultatChangementStatutLot:
    """Valide ou rejette plusieurs enregistrements d'un coup.

    Un refus sur l'un n'empêche pas le traitement des autres : le contrôleur
    reçoit le détail de ce qui a été appliqué et de ce qui ne l'a pas été.
    """
    modele = _modele_ou_404(table_cible)
    details: list[ResultatChangementStatut] = []

    for identifiant in demande.identifiants:
        objet = session.get(modele, identifiant)
        if objet is None:
            details.append(
                ResultatChangementStatut(
                    id=identifiant, applique=False, erreur="Enregistrement inconnu."
                )
            )
            continue

        site = obtenir_site(objet)
        if site is not None and utilisateur.role.value not in {"controleur", "admin"}:
            if utilisateur.site_id != site:
                details.append(
                    ResultatChangementStatut(
                        id=identifiant,
                        applique=False,
                        erreur="Ce compte n'est pas habilité sur ce site.",
                    )
                )
                continue

        try:
            with session.begin_nested():
                ancien, nouveau = changer_statut(
                    session,
                    objet,
                    table_cible,
                    demande.nouveau_statut,
                    utilisateur,
                    demande.motif,
                )
            details.append(
                ResultatChangementStatut(
                    id=identifiant,
                    applique=True,
                    ancien_statut=ancien,
                    nouveau_statut=nouveau,
                )
            )
        except (TransitionInterdite, MotifRequis) as erreur:
            details.append(
                ResultatChangementStatut(id=identifiant, applique=False, erreur=str(erreur))
            )

    session.commit()
    nb_appliques = sum(1 for d in details if d.applique)
    return ResultatChangementStatutLot(
        table_cible=table_cible,
        nb_traites=len(details),
        nb_appliques=nb_appliques,
        nb_refuses=len(details) - nb_appliques,
        details=details,
    )


@routeur.post(
    "/{table_cible}/{enregistrement_id}/correction",
    response_model=list[LigneAudit],
    summary="Corriger une donnée en journalisant chaque écart",
)
def corriger(
    session: SessionBD,
    utilisateur: ExigeSuperviseur,
    demande: DemandeCorrection,
    table_cible: str = DescriptionTable,
    enregistrement_id: uuid.UUID = Path(),
) -> list[AuditModification]:
    """Corrige une donnée déjà synchronisée.

    Chaque champ modifié produit une ligne d'audit portant l'ancienne valeur,
    la nouvelle, l'auteur et le motif. Une donnée validée qui est corrigée
    retourne au statut contrôlé : elle doit être revalidée avant de repartir
    vers le gestionnaire externe.
    """
    modele = _modele_ou_404(table_cible)
    objet = session.get(modele, enregistrement_id)
    if objet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enregistrement inconnu.")

    site = obtenir_site(objet)
    if site is not None:
        verifier_acces_site(utilisateur, site)

    try:
        lignes = appliquer_correction(
            session, objet, table_cible, demande.modifications, demande.motif, utilisateur
        )
    except (MotifRequis, ChampNonCorrigeable) as erreur:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(erreur)
        ) from erreur

    session.commit()
    for ligne in lignes:
        session.refresh(ligne)
    return lignes


@routeur.get("/audit", response_model=Page[LigneAudit], summary="Consulter le journal d'audit")
def consulter_audit(
    session: SessionBD,
    _: ExigeSuperviseur,
    table_cible: str | None = None,
    enregistrement: str | None = None,
    limite: int = Query(default=100, ge=1, le=1000),
    decalage: int = Query(default=0, ge=0),
) -> Page[LigneAudit]:
    """C'est ce journal qui permet de défendre un chiffre contesté (ch. 5.1).

    Le décalage existait déjà, mais sans total : on pouvait avancer dans le
    journal sans jamais savoir où il s'arrête. Un journal d'audit qu'on ne
    peut pas parcourir jusqu'au bout ne défend rien.
    """
    requete = select(AuditModification).order_by(AuditModification.modifie_le.desc())
    if table_cible is not None:
        requete = requete.where(AuditModification.table_cible == table_cible)
    if enregistrement is not None:
        requete = requete.where(AuditModification.enregistrement == enregistrement)

    total = session.execute(select(text("count(*)")).select_from(requete.subquery())).scalar_one()
    lignes = session.execute(requete.limit(limite).offset(decalage)).scalars()
    return Page[LigneAudit](
        total=total,
        limite=limite,
        decalage=decalage,
        elements=[LigneAudit.model_validate(ligne) for ligne in lignes],
    )
