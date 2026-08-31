/**
 * Journal d'événements engins (ch. 8.1).
 *
 * Aucune durée n'est saisie : l'agent déclare des instants, et les temps de
 * marche comme les temps d'arrêt sont dérivés par agrégation côté serveur.
 * C'est ce qui permet de corriger un relevé sans reprendre les calculs.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Bandeau, Bouton, Carte, Champ, EtatSynchro } from '@/composants/Communs';
import ScannerQR from '@/composants/ScannerQR';
import { useSession } from '@/contextes/Session';
import { empiler } from '@/services/basedonnees';
import { nouvelIdentifiant } from '@/services/synchronisation';
import {
  EVENEMENTS_AVEC_CAUSE,
  type Engin,
  type TypeEvenementEngin,
} from '@/types/modele';
import { CIBLE_TACTILE, couleurs, espacement, rayons } from '@/utils/theme';

const TYPES: { valeur: TypeEvenementEngin; libelle: string }[] = [
  { valeur: 'debut', libelle: 'Début de poste' },
  { valeur: 'arret', libelle: 'Arrêt' },
  { valeur: 'reprise', libelle: 'Reprise' },
  { valeur: 'panne', libelle: 'Panne' },
  { valeur: 'maintenance', libelle: 'Maintenance' },
  { valeur: 'ravitaillement', libelle: 'Ravitaillement' },
  { valeur: 'fin', libelle: 'Fin de poste' },
];

export default function EcranEvenementsEngin() {
  const { parametrage, reseau, nbEnAttente, nbRejetes, rafraichirCompteurs } = useSession();

  const [engin, setEngin] = useState<Engin | null>(null);
  const [scanner, setScanner] = useState(false);
  const [type, setType] = useState<TypeEvenementEngin | null>(null);
  const [cause, setCause] = useState<string | null>(null);
  const [compteur, setCompteur] = useState('');
  const [carburant, setCarburant] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const causeObligatoire = useMemo(
    () => type !== null && EVENEMENTS_AVEC_CAUSE.includes(type),
    [type],
  );

  const enregistrer = useCallback(async () => {
    if (!parametrage || !engin || !type) return;

    const maintenant = new Date().toISOString();
    await empiler(nouvelIdentifiant(), 'evenement_engin', {
      engin_id: engin.id,
      site_id: parametrage.site_id,
      centre_cout_reel: engin.centre_cout_reference,
      type_evenement: type,
      horodatage: maintenant,
      saisi_le: maintenant,
      compteur: compteur ? Number(compteur.replace(',', '.')) : null,
      cause_code: cause,
      carburant_litres: carburant ? Number(carburant.replace(',', '.')) : null,
      poste: 'jour',
      commentaire: commentaire.trim() || null,
      source_collecte: 'qr_code',
    });

    setMessage(`${type} enregistré sur ${engin.numero_parc}.`);
    setType(null);
    setCause(null);
    setCarburant('');
    setCommentaire('');
    await rafraichirCompteurs();
  }, [parametrage, engin, type, compteur, cause, carburant, commentaire, rafraichirCompteurs]);

  if (scanner) {
    return (
      <ScannerQR
        titre="Scanner l'étiquette de l'engin"
        onAnnuler={() => setScanner(false)}
        onEngin={(choisi) => {
          setEngin(choisi);
          setCompteur(choisi.compteur_actuel ? String(choisi.compteur_actuel) : '');
          setScanner(false);
        }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <EtatSynchro reseau={reseau} enAttente={nbEnAttente} rejetes={nbRejetes} />
      <ScrollView contentContainerStyle={styles.contenu}>
        {message ? <Bandeau ton="succes" texte={message} /> : null}

        {engin ? (
          <Carte>
            <Text style={styles.enginParc}>{engin.numero_parc}</Text>
            <Text style={styles.enginDetail}>
              {engin.famille}
              {engin.matricule ? ` · ${engin.matricule}` : ''}
            </Text>
            <Bouton titre="Changer d'engin" variante="secondaire" onPress={() => setScanner(true)} />
          </Carte>
        ) : (
          <Bouton titre="Scanner un engin" onPress={() => setScanner(true)} />
        )}

        {engin ? (
          <>
            <Text style={styles.section}>Type d'événement</Text>
            <View style={styles.grille}>
              {TYPES.map((entree) => (
                <Pressable
                  key={entree.valeur}
                  onPress={() => {
                    setType(entree.valeur);
                    setCause(null);
                  }}
                  style={[styles.tuile, type === entree.valeur && styles.tuileActive]}
                >
                  <Text
                    style={[styles.tuileTexte, type === entree.valeur && styles.tuileTexteActif]}
                  >
                    {entree.libelle}
                  </Text>
                </Pressable>
              ))}
            </View>

            {causeObligatoire ? (
              <>
                <Text style={styles.section}>Motif — obligatoire</Text>
                <Text style={styles.explication}>
                  Un motif codifié permet de compter les arrêts par cause. Un
                  texte libre ne le permet pas.
                </Text>
                <View style={styles.grille}>
                  {(parametrage?.causes_arret ?? []).map((c) => (
                    <Pressable
                      key={c.code}
                      onPress={() => setCause(c.code)}
                      style={[styles.tuileMotif, cause === c.code && styles.tuileActive]}
                    >
                      <Text
                        style={[styles.tuileTexte, cause === c.code && styles.tuileTexteActif]}
                      >
                        {c.libelle}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Carte>
              <Champ
                libelle={`Compteur (${engin.unite_compteur})`}
                value={compteur}
                onChangeText={setCompteur}
                keyboardType="decimal-pad"
              />
              {type === 'ravitaillement' ? (
                <Champ
                  libelle="Carburant (litres)"
                  value={carburant}
                  onChangeText={setCarburant}
                  keyboardType="decimal-pad"
                />
              ) : null}
              <Champ
                libelle="Commentaire"
                value={commentaire}
                onChangeText={setCommentaire}
                multiline
              />
            </Carte>

            <Bouton
              titre="Enregistrer l'événement"
              onPress={() => void enregistrer()}
              desactive={!type || (causeObligatoire && !cause)}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espacement.m, paddingBottom: espacement.xl },
  enginParc: { fontSize: 28, fontWeight: '800', color: couleurs.primaire },
  enginDetail: { fontSize: 15, color: couleurs.texteFaible, marginBottom: espacement.s },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.texte,
    marginTop: espacement.m,
    marginBottom: espacement.s,
  },
  explication: {
    fontSize: 13,
    color: couleurs.texteFaible,
    marginBottom: espacement.s,
    lineHeight: 19,
  },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espacement.s },
  tuile: {
    minWidth: '47%',
    minHeight: CIBLE_TACTILE,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.m,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    padding: espacement.s,
  },
  tuileMotif: {
    minWidth: '47%',
    minHeight: 56,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.s,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    padding: espacement.s,
  },
  tuileActive: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  tuileTexte: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.texte,
    textAlign: 'center',
  },
  tuileTexteActif: { color: '#FFFFFF' },
});
