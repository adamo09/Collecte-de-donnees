/**
 * Modules hors périmètre du pilote.
 *
 * Le pilote porte sur un site unique et deux modules — foration et
 * rotations de dumpers (ch. 14). Concassage et pont-bascule sont
 * développés et fonctionnels, mais rangés derrière cet écran plutôt que
 * mis en avant dans la barre d'onglets : un opérateur de dumper ne doit
 * pas rencontrer six choix dont cinq ne le concernent pas, et six
 * étiquettes de texte sur une barre de téléphone seraient tronquées.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Bouton, EtatSynchro } from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import EcranConcassage from '@/ecrans/Concassage';
import EcranPesees from '@/ecrans/Pesees';
import { CIBLE_TACTILE, couleurs, espacement, rayons } from '@/utils/theme';

type Module = 'menu' | 'concassage' | 'pesees';

const MODULES: { cle: Exclude<Module, 'menu'>; titre: string; description: string }[] = [
  {
    cle: 'concassage',
    titre: 'Concassage',
    description:
      'Marche à charge, marche à vide, arrêts et pannes des concasseurs, cribles et convoyeurs.',
  },
  {
    cle: 'pesees',
    titre: 'Pont-bascule',
    description: 'Pesée d’un camion au chargement : poids, produit et bon de livraison.',
  },
];

export default function EcranAutresSaisies() {
  const { reseau, nbEnAttente, nbRejetes } = useSession();
  const [module, setModule] = useState<Module>('menu');

  if (module === 'concassage') {
    return (
      <View style={styles.page}>
        <View style={styles.retour}>
          <Bouton titre="← Autres saisies" variante="secondaire" onPress={() => setModule('menu')} />
        </View>
        <EcranConcassage />
      </View>
    );
  }

  if (module === 'pesees') {
    return (
      <View style={styles.page}>
        <View style={styles.retour}>
          <Bouton titre="← Autres saisies" variante="secondaire" onPress={() => setModule('menu')} />
        </View>
        <EcranPesees />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <EtatSynchro reseau={reseau} enAttente={nbEnAttente} rejetes={nbRejetes} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Text style={styles.titre}>Modules hors pilote</Text>
        <Text style={styles.explication}>
          Le déploiement commence par la foration et les rotations de dumpers,
          sur un seul site. Ces deux modules sont opérationnels et peuvent être
          ouverts quand le premier lot sera installé.
        </Text>

        {MODULES.map((m) => (
          <Pressable
            key={m.cle}
            onPress={() => setModule(m.cle)}
            style={({ pressed }) => [styles.tuile, pressed && styles.tuilePressee]}
          >
            <Text style={styles.tuileTitre}>{m.titre}</Text>
            <Text style={styles.tuileDescription}>{m.description}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  retour: {
    paddingHorizontal: espacement.m,
    paddingTop: espacement.s,
    backgroundColor: couleurs.fond,
  },
  contenu: { padding: espacement.m, paddingBottom: espacement.xl },
  titre: { fontSize: 20, fontWeight: '800', color: couleurs.texte, marginBottom: espacement.xs },
  explication: {
    fontSize: 14,
    color: couleurs.texteFaible,
    lineHeight: 21,
    marginBottom: espacement.l,
  },
  tuile: {
    minHeight: CIBLE_TACTILE * 1.3,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderLeftWidth: 3,
    borderLeftColor: couleurs.accent,
    padding: espacement.m,
    marginBottom: espacement.m,
    justifyContent: 'center',
  },
  tuilePressee: { backgroundColor: '#E8EDF5' },
  tuileTitre: { fontSize: 19, fontWeight: '800', color: couleurs.primaire },
  tuileDescription: {
    fontSize: 13.5,
    color: couleurs.texteFaible,
    marginTop: espacement.xs,
    lineHeight: 19,
  },
});
