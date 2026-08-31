# Écarts entre le schéma v0.1 et le schéma implémenté

Le schéma v0.1 fourni (`db/schema_reference_v0.1.sql`) a servi de base. Les
écarts ci-dessous sont **à valider avec le commanditaire** : chacun est
rattaché au chapitre du document de modélisation qui le motive.

Aucun écart ne remet en cause les cinq principes du chapitre 2. Ils
comblent des manques entre le document et le SQL, ou rendent exécutable une
exigence que le SQL énonçait sans l'outiller.

---

## 1. Champs présents dans le document mais absents du SQL

| Table | Colonne ajoutée | Motif |
|---|---|---|
| `engin` | `compteur_actuel`, `compteur_maj_le` | Le ch. 4.1 liste « compteur_actuel — dernier relevé connu ». Sans lui, pré-remplir le compteur au scan suivant impose de balayer tout le journal d'événements. |
| `engin` | `amortissement_methode`, `amortissement_duree_ans`, `valeur_residuelle` | Le ch. 4.1 annonce `amortissement_*` en phase 2. Les colonnes sont créées vides dès la V1 pour que l'import Sage n'exige aucune migration. |
| `rotation_dumper` | `poste` | Le ch. 8.2 liste `poste_travail`. Le rendement d'une équipe de nuit n'est pas comparable à celui d'une équipe de jour. |
| `sortie_piece` | `numero_bon` | Le ch. 9.1 liste « numero_bon — référence du bon de sortie ». |
| `lot_synchronisation` | `nb_acceptes`, `nb_rejetes`, `application_version` | Le ch. 12 demande « nombre d'enregistrements acceptés **et rejetés**, détail des erreurs ». Le SQL v0.1 ne portait qu'un compteur global. |
| `trou_forage` | `piece_jointe_url` | Le bloc de traçabilité du ch. 5 comprend huit champs ; le SQL v0.1 en omettait un sur plusieurs tables. |

## 2. Table ajoutée

### `lot_enregistrement`

Le ch. 12 est explicite : « Sans lui, l'absence d'une rotation reste
indiscernable entre un oubli de l'opérateur, un terminal en panne et un
échec de transmission. » Un compteur global ne permet pas ce diagnostic —
il dit *combien* ont échoué, pas *lesquels*.

Cette table consigne, pour chaque enregistrement d'un lot : accepté ou
rejeté, doublon ou non, et le message d'erreur. C'est aussi elle qui permet
de rejouer à l'identique la réponse d'un lot renvoyé, sans rien réinsérer.

## 3. Types ENUM ajoutés

| Type | Valeurs | Motif |
|---|---|---|
| `poste_travail` | `jour`, `nuit` | Mentionné aux ch. 8.2 mais sans type dédié. |
| `role_utilisateur` | `agent_terrain`, `superviseur`, `controleur`, `admin` | `utilisateur.role` était un `TEXT` libre, alors que le ch. 5 fait dépendre le workflow du rôle. Une faute de frappe y devenait un rôle inconnu, donc un accès refusé sans explication. |
| `nature_charge` | `administrative`, `fonctionnement` | Le ch. 11.1 n'admet que ces deux natures. |
| `resultat_lot` | `ok`, `partiel`, `rejete` | Le SQL v0.1 documentait ces trois valeurs en commentaire d'un `TEXT`. |

## 4. Changement de type

### `audit_modification.enregistrement` : `UUID` → `TEXT`

Les données collectées sont identifiées par UUID, mais les référentiels le
sont par code (`personnel.matricule`, `centre_de_cout.code`,
`cause_arret.code`). Avec une colonne `UUID`, une modification de
référentiel n'était pas auditable — or c'est précisément une correction de
référentiel qui peut déplacer un coût d'un centre à un autre.

Une colonne textuelle couvre les deux cas avec une seule table.

## 5. Colonnes générées ajoutées

| Table | Colonne | Expression |
|---|---|---|
| `trou_forage` | `est_cloture` | `heure_fin IS NOT NULL` |
| `evenement_equipement` | `duree` | `heure_fin - heure_debut` |

Le ch. 6 demande « un indicateur de trou non clôturé lorsque le second scan
est absent ». En colonne générée plutôt qu'en calcul applicatif, il est
indexable : l'écran de contrôle quotidien reste rapide quand la table aura
grossi.

## 6. Automatismes ajoutés

### Trigger de versionnement des référentiels

