"""CP01 — cycle en deux scans et grandeurs dérivées (ch. 6)."""

from tests.conftest import nouvel_id


def _premier_scan(parc, **remplacements) -> dict:
    from datetime import UTC, datetime, timedelta

    debut = datetime.now(UTC) - timedelta(hours=3)
    charge = {
        "id": nouvel_id(),
        "site_id": parc["site_id"],
        "tir_id": str(parc["tir"].id),
        "foreuse_id": str(parc["engins"]["FE01"].id),
        "operateur_matricule": "MAT001",
        "poste": "jour",
        "date_foration": debut.date().isoformat(),
        "heure_debut": debut.isoformat(),
        "compteur_debut": 4820.0,
        "diametre_mm": 102.0,
        "gps_latitude": 5.4812,
        "gps_longitude": -4.3185,
        "source_collecte": "qr_code",
    }
    charge.update(remplacements)
    return charge


def test_le_premier_scan_attribue_une_reference_lisible(client, entetes, parc):
    """L'UUID vient du terminal, la référence lisible du serveur."""
    h = entetes("agent")
    reponse = client.post("/api/v1/foration/trous", json=_premier_scan(parc), headers=h)

    assert reponse.status_code == 201, reponse.text
    trou = reponse.json()
    assert trou["reference"] == "KOS-T01-0001"
    assert trou["est_cloture"] is False
    assert trou["statut"] == "brute"


def test_les_references_se_suivent_dans_un_meme_tir(client, entetes, parc):
    h = entetes("agent")
    references = [
        client.post("/api/v1/foration/trous", json=_premier_scan(parc), headers=h).json()[
            "reference"
        ]
        for _ in range(3)
    ]
    assert references == ["KOS-T01-0001", "KOS-T01-0002", "KOS-T01-0003"]


def test_rejouer_le_premier_scan_ne_cree_pas_de_doublon(client, entetes, parc):
    """Un double appui sur le bouton de scan ne doit pas ouvrir deux trous."""
    h = entetes("agent")
    charge = _premier_scan(parc)

    premier = client.post("/api/v1/foration/trous", json=charge, headers=h)
    second = client.post("/api/v1/foration/trous", json=charge, headers=h)

    assert premier.json()["reference"] == second.json()["reference"]
    assert client.get("/api/v1/foration/trous", headers=h).json()["total"] == 1


def test_le_second_scan_cloture_et_calcule_les_derivees(client, entetes, parc):
    """Durée et utilisation foreuse sont calculées par la base, jamais saisies."""
    from datetime import datetime, timedelta

    h = entetes("agent")
    charge = _premier_scan(parc)
    client.post("/api/v1/foration/trous", json=charge, headers=h)

    fin = datetime.fromisoformat(charge["heure_debut"]) + timedelta(minutes=45)
    reponse = client.post(
        f"/api/v1/foration/trous/{charge['id']}/cloture",
        json={
            "heure_fin": fin.isoformat(),
            "compteur_fin": 4820.75,
            "metres_lineaires": 12.5,
            "numero_taillant": "TAI-2291",
        },
        headers=h,
    )

    assert reponse.status_code == 200, reponse.text
    trou = reponse.json()
    assert trou["est_cloture"] is True
    assert trou["duree_foration"] == "PT45M"
    assert float(trou["utilisation_foreuse"]) == 0.75
    assert trou["cloture_le"] is not None


def test_un_trou_deja_cloture_ne_se_recloture_pas(client, entetes, parc):
    """Toute correction ultérieure passe par le workflow, qui exige un motif."""
    from datetime import datetime, timedelta

    h = entetes("agent")
    charge = _premier_scan(parc)
    client.post("/api/v1/foration/trous", json=charge, headers=h)
    fin = datetime.fromisoformat(charge["heure_debut"]) + timedelta(minutes=45)
    cloture = {"heure_fin": fin.isoformat(), "metres_lineaires": 12.5}

    client.post(f"/api/v1/foration/trous/{charge['id']}/cloture", json=cloture, headers=h)
    seconde = client.post(
        f"/api/v1/foration/trous/{charge['id']}/cloture", json=cloture, headers=h
    )

    assert seconde.status_code == 409
    assert "déjà clôturé" in seconde.json()["detail"]


def test_une_fin_anterieure_au_debut_est_refusee(client, entetes, parc):
    from datetime import datetime, timedelta

    h = entetes("agent")
    charge = _premier_scan(parc)
    client.post("/api/v1/foration/trous", json=charge, headers=h)

    fin = datetime.fromisoformat(charge["heure_debut"]) - timedelta(minutes=10)
    reponse = client.post(
        f"/api/v1/foration/trous/{charge['id']}/cloture",
        json={"heure_fin": fin.isoformat()},
        headers=h,
    )
    assert reponse.status_code == 422


def test_un_compteur_qui_regresse_est_refuse(client, entetes, parc):
    """Un compteur horaire ne décroît pas : c'est une erreur de saisie."""
    from datetime import datetime, timedelta

    h = entetes("agent")
    charge = _premier_scan(parc)
    client.post("/api/v1/foration/trous", json=charge, headers=h)

    fin = datetime.fromisoformat(charge["heure_debut"]) + timedelta(minutes=45)
    reponse = client.post(
        f"/api/v1/foration/trous/{charge['id']}/cloture",
        json={"heure_fin": fin.isoformat(), "compteur_fin": 4000.0},
        headers=h,
    )
    assert reponse.status_code == 422
    assert "compteur" in reponse.json()["detail"].lower()


def test_ecran_des_trous_non_clotures(client, entetes, parc):
    """L'anomalie la plus probable du module doit être visible dès le pilote."""
    from datetime import UTC, datetime, timedelta

    h = entetes("agent")
    ancien = datetime.now(UTC) - timedelta(hours=20)
    client.post(
        "/api/v1/foration/trous",
        json=_premier_scan(
            parc, heure_debut=ancien.isoformat(), date_foration=ancien.date().isoformat()
        ),
        headers=h,
    )
    recent = _premier_scan(parc)
    client.post("/api/v1/foration/trous", json=recent, headers=h)

    tous = client.get(
        "/api/v1/foration/trous/non-clotures?au_dela_de_heures=0", headers=h
    ).json()
    assert len(tous) == 2

    anciens = client.get(
        "/api/v1/foration/trous/non-clotures?au_dela_de_heures=12", headers=h
    ).json()
    assert len(anciens) == 1
    assert anciens[0]["anciennete_heures"] > 12


def test_une_position_gps_incomplete_est_refusee(client, entetes, parc):
    h = entetes("agent")
    reponse = client.post(
        "/api/v1/foration/trous",
        json=_premier_scan(parc, gps_longitude=None),
        headers=h,
    )
    assert reponse.status_code == 422


def test_un_agent_ne_declare_pas_sur_un_autre_site(client, entetes, parc, session):
    """Le cloisonnement par site protège des erreurs de saisie autant que des abus."""
    from sqlalchemy import text

    autre_site = session.execute(
        text("SELECT id FROM site WHERE code = 'BKE'")
    ).scalar_one()

    h = entetes("agent")
    reponse = client.post(
        "/api/v1/foration/trous", json=_premier_scan(parc, site_id=autre_site), headers=h
    )
    assert reponse.status_code == 403
