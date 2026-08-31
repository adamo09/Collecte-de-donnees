"""Schémas des tables de collecte (ch. 6 à 11).

Convention commune à tout le module : l'identifiant est fourni par le
terminal, jamais par le serveur. C'est ce qui permet à un agent hors
connexion de créer une donnée sans attendre le réseau et rend la
synchronisation idempotente (principe 1 du ch. 2).
"""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.models.enums import (
    NatureCharge,
    NatureQuantite,
    PosteTravail,
    StatutValidation,
    TypeEvenementEngin,
    TypeEvenementEquipement,
)
from app.schemas.communs import SchemaBase, TracabiliteEntree, TracabiliteSortie

# =====================================================================
# CP01 — Foration (ch. 6) — cycle en deux scans
# =====================================================================


class TrouForagePremierScan(TracabiliteEntree):
    """Premier scan : la foreuse est positionnée, le taillant posé.

    Crée l'enregistrement, qui reste ouvert jusqu'au second scan.
    """

    id: uuid.UUID = Field(description="UUID généré par le terminal")
    site_id: int
    foreuse_id: uuid.UUID
    tir_id: uuid.UUID | None = None
    operateur_matricule: str | None = None
    poste: PosteTravail | None = None

    date_foration: date
    heure_debut: datetime
    compteur_debut: Decimal | None = Field(default=None, ge=0)
    diametre_mm: Decimal | None = Field(default=None, gt=0)
    maille_longueur_m: Decimal | None = Field(default=None, gt=0)
    maille_largeur_m: Decimal | None = Field(default=None, gt=0)
    gps_latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    gps_longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    commentaire: str | None = None

    @model_validator(mode="after")
    def _gps_complet(self) -> "TrouForagePremierScan":
        if (self.gps_latitude is None) != (self.gps_longitude is None):
            raise ValueError(
                "La position GPS doit être fournie entièrement ou pas du tout."
            )
        return self


class TrouForageSecondScan(TracabiliteEntree):
    """Second scan : clôture du trou en fin de forage."""

    heure_fin: datetime
    compteur_fin: Decimal | None = Field(default=None, ge=0)
    metres_lineaires: Decimal | None = Field(default=None, gt=0)
    numero_taillant: str | None = None
    numero_tige: str | None = None
    commentaire: str | None = None


class TrouForageComplet(TrouForagePremierScan):
    """Trou déclaré en une seule fois, les deux scans étant déjà réalisés.

    Utilisé par la synchronisation : un terminal resté hors ligne toute la
    journée transmet des trous déjà clôturés.
    """

    heure_fin: datetime | None = None
    compteur_fin: Decimal | None = Field(default=None, ge=0)
    metres_lineaires: Decimal | None = Field(default=None, gt=0)
    numero_taillant: str | None = None
    numero_tige: str | None = None

    @model_validator(mode="after")
    def _chronologie(self) -> "TrouForageComplet":
        if self.heure_fin is not None and self.heure_fin < self.heure_debut:
            raise ValueError("L'heure de fin ne peut pas précéder l'heure de début.")
        if (
            self.compteur_fin is not None
            and self.compteur_debut is not None
            and self.compteur_fin < self.compteur_debut
        ):
            raise ValueError("Le compteur de fin ne peut pas être inférieur à celui de début.")
        return self


class TrouForageSortie(TracabiliteSortie):
    id: uuid.UUID
    reference: str | None = None
    site_id: int
    tir_id: uuid.UUID | None = None
    foreuse_id: uuid.UUID
    operateur_matricule: str | None = None
    poste: PosteTravail | None = None

    date_foration: date
    heure_debut: datetime
    compteur_debut: Decimal | None = None
    diametre_mm: Decimal | None = None
    maille_longueur_m: Decimal | None = None
    maille_largeur_m: Decimal | None = None
    gps_latitude: Decimal | None = None
    gps_longitude: Decimal | None = None

    heure_fin: datetime | None = None
    compteur_fin: Decimal | None = None
    metres_lineaires: Decimal | None = None
    numero_taillant: str | None = None
    numero_tige: str | None = None
    cloture_le: datetime | None = None

    # Grandeurs dérivées, calculées par la base.
    duree_foration: timedelta | None = None
    utilisation_foreuse: Decimal | None = None
    est_cloture: bool | None = None
    commentaire: str | None = None


