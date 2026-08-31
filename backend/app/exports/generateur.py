"""Production des fichiers CSV et Excel à partir des vues d'export."""

import csv
import io
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.exports.vues import CATALOGUE, DefinitionVue

# Séparateur point-virgule : Excel en configuration française n'ouvre pas
# correctement un CSV séparé par des virgules.
SEPARATEUR_CSV = ";"


class VueInconnue(Exception):
    """La vue demandée n'appartient pas au catalogue d'export."""


def resoudre_vue(nom: str) -> DefinitionVue:
    definition = CATALOGUE.get(nom)
    if definition is None:
        raise VueInconnue(
            f"« {nom} » n'est pas une vue d'export. Vues disponibles : "
            + ", ".join(sorted(CATALOGUE))
        )
    return definition


def construire_requete(
    definition: DefinitionVue,
    site: str | None = None,
    du: date | None = None,
    au: date | None = None,
    filtres: dict[str, Any] | None = None,
    limite: int | None = None,
) -> tuple[str, dict[str, Any]]:
    """Assemble la requête filtrée.

    Les noms de colonnes proviennent exclusivement du catalogue, jamais de
    l'utilisateur : aucune valeur saisie n'est interpolée dans le SQL.
    """
    conditions: list[str] = []
    parametres: dict[str, Any] = {}

    if site and definition.colonne_site:
        conditions.append(f"{definition.colonne_site} = :site")
        parametres["site"] = site

    if definition.colonne_date:
        if du is not None:
            conditions.append(f"{definition.colonne_date} >= :du")
            parametres["du"] = du
        if au is not None:
            # Borne haute inclusive, y compris pour une colonne horodatée.
            conditions.append(f"{definition.colonne_date} < :au")
            parametres["au"] = au

    for nom_filtre, valeur in (filtres or {}).items():
        colonne = definition.filtres_supplementaires.get(nom_filtre)
        if colonne is None or valeur is None:
            continue
        conditions.append(f"{colonne} = :f_{nom_filtre}")
        parametres[f"f_{nom_filtre}"] = valeur

    clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    clause_limite = f"LIMIT {int(limite)}" if limite else ""
    requete = (
        f"SELECT * FROM {definition.vue_sql} {clause} "
        f"ORDER BY {definition.tri} {clause_limite}"
    )
    return requete, parametres


def lire(
    session: Session,
    definition: DefinitionVue,
    site: str | None = None,
    du: date | None = None,
    au: date | None = None,
    filtres: dict[str, Any] | None = None,
    limite: int | None = None,
) -> tuple[list[str], list[dict[str, Any]]]:
    requete, parametres = construire_requete(definition, site, du, au, filtres, limite)
    resultat = session.execute(text(requete), parametres)
    colonnes = list(resultat.keys())
    lignes = [dict(ligne) for ligne in resultat.mappings()]
    return colonnes, lignes


def _valeur_texte(valeur: Any) -> str:
    """Rend une valeur au format attendu par Excel en configuration française."""
    if valeur is None:
        return ""
    if isinstance(valeur, bool):
        return "oui" if valeur else "non"
    if isinstance(valeur, datetime):
        return valeur.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(valeur, date):
        return valeur.strftime("%Y-%m-%d")
    if isinstance(valeur, timedelta):
        # Une durée est plus exploitable en heures décimales qu'en
        # « 0:38:00 », que le tableur traite comme du texte.
        return f"{valeur.total_seconds() / 3600:.4f}".replace(".", ",")
    if isinstance(valeur, Decimal | float):
        return str(valeur).replace(".", ",")
    if isinstance(valeur, Enum):
        return str(valeur.value)
    return str(valeur)


def _valeur_excel(valeur: Any) -> Any:
    """Convertit une valeur en un type qu'openpyxl sait écrire.

    Les nombres et les dates restent natifs pour rester calculables dans le
    tableur ; tout le reste — UUID, énumérations, JSON — devient du texte.
    """
    if valeur is None or isinstance(valeur, bool | int | float | str):
        return valeur
    if isinstance(valeur, Decimal):
        return float(valeur)
    if isinstance(valeur, datetime):
        # Excel ne sait pas représenter un fuseau horaire : l'horodatage est
        # normalisé en UTC, puis rendu naïf.
        return valeur.astimezone(UTC).replace(tzinfo=None) if valeur.tzinfo else valeur
    if isinstance(valeur, date):
        return valeur
    if isinstance(valeur, timedelta):
        return round(valeur.total_seconds() / 3600, 4)
    if isinstance(valeur, Enum):
        return str(valeur.value)
    if isinstance(valeur, uuid.UUID):
        return str(valeur)
    return str(valeur)


def generer_csv(colonnes: list[str], lignes: list[dict[str, Any]]) -> bytes:
    tampon = io.StringIO()
    redacteur = csv.writer(tampon, delimiter=SEPARATEUR_CSV, lineterminator="\r\n")
    redacteur.writerow(colonnes)
    for ligne in lignes:
        redacteur.writerow([_valeur_texte(ligne.get(c)) for c in colonnes])
    # BOM UTF-8 : sans lui, Excel affiche « Bouaké » en « BouakÃ© ».
    return tampon.getvalue().encode("utf-8-sig")


def generer_excel(
    definition: DefinitionVue,
    colonnes: list[str],
    lignes: list[dict[str, Any]],
    contexte: dict[str, Any] | None = None,
) -> bytes:
    """Produit un classeur avec une feuille de données et une feuille de contexte.

    La feuille de contexte n'est pas décorative : elle indique le périmètre
    exact du fichier et rappelle que seules des données validées y figurent.
    Un export qui circule sans son périmètre finit toujours par être mal lu.
    """
    classeur = Workbook()

    feuille = classeur.active
    feuille.title = "Donnees"

    entete_fond = PatternFill("solid", fgColor="1F3864")
    entete_police = Font(color="FFFFFF", bold=True)

    feuille.append(colonnes)
    for cellule in feuille[1]:
        cellule.fill = entete_fond
        cellule.font = entete_police
        cellule.alignment = Alignment(horizontal="center", vertical="center")

    for ligne in lignes:
        feuille.append([_valeur_excel(ligne.get(c)) for c in colonnes])

    for index, nom in enumerate(colonnes, start=1):
        largeur = max(len(nom) + 2, 12)
        feuille.column_dimensions[get_column_letter(index)].width = min(largeur, 40)
    feuille.freeze_panes = "A2"
    if lignes:
        feuille.auto_filter.ref = (
            f"A1:{get_column_letter(len(colonnes))}{len(lignes) + 1}"
        )

    contexte_feuille = classeur.create_sheet("Contexte")
    infos = [
        ("Export", definition.libelle),
        ("Vue source", definition.vue_sql),
        ("Description", definition.description),
        ("Généré le", datetime.now().strftime("%d/%m/%Y %H:%M")),
        ("Nombre de lignes", len(lignes)),
        (
            "Périmètre",
            "Données au statut « validée » uniquement"
            if definition.nom != "completude"
            else "Tous statuts — vue de pilotage",
        ),
    ]
    for cle, valeur in (contexte or {}).items():
        infos.append((cle, valeur))

    for cle, valeur in infos:
        contexte_feuille.append([cle, valeur])
    for cellule in contexte_feuille["A"]:
        cellule.font = Font(bold=True)
    contexte_feuille.column_dimensions["A"].width = 22
    contexte_feuille.column_dimensions["B"].width = 70

    tampon = io.BytesIO()
    classeur.save(tampon)
    return tampon.getvalue()
