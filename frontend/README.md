# CADERAC — Back-office de contrôle

Interface de travail du contrôleur et du superviseur. Voir le
[README racine](../README.md) et le [guide de test](../docs/tests.md).

## Démarrage

```bash
npm install
npm run dev          # http://localhost:5173, API relayée depuis :8000
```

L'API est appelée en **relatif** (`/api/v1`) : en développement le proxy Vite
achemine, en production le serveur statique fait de même. Aucune URL d'API
n'est compilée dans le bundle, si bien que le même build sert partout.

### Docker et `node_modules` ne partagent rien

Sous `docker compose`, les dépendances du conteneur vivent dans un volume
dédié, jamais dans le `frontend/node_modules` du poste. Ce n'est pas une
optimisation : Vite dépend d'esbuild et de rollup, qui embarquent des
**binaires natifs propres à la plateforme**. Si le conteneur installait ses
dépendances sur le disque de l'hôte, `npm run dev` cesserait de fonctionner
en dehors de Docker — et réciproquement.

Les deux modes coexistent donc sans se gêner :

```bash
docker compose up -d          # front sur :5173, dépendances dans le volume
npm install && npm run dev    # front sur :5173, dépendances du poste
```

En cas de doute après un changement de mode :
`docker compose down -v` réinitialise le volume.

```bash
npm run verifier-types   # tsc --noEmit
npm run build            # dist/ statique, ~82 Ko compressés
npm run generer-client   # régénère les types depuis backend/openapi.json
```

## Le client API est généré, pas écrit

`src/api/schema.d.ts` est produit depuis le schéma OpenAPI du serveur. Ne pas
le modifier à la main.

L'intérêt n'est pas le confort de saisie : **les vues d'export sont un contrat
figé** avec le gestionnaire externe. Si une colonne est renommée côté serveur,
la compilation du front doit casser — pas la découverte trois semaines plus
tard dans un fichier Excel déjà livré.

Après toute évolution de l'API :

```bash
cd ../backend && python -c "import json; from app.main import application; \
  json.dump(application.openapi(), open('openapi.json','w'), ensure_ascii=False, indent=1)"
cd ../frontend && npm run generer-client && npm run verifier-types
```

Le test `backend/tests/test_contrat_openapi.py` échoue si le schéma versionné
dérive de l'API réelle.

## Périmètre

La boucle quotidienne du contrôleur, pas tout l'administratif :

| Écran | Ce qu'il résout |
|---|---|
| **File de validation** | Le cœur du métier : contrôler et valider en lot, avec motif |
| **Trous non clôturés** | L'anomalie la plus probable du module foration (ch. 6) |
| **Complétude** | Qui déclare, qui ne déclare pas — le pilotage du déploiement (ch. 13) |
| **Exports** | Le livrable au gestionnaire externe, aperçu puis téléchargement |
| **Journal d'audit** | De quoi défendre un chiffre contesté (ch. 5.1) |

Les référentiels et la gestion des comptes passent encore par la documentation
interactive de l'API : un administrateur s'en accommode quelques semaines, un
contrôleur non.

## Choix d'interface, et pourquoi

| Choix | Motif |
|---|---|
| **Barre d'action collante** | Le contrôleur sélectionne en haut de liste et agit sans remonter |
| **Action en lot sur un seul type** | L'endpoint de validation groupée est typé par table ; mêler les types produirait des rejets silencieux |
| **Rejet bloqué sans motif** | La règle serveur est répétée dans l'interface, pour que le refus soit compris avant l'envoi |
| **Statut en pastille colorée** | C'est l'information la plus balayée : elle doit se lire sans être relue |
| **Jour muet marqué d'un liseré, pas d'un aplat** | Sur trente jours, un fond coloré sur la majorité des lignes ne signale plus rien |
| **Un site sans parc n'est pas en défaut** | Signaler en rouge un site dont l'inventaire n'est pas fait viderait l'alerte de son sens |
| **Téléchargement via `fetch`** | Le jeton d'authentification voyage dans un en-tête, jamais dans l'URL |

## Organisation

| Chemin | Rôle |
|---|---|
| `src/api/client.ts` | Client typé, jetons, renouvellement silencieux |
| `src/api/schema.d.ts` | **Généré** — types issus d'OpenAPI |
| `src/contextes/Session.tsx` | Compte courant et habilitations |
| `src/composants/` | Boutons, pastilles, cartes, tableaux |
| `src/ecrans/` | Un fichier par écran |
| `src/utils/theme.css` | Palette reprise de l'application mobile |
