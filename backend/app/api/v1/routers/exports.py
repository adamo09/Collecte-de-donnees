"""Exports vers le gestionnaire externe (ch. 13).

Le gestionnaire ne travaille pas dans l'application : il exploite les
données extraites. Ces exports sont donc le véritable point de livraison
du projet.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

from app.core.dependances import ExigeSuperviseur, SessionBD, UtilisateurConnecte
from app.exports.generateur import (
    VueInconnue,
    generer_csv,
    generer_excel,
    lire,
    resoudre_vue,
)
from app.exports.vues import CATALOGUE

routeur = APIRouter(prefix="/exports", tags=["Exports"])

TYPE_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@routeur.get("/catalogue", summary="Catalogue des exports disponibles")
def catalogue() -> dict:
    """Structure contractuelle des exports.

    Cette structure est le seul point de contact entre le travail du
    gestionnaire externe et le système : une fois validée colonne par
    colonne, elle ne doit plus bouger (ch. 14).
    """
    return {
        "exports": [
            {
                "nom": d.nom,
                "libelle": d.libelle,
                "description": d.description,
                "vue_sql": d.vue_sql,
                "filtres": {
                    "site": d.colonne_site is not None,
                    "periode": d.colonne_date is not None,
                    "specifiques": sorted(d.filtres_supplementaires),
                },
            }
            for d in CATALOGUE.values()
        ]
    }


def _definition_ou_404(nom: str):
    try:
        return resoudre_vue(nom)
    except VueInconnue as erreur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(erreur)
        ) from erreur


@routeur.get("/{nom_export}", summary="Consulter un export en JSON")
def consulter_export(
    session: SessionBD,
    _: UtilisateurConnecte,
    nom_export: str,
    site: str | None = Query(default=None, description="Code site : KOS, BKE, ABO, LDB"),
    du: date | None = None,
    au: date | None = Query(
        default=None, description="Borne haute incluse dans le résultat"
    ),
    engin: str | None = None,
    dumper: str | None = None,
    foreuse: str | None = None,
    famille: str | None = None,
    centre_cout: str | None = None,
    categorie: str | None = None,
    nature: str | None = None,
    client: str | None = None,
    produit: str | None = None,
    numero_tir: str | None = None,
    limite: int = Query(default=5000, ge=1, le=100_000),
) -> dict:
    """Aperçu paginé d'un export, pour contrôle avant téléchargement."""
    definition = _definition_ou_404(nom_export)
    colonnes, lignes = lire(
        session,
        definition,
        site=site,
        du=du,
        # La borne haute est rendue inclusive : « au 31/08 » doit contenir
        # les événements du 31/08 à 23 h 50.
        au=au + timedelta(days=1) if au else None,
        filtres={
            "engin": engin,
            "dumper": dumper,
            "foreuse": foreuse,
            "famille": famille,
            "centre_cout": centre_cout,
            "categorie": categorie,
            "nature": nature,
            "client": client,
            "produit": produit,
            "numero_tir": numero_tir,
        },
        limite=limite,
    )
    return {
        "export": definition.nom,
        "libelle": definition.libelle,
        "colonnes": colonnes,
        "nb_lignes": len(lignes),
        "tronque": len(lignes) >= limite,
        "lignes": lignes,
    }


@routeur.get(
    "/{nom_export}/fichier",
    summary="Télécharger un export en Excel ou CSV",
    response_class=Response,
)
def telecharger_export(
    session: SessionBD,
    utilisateur: ExigeSuperviseur,
    nom_export: str,
    format: str = Query(default="xlsx", pattern="^(xlsx|csv)$"),
    site: str | None = None,
    du: date | None = None,
    au: date | None = None,
    engin: str | None = None,
    dumper: str | None = None,
    foreuse: str | None = None,
    famille: str | None = None,
    centre_cout: str | None = None,
    categorie: str | None = None,
    nature: str | None = None,
    client: str | None = None,
    produit: str | None = None,
    numero_tir: str | None = None,
) -> Response:
    """Produit le fichier livré au gestionnaire externe."""
    definition = _definition_ou_404(nom_export)
    filtres = {
        "engin": engin,
        "dumper": dumper,
        "foreuse": foreuse,
        "famille": famille,
        "centre_cout": centre_cout,
        "categorie": categorie,
        "nature": nature,
        "client": client,
        "produit": produit,
        "numero_tir": numero_tir,
    }
    colonnes, lignes = lire(
        session,
        definition,
        site=site,
        du=du,
        au=au + timedelta(days=1) if au else None,
        filtres=filtres,
    )

    horodatage = datetime.now().strftime("%Y%m%d_%H%M")
    morceaux = ["caderac", definition.nom]
    if site:
        morceaux.append(site)
    if du:
        morceaux.append(du.strftime("%Y%m%d"))
    if au:
        morceaux.append(au.strftime("%Y%m%d"))
    morceaux.append(horodatage)
    nom_fichier = "_".join(morceaux)

    if format == "csv":
        contenu = generer_csv(colonnes, lignes)
        type_mime = "text/csv; charset=utf-8"
        extension = "csv"
    else:
        contexte = {
            "Site": site or "tous",
            "Période": f"{du or 'origine'} → {au or 'aujourd’hui'}",
            "Exporté par": utilisateur.nom_complet,
        }
        contexte.update(
            {cle: valeur for cle, valeur in filtres.items() if valeur is not None}
        )
        contenu = generer_excel(definition, colonnes, lignes, contexte)
        type_mime = TYPE_EXCEL
        extension = "xlsx"

    return Response(
        content=contenu,
        media_type=type_mime,
        headers={
            "Content-Disposition": f'attachment; filename="{nom_fichier}.{extension}"'
        },
    )
