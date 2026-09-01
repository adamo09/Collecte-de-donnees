"""Modification des référentiels.

Un référentiel n'est jamais supprimé — les données collectées y renvoient.
Il est désactivé, et toute modification est journalisée : changer le centre
de coût de référence d'un engin déplace des coûts dans les exports du
gestionnaire externe.
"""

import pytest


@pytest.fixture
def agent_reference(client, entetes, parc):
    """Un agent du référentiel, sur lequel opérer."""
    reponse = client.post(
        "/api/v1/referentiels/personnel",
        json={
            "matricule": "MODIF01",
            "nom_prenoms": "Ouattara Salif",
            "fonction": "Conducteur dumper",
            "site_id": parc["site_id"],
            "centre_cout": "CP03",
        },
        headers=entetes("administrateur"),
    )
    assert reponse.status_code == 201, reponse.text
    return reponse.json()


def test_modification_partielle_ne_touche_que_le_champ_transmis(
    client, entetes, agent_reference
):
    """Envoyer un seul champ ne doit pas effacer le reste de la fiche."""
    reponse = client.patch(
        f"/api/v1/referentiels/personnel/{agent_reference['matricule']}",
        json={"fonction": "Chef de manœuvre"},
        headers=entetes("administrateur"),
    )

    assert reponse.status_code == 200, reponse.text
    apres = reponse.json()
    assert apres["fonction"] == "Chef de manœuvre"
    assert apres["nom_prenoms"] == agent_reference["nom_prenoms"]
    assert apres["centre_cout"] == "CP03"
    assert apres["site_id"] == agent_reference["site_id"]


def test_un_agent_qui_part_est_desactive_pas_supprime(client, entetes, agent_reference):
    """Les déclarations passées renvoient à ce matricule : l'effacer
    romprait l'historique."""
    matricule = agent_reference["matricule"]

    reponse = client.patch(
        f"/api/v1/referentiels/personnel/{matricule}",
        json={"actif": False, "date_fin_affect": "2026-08-31"},
        headers=entetes("administrateur"),
    )
    assert reponse.status_code == 200
    assert reponse.json()["actif"] is False

    # Absent des listes de saisie…
    actifs = client.get(
        "/api/v1/referentiels/personnel", headers=entetes("agent")
    ).json()
    assert all(a["matricule"] != matricule for a in actifs)

    # …mais toujours présent en base.
    tous = client.get(
        "/api/v1/referentiels/personnel",
        params={"inclure_inactifs": True},
        headers=entetes("agent"),
    ).json()
    assert any(a["matricule"] == matricule for a in tous)


def test_toute_modification_est_journalisee(client, entetes, agent_reference):
    """C'est ce journal qui permet d'expliquer un coût qui a changé de centre."""
    matricule = agent_reference["matricule"]
    client.patch(
        f"/api/v1/referentiels/personnel/{matricule}",
        json={"centre_cout": "CP09"},
        headers=entetes("administrateur"),
    )

    audit = client.get(
        "/api/v1/validation/audit",
        params={"table_cible": "personnel", "enregistrement": matricule},
        headers=entetes("controleur"),
    ).json()

    assert len(audit) == 1
    assert audit[0]["champ"] == "centre_cout"
    assert audit[0]["ancienne_valeur"] == "CP03"
    assert audit[0]["nouvelle_valeur"] == "CP09"


def test_une_modification_sans_ecart_n_encombre_pas_le_journal(
    client, entetes, agent_reference
):
    """Un journal rempli de non-événements devient illisible au moment où
    l'on en a besoin."""
    matricule = agent_reference["matricule"]
    client.patch(
        f"/api/v1/referentiels/personnel/{matricule}",
        json={"fonction": agent_reference["fonction"]},
        headers=entetes("administrateur"),
    )

    audit = client.get(
        "/api/v1/validation/audit",
        params={"table_cible": "personnel", "enregistrement": matricule},
        headers=entetes("controleur"),
    ).json()
    assert audit == []


def test_le_matricule_n_est_pas_modifiable(client, entetes, agent_reference):
    """C'est la clé à laquelle chaque déclaration terrain se rattache."""
    reponse = client.patch(
        f"/api/v1/referentiels/personnel/{agent_reference['matricule']}",
        json={"matricule": "AUTRE01"},
        headers=entetes("administrateur"),
    )
    assert reponse.status_code == 422


