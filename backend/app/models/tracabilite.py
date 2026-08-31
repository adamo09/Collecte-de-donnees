"""Traçabilité transversale et pilotage de la synchronisation (ch. 5 et 12)."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Identity, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ResultatLot
from app.models.types_sql import enum_pg


class AuditModification(Base):
    """Journal des modifications d'une donnée déjà synchronisée (ch. 5.1).

    Une donnée validée ne doit jamais être modifiée silencieusement : c'est
    cette table qui permet au contrôle de gestion de défendre un chiffre
    contesté.
    """

    __tablename__ = "audit_modification"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    table_cible: Mapped[str] = mapped_column(nullable=False)
    enregistrement: Mapped[str] = mapped_column(nullable=False)
    champ: Mapped[str] = mapped_column(nullable=False)
    ancienne_valeur: Mapped[str | None]
    nouvelle_valeur: Mapped[str | None]
    auteur_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("utilisateur.id"), nullable=False
    )
    motif: Mapped[str | None]
    modifie_le: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )


class LotSynchronisation(Base):
    """Un envoi de données depuis un terminal.

    L'identifiant est produit par le terminal : c'est la clé d'idempotence
    qui rend un renvoi de lot sans effet.
    """

    __tablename__ = "lot_synchronisation"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    terminal_id: Mapped[str] = mapped_column(nullable=False)
    utilisateur_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("utilisateur.id"), nullable=False
    )
    application_version: Mapped[str | None]
    nb_enregistrements: Mapped[int] = mapped_column(nullable=False)
    nb_acceptes: Mapped[int] = mapped_column(nullable=False, server_default="0")
    nb_rejetes: Mapped[int] = mapped_column(nullable=False, server_default="0")
    envoye_le: Mapped[datetime] = mapped_column(nullable=False)
    recu_le: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    resultat: Mapped[ResultatLot] = mapped_column(
        enum_pg(ResultatLot, "resultat_lot"), nullable=False, server_default="ok"
    )


class LotEnregistrement(Base):
    """Sort réservé à chaque enregistrement d'un lot.

    Sans ce détail, l'absence d'une rotation reste indiscernable entre un
    oubli de l'opérateur, un terminal en panne et un échec de transmission.
    """

    __tablename__ = "lot_enregistrement"

    lot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lot_synchronisation.id", ondelete="CASCADE"), primary_key=True
    )
    table_cible: Mapped[str] = mapped_column(primary_key=True)
    enregistrement: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    accepte: Mapped[bool] = mapped_column(nullable=False)
    doublon: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    erreur: Mapped[str | None]
    traite_le: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )


class VersionReferentiel(Base):
    """Numéro de version d'un référentiel.

    Incrémenté par trigger à chaque modification ; le terminal compare sa
    copie locale à cette valeur pour savoir s'il doit la rafraîchir.
    """

    __tablename__ = "version_referentiel"

    nom_referentiel: Mapped[str] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="1")
    maj_le: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
