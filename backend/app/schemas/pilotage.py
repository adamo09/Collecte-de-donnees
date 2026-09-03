"""Schémas des indicateurs de pilotage.

Le contrat est déclaré plutôt que déduit d'un dictionnaire : le back-office
lit une trentaine de champs, et un champ renommé côté serveur doit casser sa
compilation, pas se transformer en tuile vide sur l'écran du contrôleur.

Aucun champ de coût n'y figure, et c'est délibéré : voir
`app.services.indicateurs` et la décision D12 du cahier des charges.
"""

from datetime import date

from pydantic import BaseModel


class Periode(BaseModel):
    du: date
    au: date
    site: str | None


class Production(BaseModel):
    rotations: int
    dumpers_actifs: int
    # Deux tonnages, jamais un total : l'un est mesuré au pont-bascule,
    # l'autre est le dire d'un chauffeur. Les additionner produirait un
    # chiffre à l'air juste dont personne ne pourrait dire ce qu'il mesure.
    tonnage_pese_t: float
    tonnage_estime_t: float
    part_estimee_pct: float | None
    lignes_pesees: int


class Foration(BaseModel):
    trous: int
    metres_lineaires: float
    duree_moyenne_min: float | None
    utilisation_foreuse: float
    trous_non_clotures: int


class Engins(BaseModel):
    heures_marche: float
    heures_arret: float
    taux_disponibilite_pct: float | None
    etats_non_clotures: int
    carburant_litres: float
    engins_declarants: int


class CauseArret(BaseModel):
    code: str
    libelle: str
    categorie: str
    occurrences: int
    # Un arrêt dont l'événement suivant manque n'a pas de durée connue :
    # il compte dans les occurrences, jamais dans les heures.
    occurrences_mesurees: int
    heures: float


class PointSerie(BaseModel):
    jour: date
    rotations: int
    trous: int
    tonnage_pese_t: float
    tonnage_estime_t: float


class Collecte(BaseModel):
    en_attente: dict[str, int]
    age_max_heures: float | None


class Indicateurs(BaseModel):
    periode: Periode
    production: Production
    foration: Foration
    engins: Engins
    causes_arret: list[CauseArret]
    serie: list[PointSerie]
    collecte: Collecte
