"""Référentiels : le socle sans lequel une rotation n'est qu'une chaîne de
caractères (ch. 4)."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Identity, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    FamilleEngin,
    NiveauConcassage,
    RoleUtilisateur,
    TypeEquipement,
)
from app.models.types_sql import enum_pg


class Site(Base):
    __tablename__ = "site"

    id: Mapped[int] = mapped_column(SmallInteger, Identity(), primary_key=True)
    code: Mapped[str] = mapped_column(unique=True, nullable=False)
    libelle: Mapped[str] = mapped_column(nullable=False)
    actif: Mapped[bool] = mapped_column(nullable=False, server_default="true")


class Utilisateur(Base):
    __tablename__ = "utilisateur"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    login: Mapped[str] = mapped_column(unique=True, nullable=False)
    mot_de_passe_hash: Mapped[str] = mapped_column(nullable=False)
    nom_complet: Mapped[str] = mapped_column(nullable=False)
    role: Mapped[RoleUtilisateur] = mapped_column(
        enum_pg(RoleUtilisateur, "role_utilisateur"), nullable=False
    )
    site_id: Mapped[int | None] = mapped_column(ForeignKey("site.id"))
    matricule: Mapped[str | None]
    actif: Mapped[bool] = mapped_column(nullable=False, server_default="true")
    cree_le: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    derniere_connexion: Mapped[datetime | None]

    site: Mapped[Site | None] = relationship(lazy="joined")


class CentreDeCout(Base):
    __tablename__ = "centre_de_cout"

    code: Mapped[str] = mapped_column(primary_key=True)
    libelle: Mapped[str] = mapped_column(nullable=False)
    actif: Mapped[bool] = mapped_column(nullable=False, server_default="true")


class Engin(Base):
    """Référentiel central du parc (ch. 4.1)."""

    __tablename__ = "engin"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    numero_parc: Mapped[str] = mapped_column(unique=True, nullable=False)
    matricule: Mapped[str | None] = mapped_column(unique=True)
    famille: Mapped[FamilleEngin] = mapped_column(
        enum_pg(FamilleEngin, "famille_engin"), nullable=False
    )
    type_engin: Mapped[str | None]
    marque: Mapped[str | None]
    modele: Mapped[str | None]
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    centre_cout_reference: Mapped[str | None] = mapped_column(
        ForeignKey("centre_de_cout.code")
    )
    capacite_nominale: Mapped[Decimal | None]
    unite_capacite: Mapped[str | None]
    puissance_kw: Mapped[Decimal | None]
    date_acquisition: Mapped[date | None]
    date_mise_en_service: Mapped[date | None]
    cout_acquisition: Mapped[Decimal | None]
    unite_compteur: Mapped[str] = mapped_column(nullable=False, server_default="heures")

    # Tenu à jour par un trigger sur evenement_engin, jamais écrit par l'API.
    compteur_actuel: Mapped[Decimal | None]
    compteur_maj_le: Mapped[datetime | None]

    # Réservé à l'import Sage de la phase 2.
    amortissement_methode: Mapped[str | None]
    amortissement_duree_ans: Mapped[int | None] = mapped_column(SmallInteger)
    valeur_residuelle: Mapped[Decimal | None]

    # Valeur encodée dans l'étiquette QR physique. Les étiquettes se dégradent
    # vite en carrière : la saisie manuelle du numéro de parc reste toujours
    # possible en repli (ch. 4.1).
    qr_token: Mapped[str | None] = mapped_column(unique=True)
    actif: Mapped[bool] = mapped_column(nullable=False, server_default="true")

    site: Mapped[Site] = relationship(lazy="joined")


class EquipementConcassage(Base):
    __tablename__ = "equipement_concassage"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    designation: Mapped[str] = mapped_column(nullable=False)
    type: Mapped[TypeEquipement] = mapped_column(
        enum_pg(TypeEquipement, "type_equipement"), nullable=False
    )
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    ligne: Mapped[str | None]
    niveau: Mapped[NiveauConcassage | None] = mapped_column(
        enum_pg(NiveauConcassage, "niveau_concassage")
    )
    poste: Mapped[str | None]
    puissance_kw: Mapped[Decimal | None]
    qr_token: Mapped[str | None] = mapped_column(unique=True)
    actif: Mapped[bool] = mapped_column(nullable=False, server_default="true")

    site: Mapped[Site] = relationship(lazy="joined")


class Personnel(Base):
    __tablename__ = "personnel"

    matricule: Mapped[str] = mapped_column(primary_key=True)
    nom_prenoms: Mapped[str] = mapped_column(nullable=False)
    fonction: Mapped[str | None]
    site_id: Mapped[int | None] = mapped_column(ForeignKey("site.id"))
    centre_cout: Mapped[str | None] = mapped_column(ForeignKey("centre_de_cout.code"))
    date_debut_affect: Mapped[date | None]
    date_fin_affect: Mapped[date | None]
    actif: Mapped[bool] = mapped_column(nullable=False, server_default="true")


class Produit(Base):
    __tablename__ = "produit"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    code: Mapped[str] = mapped_column(unique=True, nullable=False)
    libelle: Mapped[str] = mapped_column(nullable=False)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("site.id"))
    granulometrie: Mapped[str | None]
    actif: Mapped[bool] = mapped_column(nullable=False, server_default="true")

    parcours: Mapped[list["ProduitParcours"]] = relationship(
        back_populates="produit", cascade="all, delete-orphan", order_by="ProduitParcours.ordre"
    )


class ProduitParcours(Base):
    """Niveaux de concassage réellement traversés par un produit (ch. 4.3).

    Un produit qui ne traverse pas un niveau ne doit pas en supporter le coût.
    """

    __tablename__ = "produit_parcours"

    produit_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("produit.id", ondelete="CASCADE"), primary_key=True
    )
    ordre: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    niveau: Mapped[NiveauConcassage] = mapped_column(
        enum_pg(NiveauConcassage, "niveau_concassage"), nullable=False
    )

    produit: Mapped[Produit] = relationship(back_populates="parcours")


class CauseArret(Base):
    """Nomenclature codifiée des motifs d'arrêt (ch. 4.4).

    Table plutôt qu'ENUM : la liste s'enrichit avec l'usage terrain sans
    migration de schéma.
    """

    __tablename__ = "cause_arret"

    code: Mapped[str] = mapped_column(primary_key=True)
    libelle: Mapped[str] = mapped_column(nullable=False)
    categorie: Mapped[str | None] = mapped_column(String)
    actif: Mapped[bool] = mapped_column(nullable=False, server_default="true")