class TrouNonCloture(SchemaBase):
    """Ligne de l'écran « trous non clôturés » (contrôle du ch. 6)."""

    id: uuid.UUID
    reference: str | None = None
    site: str
    foreuse: str
    operateur_matricule: str | None = None
    date_foration: date
    heure_debut: datetime
    anciennete_heures: float
    statut: StatutValidation


# =====================================================================
# CP02 — Minage (ch. 7)
# =====================================================================


class EnginMobiliseEntree(TracabiliteEntree):
    engin_id: uuid.UUID
    duree_heures: Decimal | None = Field(default=None, ge=0, le=24)


class EnginMobiliseSortie(SchemaBase):
    engin_id: uuid.UUID
    duree_heures: Decimal | None = None


class PrestationMinageEntree(TracabiliteEntree):
    id: uuid.UUID
    tir_id: uuid.UUID | None = None
    site_id: int
    date_prestation: date
    prestataire: str | None = None
    numero_facture: str | None = None
    montant: Decimal | None = Field(default=None, ge=0)
    devise: str = "XOF"
    mode_reception: str | None = None
    commentaire: str | None = None
    engins_mobilises: list[EnginMobiliseEntree] = []


class PrestationMinageSortie(TracabiliteSortie):
    id: uuid.UUID
    tir_id: uuid.UUID | None = None
    site_id: int
    date_prestation: date
    prestataire: str | None = None
    numero_facture: str | None = None
    montant: Decimal | None = None
    devise: str
    mode_reception: str | None = None
    commentaire: str | None = None
    engins_mobilises: list[EnginMobiliseSortie] = []


# =====================================================================
# CP03 — Événements engins (ch. 8.1)
# =====================================================================


class EvenementEnginEntree(TracabiliteEntree):
    id: uuid.UUID
    engin_id: uuid.UUID
    site_id: int
    centre_cout_reel: str | None = None
    type_evenement: TypeEvenementEngin
    horodatage: datetime
    compteur: Decimal | None = Field(default=None, ge=0)
    cause_code: str | None = None
    cause: str | None = Field(
        default=None,
        description=(
            "Motif libre. Doit rester l'exception : un motif saisi librement "
            "n'est pas exploitable statistiquement (ch. 4.4)."
        ),
    )
    carburant_litres: Decimal | None = Field(default=None, ge=0)
    operateur_matricule: str | None = None
    poste: PosteTravail | None = None
    commentaire: str | None = None
    donnees_extra: dict = {}


class EvenementEnginSortie(TracabiliteSortie):
    id: uuid.UUID
    engin_id: uuid.UUID
    site_id: int
    centre_cout_reel: str | None = None
    type_evenement: TypeEvenementEngin
    horodatage: datetime
    compteur: Decimal | None = None
    cause_code: str | None = None
    cause: str | None = None
    carburant_litres: Decimal | None = None
    operateur_matricule: str | None = None
    poste: PosteTravail | None = None
    commentaire: str | None = None
    donnees_extra: dict = {}


# =====================================================================
# CP03 — Rotations de dumpers et campagne de pesage (ch. 8.2, 8.3)
# =====================================================================


class RotationDumperEntree(TracabiliteEntree):
    """Passage d'un dumper au point de déversement.

    La contrainte réel / estimé est vérifiée ici en plus de l'être en base :
    l'agent obtient un message clair au lieu d'une erreur SQL.
    """

    id: uuid.UUID
    dumper_id: uuid.UUID
    site_id: int
    horodatage: datetime
    point_deversement: str | None = None
    poste: PosteTravail | None = None
    operateur_matricule: str | None = None
    centre_cout_reel: str | None = None

    poids_reel_t: Decimal | None = Field(default=None, ge=0)
    quantite_estimee_t: Decimal | None = Field(default=None, ge=0)
    nature_quantite: NatureQuantite = NatureQuantite.ESTIMATION
    commentaire: str | None = None

    @model_validator(mode="after")
    def _coherence_quantite(self) -> "RotationDumperEntree":
        if self.nature_quantite == NatureQuantite.PESEE_REELLE and self.poids_reel_t is None:
            raise ValueError(
                "Une rotation déclarée « pesee_reelle » doit porter un poids_reel_t."
            )
        if (
            self.nature_quantite == NatureQuantite.ESTIMATION
            and self.quantite_estimee_t is None
        ):
            raise ValueError(
                "Une rotation déclarée « estimation » doit porter une quantite_estimee_t."
            )
        return self


