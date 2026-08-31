"""Tables de collecte, module par module (ch. 6 à 11)."""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Computed, ForeignKey, Numeric, SmallInteger, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    NatureCharge,
    NatureQuantite,
    PosteTravail,
    TypeEvenementEngin,
    TypeEvenementEquipement,
)
from app.models.melanges import LotMixin, TracabiliteMixin
from app.models.referentiels import Engin, EquipementConcassage, Produit, Site
from app.models.types_sql import enum_pg

# ---------------------------------------------------------------------
# CP01 — Foration (ch. 6)
# ---------------------------------------------------------------------


class Tir(Base):
    __tablename__ = "tir"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    numero_t: Mapped[str] = mapped_column(nullable=False)
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    date_tir: Mapped[date | None]

    site: Mapped[Site] = relationship(lazy="joined")


class TrouForage(Base, TracabiliteMixin, LotMixin):
    """Suivi trou par trou, selon un cycle en deux scans (ch. 6).

    Le premier scan crée l'enregistrement lorsque la foreuse est positionnée
    et le taillant posé ; le second le clôture en fin de forage. Entre les
    deux, le trou reste ouvert dans le système.
    """

    __tablename__ = "trou_forage"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    reference: Mapped[str | None] = mapped_column(unique=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    tir_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tir.id"))
    foreuse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("engin.id"), nullable=False)
    operateur_matricule: Mapped[str | None] = mapped_column(
        ForeignKey("personnel.matricule")
    )
    poste: Mapped[PosteTravail | None] = mapped_column(enum_pg(PosteTravail, "poste_travail"))

    # --- 1er scan ---
    date_foration: Mapped[date] = mapped_column(nullable=False)
    heure_debut: Mapped[datetime] = mapped_column(nullable=False)
    compteur_debut: Mapped[Decimal | None]
    diametre_mm: Mapped[Decimal | None]
    maille_longueur_m: Mapped[Decimal | None]
    maille_largeur_m: Mapped[Decimal | None]
    gps_latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    gps_longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))

    # --- 2e scan ---
    heure_fin: Mapped[datetime | None]
    compteur_fin: Mapped[Decimal | None]
    metres_lineaires: Mapped[Decimal | None]
    numero_taillant: Mapped[str | None]
    numero_tige: Mapped[str | None]
    cloture_le: Mapped[datetime | None]

    # --- Grandeurs dérivées ---
    # Colonnes générées par PostgreSQL : elles sont lues, jamais écrites, et
    # se recalculent d'elles-mêmes lorsqu'un relevé est corrigé (principe 2
    # du ch. 2). Computed les exclut automatiquement des INSERT.
    duree_foration: Mapped[timedelta | None] = mapped_column(
        Computed("heure_fin - heure_debut", persisted=True)
    )
    utilisation_foreuse: Mapped[Decimal | None] = mapped_column(
        Computed("compteur_fin - compteur_debut", persisted=True)
    )
    est_cloture: Mapped[bool | None] = mapped_column(
        Computed("heure_fin IS NOT NULL", persisted=True)
    )

    commentaire: Mapped[str | None]

    foreuse: Mapped[Engin] = relationship(lazy="joined")
    site: Mapped[Site] = relationship(lazy="joined")

    # Recharge les colonnes générées juste après l'INSERT.
    __mapper_args__ = {"eager_defaults": True}


# ---------------------------------------------------------------------
# CP02 — Minage (ch. 7)
# ---------------------------------------------------------------------


class PrestationMinage(Base, TracabiliteMixin, LotMixin):
    """Prestation de minage réalisée par un prestataire externe."""

    __tablename__ = "prestation_minage"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    tir_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tir.id"))
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    date_prestation: Mapped[date] = mapped_column(nullable=False)
    prestataire: Mapped[str | None]
    numero_facture: Mapped[str | None]
    montant: Mapped[Decimal | None]
    devise: Mapped[str] = mapped_column(nullable=False, server_default="XOF")
    mode_reception: Mapped[str | None]
    commentaire: Mapped[str | None]

    engins_mobilises: Mapped[list["MinageEnginMobilise"]] = relationship(
        back_populates="prestation", cascade="all, delete-orphan"
    )


class MinageEnginMobilise(Base):
    """Engins CADERAC ponctuellement mobilisés sur un tir."""

    __tablename__ = "minage_engin_mobilise"

    prestation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("prestation_minage.id", ondelete="CASCADE"), primary_key=True
    )
    engin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("engin.id"), primary_key=True)
    duree_heures: Mapped[Decimal | None]

    prestation: Mapped[PrestationMinage] = relationship(back_populates="engins_mobilises")


