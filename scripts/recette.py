#!/usr/bin/env python3
"""
Scénario de recette CADERAC — simule une journée complète de collecte.

Ce script rejoue le parcours réel d'une donnée, de la saisie par un agent
hors connexion jusqu'au fichier livré au gestionnaire externe, en
vérifiant à chaque étape les garanties annoncées.

Il ne remplace pas la suite de tests : il sert à démontrer le
fonctionnement du système à un tiers, et à valider un déploiement.

    python scripts/recette.py                            # serveur local
    python scripts/recette.py --url https://caderac.ci/api/v1
    python scripts/recette.py --garder                   # ne pas nettoyer

Prérequis : le serveur tourne, la base est migrée et un compte
administrateur existe (python -m app.db.seed).
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta

try:
    import httpx
except ImportError:  # pragma: no cover
    sys.exit("Installer httpx : pip install httpx")

VERT, ROUGE, JAUNE, GRIS, GRAS, FIN = (
    "\033[92m", "\033[91m", "\033[93m", "\033[90m", "\033[1m", "\033[0m",
)

anomalies: list[str] = []
etape_courante = ""


def titre(numero: str, texte: str) -> None:
    global etape_courante
    etape_courante = f"{numero} {texte}"
    print(f"\n{GRAS}── {numero}  {texte} {'─' * max(0, 58 - len(texte))}{FIN}")


def verifier(condition: bool, attendu: str, constate: str = "") -> None:
    """Consigne une vérification. Le script va jusqu'au bout même en échec :
    un rapport de recette partiel n'a aucune valeur."""
    if condition:
        print(f"  {VERT}✓{FIN} {attendu}")
    else:
        print(f"  {ROUGE}✗ {attendu}{FIN}")
        if constate:
            print(f"    {ROUGE}constaté : {constate}{FIN}")
        anomalies.append(f"{etape_courante} — {attendu}")


def info(texte: str) -> None:
    print(f"  {GRIS}{texte}{FIN}")


class Client:
    """Client HTTP minimal, un jeu de jetons par rôle."""

    def __init__(self, url: str) -> None:
        self.url = url.rstrip("/")
        self.http = httpx.Client(timeout=30.0)
        self.jetons: dict[str, str] = {}

    def attendre(self, secondes: int = 90) -> bool:
        """Attend que l'API réponde avant de commencer.

        « docker compose up » rend la main dès que le conteneur démarre, pas
        quand uvicorn écoute : entre les deux, il reste les migrations et
        l'amorçage. Sans cette attente, la recette échoue sur un serveur
        parfaitement sain.
        """
        sonde = self.url.rsplit("/api/", 1)[0] + "/sante"
        limite = time.monotonic() + secondes
        annonce = False
        while time.monotonic() < limite:
            try:
                if self.http.get(sonde, timeout=3.0).status_code == 200:
                    if annonce:
                        print(f" {VERT}prêt{FIN}")
                    return True
            except httpx.HTTPError:
                pass
            if not annonce:
                print(f"  {GRIS}Le serveur démarre encore…{FIN}", end="", flush=True)
                annonce = True
            print(f"{GRIS}.{FIN}", end="", flush=True)
            time.sleep(2)
        if annonce:
            print()
        return False

    def connecter(self, role: str, login: str, mot_de_passe: str) -> bool:
        try:
            reponse = self.http.post(
                f"{self.url}/auth/connexion-json",
                json={"login": login, "mot_de_passe": mot_de_passe},
            )
        except httpx.HTTPError as erreur:
            # Serveur injoignable : le dire clairement plutôt que d'afficher
            # une trace, la recette étant souvent lancée par un exploitant.
            print(f"\n{ROUGE}Serveur injoignable sur {self.url}{FIN}")
            print(f"{GRIS}{erreur}{FIN}")
            raise SystemExit(2) from erreur
        if reponse.status_code >= 500:
            # Le serveur répond mais quelque chose derrière ne va pas —
            # typiquement la base. Le dire, plutôt que de laisser croire à
            # un problème de compte.
            print(f"\n{ROUGE}Le serveur répond mais renvoie une erreur "
                  f"{reponse.status_code}.{FIN}")
            print(f"{GRIS}Vérifier la base : curl {self.url.rsplit('/api/', 1)[0]}/sante{FIN}")
            raise SystemExit(2)
        if reponse.status_code != 200:
            return False
        self.jetons[role] = reponse.json()["access_token"]
        return True

    def _entetes(self, role: str) -> dict:
        return {"Authorization": f"Bearer {self.jetons[role]}"}

    def get(self, role: str, chemin: str, **kw) -> httpx.Response:
        return self.http.get(f"{self.url}{chemin}", headers=self._entetes(role), **kw)

    def post(self, role: str, chemin: str, **kw) -> httpx.Response:
        return self.http.post(f"{self.url}{chemin}", headers=self._entetes(role), **kw)


