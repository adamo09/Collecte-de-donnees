# Comment tester le logiciel

Quatre niveaux, du plus rapide au plus démonstratif. Chacun répond à une
question différente — ne pas les confondre.

| Niveau | Question à laquelle il répond | Durée |
|---|---|---|
| 1. Suite automatisée | Le code respecte-t-il les garanties du modèle ? | ~2 min |
| 2. Recette de bout en bout | Le système déployé fonctionne-t-il vraiment ? | ~10 s |
| 3. Exploration manuelle | À quoi ressemble concrètement telle opération ? | libre |
| 4. Test terrain | Les agents s'en servent-ils réellement ? | le pilote |

---

## Prérequis communs

Un PostgreSQL 14 ou supérieur accessible.

```bash
# Avec Docker
docker compose up -d db

# Ou une base existante
createdb caderac
```

```bash
cd backend
pip install -e ".[dev]"
export DATABASE_URL="postgresql+psycopg://caderac:motdepasse@localhost:5432/caderac"
export SECRET_KEY="une_valeur_aleatoire"
```

---

## Niveau 1 — Suite automatisée

```bash
cd backend
pytest -q                        # 65 tests
pytest -q tests/test_synchronisation.py    # un module
pytest -q -k "doublon"           # un sujet
pytest --cov=app --cov-report=term-missing # avec couverture
```

La suite crée et détruit sa propre base (`caderac_pytest`) : elle ne touche
jamais aux données de développement. Pour changer de nom :
`TEST_DB_NAME=autre pytest`.

**Elle s'exécute sur un vrai PostgreSQL, jamais sur SQLite.** Le schéma
repose sur des types ENUM, des colonnes générées, des contraintes CHECK et
des triggers qu'aucun autre moteur ne reproduit fidèlement — tester ailleurs
reviendrait à ne pas tester les garanties du modèle.

### Ce qu'elle vérifie, au-delà du nominal

| Module | Garanties vérifiées |
|---|---|
| `test_synchronisation` | Renvoyer un lot ne crée aucun doublon · un enregistrement invalide n'emporte pas les autres · le terminal ne peut ni usurper un auteur ni déclarer une donnée validée · l'horodatage terrain n'est jamais écrasé · un lot reste consultable pour diagnostic |
| `test_foration` | Références séquentielles par tir · rejouer un premier scan ne duplique rien · durée et utilisation calculées par la base · un trou clôturé ne se reclôture pas · compteur qui régresse refusé · cloisonnement par site |
| `test_rotations` | Réel et estimé jamais confondus · aucun total agrégé · arrêt sans motif codifié refusé · compteur engin qui ne régresse pas sur synchro tardive |
| `test_validation` | Cycle brute → contrôlée → validée · seul le contrôleur valide · rejet et reprise motivés · chaque champ corrigé journalisé · champs de traçabilité incorrigibles · correction ramenant au contrôle |
| `test_exports` | Aucune donnée brute exportée · les six vues du contrat présentes · **colonnes du contrat verrouillées** · aucun tonnage total · Excel et CSV lisibles en français |
| `test_auth` | Mots de passe hachés · types de jetons distincts · login inconnu et mot de passe faux indiscernables · rôles et portées |

Le test des colonnes d'export mérite une mention : il **échoue si une
colonne du contrat disparaît ou est renommée**. C'est exactement l'alerte
attendue, puisque cette structure ne doit plus bouger une fois validée avec
le gestionnaire.

### Côté mobile

```bash
cd mobile
npm install
npm run verifier-types    # TypeScript strict
npm test                  # construction des lots de synchronisation
```

---

## Niveau 2 — Recette de bout en bout

C'est le niveau à montrer au commanditaire.

### Avec Docker — rien à installer sur le poste

`docker compose up` migre la base, crée le compte administrateur et démarre
l'API. Depuis un **second terminal** :

```bash
# Jeu de démonstration (facultatif mais recommandé)
docker compose exec api python -m app.db.seed --demonstration

# La recette, exécutée depuis le conteneur qui porte déjà ses dépendances
docker compose exec api python /scripts/recette.py --url http://localhost:8000/api/v1
```

### Sans Docker

```bash
# 1. Préparer la base et le compte administrateur
cd backend
alembic upgrade head
python -m app.db.seed

# 2. Démarrer le serveur
uvicorn app.main:app --reload

# 3. Dans un autre terminal, lancer la recette
cd ..
pip install httpx          # sous Ubuntu 24.04, passer par un venv
python scripts/recette.py
```

Le script simule **une journée complète de collecte** et vérifie à chaque
étape les garanties annoncées :