# ---------------------------------------------------------------------
# CP03 — Marinage : journal d'événements engins (ch. 8.1)
# ---------------------------------------------------------------------


class EvenementEngin(Base, TracabiliteMixin, LotMixin):
    """Journal append-only de l'activité des engins.

    Les indicateurs attendus — temps de fonctionnement, temps d'arrêt par
    cause, nombre de reprises — sont tous des agrégations de cette table.
    Aucune durée n'y est stockée (principe 2 du ch. 2).
    """

    __tablename__ = "evenement_engin"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    engin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("engin.id"), nullable=False)
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    # Centre de coût de l'activité réellement réalisée, qui peut différer de
    # l'affectation de référence portée par la fiche engin (ch. 11.2).
    centre_cout_reel: Mapped[str | None] = mapped_column(
        ForeignKey("centre_de_cout.code")
    )
    type_evenement: Mapped[TypeEvenementEngin] = mapped_column(
        enum_pg(TypeEvenementEngin, "type_evenement_engin"), nullable=False
    )
    horodatage: Mapped[datetime] = mapped_column(nullable=False)
    compteur: Mapped[Decimal | None]
    cause_code: Mapped[str | None] = mapped_column(ForeignKey("cause_arret.code"))
    cause: Mapped[str | None]
    carburant_litres: Mapped[Decimal | None]
    operateur_matricule: Mapped[str | None] = mapped_column(
        ForeignKey("personnel.matricule")
    )
    poste: Mapped[PosteTravail | None] = mapped_column(enum_pg(PosteTravail, "poste_travail"))
    commentaire: Mapped[str | None]
    # Champs spécifiques à un type d'engin, sans migration de schéma.
    donnees_extra: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    engin: Mapped[Engin] = relationship(lazy="joined")


# ---------------------------------------------------------------------
# CP03 — Rotations de dumpers et campagne de pesage (ch. 8.2, 8.3)
# ---------------------------------------------------------------------


class RotationDumper(Base, TracabiliteMixin, LotMixin):
    """Passage d'un dumper au point de déversement.

    Table la plus volumineuse du système. La séparation entre poids réel et
    quantité estimée y est garantie par une contrainte de base, pas
    seulement par le code applicatif.
    """

    __tablename__ = "rotation_dumper"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    dumper_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("engin.id"), nullable=False)
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    horodatage: Mapped[datetime] = mapped_column(nullable=False)
    point_deversement: Mapped[str | None]
    poste: Mapped[PosteTravail | None] = mapped_column(enum_pg(PosteTravail, "poste_travail"))
    operateur_matricule: Mapped[str | None] = mapped_column(
        ForeignKey("personnel.matricule")
    )
    centre_cout_reel: Mapped[str | None] = mapped_column(
        ForeignKey("centre_de_cout.code")
    )

    poids_reel_t: Mapped[Decimal | None]
    quantite_estimee_t: Mapped[Decimal | None]
    nature_quantite: Mapped[NatureQuantite] = mapped_column(
        enum_pg(NatureQuantite, "nature_quantite"),
        nullable=False,
        server_default="estimation",
    )

    commentaire: Mapped[str | None]

    dumper: Mapped[Engin] = relationship(lazy="joined")


class CampagnePesage(Base, TracabiliteMixin):
    """Campagne de pesage alimentant la capacité nominale d'un dumper (ch. 8.3)."""

    __tablename__ = "campagne_pesage"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    engin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("engin.id"), nullable=False)
    date_pesee: Mapped[date] = mapped_column(nullable=False)
    poids_a_vide_t: Mapped[Decimal | None]
    poids_charge_t: Mapped[Decimal | None]
    nombre_pesees: Mapped[int | None] = mapped_column(SmallInteger)
    capacite_retenue_t: Mapped[Decimal | None]
    commentaire: Mapped[str | None]


# ---------------------------------------------------------------------
# Concassage (ch. 9)
# ---------------------------------------------------------------------


class EvenementEquipement(Base, TracabiliteMixin, LotMixin):
    """Journal d'activité des équipements de concassage.

    La distinction marche à charge / marche à vide est indispensable au
    calcul ultérieur du coût énergétique à la tonne.
    """

    __tablename__ = "evenement_equipement"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    equipement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("equipement_concassage.id"), nullable=False
    )
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    type_evenement: Mapped[TypeEvenementEquipement] = mapped_column(
        enum_pg(TypeEvenementEquipement, "type_evenement_equipement"), nullable=False
    )
    heure_debut: Mapped[datetime] = mapped_column(nullable=False)
    heure_fin: Mapped[datetime | None]
    poste: Mapped[PosteTravail | None] = mapped_column(enum_pg(PosteTravail, "poste_travail"))
    cause_code: Mapped[str | None] = mapped_column(ForeignKey("cause_arret.code"))
    cause: Mapped[str | None]
    production_t: Mapped[Decimal | None]
    taux_charge_pct: Mapped[Decimal | None]
    operateur_matricule: Mapped[str | None] = mapped_column(
        ForeignKey("personnel.matricule")
    )
    commentaire: Mapped[str | None]
    donnees_extra: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    duree: Mapped[timedelta | None] = mapped_column(
        Computed("heure_fin - heure_debut", persisted=True)
    )

    equipement: Mapped[EquipementConcassage] = relationship(lazy="joined")


