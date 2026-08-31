# Contrat de synchronisation hors ligne

Ce document décrit le contrat entre les terminaux et le serveur. C'est le
contrat le plus sensible du système : il est consommé par l'application
mobile et **doit rester compatible ascendant**. Toute évolution se fait par
ajout de champs facultatifs, jamais par renommage ni suppression.

> « La couche de synchronisation doit être développée et testée dès le
> premier lot, avant tout module métier. Elle n'est pas ajoutable après
> coup. » — ch. 12

---

## Les trois garanties

### 1. Idempotence

Les identifiants ne sont pas des séquences serveur mais des **UUID produits
par le terminal** au moment de la saisie. Deux conséquences :

- Un agent hors connexion crée un trou ou une rotation sans attendre le
  réseau.
- Renvoyer un lot déjà transmis **ne crée aucun doublon** : le serveur
  reconnaît la clé d'idempotence et rejoue la réponse d'origine, avec
  `deja_traite: true`.

C'est ce qui autorise le terminal à réémettre sans risque lorsqu'il n'a pas
reçu d'accusé — le cas le plus fréquent d'une coupure en carrière.

### 2. Acceptation partielle

Un enregistrement invalide **ne fait pas échouer le lot**. Chaque insertion
est isolée dans un point de reprise PostgreSQL. Le terminal reçoit le sort
de chacun de ses enregistrements et ne conserve dans sa file que ceux qui
ont réellement été rejetés.

Sans cela, une seule saisie fautive bloquerait une journée entière de
collecte.

### 3. Traçabilité imposée par le serveur

Le terminal fournit `source_collecte`, `saisi_le` et éventuellement une
pièce jointe. Le serveur impose le reste :

| Champ | Origine |
|---|---|
| `auteur_id` | Le jeton d'authentification |
| `recu_le` | L'horloge du serveur |
| `statut` | Toujours `brute` à l'arrivée |
| `valide_par`, `valide_le` | Le workflow de contrôle uniquement |

Un terminal ne peut donc **ni usurper un auteur, ni déclarer une donnée
déjà validée**. Les schémas d'entrée refusent tout champ non prévu : une
tentative échoue en `422`, elle n'est pas silencieusement ignorée.

---

## Cycle de vie d'une journée de collecte

```
Retour en zone couverte          Journée en carrière           Retour en zone couverte
        │                               │                               │
        ▼                               ▼                               ▼
  POST /auth/connexion-json      Saisies → file locale          POST /synchronisation/lots
  GET  /synchronisation/            (SQLite, aucun réseau)      → accusé détaillé
       parametrage                                              → purge de la file
        │                                                              │
        └── référentiel du site                                        └── GET .../versions
            en base locale                                                 si version changée :
                                                                           recharger parametrage
```

---

## Points d'entrée

### `GET /api/v1/synchronisation/parametrage`

Renvoie **en un seul appel** tout ce dont un terminal a besoin pour
travailler hors ligne : engins, équipements, personnel, produits, causes
d'arrêt, centres de coûts et tirs récents.

Le résultat est **filtré sur le site de l'agent**. Ce n'est pas une
optimisation : une grille de boutons doit porter la dizaine de dumpers du
site, pas les cent du parc entier (ch. 8.2).

### `GET /api/v1/synchronisation/versions`

Numéros de version des référentiels. Quelques octets qui remplacent le
téléchargement complet à chaque démarrage. Les versions sont incrémentées
par trigger : aucune modification, même faite directement en base, ne peut
passer inaperçue du terminal.

### `POST /api/v1/synchronisation/lots`

Corps de la requête :

```json
{
  "lot_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "terminal_id": "TAB-KOS-01",
  "application_version": "1.0.0",
  "envoye_le": "2026-08-31T17:40:00Z",

  "rotations_dumper": [
    {
      "id": "9c1e...",
      "dumper_id": "...",
      "site_id": 1,
      "horodatage": "2026-08-31T08:15:00Z",
      "saisi_le": "2026-08-31T08:15:00Z",
      "point_deversement": "Primaire",
      "quantite_estimee_t": 28.5,
      "nature_quantite": "estimation",
      "source_collecte": "saisie_directe"
    }
  ],
  "trous_forage": [],
  "evenements_engin": []
}
```

Toutes les listes sont facultatives : un terminal dédié aux rotations
n'envoie que des rotations.

| Champ du lot | Table alimentée |
|---|---|
| `trous_forage` | `trou_forage` |
| `evenements_engin` | `evenement_engin` |
| `rotations_dumper` | `rotation_dumper` |
| `evenements_equipement` | `evenement_equipement` |
| `pesees` | `pesee_pont_bascule` |
| `prestations_minage` | `prestation_minage` |
| `sorties_piece` | `sortie_piece` |
| `charges_engin` | `charge_engin` |
| `affectations_reelles` | `affectation_reelle_engin` |

Réponse :

```json
{
  "lot_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "recu_le": "2026-08-31T17:40:12Z",
  "nb_enregistrements": 42,
  "nb_acceptes": 41,
  "nb_rejetes": 1,
  "nb_doublons": 3,
  "resultat": "partiel",
  "deja_traite": false,
  "details": [
    { "table_cible": "rotation_dumper", "id": "9c1e...",
      "accepte": true,  "doublon": false, "erreur": null },
    { "table_cible": "rotation_dumper", "id": "7b2f...",
      "accepte": false, "doublon": false,
      "erreur": "insert or update on table ... violates foreign key constraint" }
  ]
}
```

**Un doublon est « accepté ».** Il signifie que la donnée est bien arrivée,
lors d'un envoi précédent : le terminal doit purger sa file, pas réessayer.

`resultat` vaut `ok` si tout passe, `rejete` si rien ne passe, `partiel`
sinon.

### `GET /api/v1/synchronisation/lots/{lot_id}`

Outil de diagnostic. Répond à la question : *cette rotation manquante
est-elle un oubli de l'agent, une panne de terminal, ou un échec de
transmission ?*

- `404` : le lot n'est jamais arrivé — problème de transmission.
- `200` avec le détail : le lot est arrivé, et l'on voit ce qui a été
  accepté.

---

## Comportement attendu du terminal

1. **Toute saisie entre d'abord dans la file locale.** Aucun écran n'appelle
   directement l'API : une donnée saisie ne peut pas être perdue parce que
   le réseau était absent au moment du geste.
2. **Le lot est enregistré localement avant l'envoi.** Si la connexion
   tombe, le même `lot_id` est réutilisé au réessai.
3. **Un enregistrement absent de l'accusé reste en attente.** Mieux vaut un
   doublon détecté par le serveur qu'une donnée perdue.
4. **Les envois acquittés sont conservés une semaine.** Un agent doit
   pouvoir vérifier que sa saisie de la veille est bien partie.
5. **La synchronisation n'est pas automatique.** L'agent garde la maîtrise
   du moment où son terminal consomme batterie et forfait.

## Limites

| Limite | Valeur | Paramètre |
|---|---|---|
| Enregistrements par lot | 1000 | `TAILLE_MAX_LOT_SYNCHRONISATION` |
| Taille de lot côté terminal | 100 | `TAILLE_LOT` (mobile) |
| Délai d'une requête | 20 s | `DELAI_MS` (mobile) |
| Durée du jeton d'accès | 12 h | `ACCESS_TOKEN_EXPIRE_MINUTES` |
| Durée du jeton de rafraîchissement | 30 j | `REFRESH_TOKEN_EXPIRE_DAYS` |

Un lot dépassant la limite serveur reçoit un `413` accompagné d'une
consigne de découpage.
