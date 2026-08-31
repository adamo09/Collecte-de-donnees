"""Blocs de colonnes réutilisés par les tables de collecte."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, declarative_mixin, mapped_column

from app.models.enums import ModeCollecte, StatutValidation
from app.models.types_sql import enum_pg


@declarative_mixin
class TracabiliteMixin:
    """Les sept attributs de traçabilité portés par chaque donnée collectée.

    Ce bloc est volontairement dupliqué sur chaque table plutôt que déporté
    dans une table liée (ch. 5) : il évite une jointure sur chaque requête
    d'export et garantit qu'aucune donnée ne peut exister sans sa traçabilité.
    """

    source_collecte: Mapped[ModeCollecte] = mapped_column(
        enum_pg(ModeCollecte, "mode_collecte"), nullable=False
    )
    auteur_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("utilisateur.id"), nullable=False
    )
    # Horodatage de la saisie sur le terrain. Distinct de recu_le : un
    # événement déclaré à 8 h 15 en carrière peut n'arriver au serveur qu'à
    # 17 h 40, au retour en zone couverte. Confondre les deux fausserait
    # toute analyse de temps.
    saisi_le: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    recu_le: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    statut: Mapped[StatutValidation] = mapped_column(
        enum_pg(StatutValidation, "statut_validation"),
        nullable=False,
        server_default="brute",
    )
    valide_par: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("utilisateur.id"))
    valide_le: Mapped[datetime | None]
    piece_jointe_url: Mapped[str | None]


@declarative_mixin
class LotMixin:
    """Rattachement au lot de synchronisation d'origine (ch. 12).

    Permet de distinguer une donnée manquante d'un échec de transmission.
    """

    lot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lot_synchronisation.id")
    )
