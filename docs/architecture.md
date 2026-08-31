# Architecture

## Vue d'ensemble

```
   Terminaux terrain                  Serveur                  Gestionnaire externe
   ─────────────────                  ───────                  ────────────────────

  ┌──────────────────┐                                        ┌────────────────────┐
  │ Expo / React      │  lots de données                      │ Fichiers Excel/CSV │
  │ Native            │ ───────────────►┌─────────────────┐   │ (données validées) │
  │                   │                 │   API FastAPI   │──►│                    │
  │ SQLite locale     │◄─────────────── │                 │   └────────────────────┘
  │ file d'envoi      │  référentiels   └────────┬────────┘
  └──────────────────┘   + accusés               │
                                                 ▼
                                        ┌─────────────────┐
   ┌──────────────────┐                 │  PostgreSQL 16  │
   │ Back-office web   │◄───────────────►│  26 tables      │
   │ (contrôle,        │                 │  8 vues         │
   │  validation)      │                 │  triggers       │
   └──────────────────┘                 └─────────────────┘
```

Le back-office web n'est pas encore développé : l'API expose déjà tous les
points d'entrée nécessaires (file de validation, corrections, audit,
exports), et la documentation interactive permet de les exercer.

## Choix techniques, et leurs raisons

### PostgreSQL 16, et les garanties placées dans la base

Le document impose PostgreSQL 14 ou supérieur. Au-delà de la conformité, un
choix a été fait : **placer dans la base les garanties qui ne doivent jamais
céder**, plutôt que de les confier au seul code applicatif.

| Garantie | Mécanisme | Pourquoi pas dans le code |
|---|---|---|
| Réel et estimé jamais confondus | Contrainte `CHECK` | Un import direct, un script de reprise ou un correctif SQL contournent le code, pas la base. |
| Durées cohérentes avec leurs bornes | Colonnes générées | Une durée stockée devient fausse dès qu'un relevé est corrigé. |
| Versions de référentiels à jour | Triggers | Une mise à jour faite directement en base serait invisible des terminaux. |
| Compteur engin qui ne régresse jamais | Trigger conditionnel | Les événements arrivent dans le désordre après une synchronisation différée. |

Le revers assumé : les tests exigent un vrai PostgreSQL. C'est le prix de
garanties qui tiennent aussi hors du chemin applicatif.

### Le DDL vit dans des fichiers `.sql`

`backend/alembic/sql/` contient le schéma sous forme de SQL lisible, exécuté
par la migration Alembic. Deux raisons :

1. Le commanditaire relit du SQL — il en a d'ailleurs fourni.
2. Les colonnes générées, les triggers et les vues s'expriment mal en
   opérations Alembic.

Les modèles SQLAlchemy reflètent ce schéma sans le produire. Un test
compare les deux et échoue à la moindre divergence.

### FastAPI

- La documentation OpenAPI est générée depuis les schémas : le contrat
  consommé par l'application mobile ne peut pas dériver silencieusement.
- Les schémas Pydantic refusent tout champ non prévu (`extra="forbid"`).
  Un terminal qui envoie un champ inconnu doit être corrigé, pas ignoré.
- Les validations métier sont exprimées deux fois — au schéma et en base.
  La première donne à l'agent un message clair, la seconde garantit
  l'invariant.

### bcrypt et PyJWT en direct

`passlib` et `python-jose` ajoutent des dépendances lourdes pour un besoin
qui tient en quelques lignes, et `passlib` 1.7.4 est incompatible avec
`bcrypt` 4.1 et supérieur. Les deux bibliothèques sont utilisées
directement.

### Expo plutôt qu'une PWA

Une PWA se déploie plus simplement, mais dépend du navigateur pour la
caméra, le GPS et le stockage — trois éléments critiques en carrière, et
trois sources d'imprévisibilité selon le terminal fourni. Expo donne un
accès natif à SQLite, à la caméra et à la position, et un chemin de
distribution maîtrisé.

## Flux d'une donnée, de la saisie à l'export

```
1. SAISIE          L'agent appuie sur un bouton. UUID généré localement.
                   Écriture immédiate dans file_envoi (SQLite). Aucun réseau requis.

2. SYNCHRONISATION Au retour en zone couverte, la file est expédiée par lots.
                   Chaque lot porte une clé d'idempotence.
                   Le serveur impose auteur, recu_le et statut = brute.
                   Réponse détaillée : accepté / rejeté / doublon, par enregistrement.

3. CONTRÔLE        Le superviseur parcourt la file de validation.
                   brute → controlee.

4. VALIDATION      Le contrôleur valide. controlee → validee.
                   Toute correction ultérieure est journalisée avec son motif
                   et ramène la donnée au contrôle.

5. EXPORT          Les vues v_export_* n'exposent que le statut validee.
                   Excel ou CSV, filtrés par période, site, engin, centre de coût.
```

Le point 2 est celui qui conditionne tous les autres : c'est pourquoi la
couche de synchronisation a été développée et testée avant tout module
métier, comme le prescrit le ch. 12.

## Cloisonnement des accès

| Rôle | Portée | Peut |
|---|---|---|
| `agent_terrain` | Son site | Déclarer |
| `superviseur` | Son site | Déclarer, contrôler, saisir des charges |
| `controleur` | **Tous les sites** | Contrôler, valider, corriger, exporter |
| `admin` | Tous les sites | Tout, plus la gestion des comptes et référentiels |

Le contrôleur voit les quatre sites parce que la consolidation multi-sites
est précisément son métier.

## Volumétrie attendue

`rotation_dumper` est la table la plus volumineuse. Avec dix dumpers par
site, une trentaine de rotations par jour et par engin, quatre sites :
environ **440 000 lignes par an**. Négligeable pour PostgreSQL, mais les
index sur `(dumper_id, horodatage)` et `(site_id, horodatage)` sont posés
dès maintenant, car ce sont eux que les exports mensuels solliciteront.

`evenement_engin` suit le même profil. Les autres tables restent sous les
quelques milliers de lignes annuelles.

## Ce qui n'est pas fait, et pourquoi

| Non fait | Raison |
|---|---|
| Moteur de calcul des coûts | Hors périmètre V1 : les règles d'imputation ne sont pas arrêtées. |
| Interfaces Sage et RH | Hors périmètre V1 : faisabilité à vérifier. Les colonnes d'accueil existent. |
| OCR des factures de minage | Quelques dizaines de documents par an. Fiabiliser un OCR pour ce volume est un mauvais investissement ; la saisie manuelle avec photo prend cinq minutes et ne présente aucun risque d'extraction erronée (ch. 7). |
| Reconnaissance vocale | Bruit ambiant en zone de concassage, matricules alphanumériques, dépendance au réseau. La grille de boutons est plus rapide et fonctionne hors ligne (ch. 8.2). |
| Back-office web | L'API est complète ; l'interface reste à construire. |
| Écrans mobiles minage / concassage / pesée | Le pilote porte sur deux modules (ch. 14). Le contrat de synchronisation les accepte déjà. |
