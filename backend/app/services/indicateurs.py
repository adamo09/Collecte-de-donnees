"""Indicateurs de pilotage, calculés sur les données validées.

Deux publics dans un seul écran : l'exploitation, qui pilote sa semaine, et
le contrôle de gestion, qui prépare le calcul de coût à venir.

Ce module ne calcule **aucun coût**. Les règles d'imputation analytique —
unité d'œuvre, amortissements, étalement des charges, traitement de la
marche à vide — n'ont pas été arrêtées (décision D12 du cahier des
charges). Un coût par tonne affiché aujourd'hui serait inventé, c'est-à-dire
exactement le chiffre faux à l'air juste que tout le reste du système
s'emploie à éviter. On livre les quantités, les temps et les consommations ;
la combinaison viendra quand les règles existeront.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

# Un événement de ce type ouvre une période de marche ; les autres ouvrent
# une période d'arrêt. La durée d'un état court jusqu'à l'événement suivant
# du même engin, dans la même journée.
TYPES_MARCHE = ("debut", "reprise")

# Constante du module, jamais une saisie : l'insérer dans le SQL évite le
# paramètre extensible, dont la syntaxe obscurcirait la requête.
_LISTE_MARCHE = ", ".join(f"'{t}'" for t in TYPES_MARCHE)

# Au-delà, une période sans événement suivant n'est pas un arrêt réel mais
# un oubli de déclaration : la compter fausserait la disponibilité.
DUREE_MAX_ETAT_H = 12


def _bornes(du: date | None, au: date | None) -> tuple[date, date]:
    """Période par défaut : les trente derniers jours."""
    fin = au or date.today()
    debut = du or (fin - timedelta(days=30))
    return debut, fin


def _nombre(valeur: Any) -> float | None:
    if valeur is None:
        return None
    if isinstance(valeur, Decimal):
        return float(valeur)
    return float(valeur)


def calculer(
    session: Session,
    site: str | None = None,
    du: date | None = None,
    au: date | None = None,
) -> dict[str, Any]:
    """Agrège les indicateurs de la période, pour un site ou pour tous."""
    debut, fin = _bornes(du, au)
    # Borne haute inclusive : « au 31 mars » comprend le 31 mars entier.
    fin_exclusive = fin + timedelta(days=1)
    p: dict[str, Any] = {"debut": debut, "fin": fin_exclusive, "site": site}

    filtre_site = "AND s.code = :site" if site else ""

    # --- Production : rotations et tonnages ---------------------------
    production = (
        session.execute(
            text(f"""
        SELECT COUNT(*)                                          AS rotations,
               COUNT(DISTINCT r.dumper_id)                       AS dumpers,
               COALESCE(SUM(r.poids_reel_t), 0)                  AS tonnage_pese,
               COALESCE(SUM(r.quantite_estimee_t), 0)            AS tonnage_estime,
               COUNT(*) FILTER (WHERE r.poids_reel_t IS NOT NULL) AS lignes_pesees
        FROM rotation_dumper r
        JOIN site s ON s.id = r.site_id
        WHERE r.statut = 'validee'
          AND r.horodatage >= :debut AND r.horodatage < :fin
          {filtre_site}
        """),
            p,
        )
        .mappings()
        .one()
    )

    # --- Foration ------------------------------------------------------
    foration = (
        session.execute(
            text(f"""
        SELECT COUNT(*)                                   AS trous,
               COALESCE(SUM(t.metres_lineaires), 0)       AS metres,
               AVG(EXTRACT(EPOCH FROM t.duree_foration) / 60.0) AS duree_moyenne_min,
               COALESCE(SUM(t.utilisation_foreuse), 0)    AS utilisation_foreuse
        FROM trou_forage t
        JOIN site s ON s.id = t.site_id
        WHERE t.statut = 'validee'
          AND t.date_foration >= :debut AND t.date_foration < :fin
          {filtre_site}
        """),
            p,
        )
        .mappings()
        .one()
    )

    # --- Disponibilité des engins --------------------------------------
    # La durée d'un état court jusqu'à l'événement suivant du même engin,
    # dans la même journée : un poste ne déborde pas sur le lendemain.
    disponibilite = (
        session.execute(
            text(f"""
        WITH evenements AS (
            SELECT e.engin_id,
                   e.type_evenement::text AS type_evenement,
                   e.horodatage,
                   LEAD(e.horodatage) OVER (
                       PARTITION BY e.engin_id, date(e.horodatage)
                       ORDER BY e.horodatage
                   ) AS suivant,
                   e.carburant_litres
            FROM evenement_engin e
            JOIN site s ON s.id = e.site_id
            WHERE e.statut = 'validee'
              AND e.horodatage >= :debut AND e.horodatage < :fin
              {filtre_site}
        ),
        durees AS (
            SELECT type_evenement,
                   EXTRACT(EPOCH FROM (suivant - horodatage)) / 3600.0 AS heures,
                   carburant_litres
            FROM evenements
            WHERE suivant IS NOT NULL
        )
        SELECT
            COALESCE(SUM(heures) FILTER (
                WHERE type_evenement IN ({_LISTE_MARCHE}) AND heures <= :plafond
            ), 0) AS heures_marche,
            COALESCE(SUM(heures) FILTER (
                WHERE type_evenement NOT IN ({_LISTE_MARCHE}) AND heures <= :plafond
            ), 0) AS heures_arret,
            COUNT(*) FILTER (WHERE heures > :plafond) AS etats_non_clotures
        FROM durees
        """).bindparams(plafond=DUREE_MAX_ETAT_H),
            p,
        )
        .mappings()
        .one()
    )

    carburant = (
        session.execute(
            text(f"""
        SELECT COALESCE(SUM(e.carburant_litres), 0) AS litres,
               COUNT(DISTINCT e.engin_id)           AS engins
        FROM evenement_engin e
        JOIN site s ON s.id = e.site_id
        WHERE e.statut = 'validee'
          AND e.horodatage >= :debut AND e.horodatage < :fin
          {filtre_site}
        """),
            p,
        )
        .mappings()
        .one()
    )

    # --- Pareto des causes d'arrêt --------------------------------------
    causes = (
        session.execute(
            text(f"""
        -- Le motif ne filtre qu'APRÈS la fenêtre, par la jointure sur
        -- cause_arret. L'événement qui clôt un arrêt est justement celui qui
        -- n'a pas de motif — une reprise : le filtrer en amont rendrait tout
        -- arrêt clôturé invisible à LEAD, et le Pareto n'afficherait jamais
        -- que des zéros.
        WITH evenements AS (
            SELECT e.cause_code,
                   e.horodatage,
                   LEAD(e.horodatage) OVER (
                       PARTITION BY e.engin_id, date(e.horodatage)
                       ORDER BY e.horodatage
                   ) AS suivant
            FROM evenement_engin e
            JOIN site s ON s.id = e.site_id
            WHERE e.statut = 'validee'
              AND e.horodatage >= :debut AND e.horodatage < :fin
              {filtre_site}
        )
        SELECT c.code, c.libelle, c.categorie::text AS categorie,
               COUNT(*) AS occurrences,
               -- LEAST ignore les NULL sous PostgreSQL : sans le filtre, un
               -- arrêt jamais clôturé compterait pour le plafond entier et
               -- gonflerait le Pareto de plusieurs heures fictives.
               COUNT(*) FILTER (WHERE v.suivant IS NOT NULL) AS occurrences_mesurees,
               COALESCE(SUM(
                   LEAST(EXTRACT(EPOCH FROM (v.suivant - v.horodatage)) / 3600.0,
                         :plafond)
               ) FILTER (WHERE v.suivant IS NOT NULL), 0) AS heures
        FROM evenements v
        JOIN cause_arret c ON c.code = v.cause_code
        GROUP BY c.code, c.libelle, c.categorie
        ORDER BY heures DESC, occurrences DESC
        LIMIT 10
        """).bindparams(plafond=DUREE_MAX_ETAT_H),
            p,
        )
        .mappings()
        .all()
    )

    # --- Série journalière ----------------------------------------------
    serie = (
        session.execute(
            text(f"""
        SELECT j.jour::date AS jour,
               COALESCE(r.rotations, 0)      AS rotations,
               COALESCE(r.tonnage_pese, 0)   AS tonnage_pese,
               COALESCE(r.tonnage_estime, 0) AS tonnage_estime,
               COALESCE(t.trous, 0)          AS trous
        -- CAST plutôt que « ::date » : le double deux-points empêcherait
        -- SQLAlchemy de reconnaître le paramètre qui le précède.
        FROM generate_series(
            CAST(:debut AS date), CAST(:fin AS date) - 1, '1 day'
        ) AS j(jour)
        LEFT JOIN (
            SELECT date(r.horodatage) AS jour,
                   COUNT(*) AS rotations,
                   COALESCE(SUM(r.poids_reel_t), 0) AS tonnage_pese,
                   COALESCE(SUM(r.quantite_estimee_t), 0) AS tonnage_estime
            FROM rotation_dumper r
            JOIN site s ON s.id = r.site_id
            WHERE r.statut = 'validee'
              AND r.horodatage >= :debut AND r.horodatage < :fin
              {filtre_site}
            GROUP BY date(r.horodatage)
        ) r ON r.jour = j.jour
        LEFT JOIN (
            SELECT t.date_foration AS jour, COUNT(*) AS trous
            FROM trou_forage t
            JOIN site s ON s.id = t.site_id
            WHERE t.statut = 'validee'
              AND t.date_foration >= :debut AND t.date_foration < :fin
              {filtre_site}
            GROUP BY t.date_foration
        ) t ON t.jour = j.jour
        ORDER BY j.jour
        """),
            p,
        )
        .mappings()
        .all()
    )

    # --- Qualité de la collecte -----------------------------------------
    attente = (
        session.execute(
            text("""
        SELECT statut::text AS statut, COUNT(*) AS nombre,
               MAX(EXTRACT(EPOCH FROM (now() - recu_le)) / 3600.0) AS age_max_h
        FROM v_pilotage_file_validation
        GROUP BY statut
        """)
        )
        .mappings()
        .all()
    )

    trous_ouverts = session.execute(
        text(f"""
        SELECT COUNT(*) AS nombre
        FROM trou_forage t
        JOIN site s ON s.id = t.site_id
        WHERE t.heure_fin IS NULL
          {filtre_site}
        """),
        p,
    ).scalar_one()

    tonnage_pese = _nombre(production["tonnage_pese"]) or 0.0
    tonnage_estime = _nombre(production["tonnage_estime"]) or 0.0
    total = tonnage_pese + tonnage_estime
    heures_marche = _nombre(disponibilite["heures_marche"]) or 0.0
    heures_arret = _nombre(disponibilite["heures_arret"]) or 0.0
    heures_totales = heures_marche + heures_arret

    return {
        "periode": {"du": debut, "au": fin, "site": site},
        "production": {
            "rotations": production["rotations"],
            "dumpers_actifs": production["dumpers"],
            "tonnage_pese_t": round(tonnage_pese, 2),
            "tonnage_estime_t": round(tonnage_estime, 2),
            # Jamais additionnés dans un total présenté comme un tonnage :
            # la part d'estimé dit quelle confiance accorder au volume.
            "part_estimee_pct": round(100 * tonnage_estime / total, 1) if total else None,
            "lignes_pesees": production["lignes_pesees"],
        },
        "foration": {
            "trous": foration["trous"],
            "metres_lineaires": round(_nombre(foration["metres"]) or 0.0, 1),
            "duree_moyenne_min": (
                round(_nombre(foration["duree_moyenne_min"]), 1)
                if foration["duree_moyenne_min"] is not None
                else None
            ),
            "utilisation_foreuse": round(_nombre(foration["utilisation_foreuse"]) or 0.0, 1),
            "trous_non_clotures": trous_ouverts,
        },
        "engins": {
            "heures_marche": round(heures_marche, 1),
            "heures_arret": round(heures_arret, 1),
            "taux_disponibilite_pct": (
                round(100 * heures_marche / heures_totales, 1) if heures_totales else None
            ),
            "etats_non_clotures": disponibilite["etats_non_clotures"],
            "carburant_litres": round(_nombre(carburant["litres"]) or 0.0, 1),
            "engins_declarants": carburant["engins"],
        },
        "causes_arret": [
            {
                "code": c["code"],
                "libelle": c["libelle"],
                "categorie": c["categorie"],
                "occurrences": c["occurrences"],
                "occurrences_mesurees": c["occurrences_mesurees"],
                "heures": round(_nombre(c["heures"]) or 0.0, 1),
            }
            for c in causes
        ],
        "serie": [
            {
                "jour": s["jour"],
                "rotations": s["rotations"],
                "trous": s["trous"],
                "tonnage_pese_t": round(_nombre(s["tonnage_pese"]) or 0.0, 2),
                "tonnage_estime_t": round(_nombre(s["tonnage_estime"]) or 0.0, 2),
            }
            for s in serie
        ],
        "collecte": {
            "en_attente": {a["statut"]: a["nombre"] for a in attente},
            "age_max_heures": (
                round(max((_nombre(a["age_max_h"]) or 0.0) for a in attente), 1)
                if attente
                else None
            ),
        },
    }
