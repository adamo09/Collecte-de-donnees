/** Composants d'interface partagés. */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { CIBLE_TACTILE, couleurs, espacement, rayons } from '@/utils/theme';

export function Bouton({
  titre,
  onPress,
  variante = 'primaire',
  desactive = false,
  enCours = false,
}: {
  titre: string;
  onPress: () => void;
  variante?: 'primaire' | 'secondaire' | 'danger';
  desactive?: boolean;
  enCours?: boolean;
}) {
  const fond =
    variante === 'primaire'
      ? couleurs.primaire
      : variante === 'danger'
        ? couleurs.erreur
        : couleurs.surface;
  const texte = variante === 'secondaire' ? couleurs.primaire : '#FFFFFF';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: desactive || enCours }}
      onPress={onPress}
      disabled={desactive || enCours}
      style={({ pressed }) => [
        styles.bouton,
        { backgroundColor: fond, opacity: desactive ? 0.5 : pressed ? 0.85 : 1 },
        variante === 'secondaire' && styles.boutonBordure,
      ]}
    >
      {enCours ? (
        <ActivityIndicator color={texte} />
      ) : (
        <Text style={[styles.boutonTexte, { color: texte }]}>{titre}</Text>
      )}
    </Pressable>
  );
}

export function Champ({
  libelle,
  aide,
  ...props
}: TextInputProps & { libelle: string; aide?: string }) {
  return (
    <View style={styles.champ}>
      <Text style={styles.libelle}>{libelle}</Text>
      <TextInput
        style={styles.saisie}
        placeholderTextColor={couleurs.texteFaible}
        {...props}
      />
      {aide ? <Text style={styles.aide}>{aide}</Text> : null}
    </View>
  );
}

export function Carte({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[styles.carte, style]}>{children}</View>;
}

export function Bandeau({
  texte,
  ton = 'info',
}: {
  texte: string;
  ton?: 'info' | 'succes' | 'alerte' | 'erreur';
}) {
  const fonds = {
    info: couleurs.primaireClair,
    succes: couleurs.succes,
    alerte: couleurs.alerte,
    erreur: couleurs.erreur,
  };
  return (
    <View style={[styles.bandeau, { backgroundColor: fonds[ton] }]}>
      <Text style={styles.bandeauTexte}>{texte}</Text>
    </View>
  );
}

/** Pastille d'état réseau et de file d'envoi.
 *
 *  Elle est présente sur tous les écrans : un agent doit pouvoir vérifier
 *  d'un coup d'œil que ses saisies sont bien parties, sans changer d'écran.
 */
export function EtatSynchro({
  reseau,
  enAttente,
  rejetes,
}: {
  reseau: boolean;
  enAttente: number;
  rejetes: number;
}) {
  return (
    <View style={styles.etat}>
      <View
        style={[
          styles.pastille,
          { backgroundColor: reseau ? couleurs.succes : couleurs.horsLigne },
        ]}
      />
      <Text style={styles.etatTexte}>
        {reseau ? 'En ligne' : 'Hors ligne'}
        {enAttente > 0 ? ` · ${enAttente} en attente` : ''}
        {rejetes > 0 ? ` · ${rejetes} à corriger` : ''}
      </Text>
    </View>
  );
}

export function Vide({ texte }: { texte: string }) {
  return (
    <View style={styles.vide}>
      <Text style={styles.videTexte}>{texte}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bouton: {
    minHeight: CIBLE_TACTILE,
    borderRadius: rayons.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espacement.l,
    marginVertical: espacement.s,
  },
  boutonBordure: { borderWidth: 2, borderColor: couleurs.primaire },
  boutonTexte: { fontSize: 18, fontWeight: '700' },
  champ: { marginBottom: espacement.m },
  libelle: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.texte,
    marginBottom: espacement.xs,
  },
  saisie: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    borderRadius: rayons.s,
    paddingHorizontal: espacement.m,
    fontSize: 18,
    color: couleurs.texte,
    backgroundColor: couleurs.surface,
  },
  aide: { fontSize: 13, color: couleurs.texteFaible, marginTop: espacement.xs },
  carte: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    padding: espacement.m,
    marginBottom: espacement.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  bandeau: {
    padding: espacement.m,
    borderRadius: rayons.s,
    marginBottom: espacement.m,
  },
  bandeauTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  etat: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espacement.m,
    paddingVertical: espacement.s,
    backgroundColor: couleurs.surface,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  pastille: { width: 12, height: 12, borderRadius: 6, marginRight: espacement.s },
  etatTexte: { fontSize: 14, color: couleurs.texteFaible, fontWeight: '600' },
  vide: { padding: espacement.xl, alignItems: 'center' },
  videTexte: { fontSize: 16, color: couleurs.texteFaible, textAlign: 'center' },
});
