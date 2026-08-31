"""Contrat de la synchronisation hors ligne (ch. 12).

Cette structure est le contrat le plus sensible du système : elle est
consommée par l'application mobile et doit rester compatible ascendante.
Toute évolution se fait par ajout de champs facultatifs, jamais par
renommage ni suppression.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import ResultatLot
from app.schemas.collecte import (
    AffectationReelleEntree,
    ChargeEnginEntree,
    EvenementEnginEntree,
    EvenementEquipementEntree,
    PeseeEntree,
    PrestationMinageEntree,
    RotationDumperEntree,
    SortiePieceEntree,
    TrouForageComplet,
)
from app.schemas.communs import SchemaEntree


class LotSynchronisationEntree(SchemaEntree):
    """Un envoi de données depuis un terminal.

    L'identifiant du lot est produit par le terminal : renvoyer deux fois le
    même lot ne crée aucun doublon.
    """

    lot_id: uuid.UUID = Field(description="Clé d'idempotence générée par le terminal")
    terminal_id: str = Field(min_length=1, max_length=64)
    application_version: str | None = None
    envoye_le: datetime

    # Une liste par table de collecte. Toutes sont facultatives : un terminal
    # dédié aux rotations n'envoie que des rotations.
    trous_forage: list[TrouForageComplet] = []
    evenements_engin: list[EvenementEnginEntree] = []
    rotations_dumper: list[RotationDumperEntree] = []
    evenements_equipement: list[EvenementEquipementEntree] = []
    pesees: list[PeseeEntree] = []
    prestations_minage: list[PrestationMinageEntree] = []
    sorties_piece: list[SortiePieceEntree] = []
    charges_engin: list[ChargeEnginEntree] = []
    affectations_reelles: list[AffectationReelleEntree] = []

    def nombre_total(self) -> int:
        return sum(
            len(getattr(self, champ))
            for champ in (
                "trous_forage",
                "evenements_engin",
                "rotations_dumper",
                "evenements_equipement",
                "pesees",
                "prestations_minage",
                "sorties_piece",
                "charges_engin",
                "affectations_reelles",
            )
        )


class ResultatEnregistrement(BaseModel):
    """Sort réservé à un enregistrement du lot."""

    table_cible: str
    id: uuid.UUID
    accepte: bool
    # Vrai lorsque l'enregistrement était déjà présent : le terminal peut
    # alors purger sa file d'envoi en toute sécurité.
    doublon: bool = False
    erreur: str | None = None


class LotSynchronisationSortie(BaseModel):
    """Accusé de réception détaillé du lot."""

    lot_id: uuid.UUID
    recu_le: datetime
    nb_enregistrements: int
    nb_acceptes: int
    nb_rejetes: int
    nb_doublons: int
    resultat: ResultatLot
    # Le détail permet au terminal de ne conserver dans sa file que les
    # enregistrements réellement rejetés, et de les présenter à l'agent.
    details: list[ResultatEnregistrement] = []
    deja_traite: bool = Field(
        default=False,
        description=(
            "Vrai si ce lot avait déjà été reçu : la réponse est alors "
            "rejouée à l'identique."
        ),
    )


class VersionReferentielSortie(BaseModel):
    nom_referentiel: str
    version: int
    maj_le: datetime


class EtatReferentiels(BaseModel):
    """Versions courantes des référentiels.

    Le terminal compare ces numéros à sa copie locale pour ne retélécharger
    que ce qui a changé.
    """

    versions: list[VersionReferentielSortie]


class ParametragePoste(BaseModel):
    """Tout ce dont un terminal a besoin pour travailler hors ligne.

    Renvoyé en un seul appel au démarrage de journée, filtré sur le site de
    l'agent : une dizaine d'engins, pas cent (ch. 8.2).
    """

    site_id: int
    site_code: str
    versions: list[VersionReferentielSortie]
    engins: list[dict]
    equipements: list[dict]
    personnel: list[dict]
    produits: list[dict]
    causes_arret: list[dict]
    centres_de_cout: list[dict]
    tirs_ouverts: list[dict]