class RotationDumperSortie(TracabiliteSortie):
    id: uuid.UUID
    dumper_id: uuid.UUID
    site_id: int
    horodatage: datetime
    point_deversement: str | None = None
    poste: PosteTravail | None = None
    operateur_matricule: str | None = None
    centre_cout_reel: str | None = None
    poids_reel_t: Decimal | None = None
    quantite_estimee_t: Decimal | None = None
    nature_quantite: NatureQuantite
    commentaire: str | None = None


class CampagnePesageEntree(TracabiliteEntree):
    id: uuid.UUID | None = None
    engin_id: uuid.UUID
    date_pesee: date
    poids_a_vide_t: Decimal | None = Field(default=None, ge=0)
    poids_charge_t: Decimal | None = Field(default=None, ge=0)
    nombre_pesees: int | None = Field(default=None, gt=0)
    capacite_retenue_t: Decimal | None = Field(default=None, ge=0)
    commentaire: str | None = None

    @model_validator(mode="after")
    def _poids_coherents(self) -> "CampagnePesageEntree":
        if (
            self.poids_charge_t is not None
            and self.poids_a_vide_t is not None
            and self.poids_charge_t < self.poids_a_vide_t
        ):
            raise ValueError("Le poids en charge ne peut pas être inférieur au poids à vide.")
        return self


class CampagnePesageSortie(TracabiliteSortie):
    id: uuid.UUID
    engin_id: uuid.UUID
    date_pesee: date
    poids_a_vide_t: Decimal | None = None
    poids_charge_t: Decimal | None = None
    nombre_pesees: int | None = None
    capacite_retenue_t: Decimal | None = None
    commentaire: str | None = None


# =====================================================================
# Concassage (ch. 9)
# =====================================================================


class EvenementEquipementEntree(TracabiliteEntree):
    id: uuid.UUID
    equipement_id: uuid.UUID
    site_id: int
    type_evenement: TypeEvenementEquipement
    heure_debut: datetime
    heure_fin: datetime | None = None
    poste: PosteTravail | None = None
    cause_code: str | None = None
    cause: str | None = None
    production_t: Decimal | None = Field(default=None, ge=0)
    taux_charge_pct: Decimal | None = Field(default=None, ge=0, le=100)
    operateur_matricule: str | None = None
    commentaire: str | None = None
    donnees_extra: dict = {}

    @model_validator(mode="after")
    def _chronologie(self) -> "EvenementEquipementEntree":
        if self.heure_fin is not None and self.heure_fin < self.heure_debut:
            raise ValueError("L'heure de fin ne peut pas précéder l'heure de début.")
        return self


class EvenementEquipementSortie(TracabiliteSortie):
    id: uuid.UUID
    equipement_id: uuid.UUID
    site_id: int
    type_evenement: TypeEvenementEquipement
    heure_debut: datetime
    heure_fin: datetime | None = None
    poste: PosteTravail | None = None
    cause_code: str | None = None
    cause: str | None = None
    production_t: Decimal | None = None
    taux_charge_pct: Decimal | None = None
    operateur_matricule: str | None = None
    commentaire: str | None = None
    donnees_extra: dict = {}
    duree: timedelta | None = None


class SortiePieceEntree(TracabiliteEntree):
    """Sortie magasin. La cible est un équipement OU un engin, jamais les deux."""

    id: uuid.UUID
    date_sortie: date
    equipement_id: uuid.UUID | None = None
    engin_id: uuid.UUID | None = None
    reference_piece: str = Field(min_length=1)
    designation: str | None = None
    quantite: Decimal = Field(gt=0)
    cout_unitaire: Decimal | None = Field(default=None, ge=0)
    devise: str = "XOF"
    numero_bon: str | None = None
    commentaire: str | None = None

    @model_validator(mode="after")
    def _cible_unique(self) -> "SortiePieceEntree":
        cibles = [self.equipement_id, self.engin_id]
        if sum(c is not None for c in cibles) != 1:
            raise ValueError(
                "Une sortie de pièce vise soit un équipement, soit un engin, "
                "jamais les deux ni aucun."
            )
        return self


class SortiePieceSortie(TracabiliteSortie):
    id: uuid.UUID
    date_sortie: date
    equipement_id: uuid.UUID | None = None
    engin_id: uuid.UUID | None = None
    reference_piece: str
    designation: str | None = None
    quantite: Decimal
    cout_unitaire: Decimal | None = None
    devise: str
    numero_bon: str | None = None
    commentaire: str | None = None


