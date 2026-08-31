"""Éléments de schéma partagés par tous les modules."""

import uuid
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ModeCollecte, StatutValidation

T = TypeVar("T")


class SchemaBase(BaseModel):
    """Base des schémas de sortie, lisibles depuis un objet ORM."""

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class SchemaEntree(BaseModel):
    """Base des schémas d'entrée : tout champ non prévu est refusé.

    Un terminal qui envoie un champ inconnu doit être corrigé, pas ignoré
    silencieusement.
    """

    model_config = ConfigDict(extra="forbid")


class TracabiliteSortie(SchemaBase):
    """Les sept attributs de traçabilité, exposés en lecture (ch. 5)."""

    source_collecte: ModeCollecte
    auteur_id: uuid.UUID
    saisi_le: datetime
    recu_le: datetime
    statut: StatutValidation
    valide_par: uuid.UUID | None = None
    valide_le: datetime | None = None
    piece_jointe_url: str | None = None


class TracabiliteEntree(SchemaEntree):
    """Ce que le terminal fournit lui-même du bloc de traçabilité.

    Le serveur impose le reste : auteur_id vient du jeton, recu_le de
    l'horloge serveur, et statut vaut toujours « brute » à l'arrivée. Un
    terminal ne peut pas déclarer une donnée déjà validée.
    """

    source_collecte: ModeCollecte = ModeCollecte.SAISIE_DIRECTE
    # Horodatage de la saisie sur le terrain, qui peut précéder de plusieurs
    # heures l'arrivée au serveur.
    saisi_le: datetime | None = None
    piece_jointe_url: str | None = None


class Page(BaseModel, Generic[T]):
    """Réponse paginée."""

    total: int = Field(description="Nombre total d'enregistrements correspondant au filtre")
    limite: int
    decalage: int
    elements: list[T]


class MessageReponse(BaseModel):
    message: str
