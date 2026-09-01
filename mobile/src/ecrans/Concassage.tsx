/**
 * Concassage — journal d'activité des équipements (ch. 9).
 *
 * La distinction entre marche à charge et marche à vide est indispensable
 * au calcul ultérieur du coût énergétique à la tonne : c'est elle qui
 * sépare l'énergie qui a produit des tonnes de celle qui n'a fait que
 * tourner. Une marche à charge sans tonnage traité ne permet aucun calcul,
 * l'écran le refuse donc.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Vibration } from 'react-native';

import { Bandeau, Bouton, Carte, Champ, EtatSynchro } from '@/composants/Communs';
import ScannerQR from '@/composants/ScannerQR';
import { useSession } from '@/contextes/Session';
import { empiler } from '@/services/basedonnees';
import { nouvelIdentifiant } from '@/services/synchronisation';
import {
  EVENEMENTS_EQUIPEMENT_AVEC_CAUSE,
  type Equipement,
  type TypeEvenementEquipement,
} from '@/types/modele';
import { CIBLE_TACTILE, couleurs, espacement, rayons } from '@/utils/theme';

const TYPES: { valeur: TypeEvenementEquipement; libelle: string }[] = [
  { valeur: 'marche_a_charge', libelle: 'Marche à charge' },
  { valeur: 'marche_a_vide', libelle: 'Marche à vide' },
  { valeur: 'arret', libelle: 'Arrêt' },
  { valeur: 'reprise', libelle: 'Reprise' },
  { valeur: 'panne', libelle: 'Panne' },
  { valeur: 'maintenance', libelle: 'Maintenance' },
  { valeur: 'fin', libelle: 'Fin de poste' },
];

export default function EcranConcassage() {
  const { parametrage, reseau, nbEnAttente, nbRejetes, rafraichirCompteurs } = useSession();

  const [equipement, setEquipement] = useState<Equipement | null>(null);
  const [scanner, setScanner] = useState(false);
  const [type, setType] = useState<TypeEvenementEquipement | null>(null);
  const [cause, setCause] = useState<string | null>(null);
  const [production, setProduction] = useState('');
  const [tauxCharge, setTauxCharge] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const equipements = useMemo(() => parametrage?.equipements ?? [], [parametrage]);

  const causeObligatoire = useMemo(
    () => type !== null && EVENEMENTS_EQUIPEMENT_AVEC_CAUSE.includes(type),
    [type],
  );
  const productionObligatoire = type === 'marche_a_charge';

  const nombre = (valeur: string): number | null => {
    const nettoye = valeur.replace(',', '.').trim();
    if (nettoye === '') return null;
    const converti = Number(nettoye);
    return Number.isFinite(converti) ? converti : null;
  };

  const enregistrer = useCallback(async () => {
    if (!parametrage || !equipement || !type) return;

    Vibration.vibrate(40);
    const maintenant = new Date().toISOString();

    await empiler(nouvelIdentifiant(), 'evenement_equipement', {
      equipement_id: equipement.id,
      site_id: parametrage.site_id,
      type_evenement: type,
      heure_debut: maintenant,
      saisi_le: maintenant,
      poste: 'jour',
      cause_code: cause,
      production_t: nombre(production),
      taux_charge_pct: nombre(tauxCharge),
      commentaire: commentaire.trim() || null,
      source_collecte: 'qr_code',
    });

    setMessage(`${TYPES.find((t) => t.valeur === type)?.libelle} — ${equipement.designation}`);
    setType(null);
    setCause(null);
    setProduction('');
    setTauxCharge('');
    setCommentaire('');
    await rafraichirCompteurs();
  }, [
    parametrage, equipement, type, cause, production, tauxCharge, commentaire,
    rafraichirCompteurs,
  ]);

  if (scanner) {
    return (
      <ScannerQR
        titre="Scanner l'étiquette de l'équipement"
        cible="equipement"
        onAnnuler={() => setScanner(false)}
        onEquipement={(choisi) => {
          setEquipement(choisi);
          setScanner(false);
        }}
      />
    );
  }

  const pretAEnregistrer =
    type !== null &&
    (!causeObligatoire || cause !== null) &&
    (!productionObligatoire || nombre(production) !== null);

  return (
    <View style={styles.page}>
      <EtatSynchro reseau={reseau} enAttente={nbEnAttente} rejetes={nbRejetes} />
      <ScrollView contentContainerStyle={styles.contenu}>
        {message ? <Bandeau ton="succes" texte={`${message} enregistré.`} /> : null}

        {equipement ? (
          <Carte>
            <Text style={styles.designation}>{equipement.designation}</Text>
            <Text style={styles.detail}>
              {equipement.type}
              {equipement.niveau ? ` · niveau ${equipement.niveau}` : ''}
              {equipement.ligne ? ` · ${equipement.ligne}` : ''}
            </Text>
            <Bouton
              titre="Changer d'équipement"
              variante="secondaire"
              onPress={() => setScanner(true)}
            />
          </Carte>
        ) : (
          <>
            <Bouton titre="Scanner un équipement" onPress={() => setScanner(true)} />
            {equipements.length > 0 ? (
              <>
                <Text style={styles.section}>Ou choisir dans la liste du site</Text>
                <View style={styles.grille}>
                  {equipements.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => setEquipement(e)}
                      style={styles.tuileEquipement}
                    >
                      <Text style={styles.tuileTexte}>{e.designation}</Text>
                      {e.niveau ? <Text style={styles.tuileNiveau}>{e.niveau}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.info}>
                Aucun équipement au référentiel de ce site. Contacter l'administrateur.
              </Text>
            )}
          </>
        )}

        {equipement ? (
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

            {productionObligatoire ? (
              <Carte>
                <Text style={styles.explication}>
                  Une marche à charge sans tonnage traité ne permet aucun calcul de
                  coût à la tonne.
                </Text>
                <Champ
                  libelle="Tonnage traité (t)"
                  value={production}
                  onChangeText={setProduction}
                  keyboardType="decimal-pad"
                />
                <Champ
                  libelle="Taux de charge (%)"
                  value={tauxCharge}
                  onChangeText={setTauxCharge}
                  keyboardType="decimal-pad"
                  aide="Relevé sur l'écran machine, si disponible."
                />
              </Carte>
            ) : null}

            {causeObligatoire ? (
              <>
                <Text style={styles.section}>Motif — obligatoire</Text>
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
                libelle="Commentaire"
                value={commentaire}
                onChangeText={setCommentaire}
                multiline
              />
            </Carte>

            <Bouton
              titre="Enregistrer l'événement"
              onPress={() => void enregistrer()}
              desactive={!pretAEnregistrer}
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
  designation: { fontSize: 22, fontWeight: '800', color: couleurs.primaire },
  detail: { fontSize: 14, color: couleurs.texteFaible, marginBottom: espacement.s },
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
    lineHeight: 19,
    marginBottom: espacement.s,
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
  tuileEquipement: {
    minWidth: '47%',
    minHeight: 64,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.m,
    borderWidth: 1.5,
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
  tuileNiveau: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  tuileTexteActif: { color: '#FFFFFF' },
  info: {
    fontSize: 15,
    color: couleurs.texteFaible,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: espacement.m,
  },
});
