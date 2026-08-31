# CADERAC — Système de collecte de données terrain

Suivi technique et économique des quatre carrières CADERAC (Kossihouen,
Bouaké, Aboisso, Laoudi Ba).

**Périmètre V1 : collecte, contrôle et restitution.** Le calcul des coûts de
production et de revient est assuré par le gestionnaire externe à partir des
exports produits ici. Ce choix écarte du périmètre les règles d'imputation
analytique, qui ne sont pas encore arrêtées, ainsi que les interfaces Sage et
RH, dont la faisabilité reste à vérifier.

Le modèle est néanmoins conçu pour accueillir ces briques sans refonte : les
tables de charges, les affectations analytiques réelles et les rattachements
aux centres de coûts sont déjà en place.

---

## Les cinq principes qui structurent tout

Ils viennent du chapitre 2 du document de modélisation, et se retrouvent dans
chaque couche du code.

**1. Identifiants produits par le terminal.** Les clés primaires des données
collectées ne sont pas des séquences serveur mais des UUID générés par
l'application mobile au moment de la saisie. Un agent hors connexion crée une
donnée sans attendre le réseau, et la synchronisation devient idempotente :
renvoyer un lot ne crée aucun doublon.

**2. Modèle événementiel, pas de durées pré-calculées.** L'activité est
enregistrée sous forme d'événements horodatés. Les temps de marche, temps
d'arrêt, durées de foration et taux de charge sont dérivés par agrégation.
Le jour où une règle de calcul évolue, ou lorsqu'un relevé de compteur est
corrigé, tout se recalcule sans reprise de données.

**3. Réel et estimé jamais confondus.** Une quantité pesée et une quantité
estimée occupent deux colonnes distinctes, avec un indicateur de nature.
Elles ne sont jamais additionnées implicitement — une contrainte de base le
garantit, et un test vérifie qu'aucune vue d'export n'expose de total.

**4. Traçabilité portée par la donnée.** Chaque enregistrement porte huit
attributs : mode de collecte, auteur, horodatage terrain, horodatage
serveur, statut, validateur, date de validation, pièce jointe. Toute
modification postérieure à la validation est journalisée avec son motif.

**5. Les vues d'export sont le contrat d'interface.** Le livrable destiné au
gestionnaire n'est pas la base mais un ensemble de vues stables n'exposant
que des données validées.

---

## Composition du dépôt

| Répertoire | Contenu |
|---|---|
| `backend/` | API FastAPI, schéma PostgreSQL, exports — [README](backend/README.md) |
| `mobile/` | Application terrain React Native / Expo — [README](mobile/README.md) |
| `db/` | Schéma v0.1 fourni par le commanditaire, conservé pour référence |
| `docs/` | Documentation fonctionnelle et technique |

### Documentation

| Document | Objet |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Vue d'ensemble et choix techniques |
| [`docs/api-synchronisation.md`](docs/api-synchronisation.md) | Contrat de synchronisation hors ligne |
| [`docs/ecarts-schema-v0.1.md`](docs/ecarts-schema-v0.1.md) | **À valider** — écarts avec le schéma fourni |
| [`docs/exploitation.md`](docs/exploitation.md) | Déploiement, sauvegarde, exploitation |
| [`docs/CADERAC_modelisation_donnees_v0.1.pdf`](docs/) | Document source du commanditaire |

---

## Démarrage rapide

### Avec Docker

```bash
cp .env.example .env       # puis renseigner SECRET_KEY et les mots de passe
docker compose up
```

L'API démarre sur http://localhost:8000, documentation interactive sur
http://localhost:8000/documentation.

### Sans Docker

```bash
createdb caderac
cd backend
pip install -e ".[dev]"
export DATABASE_URL="postgresql+psycopg://caderac:motdepasse@localhost:5432/caderac"
alembic upgrade head
python -m app.db.seed --demonstration
uvicorn app.main:app --reload
```

