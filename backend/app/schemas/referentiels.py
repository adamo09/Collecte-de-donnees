"""Schémas des référentiels (ch. 4)."""

import uuid
from datetime import date
from decimal import Decimal

from pydantic import Field

from app.models.enums import FamilleEngin, NiveauConcassage, TypeEquipement
from app.schemas.communs import SchemaBase, SchemaEntree


# --- Site ------------------------------------------------------------
class SiteSortie(SchemaBase):
    id: int
    code: str
    libelle: str
    actif: bool


class SiteEntree(SchemaEntree):
    code: str = Field(min_length=2, max_length=8)
    libelle: str
    actif: bool = True


# --- Centre de coût --------------------------------------------------
class CentreDeCoutSortie(SchemaBase):
    code: str
    libelle: str
    actif: bool


class CentreDeCoutEntree(SchemaEntree):
    code: str = Field(min_length=2, max_length=8)
    libelle: str
    actif: bool = True


# --- Engin -----------------------------------------------------------
class EnginSortie(SchemaBase):
    id: uuid.UUID
    numero_parc: str
    matricule: str | None = None
    famille: FamilleEngin
    type_engin: str | None = None
    marque: str | None = None
    modele: str | None = None
    site_id: int
    centre_cout_reference: str | None = None
    capacite_nominale: Decimal | None = None
    unite_capacite: str | None = None
    puissance_kw: Decimal | None = None
    date_acquisition: date | None = None
    date_mise_en_service: date | None = None
    cout_acquisition: Decimal | None = None
    unite_compteur: str
    compteur_actuel: Decimal | None = None
    qr_token: str | None = None
    actif: bool


class EnginEntree(SchemaEntree):
    numero_parc: str = Field(min_length=1, max_length=32)
    matricule: str | None = None
    famille: FamilleEngin
    type_engin: str | None = None
    marque: str | None = None
    modele: str | None = None
    site_id: int
    centre_cout_reference: str | None = None
    capacite_nominale: Decimal | None = Field(default=None, ge=0)
    unite_capacite: str | None = None
    puissance_kw: Decimal | None = Field(default=None, ge=0)
    date_acquisition: date | None = None
    date_mise_en_service: date | None = None
    cout_acquisition: Decimal | None = Field(default=None, ge=0)
    unite_compteur: str = "heures"
    actif: bool = True
    # compteur_actuel est volontairement absent : il est alimenté par les
    # événements engins, jamais saisi directement.


class EnginModification(SchemaEntree):
    matricule: str | None = None
    type_engin: str | None = None
    marque: str | None = None
    modele: str | None = None
    site_id: int | None = None
    centre_cout_reference: str | None = None
    capacite_nominale: Decimal | None = Field(default=None, ge=0)
    unite_capacite: str | None = None
    puissance_kw: Decimal | None = Field(default=None, ge=0)
    date_acquisition: date | None = None
    date_mise_en_service: date | None = None
    cout_acquisition: Decimal | None = Field(default=None, ge=0)
    unite_compteur: str | None = None
    actif: bool | None = None


# --- Équipement de concassage ----------------------------------------
class EquipementSortie(SchemaBase):
    id: uuid.UUID
    designation: str
    type: TypeEquipement
    site_id: int
    ligne: str | None = None
    niveau: NiveauConcassage | None = None
    poste: str | None = None
    puissance_kw: Decimal | None = None
    qr_token: str | None = None
    actif: bool


class EquipementEntree(SchemaEntree):
    designation: str = Field(min_length=1)
    type: TypeEquipement
    site_id: int
    ligne: str | None = None
    niveau: NiveauConcassage | None = None
    poste: str | None = None
    puissance_kw: Decimal | None = Field(default=None, ge=0)
    actif: bool = True


# --- Personnel -------------------------------------------------------
class PersonnelSortie(SchemaBase):
    matricule: str
    nom_prenoms: str
    fonction: str | None = None
    site_id: int | None = None
    centre_cout: str | None = None
    date_debut_affect: date | None = None
    date_fin_affect: date | None = None
    actif: bool


class PersonnelEntree(SchemaEntree):
    matricule: str = Field(min_length=1, max_length=32)
    nom_prenoms: str = Field(min_length=1)
    fonction: str | None = None
    site_id: int | None = None
    centre_cout: str | None = None
    date_debut_affect: date | None = None
    date_fin_affect: date | None = None
    actif: bool = True


# --- Produit ---------------------------------------------------------
class ProduitParcoursSortie(SchemaBase):
    ordre: int
    niveau: NiveauConcassage


class ProduitParcoursEntree(SchemaEntree):
    ordre: int = Field(ge=1)
    niveau: NiveauConcassage


class ProduitSortie(SchemaBase):
    id: uuid.UUID
    code: str
    libelle: str
    site_id: int | None = None
    granulometrie: str | None = None
    actif: bool
    parcours: list[ProduitParcoursSortie] = []


class ProduitEntree(SchemaEntree):
    code: str = Field(min_length=1, max_length=32)
    libelle: str = Field(min_length=1)
    site_id: int | None = None
    granulometrie: str | None = None
    actif: bool = True
    # Le parcours ordonné du produit dans les niveaux de concassage : un
    # produit qui ne traverse pas un niveau ne doit pas en supporter le coût.
    parcours: list[ProduitParcoursEntree] = []


# --- Cause d'arrêt ---------------------------------------------------
class CauseArretSortie(SchemaBase):
    code: str
    libelle: str
    categorie: str | None = None
    actif: bool


class CauseArretEntree(SchemaEntree):
    code: str = Field(min_length=2, max_length=32)
    libelle: str = Field(min_length=1)
    categorie: str | None = None
    actif: bool = True


# --- Tir -------------------------------------------------------------
class TirSortie(SchemaBase):
    id: uuid.UUID
    numero_t: str
    site_id: int
    date_tir: date | None = None


class TirEntree(SchemaEntree):
    numero_t: str = Field(min_length=1, max_length=16)
    site_id: int
    date_tir: date | None = None