class SortiePiece(Base, TracabiliteMixin, LotMixin):
    """Sortie magasin rattachée à un équipement OU à un engin (ch. 9.1).

    Le rattachement au niveau, à la ligne et au site n'est pas stocké : il se
    déduit de l'équipement concerné.
    """

    __tablename__ = "sortie_piece"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    date_sortie: Mapped[date] = mapped_column(nullable=False)
    equipement_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("equipement_concassage.id")
    )
    engin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("engin.id"))
    reference_piece: Mapped[str] = mapped_column(nullable=False)
    designation: Mapped[str | None]
    quantite: Mapped[Decimal] = mapped_column(nullable=False)
    cout_unitaire: Mapped[Decimal | None]
    devise: Mapped[str] = mapped_column(nullable=False, server_default="XOF")
    numero_bon: Mapped[str | None]
    commentaire: Mapped[str | None]


# ---------------------------------------------------------------------
# CP09 — Pont-bascule, vente et expédition (ch. 10)
# ---------------------------------------------------------------------


class PeseePontBascule(Base, TracabiliteMixin, LotMixin):
    __tablename__ = "pesee_pont_bascule"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    horodatage: Mapped[datetime] = mapped_column(nullable=False)
    client: Mapped[str | None]
    immatriculation: Mapped[str | None]
    produit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("produit.id"))
    poids_t: Mapped[Decimal | None]
    numero_bon: Mapped[str | None]
    commentaire: Mapped[str | None]

    produit: Mapped[Produit | None] = relationship(lazy="joined")


class Vente(Base, TracabiliteMixin, LotMixin):
    __tablename__ = "vente"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    site_id: Mapped[int] = mapped_column(ForeignKey("site.id"), nullable=False)
    date_vente: Mapped[date] = mapped_column(nullable=False)
    client: Mapped[str | None]
    produit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("produit.id"))
    quantite_t: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    montant: Mapped[Decimal | None]
    devise: Mapped[str] = mapped_column(nullable=False, server_default="XOF")
    pesee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("pesee_pont_bascule.id")
    )
    vendeur_matricule: Mapped[str | None] = mapped_column(
        ForeignKey("personnel.matricule")
    )
    numero_facture: Mapped[str | None]
    commentaire: Mapped[str | None]


# ---------------------------------------------------------------------
# Coûts et affectation du parc (ch. 11)
# ---------------------------------------------------------------------


class ChargeEngin(Base, TracabiliteMixin, LotMixin):
    """Charge administrative ou de fonctionnement rattachée à un engin.

    Cette table ne porte aucune règle de calcul : le système enregistre des
    montants, il ne les impute pas.
    """

    __tablename__ = "charge_engin"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    engin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("engin.id"), nullable=False)
    nature: Mapped[NatureCharge] = mapped_column(
        enum_pg(NatureCharge, "nature_charge"), nullable=False
    )
    categorie: Mapped[str] = mapped_column(nullable=False)
    date_charge: Mapped[date] = mapped_column(nullable=False)
    montant: Mapped[Decimal | None]
    devise: Mapped[str] = mapped_column(nullable=False, server_default="XOF")
    # Période couverte : permet au gestionnaire d'étaler une charge annuelle
    # sur les mois concernés plutôt que sur le seul mois de son paiement.
    periode_debut: Mapped[date | None]
    periode_fin: Mapped[date | None]
    reference_document: Mapped[str | None]
    commentaire: Mapped[str | None]

    engin: Mapped[Engin] = relationship(lazy="joined")


class AffectationReelleEngin(Base, TracabiliteMixin, LotMixin):
    """Activité réellement réalisée par un engin sur une journée (ch. 11.2)."""

    __tablename__ = "affectation_reelle_engin"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    engin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("engin.id"), nullable=False)
    date_activite: Mapped[date] = mapped_column(nullable=False)
    centre_cout_reel: Mapped[str] = mapped_column(
        ForeignKey("centre_de_cout.code"), nullable=False
    )
    activite: Mapped[str | None]
    duree_heures: Mapped[Decimal | None]
    commentaire: Mapped[str | None]