`--demonstration` charge un parc réduit et une journée de collecte sur le
site KOS (comptes `agent.kos`, `superviseur.kos`, `controleur`, mot de passe
`caderac2026`). À ne pas charger en production.

### Application mobile

```bash
cd mobile
npm install
npm start
```

---

## Tests

```bash
cd backend && pytest -q          # 65 tests, sur PostgreSQL réel
cd mobile  && npm test           # tests de la construction des lots
cd mobile  && npm run verifier-types
```

Les tests backend s'exécutent sur un vrai PostgreSQL, jamais sur SQLite : le
schéma repose sur des types ENUM, des colonnes générées, des contraintes
CHECK et des triggers qu'aucun autre moteur ne reproduit fidèlement. Tester
ailleurs reviendrait à ne pas tester les garanties du modèle.

Ce que les tests verrouillent, au-delà du fonctionnement nominal :

- renvoyer un lot ne crée aucun doublon, et un enregistrement invalide ne
  fait pas échouer les autres ;
- un terminal ne peut ni usurper un auteur ni déclarer une donnée validée ;
- l'horodatage terrain n'est jamais écrasé par celui de la réception ;
- une donnée brute n'atteint jamais un export ;
- les colonnes du contrat d'export sont toutes présentes ;
- un compteur engin ne régresse pas sur une synchronisation tardive.

---

## Modèle de données

26 tables et 8 vues, en trois couches.

**Référentiels** — `site`, `centre_de_cout`, `engin`,
`equipement_concassage`, `personnel`, `produit` / `produit_parcours`,
`utilisateur`, `cause_arret`.

**Collecte**, par centre de coûts :

| Centre | Tables |
|---|---|
| CP01 Foration | `tir`, `trou_forage` |
| CP02 Minage | `prestation_minage`, `minage_engin_mobilise` |
| CP03 Marinage | `evenement_engin`, `rotation_dumper`, `campagne_pesage` |
| Concassage | `evenement_equipement`, `sortie_piece` |
| CP09 Stockage / Vente | `pesee_pont_bascule`, `vente` |
| Parc | `charge_engin`, `affectation_reelle_engin` |

**Traçabilité et synchronisation** — `audit_modification`,
`lot_synchronisation`, `lot_enregistrement`, `version_referentiel`, plus le
bloc de traçabilité porté par chaque table de collecte.

**Restitution** — les six vues du contrat (`v_export_foration`,
`v_export_activite_engin`, `v_export_rotations`, `v_export_pesees`,
`v_export_charges_engin`, `v_completude_collecte`) et deux vues de pilotage
opérationnel, préfixées `v_pilotage_`, hors contrat et libres d'évoluer.

---

## Workflow de validation

```
   brute ──────► controlee ──────► validee
     │               │   ▲            │
     │               │   └────────────┘  (correction motivée)
     └──► rejetee ◄──┘
```

- `controlee` : accessible au superviseur et au contrôleur.
- `validee` : **réservé au contrôleur**.
- Un rejet doit être motivé.
- Reprendre une donnée validée exige un motif : elle a pu être exportée.
- Une donnée corrigée après validation retourne au contrôle et doit être
  revalidée avant de repartir vers le gestionnaire.

Seules les données `validee` apparaissent dans les vues `v_export_*`.

---

## Ce qui reste à arbitrer

Huit points relèvent d'une décision du commanditaire ou d'une vérification
sur site (ch. 14). Ils sont repris avec leur état d'avancement dans
[`docs/ecarts-schema-v0.1.md`](docs/ecarts-schema-v0.1.md). Le plus
structurant : **faire valider colonne par colonne les vues d'export avec le
gestionnaire externe**, car c'est le seul point de contact entre son travail
et le système, et cette structure ne devra plus bouger ensuite.

Le facteur déterminant n'est cependant pas technique. La qualité des données
dépendra moins de l'architecture que de l'adhésion des équipes : formation,
référent identifié sur chaque site, et restitution régulière aux équipes de
ce que leurs données ont permis de comprendre.
