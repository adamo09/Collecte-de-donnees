/**
 * CP09 — Pesées au pont-bascule (ch. 10.1).
 *
 * Le mode de récupération du poids conditionne la fiabilité de tout le
 * module. Trois modes coexistent selon les sites, et la distinction doit
 * rester visible du gestionnaire : elle est portée par le champ
 * `source_collecte`, jamais devinée.
 *
 * Cet écran couvre le mode le moins favorable — la ressaisie manuelle — en
 * attendant l'interfaçage direct avec l'indicateur de pesage, qui reste à
 * vérifier site par site (ch. 14).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Vibration } from 'react-native';

import { Bandeau, Bouton, Carte, Champ, EtatSynchro, Vide } from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import { empiler } from '@/services/basedonnees';
import { nouvelIdentifiant } from '@/services/synchronisation';
import type { Produit } from '@/types/modele';
import { couleurs, espacement, rayons } from '@/utils/theme';

export default function EcranPesees() {
  const { parametrage, reseau, nbEnAttente, nbRejetes, rafraichirCompteurs } = useSession();

  const [client, setClient] = useState('');
  const [immatriculation, setImmatriculation] = useState('');
  const [produit, setProduit] = useState<Produit | null>(null);
  const [poids, setPoids] = useState('');
  const [numeroBon, setNumeroBon] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [comptes, setComptes] = useState(0);

  const produits = useMemo(() => parametrage?.produits ?? [], [parametrage]);

  const poidsNumerique = useMemo(() => {
    const nettoye = poids.replace(',', '.').trim();
    if (nettoye === '') return null;
    const converti = Number(nettoye);
    return Number.isFinite(converti) && converti >= 0 ? converti : null;
  }, [poids]);

  const enregistrer = useCallback(async () => {
    if (!parametrage || poidsNumerique === null) return;

    Vibration.vibrate(40);
    const maintenant = new Date().toISOString();

    await empiler(nouvelIdentifiant(), 'pesee_pont_bascule', {
      site_id: parametrage.site_id,
      horodatage: maintenant,
      saisi_le: maintenant,
      client: client.trim() || null,
      immatriculation: immatriculation.trim().toUpperCase() || null,
      produit_id: produit?.id ?? null,
      poids_t: poidsNumerique,
      numero_bon: numeroBon.trim() || null,
      // Ressaisie manuelle assumée : le gestionnaire doit pouvoir
      // distinguer ce poids d'un poids relevé par interfaçage.
      source_collecte: 'saisie_directe',
    });

    setMessage(
      `${poidsNumerique} t enregistrées${immatriculation ? ` — ${immatriculation.toUpperCase()}` : ''}.`,
    );
    setComptes((n) => n + 1);
    setPoids('');
    setNumeroBon('');
    setImmatriculation('');
    await rafraichirCompteurs();
  }, [
    parametrage, poidsNumerique, client, immatriculation, produit, numeroBon,
    rafraichirCompteurs,
  ]);

  if (!parametrage) {
    return (
      <View style={styles.centre}>
        <Text style={styles.info}>
          Référentiel non chargé. Se connecter une fois au réseau pour le
          télécharger.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <EtatSynchro reseau={reseau} enAttente={nbEnAttente} rejetes={nbRejetes} />
      <ScrollView contentContainerStyle={styles.contenu}>
        {message ? <Bandeau ton="succes" texte={message} /> : null}

        {comptes > 0 ? (
          <Text style={styles.compteur}>
            {comptes} pesée{comptes > 1 ? 's' : ''} enregistrée{comptes > 1 ? 's' : ''} depuis
            l'ouverture de l'écran
          </Text>
        ) : null}

        <Carte>
          <Champ
            libelle="Poids relevé (t)"
            value={poids}
            onChangeText={setPoids}
            keyboardType="decimal-pad"
            aide="Valeur lue sur l'indicateur du pont-bascule."
          />
          <Champ
            libelle="Immatriculation du camion"
            value={immatriculation}
            onChangeText={setImmatriculation}
            autoCapitalize="characters"
          />
          <Champ
            libelle="Numéro de bon"
            value={numeroBon}
            onChangeText={setNumeroBon}
          />
          <Champ
            libelle="Client"
            value={client}
            onChangeText={setClient}
            aide="Conservé d'une pesée à l'autre : un même client charge souvent plusieurs camions."
          />
        </Carte>

        <Text style={styles.section}>Produit chargé</Text>
        {produits.length === 0 ? (
          <Vide texte="Aucun produit au référentiel." />
        ) : (
          <View style={styles.grille}>
            {produits.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setProduit(produit?.id === p.id ? null : p)}
                style={[styles.tuile, produit?.id === p.id && styles.tuileActive]}
              >
                <Text
                  style={[styles.tuileCode, produit?.id === p.id && styles.tuileTexteActif]}
                >
                  {p.code}
                </Text>
                <Text
                  style={[styles.tuileLibelle, produit?.id === p.id && styles.tuileTexteActif]}
                >
                  {p.granulometrie ?? p.libelle}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Bouton
          titre="Enregistrer la pesée"
          onPress={() => void enregistrer()}
          desactive={poidsNumerique === null}
        />

        <Text style={styles.note}>
          La pesée est enregistrée sur le terminal et partira à la prochaine
          synchronisation. Elle est marquée « saisie directe » : le gestionnaire
          saura qu'elle n'a pas été relevée par interfaçage.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espacement.m, paddingBottom: espacement.xl },
  centre: { flex: 1, justifyContent: 'center', padding: espacement.l },
  compteur: {
    fontSize: 13,
    color: couleurs.texteFaible,
    marginBottom: espacement.s,
    textAlign: 'center',
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.texte,
    marginTop: espacement.s,
    marginBottom: espacement.s,
  },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espacement.s },
  tuile: {
    minWidth: '30%',
    flexGrow: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayons.m,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    padding: espacement.s,
  },
  tuileActive: { backgroundColor: couleurs.primaire, borderColor: couleurs.primaire },
  tuileCode: { fontSize: 17, fontWeight: '800', color: couleurs.primaire },
  tuileLibelle: { fontSize: 12, color: couleurs.texteFaible, marginTop: 2 },
  tuileTexteActif: { color: '#FFFFFF' },
  info: { fontSize: 16, color: couleurs.texteFaible, textAlign: 'center', lineHeight: 24 },
  note: {
    marginTop: espacement.l,
    fontSize: 13,
    color: couleurs.texteFaible,
    lineHeight: 19,
  },
});
