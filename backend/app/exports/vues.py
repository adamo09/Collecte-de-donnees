"""Contrat d'export vers le gestionnaire externe (ch. 13).

Le livrable du projet n'est pas la base mais cet ensemble de vues. Leur
structure doit rester figée une fois validée colonne par colonne avec le
gestionnaire : le catalogue ci-dessous est la déclaration explicite de ce
contrat, et tout écart entre ce catalogue et la base est une régression.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class DefinitionVue:
    """Une vue d'export et les filtres qu'elle accepte."""

    nom: str
    vue_sql: str
    libelle: str
    description: str
    # Nom du filtre exposé dans l'API → colonne de la vue.
    colonne_site: str | None = "site"
    colonne_date: str | None = None
    filtres_supplementaires: dict[str, str] = field(default_factory=dict)
    tri: str = "1"


CATALOGUE: dict[str, DefinitionVue] = {
    "foration": DefinitionVue(
        nom="foration",
        vue_sql="v_export_foration",
        libelle="CP01 — Trous forés",
        description=(
            "Trous forés, avec durée, utilisation foreuse, mètres linéaires, "
            "consommables et références de tir."
        ),
        colonne_date="date_foration",
        filtres_supplementaires={"foreuse": "foreuse", "numero_tir": "numero_tir"},
        tri="date_foration, id_trou",
    ),
    "activite_engin": DefinitionVue(
        nom="activite_engin",
        vue_sql="v_export_activite_engin",
        libelle="Activité des engins",
        description=(
            "Événements engins avec cause d'arrêt codifiée, compteur, carburant "
            "et centre de coût réel."
        ),
        colonne_date="horodatage",
        filtres_supplementaires={
            "engin": "engin",
            "famille": "famille",
            "centre_cout": "centre_cout_reel",
        },
        tri="horodatage",
    ),
    "rotations": DefinitionVue(
        nom="rotations",
        vue_sql="v_export_rotations",
        libelle="CP03 — Rotations de dumpers",
        description=(
            "Rotations de dumpers avec distinction stricte entre tonnage pesé "
            "et tonnage estimé."
        ),
        colonne_date="horodatage",
        filtres_supplementaires={"dumper": "dumper", "centre_cout": "centre_cout_reel"},
        tri="horodatage",
    ),
    "pesees": DefinitionVue(
        nom="pesees",
        vue_sql="v_export_pesees",
        libelle="CP09 — Pesées au pont-bascule",
        description="Pesées au pont-bascule avec client, camion, produit et bon de livraison.",
        colonne_date="horodatage",
        filtres_supplementaires={"client": "client", "produit": "produit"},
        tri="horodatage",
    ),
    "charges_engin": DefinitionVue(
        nom="charges_engin",
        vue_sql="v_export_charges_engin",
        libelle="Charges par engin",
        description=(
            "Charges administratives et de fonctionnement par engin et par "
            "catégorie, avec période couverte."
        ),
        colonne_date="date_charge",
        filtres_supplementaires={
            "engin": "engin",
            "categorie": "categorie",
            "nature": "nature",
        },
        tri="date_charge, engin",
    ),
    "completude": DefinitionVue(
        nom="completude",
        vue_sql="v_completude_collecte",
        libelle="Complétude de la collecte",
        description=(
            "Suivi quotidien de la complétude : qui déclare, qui ne déclare pas, "
            "trous non clôturés, données restées au statut brut."
        ),
        colonne_date="jour",
        tri="jour DESC, site",
    ),
}
