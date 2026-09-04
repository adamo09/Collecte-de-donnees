"""Workflow de contrôle, correction et journal d'audit (ch. 5)."""

import pytest

from tests.conftest import horodatage, nouvel_id


@pytest.fixture
def rotation(client, entetes, parc) -> str:
    """Une rotation au statut brute, prête à être contrôlée."""
    identifiant = nouvel_id()
    reponse = client.post(
        "/api/v1/marinage/rotations",
        json={
            "id": identifiant,
            "dumper_id": str(parc["engins"]["DU01"].id),
            "site_id": parc["site_id"],
            "horodatage": horodatage(1),
            "quantite_estimee_t": 28.5,
            "nature_quantite": "estimation",
        },
        headers=entetes("agent"),
    )
    assert reponse.status_code == 201, reponse.text
    return identifiant


def _statut(client, entetes, rotation, statut, role="controleur", motif=None):
    return client.post(
        f"/api/v1/validation/rotation_dumper/{rotation}/statut",
        json={"nouveau_statut": statut, "motif": motif},
        headers=entetes(role),
    )


def test_le_cycle_nominal_brute_controlee_validee(client, entetes, rotation):
    assert _statut(client, entetes, rotation, "controlee").status_code == 200
    reponse = _statut(client, entetes, rotation, "validee")
    assert reponse.status_code == 200
    assert reponse.json()["nouveau_statut"] == "validee"


def test_on_ne_valide_pas_une_donnee_brute_sans_la_controler(client, entetes, rotation):
    """Sauter l'étape de contrôle viderait le workflow de son sens."""
    reponse = _statut(client, entetes, rotation, "validee")
    assert reponse.status_code == 409
    assert "non autorisée" in reponse.json()["detail"]


def test_seul_le_controleur_valide(client, entetes, rotation):
    _statut(client, entetes, rotation, "controlee", role="superviseur")
    reponse = _statut(client, entetes, rotation, "validee", role="superviseur")
    assert reponse.status_code == 409
    assert "contrôleur" in reponse.json()["detail"]


def test_un_agent_de_terrain_ne_controle_pas_ses_propres_donnees(client, entetes, rotation):
    reponse = _statut(client, entetes, rotation, "controlee", role="agent")
    assert reponse.status_code == 403


def test_un_rejet_doit_etre_motive(client, entetes, rotation):
    sans_motif = _statut(client, entetes, rotation, "rejetee")
    assert sans_motif.status_code == 409
    assert "motivé" in sans_motif.json()["detail"]

    avec_motif = _statut(
        client, entetes, rotation, "rejetee", motif="Dumper à l'arrêt à cette heure-là."
    )
    assert avec_motif.status_code == 200


def test_reprendre_une_donnee_validee_exige_un_motif(client, entetes, rotation):
    """Une donnée validée a pu être exportée au gestionnaire : la reprendre
    n'est jamais anodin."""
    _statut(client, entetes, rotation, "controlee")
    _statut(client, entetes, rotation, "validee")

    sans_motif = _statut(client, entetes, rotation, "controlee")
    assert sans_motif.status_code == 409

    avec_motif = _statut(
        client, entetes, rotation, "controlee", motif="Tonnage contesté par le chef de carrière."
    )
    assert avec_motif.status_code == 200


def test_le_rejet_est_journalise(client, entetes, rotation):
    _statut(client, entetes, rotation, "rejetee", motif="Doublon manifeste.")

    audit = client.get(
        "/api/v1/validation/audit",
        params={"table_cible": "rotation_dumper", "enregistrement": rotation},
        headers=entetes("controleur"),
    ).json()

    assert audit["total"] == 1
    assert audit["elements"][0]["champ"] == "statut"
    assert audit["elements"][0]["nouvelle_valeur"] == "rejetee"
    assert audit["elements"][0]["motif"] == "Doublon manifeste."


def test_une_correction_journalise_chaque_champ_modifie(client, entetes, rotation):
    """Le journal doit permettre de défendre un chiffre contesté (ch. 5.1)."""
    reponse = client.post(
        f"/api/v1/validation/rotation_dumper/{rotation}/correction",
        json={
            "modifications": {
                "quantite_estimee_t": 26.0,
                "point_deversement": "Concassage secondaire",
            },
            "motif": "Capacité corrigée après campagne de pesage.",
        },
        headers=entetes("controleur"),
    )

    assert reponse.status_code == 200, reponse.text
    lignes = reponse.json()
    assert len(lignes) == 2
    par_champ = {ligne["champ"]: ligne for ligne in lignes}
    assert par_champ["quantite_estimee_t"]["ancienne_valeur"] == "28.50"
    assert par_champ["quantite_estimee_t"]["nouvelle_valeur"] == "26.0"
    assert all(ligne["motif"] for ligne in lignes)


def test_une_correction_sans_motif_est_refusee(client, entetes, rotation):
    reponse = client.post(
        f"/api/v1/validation/rotation_dumper/{rotation}/correction",
        json={"modifications": {"quantite_estimee_t": 26.0}, "motif": ""},
        headers=entetes("controleur"),
    )
    assert reponse.status_code == 422


