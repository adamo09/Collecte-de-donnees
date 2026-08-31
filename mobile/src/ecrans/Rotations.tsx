/**
 * Rotations de dumpers — grille de boutons (ch. 8.2).
 *
 * Le cahier des charges envisageait la reconnaissance vocale au point de
 * déversement. En zone de concassage, le bruit ambiant et les matricules
 * alphanumériques prononcés avec un accent local rendent la transcription
 * peu fiable, sans compter la dépendance au réseau.
 *
 * La solution retenue est une grille portant les matricules des dumpers du
 * site — une dizaine, pas cent. Un appui, la rotation est enregistrée, hors
 * ligne, en moins d'une seconde.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Vibration,
} from 'react-native';

import { Bandeau, Carte, EtatSynchro } from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import { empiler } from '@/services/basedonnees';
import { nouvelIdentifiant } from '@/services/synchronisation';
import type { Engin, PosteTravail } from '@/types/modele';
import { CIBLE_TACTILE, couleurs, espacement, rayons } from '@/utils/theme';

/** Points de déversement proposés. Volontairement courts : la liste doit
 *  tenir sur une ligne de boutons, sans défilement. */
const POINTS_DEVERSEMENT = ['Primaire', 'Secondaire', 'Stock', 'Stérile'] as const;

