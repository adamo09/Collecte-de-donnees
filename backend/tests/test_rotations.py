"""CP03 — séparation stricte entre mesure réelle et estimation (ch. 8.2).

Cette exigence, posée au chapitre 6.3 du cahier des charges, conditionne la
crédibilité de tout coût à la tonne calculé en aval.
"""

from tests.conftest import horodatage, nouvel_id


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


def test_une_pesee_reelle_sans_poids_est_refusee(client, entetes, parc):
    h = entetes("agent")
    reponse = client.post(
        "/api/v1/marinage/rotations",
        json=_rotation(parc, nature_quantite="pesee_reelle", quantite_estimee_t=None),
        headers=h,
    )
    assert reponse.status_code == 422


def test_une_estimation_sans_quantite_est_refusee(client, entetes, parc):
    h = entetes("agent")
    reponse = client.post(
        "/api/v1/marinage/rotations",
        json=_rotation(parc, quantite_estimee_t=None),
        headers=h,
    )
    assert reponse.status_code == 422


def test_les_deux_natures_restent_dans_des_colonnes_distinctes(client, entetes, parc):
    """Aucune des deux colonnes ne doit être remplie à la place de l'autre."""
    h = entetes("agent")

    pesee = client.post(
        "/api/v1/marinage/rotations",
        json=_rotation(
            parc,
            nature_quantite="pesee_reelle",
            poids_reel_t=29.1,
            quantite_estimee_t=None,
        ),
        headers=h,
    ).json()
    estimee = client.post(
        "/api/v1/marinage/rotations", json=_rotation(parc), headers=h
    ).json()

    assert pesee["poids_reel_t"] == "29.10" and pesee["quantite_estimee_t"] is None
    assert estimee["quantite_estimee_t"] == "28.50" and estimee["poids_reel_t"] is None


def test_la_synthese_ne_totalise_jamais_pese_et_estime(client, entetes, parc):
    """Additionner un tonnage pesé et un tonnage estimé ôterait toute
    crédibilité au coût à la tonne : la synthèse les garde séparés."""
    from datetime import UTC, datetime

    h = entetes("agent")
    client.post(
        "/api/v1/marinage/rotations",
        json=_rotation(
            parc, nature_quantite="pesee_reelle", poids_reel_t=29.1, quantite_estimee_t=None
        ),
        headers=h,
    )
    client.post("/api/v1/marinage/rotations", json=_rotation(parc), headers=h)

    synthese = client.get(
        "/api/v1/marinage/rotations/synthese-journaliere",
        params={"site_id": parc["site_id"], "jour": datetime.now(UTC).date().isoformat()},
        headers=h,
    ).json()

    ligne = next(ligne for ligne in synthese if ligne["dumper"] == "DU01")
    assert ligne["nb_rotations"] == 2
    assert ligne["tonnage_pese_t"] == 29.1
    assert ligne["tonnage_estime_t"] == 28.5
    assert "tonnage_total_t" not in ligne


def test_un_arret_sans_motif_codifie_est_refuse(client, entetes, parc):
    """« panne », « panne moteur » et « pb moteur » ne doivent pas devenir
    trois motifs différents : la nomenclature est obligatoire (ch. 4.4)."""
    h = entetes("agent")
    evenement = {
        "id": nouvel_id(),
        "engin_id": str(parc["engins"]["DU01"].id),
        "site_id": parc["site_id"],
        "type_evenement": "panne",
        "horodatage": horodatage(1),
        "source_collecte": "qr_code",
    }
    reponse = client.post("/api/v1/marinage/evenements-engin", json=evenement, headers=h)
    assert reponse.status_code == 422
    assert "cause_code" in reponse.json()["detail"]

    evenement["cause_code"] = "PANNE_HYD"
    assert (
        client.post("/api/v1/marinage/evenements-engin", json=evenement, headers=h).status_code
        == 201
    )


def test_le_compteur_engin_est_tenu_a_jour_par_les_evenements(client, entetes, parc, session):
    """Le dernier relevé connu évite de ressaisir le compteur au scan suivant."""
    from app.models.referentiels import Engin

    h = entetes("agent")
    for compteur, decalage in ((9100.0, 3), (9105.5, 1)):
        client.post(
            "/api/v1/marinage/evenements-engin",
            json={
                "id": nouvel_id(),
                "engin_id": str(parc["engins"]["DU01"].id),
                "site_id": parc["site_id"],
                "type_evenement": "debut",
                "horodatage": horodatage(decalage),
                "compteur": compteur,
                "source_collecte": "qr_code",
            },
            headers=h,
        )

    session.expire_all()
    engin = session.get(Engin, parc["engins"]["DU01"].id)
    assert float(engin.compteur_actuel) == 9105.5


def test_un_evenement_arrive_en_retard_ne_fait_pas_regresser_le_compteur(
    client, entetes, parc, session
):
    """Une synchronisation différée ne doit pas rembobiner le compteur."""
    from app.models.referentiels import Engin

    h = entetes("agent")
    client.post(
        "/api/v1/marinage/evenements-engin",
        json={
            "id": nouvel_id(),
            "engin_id": str(parc["engins"]["DU01"].id),
            "site_id": parc["site_id"],
            "type_evenement": "fin",
            "horodatage": horodatage(1),
            "compteur": 9200.0,
            "source_collecte": "qr_code",
        },
        headers=h,
    )
    # Événement plus ancien, transmis après : compteur nécessairement inférieur.
    client.post(
        "/api/v1/marinage/evenements-engin",
        json={
            "id": nouvel_id(),
            "engin_id": str(parc["engins"]["DU01"].id),
            "site_id": parc["site_id"],
            "type_evenement": "debut",
            "horodatage": horodatage(9),
            "compteur": 9150.0,
            "source_collecte": "qr_code",
        },
        headers=h,
    )

    session.expire_all()
    engin = session.get(Engin, parc["engins"]["DU01"].id)
    assert float(engin.compteur_actuel) == 9200.0