```
0.  Mise en place — comptes des trois rôles, parc minimal, tir
1.  Le terminal se prépare pour une journée hors ligne
2.  Journée en carrière — 2 trous, 8 rotations, 3 événements, sans réseau
3.  Retour en zone couverte — synchronisation
4.  Le réseau coupe pendant l'envoi — le terminal réémet
5.  Une saisie fautive ne doit pas emporter le lot entier
6.  Le terminal ne peut pas s'auto-attribuer un statut validé
7.  Écran de contrôle — les trous restés ouverts
8.  Grandeurs dérivées calculées par la base
9.  Réel et estimé ne sont jamais confondus
10. Workflow de contrôle et de validation
11. Une donnée validée ne se modifie pas silencieusement
12. Livrable au gestionnaire externe
13. Complétude — le pilotage du déploiement
14. Diagnostic d'une donnée manquante
```

Options :

```bash
python scripts/recette.py --url https://caderac.exemple.ci/api/v1
python scripts/recette.py --admin-login exploitant --admin-mot-de-passe ...
```

Codes de sortie : `0` conforme, `1` anomalies détectées (elles sont toutes
listées en fin de rapport), `2` serveur injoignable.

Le script **est rejouable** : il crée ses propres comptes et engins à chaque
exécution, et ses vérifications sont restreintes aux données qu'il vient de
produire. Il peut donc servir de contrôle après chaque déploiement.

---

## Niveau 3 — Exploration manuelle

### Documentation interactive

Serveur démarré, ouvrir **http://localhost:8000/documentation**.

1. Cliquer sur **Authorize**, saisir `admin` / `admin`.
2. Tous les points d'entrée deviennent exécutables depuis le navigateur.

C'est le moyen le plus direct de faire découvrir l'API à un tiers, sans
écrire une ligne de code.

### Jeu de démonstration

```bash
python -m app.db.seed --demonstration
```

Charge sur le site KOS un parc de 7 engins, 4 équipements de concassage,
6 agents, 3 produits, une journée de foration (dont **un trou volontairement
laissé ouvert**, pour alimenter l'écran de contrôle), 24 rotations et une
séquence d'événements engin avec panne et reprise.

Comptes créés : `agent.kos`, `superviseur.kos`, `controleur` — mot de passe
`caderac2026`. **À ne pas charger en production.**

### Quelques vérifications parlantes

```bash
JETON=$(curl -s -X POST http://localhost:8000/api/v1/auth/connexion-json \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","mot_de_passe":"admin"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Les trous restés ouverts — l'anomalie la plus probable du module foration
curl -s -H "Authorization: Bearer $JETON" \
  "http://localhost:8000/api/v1/foration/trous/non-clotures?au_dela_de_heures=0"

# La complétude du jour — qui déclare, qui ne déclare pas
curl -s -H "Authorization: Bearer $JETON" \
  "http://localhost:8000/api/v1/exports/completude?site=KOS"

# Le livrable au gestionnaire
curl -s -H "Authorization: Bearer $JETON" \
  "http://localhost:8000/api/v1/exports/rotations/fichier?format=xlsx&site=KOS" \
  -o rotations.xlsx
```

### Application mobile

```bash
cd mobile
npm start        # puis « a » pour Android
```

L'URL de l'API se règle dans `app.json` (`expo.extra.urlApi`). Depuis
l'émulateur Android, `http://10.0.2.2:8000/api/v1` désigne la machine hôte ;
sur un terminal physique, mettre l'adresse IP du poste.

**Le test qui compte : couper le réseau.** Activer le mode avion, saisir des
rotations et un trou de forage, constater que tout est accepté et que le
compteur de la barre d'onglets augmente. Réactiver le réseau, ouvrir l'onglet
*File d'envoi*, synchroniser, vérifier que le compteur retombe à zéro et que
les données apparaissent côté serveur.

---

## Niveau 4 — Test terrain

Aucun test automatisé ne dira si les agents se servent réellement de l'outil.
Le document de modélisation est explicite là-dessus (ch. 14) :

> « Un opérateur à qui l'on demande deux scans et sept saisies par trou
> saisira n'importe quoi au bout de trois jours si l'outil est lent ou s'il
> n'en perçoit aucun bénéfice. »

Ce qu'il faut mesurer pendant le pilote, sur **un site unique et deux
modules** — foration et rotations :

| Indicateur | Où le lire | Signal d'alerte |
|---|---|---|
| Complétude quotidienne | `v_completude_collecte` | Un site qui tombe à zéro, `engins_sans_declaration` élevé |
| Trous non clôturés | `v_pilotage_trous_non_clotures` | Proportion croissante — le second scan est oublié |
| Délai saisie → réception | `saisi_le` vs `recu_le` | Écarts de plusieurs jours : terminal jamais rapproché du réseau |
| Lots rejetés | `lot_synchronisation` | Répétition sur un même terminal |
| Données restées brutes | `v_pilotage_file_validation` | Le contrôle ne suit pas le rythme de la collecte |

Le suivi de la complétude dès le premier jour est ce qui permet de détecter
une équipe qui a cessé de déclarer **avant que trois semaines de données
soient perdues**.