def test_seul_un_administrateur_modifie_le_referentiel(client, entetes, agent_reference):
    matricule = agent_reference["matricule"]
    for role, attendu in (("agent", 403), ("superviseur", 403), ("administrateur", 200)):
        reponse = client.patch(
            f"/api/v1/referentiels/personnel/{matricule}",
            json={"fonction": f"Fonction {role}"},
            headers=entetes(role),
        )
        assert reponse.status_code == attendu, f"{role} → {reponse.status_code}"


def test_modification_d_un_engin(client, entetes, parc, session):
    """Un engin peut changer de site ou d'affectation analytique."""
    from sqlalchemy import text

    autre_site = session.execute(
        text("SELECT id FROM site WHERE code = 'BKE'")
    ).scalar_one()
    engin_id = str(parc["engins"]["DU01"].id)

    reponse = client.patch(
        f"/api/v1/referentiels/engins/{engin_id}",
        json={"site_id": autre_site, "centre_cout_reference": "CP09"},
        headers=entetes("administrateur"),
    )

    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["site_id"] == autre_site
    assert reponse.json()["centre_cout_reference"] == "CP09"


def test_le_parcours_d_un_produit_se_remplace_en_entier(client, entetes, parc):
    """Un parcours est une séquence : il se remplace, il ne se modifie pas
    élément par élément."""
    h = entetes("administrateur")
    cree = client.post(
        "/api/v1/referentiels/produits",
        json={
            "code": "0-3",
            "libelle": "Sable concassé 0/3",
            "parcours": [{"ordre": 1, "niveau": "primaire"}],
        },
        headers=h,
    ).json()

    reponse = client.patch(
        f"/api/v1/referentiels/produits/{cree['id']}",
        json={
            "parcours": [
                {"ordre": 1, "niveau": "primaire"},
                {"ordre": 2, "niveau": "secondaire"},
                {"ordre": 3, "niveau": "tertiaire"},
            ]
        },
        headers=h,
    )

    assert reponse.status_code == 200, reponse.text
    niveaux = [e["niveau"] for e in reponse.json()["parcours"]]
    assert niveaux == ["primaire", "secondaire", "tertiaire"]

    audit = client.get(
        "/api/v1/validation/audit",
        params={"table_cible": "produit_parcours", "enregistrement": cree["id"]},
        headers=entetes("controleur"),
    ).json()
    assert len(audit) == 1
    assert "secondaire" in (audit[0]["nouvelle_valeur"] or "")


def test_un_parcours_avec_deux_fois_le_meme_niveau_est_refuse(client, entetes):
    h = entetes("administrateur")
    cree = client.post(
        "/api/v1/referentiels/produits",
        json={"code": "15-25", "libelle": "Gravier 15/25"},
        headers=h,
    ).json()

    reponse = client.patch(
        f"/api/v1/referentiels/produits/{cree['id']}",
        json={
            "parcours": [
                {"ordre": 1, "niveau": "primaire"},
                {"ordre": 2, "niveau": "primaire"},
            ]
        },
        headers=h,
    )
    assert reponse.status_code == 409


def test_le_code_d_un_motif_d_arret_n_est_pas_modifiable(client, entetes):
    """Les événements déjà déclarés y renvoient : le renommer fausserait
    toute statistique d'arrêts."""
    reponse = client.patch(
        "/api/v1/referentiels/causes-arret/PANNE_HYD",
        json={"code": "PANNE_HYDRAULIQUE"},
        headers=entetes("administrateur"),
    )
    assert reponse.status_code == 422


def test_un_superviseur_peut_amender_la_nomenclature_des_arrets(client, entetes):
    """La liste s'enrichit avec l'usage terrain (ch. 4.4)."""
    reponse = client.patch(
        "/api/v1/referentiels/causes-arret/METEO",
        json={"libelle": "Intempéries — pluie ou orage"},
        headers=entetes("superviseur"),
    )
    assert reponse.status_code == 200
    assert reponse.json()["libelle"] == "Intempéries — pluie ou orage"


def test_modifier_un_referentiel_inconnu_retourne_404(client, entetes):
    reponse = client.patch(
        "/api/v1/referentiels/personnel/FANTOME",
        json={"fonction": "Néant"},
        headers=entetes("administrateur"),
    )
    assert reponse.status_code == 404
