"""Workflow de contrôle et journal des modifications (ch. 5).

Le statut d'une donnée suit le cycle brute → contrôlée → validée. Toute
modification postérieure à la validation est journalisée avec son motif :
c'est ce journal qui permet au contrôle de gestion de défendre un chiffre
contesté (ch. 5.1).
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.collecte import (
    AffectationReelleEngin,
    CampagnePesage,
    ChargeEngin,
    EvenementEngin,
    EvenementEquipement,
    PeseePontBascule,
    PrestationMinage,
    RotationDumper,
    SortiePiece,
    TrouForage,
    Vente,
)
from app.models.enums import RoleUtilisateur, StatutValidation
from app.models.referentiels import Utilisateur
from app.models.tracabilite import AuditModification

MODELES_VALIDABLES: dict[str, type[Base]] = {
    "trou_forage": TrouForage,
    "evenement_engin": EvenementEngin,
    "rotation_dumper": RotationDumper,
    "evenement_equipement": EvenementEquipement,
    "pesee_pont_bascule": PeseePontBascule,
    "prestation_minage": PrestationMinage,
    "sortie_piece": SortiePiece,
    "vente": Vente,
    "charge_engin": ChargeEngin,
    "affectation_reelle_engin": AffectationReelleEngin,
    "campagne_pesage": CampagnePesage,
}

# Transitions autorisées. Le cycle nominal est brute → contrôlée → validée ;
# le rejet est possible à tout moment avant validation, et une donnée validée
# ne peut redescendre qu'en contrôlée, sur motif explicite.
TRANSITIONS_AUTORISEES: dict[StatutValidation, set[StatutValidation]] = {
    StatutValidation.BRUTE: {StatutValidation.CONTROLEE, StatutValidation.REJETEE},
    StatutValidation.CONTROLEE: {
        StatutValidation.VALIDEE,
        StatutValidation.REJETEE,
        StatutValidation.BRUTE,
    },
    StatutValidation.VALIDEE: {StatutValidation.CONTROLEE},
    StatutValidation.REJETEE: {StatutValidation.BRUTE},
}

# Statuts dont l'attribution est réservée au contrôleur.
STATUTS_RESERVES_CONTROLEUR = {StatutValidation.VALIDEE, StatutValidation.CONTROLEE}

# Champs jamais modifiables par une correction : ils constituent la
# traçabilité elle-même, ou sont calculés par la base.
CHAMPS_NON_CORRIGEABLES = {
    "id",
    "auteur_id",
    "saisi_le",
    "recu_le",
    "statut",
    "valide_par",
    "valide_le",
    "lot_id",
    "source_collecte",
    "duree_foration",
    "utilisation_foreuse",
    "est_cloture",
    "duree",
}


class TransitionInterdite(Exception):
    """La transition de statut demandée n'est pas permise."""


class MotifRequis(Exception):
    """Un motif est obligatoire pour cette opération."""


class ChampNonCorrigeable(Exception):
    """Le champ visé ne peut pas être modifié."""


def _texte(valeur: Any) -> str | None:
    """Représentation textuelle stable d'une valeur, pour le journal d'audit."""
    if valeur is None:
        return None
    if isinstance(valeur, Decimal | int | float | bool):
        return str(valeur)
    if isinstance(valeur, datetime):
        return valeur.isoformat()
    if hasattr(valeur, "value"):  # énumération
        return str(valeur.value)
    return str(valeur)