export default function EcranRotations() {
  const { parametrage, reseau, nbEnAttente, nbRejetes, rafraichirCompteurs } = useSession();

  const [point, setPoint] = useState<string>(POINTS_DEVERSEMENT[0]);
  const [poste, setPoste] = useState<PosteTravail>('jour');
  const [dernier, setDernier] = useState<string | null>(null);
  const [comptes, setComptes] = useState<Record<string, number>>({});

  const dumpers = useMemo<Engin[]>(
    () => (parametrage?.engins ?? []).filter((e) => e.famille === 'dumper'),
    [parametrage],
  );

  const enregistrer = useCallback(
    async (dumper: Engin) => {
      if (!parametrage) return;

      // Retour haptique : en zone bruyante, la vibration est le seul accusé
      // de réception que l'agent perçoive sans regarder l'écran.
      Vibration.vibrate(40);

      const identifiant = nouvelIdentifiant();
      const maintenant = new Date().toISOString();

      await empiler(identifiant, 'rotation_dumper', {
        dumper_id: dumper.id,
        site_id: parametrage.site_id,
        horodatage: maintenant,
        saisi_le: maintenant,
        point_deversement: point,
        poste,
        centre_cout_reel: dumper.centre_cout_reference,
        // Sans pesée disponible au point de déversement, la quantité est
        // estimée à partir de la capacité nominale, et l'indicateur de
        // nature le dit explicitement : les deux ne seront jamais confondues.
        quantite_estimee_t: dumper.capacite_nominale,
        nature_quantite: 'estimation',
        source_collecte: 'saisie_directe',
      });

      setDernier(dumper.numero_parc);
      setComptes((precedent) => ({
        ...precedent,
        [dumper.numero_parc]: (precedent[dumper.numero_parc] ?? 0) + 1,
      }));
      await rafraichirCompteurs();
    },
    [parametrage, point, poste, rafraichirCompteurs],
  );

  if (!parametrage) {
    return (
      <View style={styles.centre}>
        <Text style={styles.info}>
          Référentiel non chargé. Se connecter une fois au réseau pour le
          télécharger, puis le travail hors ligne redevient possible.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <EtatSynchro reseau={reseau} enAttente={nbEnAttente} rejetes={nbRejetes} />

      <ScrollView contentContainerStyle={styles.contenu}>
        {dernier ? (
          <Bandeau
            ton="succes"
            texte={`Rotation ${dernier} enregistrée — ${comptes[dernier] ?? 1} aujourd'hui`}
          />
        ) : null}

        <Carte>
          <Text style={styles.section}>Point de déversement</Text>
          <View style={styles.ligneChoix}>
            {POINTS_DEVERSEMENT.map((valeur) => (
              <Pressable
                key={valeur}
                onPress={() => setPoint(valeur)}
                style={[styles.choix, point === valeur && styles.choixActif]}
              >
                <Text style={[styles.choixTexte, point === valeur && styles.choixTexteActif]}>
                  {valeur}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.section, { marginTop: espacement.m }]}>Poste</Text>
          <View style={styles.ligneChoix}>
            {(['jour', 'nuit'] as const).map((valeur) => (
              <Pressable
                key={valeur}
                onPress={() => setPoste(valeur)}
                style={[styles.choix, poste === valeur && styles.choixActif]}
              >
                <Text style={[styles.choixTexte, poste === valeur && styles.choixTexteActif]}>
                  {valeur === 'jour' ? 'Jour' : 'Nuit'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Carte>

        <Text style={styles.titreGrille}>Appuyer sur le dumper qui déverse</Text>

        {dumpers.length === 0 ? (
          <Text style={styles.info}>
            Aucun dumper au référentiel de ce site. Contacter l'administrateur.
          </Text>
        ) : (
          <View style={styles.grille}>
            {dumpers.map((dumper) => (
              <Pressable
                key={dumper.id}
                onPress={() => void enregistrer(dumper)}
                accessibilityRole="button"
                accessibilityLabel={`Enregistrer une rotation du dumper ${dumper.numero_parc}`}
                style={({ pressed }) => [styles.tuile, pressed && styles.tuilePressee]}
              >
                <Text style={styles.tuileParc}>{dumper.numero_parc}</Text>
                <Text style={styles.tuileCapacite}>
                  {dumper.capacite_nominale
                    ? `${dumper.capacite_nominale} ${dumper.unite_capacite ?? 't'}`
                    : 'capacité inconnue'}
                </Text>
                {comptes[dumper.numero_parc] ? (
                  <View style={styles.compteur}>
                    <Text style={styles.compteurTexte}>{comptes[dumper.numero_parc]}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.note}>
          Chaque appui est enregistré sur le terminal. Les rotations partent au
          serveur lors de la prochaine synchronisation ; aucune n'est perdue si
          le réseau est absent.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espacement.m, paddingBottom: espacement.xl },
  centre: { flex: 1, justifyContent: 'center', padding: espacement.l },
  section: { fontSize: 14, fontWeight: '700', color: couleurs.texteFaible },
  ligneChoix: { flexDirection: 'row', flexWrap: 'wrap', gap: espacement.s, marginTop: espacement.s },
  choix: {
    paddingHorizontal: espacement.m,
    paddingVertical: espacement.s,
    borderRadius: rayons.s,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    minHeight: 44,
    justifyContent: 'center',
  },
  choixActif: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  choixTexte: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  choixTexteActif: { color: '#FFFFFF' },
  titreGrille: {
    fontSize: 17,
    fontWeight: '700',
    color: couleurs.texte,
    marginBottom: espacement.s,
  },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espacement.m },
  tuile: {
    width: '47%',
    minHeight: CIBLE_TACTILE * 1.6,
    backgroundColor: couleurs.primaire,
    borderRadius: rayons.m,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacement.m,
  },
  tuilePressee: { backgroundColor: couleurs.primaireClair, transform: [{ scale: 0.97 }] },
  tuileParc: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  tuileCapacite: { fontSize: 13, color: '#D7DEEA', marginTop: espacement.xs },
  compteur: {
    position: 'absolute',
    top: espacement.s,
    right: espacement.s,
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: couleurs.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  compteurTexte: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  info: { fontSize: 16, color: couleurs.texteFaible, textAlign: 'center', lineHeight: 24 },
  note: {
    marginTop: espacement.l,
    fontSize: 13,
    color: couleurs.texteFaible,
    lineHeight: 19,
  },
});
