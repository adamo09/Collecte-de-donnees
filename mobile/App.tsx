/**
 * CADERAC — Application de collecte terrain.
 *
 * Le pilote porte sur un site unique et deux modules — foration et rotations
 * de dumpers (ch. 14). Les autres écrans sont présents mais n'ont pas
 * vocation à être déployés d'emblée : élargir le périmètre avant que la
 * collecte des deux premiers modules soit installée multiplierait les
 * risques sans accélérer l'apprentissage.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { FournisseurSession, useSession } from '@/contextes/Session';
import EcranAutresSaisies from '@/ecrans/AutresSaisies';
import EcranConnexion from '@/ecrans/Connexion';
import EcranEvenementsEngin from '@/ecrans/EvenementsEngin';
import EcranForation from '@/ecrans/Foration';
import EcranRotations from '@/ecrans/Rotations';
import EcranSynchronisation from '@/ecrans/Synchronisation';
import { couleurs } from '@/utils/theme';

const Onglets = createBottomTabNavigator();

function Navigation() {
  const { pret, connecte, nbEnAttente } = useSession();

  if (!pret) {
    return (
      <View style={styles.chargement}>
        <ActivityIndicator size="large" color={couleurs.primaire} />
        <Text style={styles.chargementTexte}>Ouverture de la base locale…</Text>
      </View>
    );
  }

  if (!connecte) return <EcranConnexion />;

  return (
    <Onglets.Navigator
      screenOptions={{
        tabBarActiveTintColor: couleurs.primaire,
        tabBarInactiveTintColor: couleurs.texteFaible,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
        headerStyle: { backgroundColor: couleurs.primaire },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Onglets.Screen
        name="Rotations"
        component={EcranRotations}
        options={{ title: 'Rotations dumpers' }}
      />
      <Onglets.Screen
        name="Foration"
        component={EcranForation}
        options={{ title: 'Foration' }}
      />
      <Onglets.Screen
        name="Engins"
        component={EcranEvenementsEngin}
        options={{ title: 'Événements engins' }}
      />
      <Onglets.Screen
        name="Autres"
        component={EcranAutresSaisies}
        options={{ title: 'Autres saisies' }}
      />
      <Onglets.Screen
        name="Envoi"
        component={EcranSynchronisation}
        options={{
          title: "File d'envoi",
          // Le compteur est visible en permanence : c'est le rappel qu'il
          // reste des données sur le terminal.
          tabBarBadge: nbEnAttente > 0 ? nbEnAttente : undefined,
        }}
      />
    </Onglets.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FournisseurSession>
        <NavigationContainer>
          <StatusBar style="light" />
          <Navigation />
        </NavigationContainer>
      </FournisseurSession>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  chargement: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.fond,
  },
  chargementTexte: { marginTop: 16, fontSize: 16, color: couleurs.texteFaible },
});
