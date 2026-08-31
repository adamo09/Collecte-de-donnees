"""Garanties de la couche de synchronisation hors ligne (ch. 12)."""

from tests.conftest import horodatage, nouvel_id


def _lot(parc, **contenu) -> dict:
    return {
        "lot_id": nouvel_id(),
        "terminal_id": "TAB-KOS-01",
        "application_version": "1.0.0",
        "envoye_le": horodatage(),
        **contenu,
    }


def _rotation(parc, **remplacements) -> dict:
    rotation = {
        "id": nouvel_id(),
        "dumper_id": str(parc["engins"]["DU01"].id),
        "site_id": parc["site_id"],
        "horodatage": horodatage(hours := 2),
        "point_deversement": "Concassage primaire",
        "quantite_estimee_t": 28.5,
        "nature_quantite": "estimation",
        "saisi_le": horodatage(hours),
        "source_collecte": "saisie_directe",
    }
    rotation.update(remplacements)
    return rotation


def test_renvoyer_le_meme_lot_ne_cree_aucun_doublon(client, entetes, parc):
    """Un lot renvoyé après une coupure réseau doit rester sans effet.

    C'est la garantie qui autorise le terminal à réémettre sans risque quand
    il n'a pas reçu d'accusé de réception.
    """
    h = entetes("agent")
    lot = _lot(parc, rotations_dumper=[_rotation(parc), _rotation(parc)])

    premiere = client.post("/api/v1/synchronisation/lots", json=lot, headers=h)
    assert premiere.status_code == 200, premiere.text
    assert premiere.json()["nb_acceptes"] == 2
    assert premiere.json()["deja_traite"] is False

    seconde = client.post("/api/v1/synchronisation/lots", json=lot, headers=h)
    assert seconde.status_code == 200
    assert seconde.json()["deja_traite"] is True
    assert seconde.json()["nb_acceptes"] == 2

    total = client.get("/api/v1/marinage/rotations", headers=h).json()["total"]
    assert total == 2, "Le renvoi du lot a créé des doublons."


def test_meme_enregistrement_dans_deux_lots_differents(client, entetes, parc):
    """Un même UUID renvoyé dans un autre lot est signalé comme doublon."""
    h = entetes("agent")
    rotation = _rotation(parc)

    client.post(
        "/api/v1/synchronisation/lots",
        json=_lot(parc, rotations_dumper=[rotation]),
        headers=h,
    )
    seconde = client.post(
        "/api/v1/synchronisation/lots",
        json=_lot(parc, rotations_dumper=[rotation]),
        headers=h,
    )

    assert seconde.status_code == 200
    corps = seconde.json()
    assert corps["nb_doublons"] == 1
    assert corps["details"][0]["doublon"] is True
    # Un doublon reste « accepté » : le terminal doit purger sa file d'envoi.
    assert corps["details"][0]["accepte"] is True
    assert client.get("/api/v1/marinage/rotations", headers=h).json()["total"] == 1


def test_un_enregistrement_invalide_ne_fait_pas_echouer_le_lot(client, entetes, parc):
    """L'acceptation est partielle : le reste du lot est conservé."""
    h = entetes("agent")
    valide = _rotation(parc)
    invalide = _rotation(parc, dumper_id=nouvel_id())  # engin inexistant

    reponse = client.post(
        "/api/v1/synchronisation/lots",
        json=_lot(parc, rotations_dumper=[valide, invalide]),
        headers=h,
    )

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["nb_acceptes"] == 1
    assert corps["nb_rejetes"] == 1
    assert corps["resultat"] == "partiel"

    rejete = next(d for d in corps["details"] if not d["accepte"])
    assert rejete["id"] == invalide["id"]
    assert rejete["erreur"], "Le terminal doit savoir pourquoi son enregistrement est refusé."
    assert client.get("/api/v1/marinage/rotations", headers=h).json()["total"] == 1


