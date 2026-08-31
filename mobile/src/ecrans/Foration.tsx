/**
 * CP01 — Foration en deux scans (ch. 6).
 *
 * Le premier scan ouvre le trou lorsque la foreuse est positionnée et le
 * taillant posé ; le second le clôture. Entre les deux, le trou reste
 * ouvert, y compris localement : le second scan doit rester possible même
 * si le premier n'a pas encore atteint le serveur.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import { Bandeau, Bouton, Carte, Champ, EtatSynchro, Vide } from '@/composants/Communs';
import ScannerQR from '@/composants/ScannerQR';
import { useSession } from '@/contextes/Session';
import {
  cloturerTrouLocal,
  empiler,
  ouvrirTrou,
  trousOuverts,
  type TrouOuvert,
} from '@/services/basedonnees';
import { nouvelIdentifiant } from '@/services/synchronisation';
import type { Engin } from '@/types/modele';
import { couleurs, espacement } from '@/utils/theme';

type Etape = 'liste' | 'scan_ouverture' | 'saisie_ouverture' | 'cloture';

export default function EcranForation() {
  const { parametrage, reseau, nbEnAttente, nbRejetes, rafraichirCompteurs } = useSession();

  const [etape, setEtape] = useState<Etape>('liste');
  const [ouverts, setOuverts] = useState<TrouOuvert[]>([]);
  const [foreuse, setForeuse] = useState<Engin | null>(null);
  const [aCloturer, setACloturer] = useState<TrouOuvert | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Premier scan
  const [compteurDebut, setCompteurDebut] = useState('');
  const [diametre, setDiametre] = useState('102');
  const [mailleLongueur, setMailleLongueur] = useState('');
  const [mailleLargeur, setMailleLargeur] = useState('');

  // Second scan
  const [compteurFin, setCompteurFin] = useState('');
  const [metresLineaires, setMetresLineaires] = useState('');
  const [taillant, setTaillant] = useState('');
  const [tige, setTige] = useState('');

  const rafraichirListe = useCallback(async () => {
    setOuverts(await trousOuverts());
  }, []);

  useEffect(() => {
    void rafraichirListe();
  }, [rafraichirListe]);

  const nombre = (valeur: string): number | null => {
    const nettoye = valeur.replace(',', '.').trim();
    if (nettoye === '') return null;
    const converti = Number(nettoye);
    return Number.isFinite(converti) ? converti : null;
  };

  const ouvrir = useCallback(async () => {
    if (!parametrage || !foreuse) return;

    // La position est utile mais jamais bloquante : un GPS qui n'accroche
    // pas sous un front de taille ne doit pas empêcher la déclaration.
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      }
    } catch {
      // Position indisponible : on continue sans elle.
    }

    const identifiant = nouvelIdentifiant();
    const maintenant = new Date();
    const tir = parametrage.tirs_ouverts[0] ?? null;

    await empiler(identifiant, 'trou_forage', {
      site_id: parametrage.site_id,
      tir_id: tir?.id ?? null,
      foreuse_id: foreuse.id,
      poste: 'jour',
      date_foration: maintenant.toISOString().slice(0, 10),
      heure_debut: maintenant.toISOString(),
      saisi_le: maintenant.toISOString(),
      compteur_debut: nombre(compteurDebut),
      diametre_mm: nombre(diametre),
      maille_longueur_m: nombre(mailleLongueur),
      maille_largeur_m: nombre(mailleLargeur),
      gps_latitude: latitude,
      gps_longitude: longitude,
      source_collecte: 'qr_code',
    });

    await ouvrirTrou({
      id: identifiant,
      foreuse_id: foreuse.id,
      foreuse_parc: foreuse.numero_parc,
      tir_id: tir?.id ?? null,
      heure_debut: maintenant.toISOString(),
      compteur_debut: nombre(compteurDebut),
    });

    setMessage(`Trou ouvert sur ${foreuse.numero_parc}. Ne pas oublier le second scan.`);
    setForeuse(null);
    setCompteurDebut('');
    setMailleLongueur('');
    setMailleLargeur('');
    setEtape('liste');
    await rafraichirListe();
    await rafraichirCompteurs();
  }, [
    parametrage, foreuse, compteurDebut, diametre, mailleLongueur, mailleLargeur,
    rafraichirListe, rafraichirCompteurs,
  ]);

  const cloturer = useCallback(async () => {
    if (!aCloturer) return;

    const compteur = nombre(compteurFin);
    if (
      compteur !== null &&
      aCloturer.compteur_debut !== null &&
      compteur < aCloturer.compteur_debut
    ) {
      Alert.alert(
        'Compteur incohérent',
        `Le compteur de fin (${compteur}) est inférieur à celui du début ` +
          `(${aCloturer.compteur_debut}). Vérifier le relevé.`,
      );
      return;
    }

    // Le trou est renvoyé complet, avec le même identifiant qu'à
    // l'ouverture : le serveur reconnaît la mise à jour, pas un doublon.
    await empiler(aCloturer.id, 'trou_forage', {
      heure_fin: new Date().toISOString(),
      compteur_fin: compteur,
      metres_lineaires: nombre(metresLineaires),
      numero_taillant: taillant.trim() || null,
      numero_tige: tige.trim() || null,
    });
    await cloturerTrouLocal(aCloturer.id);

    setMessage(`Trou de ${aCloturer.foreuse_parc} clôturé.`);
    setACloturer(null);
    setCompteurFin('');
    setMetresLineaires('');
    setTaillant('');
    setTige('');
    setEtape('liste');
    await rafraichirListe();
    await rafraichirCompteurs();
  }, [aCloturer, compteurFin, metresLineaires, taillant, tige, rafraichirListe, rafraichirCompteurs]);

  if (etape === 'scan_ouverture') {
    return (
      <ScannerQR
        titre="Scanner l'étiquette de la foreuse"
        familles={['foreuse']}
        onAnnuler={() => setEtape('liste')}
        onEngin={(engin) => {
          setForeuse(engin);
          setCompteurDebut(engin.compteur_actuel ? String(engin.compteur_actuel) : '');
          setEtape('saisie_ouverture');
        }}
      />
    );
  }

  if (etape === 'saisie_ouverture' && foreuse) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.contenu}>
        <Bandeau texte={`Foreuse ${foreuse.numero_parc} — premier scan`} />
        <Carte>
          <Champ
            libelle={`Compteur au début (${foreuse.unite_compteur})`}
            value={compteurDebut}
            onChangeText={setCompteurDebut}
            keyboardType="decimal-pad"
            aide={
              foreuse.compteur_actuel
                ? `Dernier relevé connu : ${foreuse.compteur_actuel}`
                : 'Aucun relevé antérieur connu.'
            }
          />
          <Champ
            libelle="Diamètre (mm)"
            value={diametre}
            onChangeText={setDiametre}
            keyboardType="decimal-pad"
          />
          <Champ
            libelle="Maille — longueur (m)"
            value={mailleLongueur}
            onChangeText={setMailleLongueur}
            keyboardType="decimal-pad"
          />
          <Champ
            libelle="Maille — largeur (m)"
            value={mailleLargeur}
            onChangeText={setMailleLargeur}
            keyboardType="decimal-pad"
          />
        </Carte>
        <Bouton titre="Ouvrir le trou" onPress={() => void ouvrir()} />
        <Bouton titre="Annuler" variante="secondaire" onPress={() => setEtape('liste')} />
      </ScrollView>
    );
  }

  if (etape === 'cloture' && aCloturer) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.contenu}>
        <Bandeau
          ton="alerte"
          texte={`Clôture du trou — foreuse ${aCloturer.foreuse_parc}`}
        />
        <Carte>
          <Champ
            libelle="Compteur à la fin"
            value={compteurFin}
            onChangeText={setCompteurFin}
            keyboardType="decimal-pad"
            aide={
              aCloturer.compteur_debut !== null
                ? `Au début : ${aCloturer.compteur_debut}`
                : undefined
            }
          />
          <Champ
            libelle="Mètres linéaires forés"
            value={metresLineaires}
            onChangeText={setMetresLineaires}
            keyboardType="decimal-pad"
          />
          <Champ libelle="Numéro de taillant" value={taillant} onChangeText={setTaillant} />
          <Champ libelle="Numéro de tige" value={tige} onChangeText={setTige} />
        </Carte>
        <Bouton titre="Clôturer le trou" onPress={() => void cloturer()} />
        <Bouton
          titre="Annuler"
          variante="secondaire"
          onPress={() => {
            setACloturer(null);
            setEtape('liste');
          }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.page}>
      <EtatSynchro reseau={reseau} enAttente={nbEnAttente} rejetes={nbRejetes} />
      <ScrollView contentContainerStyle={styles.contenu}>
        {message ? <Bandeau ton="succes" texte={message} /> : null}

        <Bouton titre="Nouveau trou — 1er scan" onPress={() => setEtape('scan_ouverture')} />

        <Text style={styles.titre}>
          Trous ouverts sur ce terminal ({ouverts.length})
        </Text>
        <Text style={styles.explication}>
          Un trou reste ouvert tant que le second scan n'a pas été fait. C'est
          l'oubli le plus fréquent du module.
        </Text>

        {ouverts.length === 0 ? (
          <Vide texte="Aucun trou en attente de clôture." />
        ) : (
          ouverts.map((trou) => {
            const heures = (Date.now() - Date.parse(trou.heure_debut)) / 3_600_000;
            return (
              <Carte key={trou.id}>
                <Text style={styles.ligneForeuse}>{trou.foreuse_parc}</Text>
                <Text style={styles.ligneDetail}>
                  Ouvert à {new Date(trou.heure_debut).toLocaleTimeString('fr-FR')} —{' '}
                  {heures < 1
                    ? `${Math.round(heures * 60)} min`
                    : `${heures.toFixed(1)} h`}
                </Text>
                {heures > 12 ? (
                  <Text style={styles.alerte}>
                    Ouvert depuis plus de 12 heures : vérifier auprès de l'opérateur.
                  </Text>
                ) : null}
                <Bouton
                  titre="2e scan — clôturer"
                  onPress={() => {
                    setACloturer(trou);
                    setCompteurFin(
                      trou.compteur_debut !== null ? String(trou.compteur_debut) : '',
                    );
                    setEtape('cloture');
                  }}
                />
              </Carte>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espacement.m, paddingBottom: espacement.xl },
  titre: {
    fontSize: 17,
    fontWeight: '700',
    color: couleurs.texte,
    marginTop: espacement.l,
  },
  explication: {
    fontSize: 13,
    color: couleurs.texteFaible,
    marginBottom: espacement.m,
    lineHeight: 19,
  },
  ligneForeuse: { fontSize: 22, fontWeight: '800', color: couleurs.primaire },
  ligneDetail: { fontSize: 15, color: couleurs.texteFaible, marginTop: espacement.xs },
  alerte: {
    fontSize: 14,
    color: couleurs.alerte,
    fontWeight: '600',
    marginTop: espacement.s,
  },
});
