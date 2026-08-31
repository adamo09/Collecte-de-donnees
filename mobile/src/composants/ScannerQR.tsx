/**
 * Scan d'une étiquette QR, avec repli obligatoire par saisie manuelle.
 *
 * Les étiquettes posées en carrière se dégradent vite : poussière, gasoil,
 * UV, chocs. Sans repli manuel, une étiquette arrachée signifie zéro
 * déclaration sur l'engin concerné pendant des jours (ch. 4.1). Le repli
 * n'est donc pas une option de confort : il est toujours accessible, à un
 * seul appui, sur le même écran que le scanner.
 */

import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Bandeau, Bouton, Champ } from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import type { Engin, FamilleEngin } from '@/types/modele';
import { CIBLE_TACTILE, couleurs, espacement, rayons } from '@/utils/theme';

export default function ScannerQR({
  titre,
  familles,
  onEngin,
  onAnnuler,
}: {
  titre: string;
  familles?: FamilleEngin[];
  onEngin: (engin: Engin) => void;
  onAnnuler: () => void;
}) {
  const { parametrage } = useSession();
  const [permission, demanderPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'camera' | 'manuel'>('camera');
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [dejaLu, setDejaLu] = useState(false);

  const candidats = useMemo(() => {
    const tous = parametrage?.engins ?? [];
    return familles ? tous.filter((e) => familles.includes(e.famille)) : tous;
  }, [parametrage, familles]);

  const filtres = useMemo(() => {
    const terme = recherche.trim().toUpperCase();
    if (!terme) return candidats;
    return candidats.filter(
      (e) =>
        e.numero_parc.toUpperCase().includes(terme) ||
        (e.matricule ?? '').toUpperCase().includes(terme),
    );
  }, [candidats, recherche]);

  const traiterCode = (valeur: string) => {
    if (dejaLu) return;
    setDejaLu(true);

    // La résolution se fait sur le référentiel local : le scan doit
    // fonctionner sans réseau.
    const engin = candidats.find((e) => e.qr_token === valeur);
    if (!engin) {
      setErreur(
        "Étiquette inconnue ou engin d'une autre famille. " +
          'Utiliser la saisie du numéro de parc.',
      );
      setMode('manuel');
      setDejaLu(false);
      return;
    }
    onEngin(engin);
  };

  if (mode === 'camera') {
    if (!permission) {
      return (
        <View style={styles.centre}>
          <Text style={styles.info}>Vérification de l'accès à la caméra…</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.centre}>
          <Text style={styles.info}>
            La caméra n'est pas autorisée. Le scan des étiquettes QR nécessite
            cette permission ; la saisie manuelle reste possible sans elle.
          </Text>
          <Bouton titre="Autoriser la caméra" onPress={() => void demanderPermission()} />
          <Bouton
            titre="Saisir le numéro de parc"
            variante="secondaire"
            onPress={() => setMode('manuel')}
          />
          <Bouton titre="Annuler" variante="secondaire" onPress={onAnnuler} />
        </View>
      );
    }

    return (
      <View style={styles.page}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => traiterCode(data)}
        >
          <View style={styles.viseur}>
            <Text style={styles.consigne}>{titre}</Text>
            <View style={styles.cadre} />
          </View>
        </CameraView>

        <View style={styles.piedDePage}>
          <Bouton
            titre="Étiquette illisible — saisir le numéro"
            variante="secondaire"
            onPress={() => setMode('manuel')}
          />
          <Bouton titre="Annuler" variante="secondaire" onPress={onAnnuler} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.contenu}>
        {erreur ? <Bandeau ton="alerte" texte={erreur} /> : null}

        <Champ
          libelle="Numéro de parc"
          value={recherche}
          onChangeText={(valeur) => {
            setRecherche(valeur);
            setErreur(null);
          }}
          autoCapitalize="characters"
          placeholder="DU01, FE02…"
          aide="Repli lorsque l'étiquette QR est absente ou illisible."
        />

        <FlatList
          data={filtres}
          keyExtractor={(engin) => engin.id}
          ListEmptyComponent={
            <Text style={styles.info}>Aucun engin ne correspond à cette recherche.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onEngin(item)}
              style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
            >
              <Text style={styles.lignParc}>{item.numero_parc}</Text>
              <Text style={styles.ligneDetail}>
                {item.famille}
                {item.matricule ? ` · ${item.matricule}` : ''}
              </Text>
            </Pressable>
          )}
        />

        <Bouton
          titre="Revenir au scan"
          variante="secondaire"
          onPress={() => {
            setErreur(null);
            setMode('camera');
          }}
        />
        <Bouton titre="Annuler" variante="secondaire" onPress={onAnnuler} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { flex: 1, padding: espacement.m },
  centre: { flex: 1, justifyContent: 'center', padding: espacement.l },
  camera: { flex: 1 },
  viseur: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  consigne: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: espacement.l,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: espacement.m,
    paddingVertical: espacement.s,
    borderRadius: rayons.s,
    textAlign: 'center',
  },
  cadre: {
    width: 250,
    height: 250,
    borderWidth: 4,
    borderColor: couleurs.accent,
    borderRadius: rayons.l,
  },
  piedDePage: {
    padding: espacement.m,
    backgroundColor: couleurs.fond,
  },
  ligne: {
    minHeight: CIBLE_TACTILE,
    justifyContent: 'center',
    paddingHorizontal: espacement.m,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.s,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    marginBottom: espacement.s,
  },
  lignePressee: { backgroundColor: '#E8EDF5' },
  lignParc: { fontSize: 22, fontWeight: '800', color: couleurs.primaire },
  ligneDetail: { fontSize: 14, color: couleurs.texteFaible, marginTop: 2 },
  info: {
    fontSize: 16,
    color: couleurs.texteFaible,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: espacement.m,
  },
});