def test_le_terminal_ne_peut_pas_declarer_une_donnee_validee(client, entetes, parc):
    """Le statut et l'auteur sont imposés par le serveur, jamais par le terminal."""
    h = entetes("agent")
    rotation = _rotation(parc)
    rotation["statut"] = "validee"
    rotation["auteur_id"] = nouvel_id()

    reponse = client.post(
        "/api/v1/synchronisation/lots",
        json=_lot(parc, rotations_dumper=[rotation]),
        headers=h,
    )
    # Les schémas d'entrée refusent tout champ non prévu : la tentative
    # échoue à la validation, elle n'est pas silencieusement ignorée.
    assert reponse.status_code == 422


def test_les_deux_horodatages_sont_distincts(client, entetes, parc, session):
    """saisi_le vient du terrain, recu_le du serveur (ch. 5).

    Un événement déclaré le matin en carrière peut n'arriver au serveur que
    le soir : confondre les deux fausserait toute analyse de temps.
    """
    from app.models.collecte import RotationDumper

    h = entetes("agent")
    saisie_terrain = horodatage(9)  # neuf heures plus tôt
    rotation = _rotation(parc, saisi_le=saisie_terrain, horodatage=saisie_terrain)

    client.post(
        "/api/v1/synchronisation/lots",
        json=_lot(parc, rotations_dumper=[rotation]),
        headers=h,
    )

    enregistree = session.get(RotationDumper, rotation["id"])
    ecart = enregistree.recu_le - enregistree.saisi_le
    assert ecart.total_seconds() > 8 * 3600, (
        "L'horodatage terrain a été écrasé par celui de la réception serveur."
    )


def test_le_lot_est_consultable_pour_diagnostic(client, entetes, parc):
    """Sans suivi des lots, une donnée manquante reste inexplicable (ch. 12)."""
    h = entetes("agent")
    lot = _lot(parc, rotations_dumper=[_rotation(parc)])
    client.post("/api/v1/synchronisation/lots", json=lot, headers=h)

    reponse = client.get(f"/api/v1/synchronisation/lots/{lot['lot_id']}", headers=h)
    assert reponse.status_code == 200
    assert reponse.json()["nb_acceptes"] == 1

    inconnu = client.get(f"/api/v1/synchronisation/lots/{nouvel_id()}", headers=h)
    assert inconnu.status_code == 404


def test_lot_trop_volumineux_est_refuse(client, entetes, parc, monkeypatch):
    """Un lot démesuré est refusé avec une consigne claire de découpage."""
    from app.core import config

    monkeypatch.setattr(config.parametres, "taille_max_lot_synchronisation", 2)
    from app.api.v1.routers import synchronisation as routeur_synchro

    monkeypatch.setattr(routeur_synchro, "parametres", config.parametres)

    h = entetes("agent")
    reponse = client.post(
        "/api/v1/synchronisation/lots",
        json=_lot(parc, rotations_dumper=[_rotation(parc) for _ in range(3)]),
        headers=h,
    )
    assert reponse.status_code == 413
    assert "découper" in reponse.json()["detail"]


def test_versions_referentiels_progressent_a_chaque_modification(client, entetes, parc):
    """Le terminal se fie à ces numéros pour rafraîchir sa copie locale."""
    h = entetes("administrateur")
    avant = {
        v["nom_referentiel"]: v["version"]
        for v in client.get("/api/v1/synchronisation/versions", headers=h).json()["versions"]
    }

    client.post(
        "/api/v1/referentiels/engins",
        json={"numero_parc": "DU99", "famille": "dumper", "site_id": parc["site_id"]},
        headers=h,
    )

    apres = {
        v["nom_referentiel"]: v["version"]
        for v in client.get("/api/v1/synchronisation/versions", headers=h).json()["versions"]
    }
    assert apres["engin"] > avant["engin"]


def test_parametrage_est_filtre_sur_le_site(client, entetes, parc):
    """Une grille de boutons porte les engins du site, pas ceux du parc entier."""
    h = entetes("agent")
    reponse = client.get("/api/v1/synchronisation/parametrage", headers=h)
    assert reponse.status_code == 200

    corps = reponse.json()
    assert corps["site_code"] == "KOS"
    assert {e["numero_parc"] for e in corps["engins"]} == {"FE01", "DU01", "DU02"}
    assert len(corps["causes_arret"]) >= 10
    assert corps["centres_de_cout"], "Les centres de coûts sont nécessaires hors ligne."
