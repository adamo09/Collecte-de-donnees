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

Onze écrans, en trois sections qui suivent les métiers plutôt que les tables.

### Contrôle — le quotidien du contrôleur

| Écran | Ce qu'il résout |
|---|---|
| **File de validation** | Le cœur du métier : contrôler et valider en lot, avec motif |
| **Consulter les données** | Retrouver un enregistrement précis et le corriger, motif à l'appui |
| **Trous non clôturés** | L'anomalie la plus probable du module foration (ch. 6) |
| **Complétude** | Qui déclare, qui ne déclare pas — le pilotage du déploiement (ch. 13) |
| **Exports** | Le livrable au gestionnaire externe, aperçu puis téléchargement |
| **Journal d'audit** | De quoi défendre un chiffre contesté (ch. 5.1) |

### Saisie bureau — ce qui ne vient pas du terrain

| Écran | Ce qu'il résout |
|---|---|
| **Charges engin** | Assurances, carburant, maintenance, avec la période couverte (ch. 11.1) |
| **Prestations de minage** | Factures du prestataire externe, rattachées au tir (ch. 7) |
| **Ventes** | Facturation, avec rattachement à la pesée et alerte sur l'écart (ch. 10.2) |
| **Sorties magasin** | Pièces vers un engin **ou** un équipement, jamais les deux (ch. 9.1) |

### Référentiels — réservé à l'administrateur

Parc d'engins, équipements de concassage, personnel, produits et leur parcours
de concassage, tirs, motifs d'arrêt, comptes. L'inventaire initial passe par un
**import CSV** : saisir cent engins un par un n'aurait pas de sens.

Couverture de l'API : **45 des 69 points d'entrée**. Le reste est consommé par
l'application mobile — synchronisation, scans de foration, déclarations
d'événements — et n'a rien à faire dans un back-office.

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
| **Import CSV ligne par ligne** | Un fichier de cent lignes dont trois sont fautives doit en importer quatre-vingt-dix-sept, pas échouer en bloc |
| **`<dialog>` natif pour les modales** | Focus, touche Échap et fond inerte gérés par le navigateur, sans bibliothèque |
| **Un chargeur typé par module de consultation** | Un chemin dynamique passé au client perdrait le typage engendré depuis OpenAPI, qui est précisément ce qui doit casser si l'API change |
| **Motif obligatoire avant correction** | La règle serveur est répétée dans l'interface : le bouton reste inerte tant que le motif manque |

## Organisation

| Chemin | Rôle |
|---|---|
| `src/api/client.ts` | Client typé, jetons, renouvellement silencieux |
| `src/api/schema.d.ts` | **Généré** — types issus d'OpenAPI |
| `src/contextes/Session.tsx` | Compte courant et habilitations |
| `src/composants/` | Boutons, pastilles, cartes, tableaux |
| `src/ecrans/` | Un fichier par écran |
| `src/utils/theme.css` | Palette reprise de l'application mobile |
