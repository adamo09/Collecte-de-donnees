"""Schémas d'authentification."""

import uuid

from pydantic import BaseModel, Field

from app.models.enums import RoleUtilisateur
from app.schemas.communs import SchemaBase, SchemaEntree


class DemandeConnexion(SchemaEntree):
    login: str
    mot_de_passe: str


class Jetons(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expire_dans_secondes: int


class DemandeRafraichissement(SchemaEntree):
    refresh_token: str


class UtilisateurSortie(SchemaBase):
    id: uuid.UUID
    login: str
    nom_complet: str
    role: RoleUtilisateur
    site_id: int | None = None
    matricule: str | None = None
    actif: bool


class UtilisateurCreation(SchemaEntree):
    login: str = Field(min_length=3, max_length=64)
    mot_de_passe: str = Field(min_length=8, max_length=128)
    nom_complet: str = Field(min_length=1)
    role: RoleUtilisateur
    site_id: int | None = None
    matricule: str | None = None


class UtilisateurModification(SchemaEntree):
    nom_complet: str | None = None
    role: RoleUtilisateur | None = None
    site_id: int | None = None
    matricule: str | None = None
    actif: bool | None = None


class ChangementMotDePasse(SchemaEntree):
    mot_de_passe_actuel: str
    nouveau_mot_de_passe: str = Field(min_length=8, max_length=128)
