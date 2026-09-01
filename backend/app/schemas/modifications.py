"""Schémas de modification partielle des référentiels.

Chaque champ est facultatif : seuls ceux effectivement transmis sont
modifiés. `exclude_unset` distingue « champ absent » de « champ mis à
null » — sans quoi une modification du seul libellé effacerait tout le
reste de la fiche.
"""

from datetime import date
from decimal import Decimal

from pydantic import Field

from app.models.enums import NiveauConcassage, TypeEquipement
from app.schemas.communs import SchemaEntree


class SiteModification(SchemaEntree):
    libelle: str | None = None
    actif: bool | None = None


class CentreDeCoutModification(SchemaEntree):
    libelle: str | None = None
    actif: bool | None = None


class PersonnelModification(SchemaEntree):
    """Le matricule n'est pas modifiable : c'est la clé à laquelle chaque
    déclaration terrain se rattache."""

    nom_prenoms: str | None = None
    fonction: str | None = None
    site_id: int | None = None
    centre_cout: str | None = None
    date_debut_affect: date | None = None
    date_fin_affect: date | None = None
    actif: bool | None = None


class EquipementModification(SchemaEntree):
    designation: str | None = None
    type: TypeEquipement | None = None
    site_id: int | None = None
    ligne: str | None = None
    niveau: NiveauConcassage | None = None
    poste: str | None = None
    puissance_kw: Decimal | None = Field(default=None, ge=0)
    actif: bool | None = None


class ProduitModification(SchemaEntree):
    """Le code n'est pas modifiable : il est repris par les pesées et les
    ventes déjà enregistrées."""

    libelle: str | None = None
    site_id: int | None = None
    granulometrie: str | None = None
    actif: bool | None = None
    # Fourni, le parcours remplace entièrement l'ancien : un parcours se
    # lit comme une séquence, le modifier par éléments n'aurait pas de sens.
    parcours: list[dict] | None = None


class CauseArretModification(SchemaEntree):
    """Le code n'est pas modifiable : les événements déjà déclarés y
    renvoient, et le renommer fausserait toute statistique d'arrêts."""

    libelle: str | None = None
    categorie: str | None = None
    actif: bool | None = None


class TirModification(SchemaEntree):
    numero_t: str | None = Field(default=None, min_length=1, max_length=16)
    date_tir: date | None = None
