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
    # Colonnes retenues pour l'édition PDF. Une vue de vingt-six colonnes
    # ne se lit pas sur une page : le PDF est un document à imprimer et à
    # classer, pas un jeu de données. Les colonnes écartées restent dans
    # le classeur Excel et le CSV, qui demeurent les formats de travail.
    colonnes_pdf: tuple[str, ...] = ()


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
        colonnes_pdf=(
            "id_trou", "site", "numero_tir", "foreuse", "operateur",
            "date_foration", "duree_heures", "utilisation_foreuse",
            "metres_lineaires", "diametre_mm",
        ),
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
        colonnes_pdf=(
            "engin", "famille", "site", "centre_cout_reel", "type_evenement",
            "horodatage", "poste", "compteur", "cause_libelle",
            "carburant_litres",
        ),
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
        colonnes_pdf=(
            "dumper", "site", "horodatage", "poste", "point_deversement",
            "centre_cout_reel", "poids_reel_t", "quantite_estimee_t",
            "nature_quantite", "numero_rotation_du_jour",
        ),
    ),
    "pesees": DefinitionVue(
        nom="pesees",
        vue_sql="v_export_pesees",
        libelle="CP09 — Pesées au pont-bascule",
        description="Pesées au pont-bascule avec client, camion, produit et bon de livraison.",
        colonne_date="horodatage",
        filtres_supplementaires={"client": "client", "produit": "produit"},
        tri="horodatage",
        colonnes_pdf=(
            "site", "horodatage", "client", "immatriculation", "produit",
            "granulometrie", "poids_t", "numero_bon",
        ),
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
        colonnes_pdf=(
            "engin", "famille", "site", "nature", "categorie", "date_charge",
            "montant", "devise", "periode_debut", "periode_fin",
            "nb_mois_couverts",
        ),
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
        colonnes_pdf=(
            "site", "jour", "trous_declares", "trous_non_clotures",
            "rotations_declarees", "rotations_validees", "dumpers_actifs",
            "engins_ayant_declare", "engins_sans_declaration",
        ),
    ),
}