Le ch. 12 prévoit `version_referentiel` « permettant au terminal de savoir
s'il doit rafraîchir sa copie locale », mais rien n'incrémentait ce numéro.
Confié au code applicatif, il aurait été oublié à la première correction
faite directement en base. Un trigger par référentiel le garantit.

### Trigger de mise à jour du compteur engin

Alimente `engin.compteur_actuel` depuis les événements. **Le compteur ne
peut que progresser** : un événement arrivé en retard après une
synchronisation différée ne doit pas faire régresser le relevé courant.

## 7. Contraintes ajoutées

Contraintes de domaine sur les grandeurs physiques : carburant, tonnages,
montants et quantités positifs, taux de charge entre 0 et 100, durée
d'affectation entre 0 et 24 heures, coordonnées GPS dans leurs bornes,
cohérence des périodes de charge et des poids de pesage.

Ces contraintes rattrapent des erreurs de saisie que rien n'arrêtait :
un tonnage négatif se serait propagé jusqu'au coût à la tonne.

## 8. Vues

Les six vues du ch. 13 sont conservées **à l'identique dans leur rôle**,
avec des colonnes ajoutées (jamais retirées) :

- `v_export_foration` : ajout du nom de l'opérateur, des coordonnées GPS, du
  poste et des horodatages de traçabilité.
- `v_export_activite_engin` : ajout des libellés de cause et de centre de
  coût — le gestionnaire ne devrait pas avoir à joindre une nomenclature à
  la main.
- `v_export_rotations` : ajout du délai entre passages et du rang de la
  rotation dans la journée, tous deux annoncés au ch. 8.2 comme grandeurs
  dérivées attendues. **Aucune colonne n'additionne pesé et estimé**, et
  c'est vérifié par un test automatisé.
- `v_export_charges_engin` : ajout du nombre de mois couverts, pour que
  l'étalement d'une charge annuelle n'exige pas de recalcul.
- `v_completude_collecte` : élargie aux rotations, aux événements et aux
  pesées. Le ch. 13 demande « qui déclare, qui ne déclare pas » ; la version
  v0.1 ne couvrait que la foration. La colonne `engins_sans_declaration`
  répond directement au « qui ne déclare pas ».

Deux vues **hors contrat** ont été ajoutées, préfixées `v_pilotage_` pour
qu'aucune ambiguïté ne subsiste : elles servent les écrans de
l'application, exposent volontairement les données non validées, et peuvent
évoluer librement.

- `v_pilotage_trous_non_clotures` : l'écran demandé au ch. 6.
- `v_pilotage_file_validation` : la file d'attente du contrôle.

## 9. Points laissés en l'état, volontairement

- **`rotation_dumper.quantite_estimee_t`** : le ch. 8.2 la nomme
  `poids_estime_t`. Le nom du SQL v0.1 est conservé — il est le plus récent
  des deux, et « quantité » est plus juste puisque l'unité peut être le m³.
- **`campagne_pesage.date_pesee`** : le ch. 8.3 la nomme `date_campagne`.
  Nom du SQL conservé.
- **Centre de coût CP08** : absent de la nomenclature initiale (CP01 à CP07,
  puis CP09). Le saut est reproduit tel quel — **à confirmer** : s'agit-il
  d'un centre supprimé ou d'un oubli ?

---

## Points restant à arbitrer (ch. 14)

Ces points ne relèvent pas du schéma mais conditionnent le déploiement.
Aucun n'est bloquant pour le développement engagé.

| Point | Ce qui est prêt | Ce qui reste à décider |
|---|---|---|
| Structure des exports | Les six vues sont figées et verrouillées par des tests | Validation colonne par colonne avec le gestionnaire |
| Granularité du centre de coût réel | `centre_cout_reel` collecté événement par événement | Confirmer que ce niveau de détail est exploité |
| Écrans de concassage | `source_collecte` distingue `interface_systeme`, `import_fichier` et `saisie_directe` | Vérification site par site de l'exportabilité |
| Pont-bascule | Même mécanisme de distinction | Identifier marque, modèle et logiciel par site |
| Nomenclature des numéros de parc | Format libre, unicité garantie | Valider la convention avant l'inventaire |
| Terminaux | L'application cible Android via Expo | Fournisseur, parc, modalités de remplacement |
| Périmètre du pilote | L'app mobile expose foration et rotations en premier | Choix du site pilote |
| Cadre contractuel | — | Propriété du code et des données, circuit de validation |