def maintenant(heures: float = 0) -> str:
    return (datetime.now(UTC) - timedelta(hours=heures)).isoformat()


def principal() -> int:
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--url", default="http://localhost:8000/api/v1")
    analyseur.add_argument("--admin-login", default="admin")
    analyseur.add_argument("--admin-mot-de-passe", default="admin")
    arguments = analyseur.parse_args()

    print(f"{GRAS}Scénario de recette CADERAC{FIN}")
    print(f"{GRIS}Serveur : {arguments.url}{FIN}")

    client = Client(arguments.url)
    marque = uuid.uuid4().hex[:6].upper()

    # =================================================================
    titre("0.", "Mise en place")
    # =================================================================
    if not client.attendre():
        print(f"\n{ROUGE}Serveur injoignable sur {arguments.url}.{FIN}")
        print(f"{GRIS}Vérifier son état : docker compose ps{FIN}")
        print(f"{GRIS}Voir ses journaux : docker compose logs api{FIN}")
        return 2
    verifier(True, "Serveur joignable")

    if not client.connecter("admin", arguments.admin_login, arguments.admin_mot_de_passe):
        print(f"{ROUGE}Connexion administrateur refusée "
              f"(login « {arguments.admin_login} »).{FIN}")
        print(f"{GRIS}Si le compte n'existe pas encore :"
              f" python -m app.db.seed{FIN}")
        print(f"{GRIS}S'il a un autre mot de passe :"
              f" --admin-login … --admin-mot-de-passe …{FIN}")
        return 2
    verifier(True, "Connexion administrateur")

    sites = client.get("admin", "/referentiels/sites").json()
    site = next((s for s in sites if s["code"] == "KOS"), sites[0])
    info(f"Site retenu : {site['code']} — {site['libelle']}")

    # Comptes des trois rôles opérationnels
    comptes = {
        "agent": ("agent_terrain", site["id"]),
        "superviseur": ("superviseur", site["id"]),
        "controleur": ("controleur", None),
    }
    for role, (role_api, site_id) in comptes.items():
        login = f"recette.{role}.{marque}"
        client.post("admin", "/auth/utilisateurs", json={
            "login": login, "mot_de_passe": "recette2026",
            "nom_complet": f"Recette {role}", "role": role_api, "site_id": site_id,
        })
        verifier(client.connecter(role, login, "recette2026"),
                 f"Compte {role} créé et opérationnel")

    # Parc minimal
    client.post("admin", "/referentiels/personnel", json={
        "matricule": f"REC{marque}", "nom_prenoms": "Opérateur de recette",
        "fonction": "Foreur", "site_id": site["id"], "centre_cout": "CP01",
    })
    engins: dict[str, dict] = {}
    for numero, famille, capacite, centre in (
        (f"FE{marque[:2]}", "foreuse", None, "CP01"),
        (f"DU{marque[:2]}", "dumper", 28.5, "CP03"),
    ):
        reponse = client.post("admin", "/referentiels/engins", json={
            "numero_parc": numero, "famille": famille, "site_id": site["id"],
            "capacite_nominale": capacite, "unite_capacite": "t" if capacite else None,
            "centre_cout_reference": centre,
        })
        engins[famille] = reponse.json()
    verifier(len(engins) == 2, "Foreuse et dumper enregistrés au référentiel")

    tir = client.post("admin", "/referentiels/tirs", json={
        "numero_t": f"T{marque[:3]}", "site_id": site["id"],
        "date_tir": datetime.now(UTC).date().isoformat(),
    }).json()
    info(f"Tir {tir['numero_t']} déclaré")

    # =================================================================
    titre("1.", "Le terminal se prépare pour une journée hors ligne")
    # =================================================================
    parametrage = client.get("agent", "/synchronisation/parametrage").json()
    verifier(parametrage["site_code"] == site["code"],
             "Le paramétrage est filtré sur le site de l'agent")
    verifier(any(e["numero_parc"] == engins["dumper"]["numero_parc"]
                 for e in parametrage["engins"]),
             "Le dumper figure dans le référentiel embarqué")
    verifier(len(parametrage["causes_arret"]) >= 10,
             "La nomenclature des arrêts est embarquée")
    info(f"{len(parametrage['engins'])} engins, "
         f"{len(parametrage['causes_arret'])} motifs d'arrêt, "
         f"{len(parametrage['centres_de_cout'])} centres de coûts")

    # =================================================================
    titre("2.", "Journée en carrière — saisies sans réseau")
    # =================================================================
    # Les identifiants sont produits par le terminal : c'est ce qui permet
    # de saisir sans attendre le réseau.
    id_trou_clos, id_trou_ouvert = str(uuid.uuid4()), str(uuid.uuid4())
    debut = datetime.now(UTC) - timedelta(hours=6)

    trou_clos = {
        "id": id_trou_clos, "site_id": site["id"], "tir_id": tir["id"],
        "foreuse_id": engins["foreuse"]["id"], "operateur_matricule": f"REC{marque}",
        "poste": "jour", "date_foration": debut.date().isoformat(),
        "heure_debut": debut.isoformat(), "saisi_le": debut.isoformat(),
        "compteur_debut": 4820.0, "diametre_mm": 102.0,
        "gps_latitude": 5.4812, "gps_longitude": -4.3185,
        "heure_fin": (debut + timedelta(minutes=45)).isoformat(),
        "compteur_fin": 4820.75, "metres_lineaires": 12.5,
        "numero_taillant": "TAI-2291", "source_collecte": "qr_code",
    }
    trou_ouvert = {**trou_clos, "id": id_trou_ouvert,
                   "heure_debut": (debut + timedelta(hours=2)).isoformat(),
                   "saisi_le": (debut + timedelta(hours=2)).isoformat(),
                   "heure_fin": None, "compteur_fin": None,
                   "metres_lineaires": None, "numero_taillant": None}

    rotations = []
    for i in range(8):
        horodatage = (debut + timedelta(minutes=25 * i)).isoformat()
        pesee = i == 0
        rotations.append({
            "id": str(uuid.uuid4()), "dumper_id": engins["dumper"]["id"],
            "site_id": site["id"], "horodatage": horodatage, "saisi_le": horodatage,
            "point_deversement": "Primaire", "poste": "jour", "centre_cout_reel": "CP03",
            "poids_reel_t": 29.1 if pesee else None,
            "quantite_estimee_t": None if pesee else 28.5,
            "nature_quantite": "pesee_reelle" if pesee else "estimation",
            "source_collecte": "saisie_directe",
        })

    evenements = [{
        "id": str(uuid.uuid4()), "engin_id": engins["dumper"]["id"],
        "site_id": site["id"], "centre_cout_reel": "CP03",
        "type_evenement": type_evt,
        "horodatage": (debut + timedelta(minutes=m)).isoformat(),
        "saisi_le": (debut + timedelta(minutes=m)).isoformat(),
        "compteur": 9100.0 + m / 60, "cause_code": cause,
        "source_collecte": "qr_code",
    } for type_evt, m, cause in (
        ("debut", 0, None), ("panne", 120, "PANNE_HYD"), ("reprise", 165, None),
    )]

    info(f"Saisi hors ligne : 2 trous ({len(rotations)} rotations, "
         f"{len(evenements)} événements engin)")

    # =================================================================
    titre("3.", "Retour en zone couverte — synchronisation")
    # =================================================================
    lot_id = str(uuid.uuid4())
    lot = {
        "lot_id": lot_id, "terminal_id": f"TAB-RECETTE-{marque}",
        "application_version": "1.0.0", "envoye_le": maintenant(),
        "trous_forage": [trou_clos, trou_ouvert],
        "rotations_dumper": rotations,
        "evenements_engin": evenements,
    }
    attendu = 2 + len(rotations) + len(evenements)

    reponse = client.post("agent", "/synchronisation/lots", json=lot)
    verifier(reponse.status_code == 200, "Le lot est accepté",
             reponse.text[:160])
    accuse = reponse.json()
    verifier(accuse["nb_acceptes"] == attendu,
             f"Les {attendu} enregistrements sont acceptés",
             f"{accuse['nb_acceptes']} acceptés, {accuse['nb_rejetes']} rejetés")
    verifier(accuse["deja_traite"] is False, "Le lot est traité pour la première fois")

    ecart_horodatages = client.get(
        "controleur", "/marinage/rotations",
        params={"dumper_id": engins["dumper"]["id"], "limite": 1},
    ).json()["elements"][0]
    verifier(ecart_horodatages["saisi_le"] != ecart_horodatages["recu_le"],
             "L'horodatage terrain est distinct de celui de la réception")
    info(f"Saisi le {ecart_horodatages['saisi_le'][:19]} — "
         f"reçu le {ecart_horodatages['recu_le'][:19]}")

    # =================================================================
    titre("4.", "Le réseau coupe pendant l'envoi — le terminal réémet")
    # =================================================================
    rejoue = client.post("agent", "/synchronisation/lots", json=lot).json()
    verifier(rejoue["deja_traite"] is True,
             "Le serveur reconnaît un lot déjà reçu")
    verifier(rejoue["nb_acceptes"] == accuse["nb_acceptes"],
             "La réponse d'origine est rejouée à l'identique")

    # Comptage restreint au dumper de cette exécution : le script est
    # rejouable sur une base déjà alimentée.
    total = client.get("controleur", "/marinage/rotations",
                       params={"dumper_id": engins["dumper"]["id"],
                               "limite": 1}).json()["total"]
    verifier(total == len(rotations),
             f"Aucun doublon créé — {len(rotations)} rotations pour ce dumper",
             f"{total} rotations")

    # =================================================================
    titre("5.", "Une saisie fautive ne doit pas emporter le lot entier")
    # =================================================================
    bonne = {**rotations[0], "id": str(uuid.uuid4()),
             "horodatage": maintenant(1), "saisi_le": maintenant(1)}
    mauvaise = {**bonne, "id": str(uuid.uuid4()),
                "dumper_id": str(uuid.uuid4())}  # engin inexistant

    partiel = client.post("agent", "/synchronisation/lots", json={
        "lot_id": str(uuid.uuid4()), "terminal_id": f"TAB-RECETTE-{marque}",
        "envoye_le": maintenant(), "rotations_dumper": [bonne, mauvaise],
    }).json()

    verifier(partiel["resultat"] == "partiel", "Le lot est accepté partiellement")
    verifier(partiel["nb_acceptes"] == 1 and partiel["nb_rejetes"] == 1,
             "La saisie valide passe, la fautive est écartée",
             f"{partiel['nb_acceptes']} acceptés / {partiel['nb_rejetes']} rejetés")
    rejete = next(d for d in partiel["details"] if not d["accepte"])
    verifier(bool(rejete["erreur"]),
             "Le terminal reçoit le motif du rejet pour le présenter à l'agent")
    info(f"Motif transmis : {(rejete['erreur'] or '')[:90]}")

    # =================================================================
    titre("6.", "Le terminal ne peut pas s'auto-attribuer un statut validé")
    # =================================================================
    fraude = client.post("agent", "/synchronisation/lots", json={
        "lot_id": str(uuid.uuid4()), "terminal_id": "TAB-FRAUDE",
        "envoye_le": maintenant(),
        "rotations_dumper": [{**bonne, "id": str(uuid.uuid4()), "statut": "validee"}],
    })
    verifier(fraude.status_code == 422,
             "Une donnée déclarée « validée » par le terminal est refusée",
             f"HTTP {fraude.status_code}")

    # =================================================================
    titre("7.", "Écran de contrôle — les trous restés ouverts")
    # =================================================================
    ouverts = client.get("superviseur", "/foration/trous/non-clotures",
                         params={"au_dela_de_heures": 0}).json()
    verifier(any(t["id"] == id_trou_ouvert for t in ouverts),
             "Le trou sans second scan apparaît à l'écran de contrôle")
    verifier(all(t["id"] != id_trou_clos for t in ouverts),
             "Le trou clôturé n'y figure pas")
    for t in ouverts:
        if t["id"] == id_trou_ouvert:
            info(f"{t['reference']} — foreuse {t['foreuse']} — "
                 f"ouvert depuis {t['anciennete_heures']:.1f} h")

    # =================================================================
    titre("8.", "Grandeurs dérivées calculées par la base")
    # =================================================================
    trou = client.get("controleur", f"/foration/trous/{id_trou_clos}").json()
    verifier(trou["reference"] is not None,
             f"Référence lisible attribuée par le serveur : {trou['reference']}")
    verifier(trou["duree_foration"] == "PT45M",
             "Durée de foration calculée (45 min)", str(trou["duree_foration"]))
    verifier(float(trou["utilisation_foreuse"]) == 0.75,
             "Utilisation foreuse calculée (0,75 h)", str(trou["utilisation_foreuse"]))
    verifier(trou["est_cloture"] is True, "Le trou est marqué clôturé")

    # =================================================================
    titre("9.", "Réel et estimé ne sont jamais confondus")
    # =================================================================
    synthese = client.get("superviseur", "/marinage/rotations/synthese-journaliere",
                          params={"site_id": site["id"],
                                  "jour": debut.date().isoformat()}).json()
    ligne = next((s for s in synthese
                  if s["dumper"] == engins["dumper"]["numero_parc"]), None)
    verifier(ligne is not None, "Le dumper apparaît dans la synthèse du jour")
    if ligne:
        verifier(ligne["tonnage_pese_t"] is not None
                 and ligne["tonnage_estime_t"] is not None,
                 "Les deux tonnages sont restitués séparément")
        verifier("tonnage_total_t" not in ligne,
                 "Aucun total n'additionne le pesé et l'estimé")
        info(f"{ligne['nb_rotations']} rotations — "
             f"pesé {ligne['tonnage_pese_t']} t, estimé {ligne['tonnage_estime_t']} t")

    # =================================================================
    titre("10.", "Workflow de contrôle et de validation")
    # =================================================================
    file_attente = client.get("superviseur", "/validation/file",
                              params={"statut": "brute", "limite": 500}).json()
    verifier(any(ligne_["id"] == id_trou_clos for ligne_ in file_attente),
             "Le trou synchronisé attend dans la file de contrôle")

    saut = client.post("controleur", f"/validation/trou_forage/{id_trou_clos}/statut",
                       json={"nouveau_statut": "validee"})
    verifier(saut.status_code == 409,
             "Impossible de valider sans contrôle préalable",
             f"HTTP {saut.status_code}")

    controle = client.post("superviseur", f"/validation/trou_forage/{id_trou_clos}/statut",
                           json={"nouveau_statut": "controlee"})
    verifier(controle.status_code == 200, "Le superviseur contrôle la donnée")

    refus = client.post("superviseur", f"/validation/trou_forage/{id_trou_clos}/statut",
                        json={"nouveau_statut": "validee"})
    verifier(refus.status_code == 409,
             "Le superviseur ne peut pas valider — réservé au contrôleur",
             f"HTTP {refus.status_code}")

    validation = client.post("controleur", f"/validation/trou_forage/{id_trou_clos}/statut",
                             json={"nouveau_statut": "validee"})
    verifier(validation.status_code == 200, "Le contrôleur valide")

    # Valider aussi les rotations, pour l'export de l'étape 12.
    lot_rotations = client.post(
        "controleur", "/validation/rotation_dumper/statut-lot",
        json={"identifiants": [r["id"] for r in rotations],
              "nouveau_statut": "controlee"}).json()
    client.post("controleur", "/validation/rotation_dumper/statut-lot",
                json={"identifiants": [r["id"] for r in rotations],
                      "nouveau_statut": "validee"})
    verifier(lot_rotations["nb_appliques"] == len(rotations),
             f"Validation par lot des {len(rotations)} rotations",
             f"{lot_rotations['nb_appliques']} appliquées")

    # =================================================================
    titre("11.", "Une donnée validée ne se modifie pas silencieusement")
    # =================================================================
    sans_motif = client.post("controleur",
                             f"/validation/trou_forage/{id_trou_clos}/correction",
                             json={"modifications": {"metres_lineaires": 13.2},
                                   "motif": ""})
    verifier(sans_motif.status_code == 422,
             "Une correction sans motif est refusée", f"HTTP {sans_motif.status_code}")

    tracabilite = client.post("controleur",
                              f"/validation/trou_forage/{id_trou_clos}/correction",
                              json={"modifications": {"auteur_id": str(uuid.uuid4())},
                                    "motif": "Tentative"})
    verifier(tracabilite.status_code == 422,
             "Les champs de traçabilité ne sont pas corrigeables")

    correction = client.post(
        "controleur", f"/validation/trou_forage/{id_trou_clos}/correction",
        json={"modifications": {"metres_lineaires": 13.2},
              "motif": "Relevé corrigé après vérification sur le carreau."})
    verifier(correction.status_code == 200, "La correction motivée est acceptée")

    audit = client.get("controleur", "/validation/audit",
                       params={"table_cible": "trou_forage",
                               "enregistrement": id_trou_clos}).json()
    verifier(len(audit) >= 1, "La correction est journalisée")
    if audit:
        ligne = audit[0]
        verifier(bool(ligne["motif"]), "Le motif est conservé")
        info(f"{ligne['champ']} : {ligne['ancienne_valeur']} → "
             f"{ligne['nouvelle_valeur']} — « {ligne['motif']} »")

    apres = client.get("controleur", f"/foration/trous/{id_trou_clos}").json()
    verifier(apres["statut"] == "controlee",
             "La donnée corrigée retourne au contrôle et doit être revalidée",
             apres["statut"])

    # =================================================================
    titre("12.", "Livrable au gestionnaire externe")
    # =================================================================
    export = client.get("controleur", "/exports/rotations",
                        params={"site": site["code"]}).json()
    identifiants_exportes = {ligne_["id"] for ligne_ in export["lignes"]}
    verifier(len(identifiants_exportes & {r["id"] for r in rotations}) == len(rotations),
             "Les rotations validées figurent à l'export")
    verifier(rejete["id"] not in identifiants_exportes,
             "Aucune donnée rejetée n'atteint le gestionnaire")
    verifier(id_trou_clos not in {
        ligne_["id_technique"] for ligne_ in
        client.get("controleur", "/exports/foration",
                   params={"site": site["code"]}).json()["lignes"]},
        "Le trou repassé au contrôle est retiré de l'export")

    colonnes = export["colonnes"]
    verifier("poids_reel_t" in colonnes and "quantite_estimee_t" in colonnes,
             "Les deux tonnages sont exposés séparément")
    verifier(not [c for c in colonnes if "total" in c.lower()],
             "Aucune colonne n'additionne pesé et estimé")

    fichier = client.get("controleur", "/exports/rotations/fichier",
                         params={"format": "xlsx", "site": site["code"]})
    verifier(fichier.status_code == 200 and len(fichier.content) > 5000,
             f"Fichier Excel produit ({len(fichier.content)} octets)")
    csv = client.get("controleur", "/exports/rotations/fichier",
                     params={"format": "csv", "site": site["code"]})
    verifier(csv.content.startswith(b"\xef\xbb\xbf"),
             "Le CSV porte le BOM UTF-8 attendu par Excel en français")

    # =================================================================
    titre("13.", "Complétude — le pilotage du déploiement")
    # =================================================================
    completude = client.get("controleur", "/exports/completude",
                            params={"site": site["code"]}).json()
    jour = debut.date().isoformat()
    ligne = next(
        (entree for entree in completude["lignes"] if str(entree["jour"]) == jour), None
    )
    verifier(ligne is not None, f"Le {jour} est suivi dans la vue de complétude")
    if ligne:
        info(f"{ligne['trous_declares']} trous déclarés dont "
             f"{ligne['trous_non_clotures']} non clôturé(s), "
             f"{ligne['rotations_declarees']} rotations, "
             f"{ligne['engins_sans_declaration']} engin(s) sans déclaration")

    # =================================================================
    titre("14.", "Diagnostic d'une donnée manquante")
    # =================================================================
    trace = client.get("agent", f"/synchronisation/lots/{lot_id}")
    verifier(trace.status_code == 200,
             "Le lot reste consultable pour prouver qu'il est bien arrivé")
    inexistant = client.get("agent", f"/synchronisation/lots/{uuid.uuid4()}")
    verifier(inexistant.status_code == 404,
             "Un lot jamais reçu est signalé comme tel")

    # =================================================================
    print(f"\n{GRAS}{'═' * 64}{FIN}")
    if anomalies:
        print(f"{ROUGE}{GRAS}RECETTE EN ÉCHEC — {len(anomalies)} anomalie(s){FIN}\n")
        for anomalie in anomalies:
            print(f"  {ROUGE}•{FIN} {anomalie}")
        return 1

    print(f"{VERT}{GRAS}RECETTE CONFORME{FIN}")
    print(f"{GRIS}Toutes les garanties annoncées ont été vérifiées "
          f"de bout en bout.{FIN}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
