"""Schémas du workflow de contrôle et de validation (ch. 5)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import StatutValidation
from app.schemas.communs import SchemaBase, SchemaEntree

# Tables de collecte sur lesquelles le workflow de validation s'applique.
TABLES_VALIDABLES = (
    "trou_forage",
    "evenement_engin",
    "rotation_dumper",
    "evenement_equipement",
    "pesee_pont_bascule",
    "prestation_minage",
    "sortie_piece",
    "vente",
    "charge_engin",
    "affectation_reelle_engin",
    "campagne_pesage",
)


class DemandeChangementStatut(SchemaEntree):
    """Fait avancer une donnée dans son cycle de validation."""

    nouveau_statut: StatutValidation
    motif: str | None = Field(
        default=None,
        description="Obligatoire pour un rejet, et pour toute reprise d'une donnée validée.",
    )


class ChangementStatutLot(SchemaEntree):
    """Traite d'un coup une sélection issue de la file de validation."""

    identifiants: list[uuid.UUID] = Field(min_length=1, max_length=500)
    nouveau_statut: StatutValidation
    motif: str | None = None


class ResultatChangementStatut(BaseModel):
    id: uuid.UUID
    applique: bool
    ancien_statut: StatutValidation | None = None
    nouveau_statut: StatutValidation | None = None
    erreur: str | None = None


class ResultatChangementStatutLot(BaseModel):
    table_cible: str
    nb_traites: int
    nb_appliques: int
    nb_refuses: int
    details: list[ResultatChangementStatut]


class DemandeCorrection(SchemaEntree):
    """Correction d'une donnée déjà validée.

    Le motif est obligatoire : une donnée validée ne doit jamais être
    modifiée silencieusement (ch. 5.1).
    """

    modifications: dict = Field(min_length=1, description="Couples champ / nouvelle valeur")
    motif: str = Field(min_length=3)


class LigneAudit(SchemaBase):
    id: int
    table_cible: str
    enregistrement: str
    champ: str
    ancienne_valeur: str | None = None
    nouvelle_valeur: str | None = None
    auteur_id: uuid.UUID
    motif: str | None = None
    modifie_le: datetime


class LigneFileValidation(BaseModel):
    table_cible: str
    id: uuid.UUID
    site_id: int
    statut: StatutValidation
    saisi_le: datetime
    recu_le: datetime
    auteur_id: uuid.UUID
