"""Authentification, rôles et cloisonnement par site."""

from app.core.securite import (
    JetonInvalide,
    creer_jeton,
    decoder_jeton,
    hacher_mot_de_passe,
    verifier_mot_de_passe,
)
from tests.conftest import nouvel_id


def test_le_mot_de_passe_n_est_jamais_stocke_en_clair():
    empreinte = hacher_mot_de_passe("motdepasse123")
    assert empreinte != "motdepasse123"
    assert verifier_mot_de_passe("motdepasse123", empreinte)
    assert not verifier_mot_de_passe("motdepasse124", empreinte)


def test_un_mot_de_passe_tres_long_reste_utilisable():
    """bcrypt ignore ce qui dépasse 72 octets : la troncature est explicite."""
    long = "é" * 100
    empreinte = hacher_mot_de_passe(long)
    assert verifier_mot_de_passe(long, empreinte)


def test_une_empreinte_corrompue_ne_leve_pas_d_exception():
    assert verifier_mot_de_passe("peu importe", "ceci-n-est-pas-une-empreinte") is False


def test_un_jeton_de_rafraichissement_ne_vaut_pas_jeton_d_acces():
    """Confondre les deux types allongerait la durée de vie d'un accès."""
    identifiant = nouvel_id()
    jeton = creer_jeton(identifiant, "rafraichissement")

    assert str(decoder_jeton(jeton, "rafraichissement")) == identifiant
    try:
        decoder_jeton(jeton, "acces")
    except JetonInvalide:
        pass
    else:
        raise AssertionError("Un jeton de rafraîchissement a été accepté comme jeton d'accès.")


def test_connexion_et_rafraichissement(client, comptes):
    reponse = client.post(
        "/api/v1/auth/connexion-json",
        json={"login": "agent", "mot_de_passe": "motdepasse123"},
    )
    assert reponse.status_code == 200
    jetons = reponse.json()

    renouvelle = client.post(
        "/api/v1/auth/rafraichir", json={"refresh_token": jetons["refresh_token"]}
    )
    assert renouvelle.status_code == 200
    assert renouvelle.json()["access_token"]


def test_mot_de_passe_incorrect_et_login_inconnu_donnent_le_meme_message(client, comptes):
    """Distinguer les deux cas faciliterait l'énumération des comptes."""
    mauvais_mot_de_passe = client.post(
        "/api/v1/auth/connexion-json", json={"login": "agent", "mot_de_passe": "faux"}
    )
    login_inconnu = client.post(
        "/api/v1/auth/connexion-json", json={"login": "fantome", "mot_de_passe": "faux"}
    )

    assert mauvais_mot_de_passe.status_code == login_inconnu.status_code == 401
    assert mauvais_mot_de_passe.json()["detail"] == login_inconnu.json()["detail"]


def test_un_compte_desactive_ne_se_connecte_pas(client, comptes, session):
    comptes["agent"].actif = False
    session.commit()

    reponse = client.post(
        "/api/v1/auth/connexion-json",
        json={"login": "agent", "mot_de_passe": "motdepasse123"},
    )
    assert reponse.status_code == 403


def test_sans_jeton_l_api_refuse(client):
    assert client.get("/api/v1/referentiels/engins").status_code == 401


def test_seul_un_administrateur_cree_des_comptes(client, entetes, comptes):
    nouveau = {
        "login": "agent2",
        "mot_de_passe": "motdepasse123",
        "nom_complet": "Agent deux",
        "role": "agent_terrain",
    }
    assert (
        client.post(
            "/api/v1/auth/utilisateurs", json=nouveau, headers=entetes("superviseur")
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/auth/utilisateurs", json=nouveau, headers=entetes("administrateur")
        ).status_code
        == 201
    )


def test_un_controleur_voit_tous_les_sites(client, entetes, parc, session):
    """La consolidation multi-sites est précisément le métier du contrôleur."""
    from sqlalchemy import text

    autre = session.execute(text("SELECT id FROM site WHERE code = 'BKE'")).scalar_one()

    assert (
        client.get(
            "/api/v1/synchronisation/parametrage",
            params={"site_id": autre},
            headers=entetes("controleur"),
        ).status_code
        == 200
    )
    assert (
        client.get(
            "/api/v1/synchronisation/parametrage",
            params={"site_id": autre},
            headers=entetes("agent"),
        ).status_code
        == 403
    )


def test_changement_de_mot_de_passe(client, entetes, comptes):
    h = entetes("agent")
    refus = client.post(
        "/api/v1/auth/moi/mot-de-passe",
        json={"mot_de_passe_actuel": "faux", "nouveau_mot_de_passe": "nouveaumotdepasse"},
        headers=h,
    )
    assert refus.status_code == 400

    accepte = client.post(
        "/api/v1/auth/moi/mot-de-passe",
        json={
            "mot_de_passe_actuel": "motdepasse123",
            "nouveau_mot_de_passe": "nouveaumotdepasse",
        },
        headers=h,
    )
    assert accepte.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/connexion-json",
            json={"login": "agent", "mot_de_passe": "nouveaumotdepasse"},
        ).status_code
        == 200
    )
