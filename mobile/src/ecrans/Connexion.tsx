/** Écran de connexion.
 *
 *  C'est le seul moment où le réseau est indispensable : une fois les
 *  jetons et le référentiel en place, l'agent travaille hors ligne.
 */

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Bandeau, Bouton, Champ } from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import { couleurs, espacement } from '@/utils/theme';

export default function EcranConnexion() {
  const { seConnecter } = useSession();
  const [login, setLogin] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const valider = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      await seConnecter(login.trim(), motDePasse);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.entete}>
          <Text style={styles.titre}>CADERAC</Text>
          <Text style={styles.sousTitre}>Collecte terrain</Text>
        </View>

        {erreur ? <Bandeau ton="erreur" texte={erreur} /> : null}

        <Champ
          libelle="Identifiant"
          value={login}
          onChangeText={setLogin}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
        />
        <Champ
          libelle="Mot de passe"
          value={motDePasse}
          onChangeText={setMotDePasse}
          secureTextEntry
          textContentType="password"
        />

        <Bouton
          titre="Se connecter"
          onPress={() => void valider()}
          enCours={enCours}
          desactive={!login.trim() || !motDePasse}
        />

        <Text style={styles.note}>
          La connexion nécessite du réseau. Une fois faite, le terminal
          télécharge le référentiel du site et l'application fonctionne ensuite
          hors ligne toute la journée.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espacement.l, paddingTop: espacement.xl * 2 },
  entete: { alignItems: 'center', marginBottom: espacement.xl },
  titre: { fontSize: 40, fontWeight: '900', color: couleurs.primaire, letterSpacing: 3 },
  sousTitre: { fontSize: 17, color: couleurs.texteFaible, marginTop: espacement.xs },
  note: {
    marginTop: espacement.l,
    fontSize: 13,
    color: couleurs.texteFaible,
    lineHeight: 20,
    textAlign: 'center',
  },
});