def changer_statut(
    session: Session,
    objet: Base,
    nom_table: str,
    nouveau_statut: StatutValidation,
    utilisateur: Utilisateur,
    motif: str | None = None,
) -> tuple[StatutValidation, StatutValidation]:
    """Fait avancer une donnée dans son cycle de validation.

    Retourne le couple (ancien statut, nouveau statut).
    """
    ancien = StatutValidation(objet.statut)

    if ancien == nouveau_statut:
        return ancien, nouveau_statut

    if nouveau_statut not in TRANSITIONS_AUTORISEES.get(ancien, set()):
        raise TransitionInterdite(
            f"Transition « {ancien.value} » vers « {nouveau_statut.value} » non autorisée."
        )

    if (
        nouveau_statut in STATUTS_RESERVES_CONTROLEUR
        and utilisateur.role not in {RoleUtilisateur.CONTROLEUR, RoleUtilisateur.ADMIN}
        and not (
            nouveau_statut == StatutValidation.CONTROLEE
            and utilisateur.role == RoleUtilisateur.SUPERVISEUR
        )
    ):
        raise TransitionInterdite(
            f"Le passage au statut « {nouveau_statut.value} » est réservé au contrôleur."
        )

    # Un rejet, comme la reprise d'une donnée déjà validée, doit être motivé.
    if nouveau_statut == StatutValidation.REJETEE and not motif:
        raise MotifRequis("Un rejet doit être motivé.")
    if ancien == StatutValidation.VALIDEE and not motif:
        raise MotifRequis(
            "Reprendre une donnée déjà validée exige un motif : elle a pu être "
            "exportée au gestionnaire."
        )

    objet.statut = nouveau_statut
    if nouveau_statut == StatutValidation.VALIDEE:
        objet.valide_par = utilisateur.id
        objet.valide_le = datetime.now(UTC)
    else:
        # Une donnée qui quitte l'état validé perd son visa : le conserver
        # laisserait croire qu'elle est toujours certifiée.
        objet.valide_par = None
        objet.valide_le = None

    # Le changement de statut d'une donnée déjà validée est lui-même une
    # modification à journaliser.
    if ancien == StatutValidation.VALIDEE or nouveau_statut == StatutValidation.REJETEE:
        session.add(
            AuditModification(
                table_cible=nom_table,
                enregistrement=str(objet.id),
                champ="statut",
                ancienne_valeur=ancien.value,
                nouvelle_valeur=nouveau_statut.value,
                auteur_id=utilisateur.id,
                motif=motif,
            )
        )

    return ancien, nouveau_statut


def appliquer_correction(
    session: Session,
    objet: Base,
    nom_table: str,
    modifications: dict[str, Any],
    motif: str,
    utilisateur: Utilisateur,
) -> list[AuditModification]:
    """Applique une correction champ par champ, en journalisant chaque écart.

    Une donnée validée ne doit jamais être modifiée silencieusement : chaque
    champ touché produit une ligne d'audit portant l'ancienne valeur, la
    nouvelle, l'auteur et le motif.
    """
    if not motif or not motif.strip():
        raise MotifRequis("Toute correction doit être motivée.")

    lignes: list[AuditModification] = []

    for champ, nouvelle_valeur in modifications.items():
        if champ in CHAMPS_NON_CORRIGEABLES:
            raise ChampNonCorrigeable(
                f"Le champ « {champ} » relève de la traçabilité ou du calcul "
                "automatique : il n'est pas corrigeable."
            )
        if not hasattr(objet, champ):
            raise ChampNonCorrigeable(
                f"Le champ « {champ} » n'existe pas sur {nom_table}."
            )

        ancienne_valeur = getattr(objet, champ)
        if _texte(ancienne_valeur) == _texte(nouvelle_valeur):
            continue  # rien n'a changé : pas de ligne d'audit inutile

        setattr(objet, champ, nouvelle_valeur)
        ligne = AuditModification(
            table_cible=nom_table,
            enregistrement=str(objet.id),
            champ=champ,
            ancienne_valeur=_texte(ancienne_valeur),
            nouvelle_valeur=_texte(nouvelle_valeur),
            auteur_id=utilisateur.id,
            motif=motif,
        )
        session.add(ligne)
        lignes.append(ligne)

    # Une donnée corrigée après validation retourne au contrôle : elle doit
    # être revalidée avant de repartir vers le gestionnaire externe.
    if lignes and StatutValidation(objet.statut) == StatutValidation.VALIDEE:
        objet.statut = StatutValidation.CONTROLEE
        objet.valide_par = None
        objet.valide_le = None

    return lignes


def resoudre_modele(nom_table: str) -> type[Base]:
    """Retourne le modèle correspondant à une table validable."""
    modele = MODELES_VALIDABLES.get(nom_table)
    if modele is None:
        raise KeyError(
            f"« {nom_table} » n'est pas une table soumise au workflow de validation. "
            f"Tables acceptées : {', '.join(sorted(MODELES_VALIDABLES))}."
        )
    return modele


def obtenir_site(objet: Base) -> int | None:
    """Site de rattachement d'une donnée, pour le cloisonnement par site.

    Certaines tables (charges, affectations, campagnes de pesage) n'ont pas
    de colonne site : le rattachement passe alors par l'engin.
    """
    site_id = getattr(objet, "site_id", None)
    if site_id is not None:
        return site_id
    engin = getattr(objet, "engin", None)
    return getattr(engin, "site_id", None) if engin is not None else None


def identifiant_texte(objet: Base) -> str:
    return str(getattr(objet, "id", ""))


__all__ = [
    "MODELES_VALIDABLES",
    "TRANSITIONS_AUTORISEES",
    "TransitionInterdite",
    "MotifRequis",
    "ChampNonCorrigeable",
    "changer_statut",
    "appliquer_correction",
    "resoudre_modele",
    "obtenir_site",
    "identifiant_texte",
]
