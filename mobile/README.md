# CADERAC Terrain — application mobile

Application de collecte **conçue pour fonctionner sans réseau**. Voir le
[README racine](../README.md) et le [contrat de
synchronisation](../docs/api-synchronisation.md).

## Démarrage

```bash
npm install
npm start          # puis « a » pour Android, « i » pour iOS
```

L'URL de l'API est lue dans `app.json` (`expo.extra.urlApi`). La valeur par
défaut `http://10.0.2.2:8000/api/v1` vise la machine hôte depuis
l'émulateur Android. Sur un terminal physique, mettre l'adresse IP du poste
de développement.

```bash
npm run verifier-types   # tsc --noEmit
npm test                 # jest
```

## Principe de fonctionnement

**Aucun écran n'appelle directement l'API.** Toute saisie entre dans la
file d'envoi locale (SQLite), et n'en sort qu'une fois acquittée par le
serveur. Une donnée saisie ne peut donc pas être perdue parce que le réseau
était absent au moment du geste.

```
Écran de saisie ──► file_envoi (SQLite) ──► service de synchronisation ──► API
                          ▲                            │
                          └──── acquittement ──────────┘
```

Le réseau n'est indispensable qu'à deux moments : la connexion initiale, et
la synchronisation. Entre les deux, l'application travaille sur sa copie
locale du référentiel.

## Choix d'interface, et pourquoi

| Choix | Motif |
|---|---|
| **Grille de boutons pour les rotations**, pas de reconnaissance vocale | En zone de concassage, le bruit ambiant et les matricules alphanumériques prononcés avec un accent local rendent la transcription peu fiable — sans compter la dépendance au réseau. Un appui, la rotation est enregistrée en moins d'une seconde (ch. 8.2). |
| **Repli manuel toujours visible sur l'écran de scan** | Les étiquettes QR se dégradent vite en carrière. Sans repli, une étiquette arrachée signifie zéro déclaration sur l'engin pendant des jours (ch. 4.1). |
| **Cibles tactiles de 64 points** | L'application s'utilise avec des gants, en plein soleil, sur un engin qui vibre. |
| **Vibration à chaque rotation enregistrée** | En zone bruyante, c'est le seul accusé de réception perçu sans regarder l'écran. |
| **Compteur d'attente en permanence sur la barre d'onglets** | La question d'un agent en fin de poste est toujours la même : « est-ce que ce que j'ai saisi est bien parti ? ». |
| **Synchronisation déclenchée par l'agent** | Il garde la maîtrise de ce que son terminal consomme en batterie et en forfait. |
| **GPS non bloquant** | Un GPS qui n'accroche pas sous un front de taille ne doit pas empêcher la déclaration. |

## Organisation

| Chemin | Rôle |
|---|---|
| `src/services/basedonnees.ts` | Base SQLite locale et file d'envoi |
| `src/services/lot.ts` | Construction du corps d'un lot — fonction pure, testée |
| `src/services/synchronisation.ts` | Vidage de la file, gestion des renvois |
| `src/services/api.ts` | Client HTTP, jetons, renouvellement silencieux |
| `src/contextes/Session.tsx` | Compte, référentiel local, état de la file |
| `src/composants/ScannerQR.tsx` | Scan QR et repli par numéro de parc |
| `src/ecrans/` | Rotations, Foration, Événements engins, File d'envoi |

## Périmètre

Le pilote porte sur **un site unique et deux modules** — foration et
rotations de dumpers (ch. 14). Les événements engins et l'écran de
synchronisation complètent le socle sans élargir le périmètre.

Non couverts par l'application mobile en V1, car relevant du back-office :
minage, concassage, pont-bascule, ventes, charges. Le contrat de
synchronisation les accepte déjà — seuls les écrans manquent.