def test_les_champs_de_tracabilite_ne_sont_pas_corrigeables(client, entetes, rotation):
    """Pouvoir réécrire l'auteur ou l'horodatage de saisie ruinerait l'audit."""
    for champ, valeur in (("auteur_id", nouvel_id()), ("saisi_le", horodatage(50))):
        reponse = client.post(
            f"/api/v1/validation/rotation_dumper/{rotation}/correction",
            json={"modifications": {champ: valeur}, "motif": "Tentative."},
            headers=entetes("controleur"),
        )
        assert reponse.status_code == 422, champ
        assert "traçabilité" in reponse.json()["detail"]


def test_corriger_une_donnee_validee_la_ramene_au_controle(client, entetes, rotation):
    """Une donnée corrigée doit être revalidée avant de repartir au gestionnaire."""
    _statut(client, entetes, rotation, "controlee")
    _statut(client, entetes, rotation, "validee")

    client.post(
        f"/api/v1/validation/rotation_dumper/{rotation}/correction",
        json={"modifications": {"quantite_estimee_t": 26.0}, "motif": "Erreur de relevé."},
        headers=entetes("controleur"),
    )

    rotations = client.get("/api/v1/marinage/rotations", headers=entetes("controleur")).json()
    assert rotations["elements"][0]["statut"] == "controlee"
    assert rotations["elements"][0]["valide_le"] is None


def test_validation_par_lot_traite_ce_qui_peut_l_etre(client, entetes, rotation):
    """Un refus sur l'un n'empêche pas le traitement des autres."""
    inconnu = nouvel_id()
    _statut(client, entetes, rotation, "controlee")

    reponse = client.post(
        "/api/v1/validation/rotation_dumper/statut-lot",
        json={"identifiants": [rotation, inconnu], "nouveau_statut": "validee"},
        headers=entetes("controleur"),
    )

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["nb_appliques"] == 1
    assert corps["nb_refuses"] == 1


def test_la_file_de_validation_liste_ce_qui_reste_a_traiter(client, entetes, rotation):
    file_attente = client.get(
        "/api/v1/validation/file", params={"statut": "brute"}, headers=entetes("controleur")
    ).json()

    assert any(
        ligne["id"] == rotation and ligne["table_cible"] == "rotation_dumper"
        for ligne in file_attente["elements"]
    )

    _statut(client, entetes, rotation, "controlee")
    _statut(client, entetes, rotation, "validee")

    apres = client.get("/api/v1/validation/file", headers=entetes("controleur")).json()
    assert not any(ligne["id"] == rotation for ligne in apres["elements"])


def test_une_table_hors_workflow_est_refusee(client, entetes, rotation):
    reponse = client.post(
        f"/api/v1/validation/engin/{rotation}/statut",
        json={"nouveau_statut": "validee"},
        headers=entetes("controleur"),
    )
    assert reponse.status_code == 404


def test_la_file_annonce_son_total_au_dela_du_plafond(client, entetes, parc):
    """Le défaut que ce test protège : la file est ordonnée du plus ancien au
    plus récent. Un plafond sans total escamotait donc les données du jour
    derrière l'arriéré, et le contrôleur croyait sa file à jour parce que le
    compteur affichait le nombre de lignes reçues, pas le nombre en attente."""
    for rang in range(5):
        reponse = client.post(
            "/api/v1/marinage/rotations",
            json={
                "id": nouvel_id(),
                "dumper_id": str(parc["engins"]["DU01"].id),
                "site_id": parc["site_id"],
                "horodatage": horodatage(rang + 1),
                "quantite_estimee_t": 28.5,
                "nature_quantite": "estimation",
            },
            headers=entetes("agent"),
        )
        assert reponse.status_code == 201, reponse.text

    page = client.get(
        "/api/v1/validation/file",
        params={"limite": 2},
        headers=entetes("controleur"),
    ).json()

    assert page["total"] == 5
    assert len(page["elements"]) == 2
    assert page["limite"] == 2 and page["decalage"] == 0

    suite = client.get(
        "/api/v1/validation/file",
        params={"limite": 2, "decalage": 2},
        headers=entetes("controleur"),
    ).json()

    assert suite["total"] == 5
    # Les pages ne se recouvrent pas : sans quoi parcourir la file
    # reviendrait à retraiter les mêmes lignes.
    debut = {ligne["id"] for ligne in page["elements"]}
    assert debut.isdisjoint({ligne["id"] for ligne in suite["elements"]})


def test_le_journal_d_audit_annonce_son_total(client, entetes, parc):
    """Le décalage existait déjà sur le journal, mais sans total : on pouvait
    y avancer sans jamais savoir où il s'arrête.

    Deux rejets, donc deux lignes : l'avancement nominal, lui, n'est pas
    journalisé — seuls un rejet ou la reprise d'une donnée déjà validée le
    sont."""
    for rang in range(2):
        identifiant = nouvel_id()
        client.post(
            "/api/v1/marinage/rotations",
            json={
                "id": identifiant,
                "dumper_id": str(parc["engins"]["DU01"].id),
                "site_id": parc["site_id"],
                "horodatage": horodatage(rang + 1),
                "quantite_estimee_t": 28.5,
                "nature_quantite": "estimation",
            },
            headers=entetes("agent"),
        )
        _statut(client, entetes, identifiant, "rejetee", motif="Doublon manifeste.")

    journal = client.get(
        "/api/v1/validation/audit",
        params={"table_cible": "rotation_dumper", "limite": 1},
        headers=entetes("controleur"),
    ).json()

    assert journal["total"] == 2
    assert len(journal["elements"]) == 1
