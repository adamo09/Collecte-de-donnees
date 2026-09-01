"""Modification des référentiels.

Une correction de référentiel n'est pas anodine : changer le centre de coût
de référence d'un engin, ou retirer un agent, déplace des coûts d'un centre
à un autre dans les exports du gestionnaire. Ces modifications sont donc
journalisées au même titre que les corrections de données collectées
(ch. 5.1), avec l'ancienne et la nouvelle valeur.

Aucun référentiel n'est jamais supprimé : les données collectées y
renvoient, et une suppression romprait l'historique. Un référentiel qui
n'a plus cours est désactivé.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.referentiels import Utilisateur
from app.models.tracabilite import AuditModification


def _texte(valeur: Any) -> str | None:
    """Représentation textuelle stable, pour le journal."""
    if valeur is None:
        return None
    if isinstance(valeur, bool):
        return "oui" if valeur else "non"
    if isinstance(valeur, Decimal | int | float):
        return str(valeur)
    if isinstance(valeur, datetime | date):
        return valeur.isoformat()
    if hasattr(valeur, "value"):  # énumération
        return str(valeur.value)
    return str(valeur)


def appliquer_modification(
    session: Session,
    objet: Base,
    nom_table: str,
    cle: str,
    modifications: dict[str, Any],
    utilisateur: Utilisateur,
    motif: str | None = None,
) -> list[AuditModification]:
    """Applique une modification partielle et journalise chaque écart.

    Seuls les champs réellement modifiés produisent une ligne d'audit : une
    mise à jour qui ne change rien ne doit pas encombrer le journal, sans
    quoi celui-ci devient illisible au moment où on en a besoin.
    """
    lignes: list[AuditModification] = []

    for champ, nouvelle_valeur in modifications.items():
        if not hasattr(objet, champ):
            continue
        ancienne_valeur = getattr(objet, champ)
        if _texte(ancienne_valeur) == _texte(nouvelle_valeur):
            continue

        setattr(objet, champ, nouvelle_valeur)
        ligne = AuditModification(
            table_cible=nom_table,
            enregistrement=cle,
            champ=champ,
            ancienne_valeur=_texte(ancienne_valeur),
            nouvelle_valeur=_texte(nouvelle_valeur),
            auteur_id=utilisateur.id,
            motif=motif,
        )
        session.add(ligne)
        lignes.append(ligne)

    return lignes