# =====================================================================
# CP09 — Pont-bascule et vente (ch. 10)
# =====================================================================


class PeseeEntree(TracabiliteEntree):
    id: uuid.UUID
    site_id: int
    horodatage: datetime
    client: str | None = None
    immatriculation: str | None = None
    produit_id: uuid.UUID | None = None
    poids_t: Decimal | None = Field(default=None, ge=0)
    numero_bon: str | None = None
    commentaire: str | None = None


class PeseeSortie(TracabiliteSortie):
    id: uuid.UUID
    site_id: int
    horodatage: datetime
    client: str | None = None
    immatriculation: str | None = None
    produit_id: uuid.UUID | None = None
    poids_t: Decimal | None = None
    numero_bon: str | None = None
    commentaire: str | None = None


class VenteEntree(TracabiliteEntree):
    id: uuid.UUID | None = None
    site_id: int
    date_vente: date
    client: str | None = None
    produit_id: uuid.UUID | None = None
    quantite_t: Decimal | None = Field(default=None, ge=0)
    montant: Decimal | None = Field(default=None, ge=0)
    devise: str = "XOF"
    pesee_id: uuid.UUID | None = None
    vendeur_matricule: str | None = None
    numero_facture: str | None = None
    commentaire: str | None = None


class VenteSortie(TracabiliteSortie):
    id: uuid.UUID
    site_id: int
    date_vente: date
    client: str | None = None
    produit_id: uuid.UUID | None = None
    quantite_t: Decimal | None = None
    montant: Decimal | None = None
    devise: str
    pesee_id: uuid.UUID | None = None
    vendeur_matricule: str | None = None
    numero_facture: str | None = None
    commentaire: str | None = None


# =====================================================================
# Coûts et affectation du parc (ch. 11)
# =====================================================================

# Catégories attendues au ch. 11.1. Liste indicative et non contraignante :
# elle alimente les listes déroulantes sans bloquer une catégorie nouvelle.
CATEGORIES_CHARGE = (
    "assurance",
    "vignette",
    "stationnement",
    "taxe",
    "carburant",
    "maintenance",
    "pieces",
    "consommables",
    "pneumatiques",
    "lubrifiants",
    "energie",
    "autre",
)


class ChargeEnginEntree(TracabiliteEntree):
    id: uuid.UUID | None = None
    engin_id: uuid.UUID
    nature: NatureCharge
    categorie: str = Field(min_length=1)
    date_charge: date
    montant: Decimal | None = Field(default=None, ge=0)
    devise: str = "XOF"
    periode_debut: date | None = None
    periode_fin: date | None = None
    reference_document: str | None = None
    commentaire: str | None = None

    @field_validator("categorie")
    @classmethod
    def _categorie_normalisee(cls, valeur: str) -> str:
        return valeur.strip().lower()

    @model_validator(mode="after")
    def _periode_coherente(self) -> "ChargeEnginEntree":
        if (
            self.periode_debut is not None
            and self.periode_fin is not None
            and self.periode_fin < self.periode_debut
        ):
            raise ValueError("La fin de période ne peut pas précéder son début.")
        return self


class ChargeEnginSortie(TracabiliteSortie):
    id: uuid.UUID
    engin_id: uuid.UUID
    nature: NatureCharge
    categorie: str
    date_charge: date
    montant: Decimal | None = None
    devise: str
    periode_debut: date | None = None
    periode_fin: date | None = None
    reference_document: str | None = None
    commentaire: str | None = None


class AffectationReelleEntree(TracabiliteEntree):
    """Activité réellement réalisée par un engin (ch. 11.2).

    Un dumper habituellement affecté au marinage peut intervenir
    ponctuellement en stockage/vente ; son coût doit alors suivre
    l'activité réelle, pas l'affectation de référence.
    """

    id: uuid.UUID | None = None
    engin_id: uuid.UUID
    date_activite: date
    centre_cout_reel: str
    activite: str | None = None
    duree_heures: Decimal | None = Field(default=None, ge=0, le=24)
    commentaire: str | None = None


class AffectationReelleSortie(TracabiliteSortie):
    id: uuid.UUID
    engin_id: uuid.UUID
    date_activite: date
    centre_cout_reel: str
    activite: str | None = None
    duree_heures: Decimal | None = None
    commentaire: str | None = None
