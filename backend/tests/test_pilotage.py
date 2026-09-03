"""Indicateurs de pilotage (ch. 15).

Les trois tests qui suivent ne mesurent pas des chiffres : ils protègent
trois règles de lecture. Un indicateur faux à l'air juste est plus nuisible
qu'un indicateur absent, car personne ne le vérifie.
"""

from datetime import UTC, datetime, timedelta

from tests.conftest import horodatage, nouvel_id

CHEMIN = "/api/v1/pilotage/indicateurs"


def _rotation(parc, **remplacements) -> dict:
    charge = {
        "id": nouvel_id(),
        "dumper_id": str(parc["engins"]["DU01"].id),
        "site_id": parc["site_id"],
        "horodatage": horodatage(1),
        "point_deversement": "Concassage primaire",
        "poste": "jour",
        "quantite_estimee_t": 28.5,
        "nature_quantite": "estimation",
    }
    charge.update(remplacements)
    return charge


def _valider(client, entetes, table: str, identifiant: str) -> None:
    for statut in ("controlee", "validee"):
        reponse = client.post(
            f"/api/v1/validation/{table}/{identifiant}/statut",
            json={"nouveau_statut": statut, "motif": None},
            headers=entetes("controleur"),
        )
        assert reponse.status_code == 200, reponse.text


def test_les_tonnages_pese_et_estime_ne_sont_jamais_totalises(client, entetes, parc):
    """P1 : le pesé et l'estimé restent deux colonnes, et la part d'estimé
    dit quelle confiance accorder au volume."""
    h = entetes("agent")
    pesee = client.post(
        "/api/v1/marinage/rotations",
        json=_rotation(
            parc, nature_quantite="pesee_reelle", poids_reel_t=30.0, quantite_estimee_t=None
        ),
        headers=h,
    ).json()
    estimee = client.post(
        "/api/v1/marinage/rotations",
        json=_rotation(parc, quantite_estimee_t=10.0),
        headers=h,
    ).json()
    _valider(client, entetes, "rotation_dumper", pesee["id"])
    _valider(client, entetes, "rotation_dumper", estimee["id"])

    production = client.get(CHEMIN, headers=entetes("superviseur")).json()["production"]

    assert production["rotations"] == 2
    assert production["tonnage_pese_t"] == 30.0
    assert production["tonnage_estime_t"] == 10.0
    assert production["lignes_pesees"] == 1
    # 10 sur 40 : la part est un rapport de lecture, pas un tonnage total.
    assert production["part_estimee_pct"] == 25.0
    assert "tonnage_total_t" not in production


def test_seules_les_donnees_validees_sont_comptees(client, entetes, parc):
    """L'écran de pilotage lit la même matière que l'export : une rotation
    encore en attente de contrôle n'a pas à peser sur une décision."""
    h = entetes("agent")
    client.post("/api/v1/marinage/rotations", json=_rotation(parc), headers=h)

    production = client.get(CHEMIN, headers=entetes("superviseur")).json()["production"]

    assert production["rotations"] == 0
    assert production["tonnage_estime_t"] == 0.0


def test_un_arret_jamais_cloture_est_compte_mais_pas_chiffre(client, entetes, parc):
    """Un arrêt sans événement suivant n'a pas de durée connue. Lui en
    prêter une gonflerait le Pareto d'heures qui n'ont jamais existé : on
    compte l'occurrence, on ne chiffre pas les heures."""
    h = entetes("agent")
    debut = datetime.now(UTC) - timedelta(hours=3)
    evenement = client.post(
        "/api/v1/marinage/evenements-engin",
        json={
            "id": nouvel_id(),
            "engin_id": str(parc["engins"]["DU01"].id),
            "site_id": parc["site_id"],
            "horodatage": debut.isoformat(),
            "type_evenement": "arret",
            "cause_code": "PANNE_MEC",
        },
        headers=h,
    ).json()
    _valider(client, entetes, "evenement_engin", evenement["id"])

    indicateurs = client.get(CHEMIN, headers=entetes("superviseur")).json()
    causes = indicateurs["causes_arret"]

    assert len(causes) == 1
    assert causes[0]["occurrences"] == 1
    assert causes[0]["occurrences_mesurees"] == 0
    assert causes[0]["heures"] == 0.0


def test_l_agent_de_terrain_n_accede_pas_aux_indicateurs(client, entetes):
    """L'écran agrège tous les engins de tous les sites : c'est un outil de
    supervision, pas une restitution de sa propre saisie."""
    assert client.get(CHEMIN, headers=entetes("agent")).status_code == 403


def test_un_arret_cloture_par_une_reprise_est_bien_chiffre(client, entetes, parc):
    """L'événement qui clôt un arrêt est une reprise, et une reprise n'a pas
    de motif. Restreindre la fenêtre aux seuls événements motivés rendrait
    donc tout arrêt clôturé invisible, et le Pareto n'afficherait que des
    zéros — l'exact contraire de ce qu'il sert à montrer."""
    h = entetes("agent")
    debut = datetime.now(UTC) - timedelta(hours=4)
    engin = str(parc["engins"]["DU01"].id)

    for horaire, type_evenement, cause in (
        (debut, "arret", "PANNE_MEC"),
        (debut + timedelta(hours=2), "reprise", None),
    ):
        evenement = client.post(
            "/api/v1/marinage/evenements-engin",
            json={
                "id": nouvel_id(),
                "engin_id": engin,
                "site_id": parc["site_id"],
                "horodatage": horaire.isoformat(),
                "type_evenement": type_evenement,
                "cause_code": cause,
            },
            headers=h,
        ).json()
        _valider(client, entetes, "evenement_engin", evenement["id"])

    causes = client.get(CHEMIN, headers=entetes("superviseur")).json()["causes_arret"]

    assert len(causes) == 1
    assert causes[0]["code"] == "PANNE_MEC"
    assert causes[0]["occurrences_mesurees"] == 1
    assert causes[0]["heures"] == 2.0
