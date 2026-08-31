/**
 * File d'envoi et synchronisation (ch. 12).
 *
 * Cet écran répond à la seule question que se pose un agent en fin de
 * poste : « est-ce que ce que j'ai saisi est bien parti ? ». Sans réponse
 * claire, la confiance dans l'outil s'effondre en quelques jours.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Bandeau, Bouton, Carte, EtatSynchro, Vide } from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import { elementsRejetes, type ElementFile } from '@/services/basedonnees';
import { couleurs, espacement } from '@/utils/theme';

const LIBELLE_TABLE: Record<string, string> = {
  trou_forage: 'Trou de forage',
  evenement_engin: 'Événement engin',
  rotation_dumper: 'Rotation dumper',
  evenement_equipement: 'Événement équipement',
  pesee_pont_bascule: 'Pesée pont-bascule',
  prestation_minage: 'Prestation de minage',
  sortie_piece: 'Sortie magasin',
  charge_engin: 'Charge engin',
  affectation_reelle_engin: 'Affectation réelle',
};

export default function EcranSynchronisation() {
  const {
    utilisateur,
    terminalId,
    reseau,
    nbEnAttente,
    nbRejetes,
    lancerSynchronisation,
    rafraichirCompteurs,
    rafraichirParametrage,
    seDeconnecter,
  } = useSession();

  const [rejetes, setRejetes] = useState<ElementFile[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [resume, setResume] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    await rafraichirCompteurs();
    setRejetes(await elementsRejetes());
  }, [rafraichirCompteurs]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const synchroniser = useCallback(async () => {
    setEnCours(true);
    setResume(null);
    try {
      const resultat = await lancerSynchronisation();
      await rafraichirParametrage();
      setResume(
        resultat.acceptes === 0 && resultat.restants > 0
          ? `Aucune donnée transmise. ${resultat.restants} restent en attente.`
          : `${resultat.acceptes} enregistrement(s) transmis` +
            (resultat.rejetes > 0 ? `, ${resultat.rejetes} rejeté(s)` : '') +
            (resultat.restants > 0 ? `, ${resultat.restants} encore en attente.` : '.'),
      );
    } finally {
      setEnCours(false);
      await recharger();
    }
  }, [lancerSynchronisation, rafraichirParametrage, recharger]);

  const deconnecter = useCallback(() => {
    const avertissement =
      nbEnAttente > 0
        ? `${nbEnAttente} enregistrement(s) n'ont pas encore été transmis. ` +
          'La déconnexion les effacera définitivement du terminal.'
        : 'Le référentiel local sera effacé ; une reconnexion au réseau sera nécessaire.';

    Alert.alert('Se déconnecter', avertissement, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: nbEnAttente > 0 ? 'Effacer et se déconnecter' : 'Se déconnecter',
        style: 'destructive',
        onPress: () => void seDeconnecter(),
      },
    ]);
  }, [nbEnAttente, seDeconnecter]);

  return (
    <View style={styles.page}>
      <EtatSynchro reseau={reseau} enAttente={nbEnAttente} rejetes={nbRejetes} />

      <ScrollView
        contentContainerStyle={styles.contenu}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void recharger()} />}
      >
        {resume ? <Bandeau ton={nbEnAttente > 0 ? 'alerte' : 'succes'} texte={resume} /> : null}

        <Carte>
          <Text style={styles.chiffre}>{nbEnAttente}</Text>
          <Text style={styles.legende}>
            {nbEnAttente === 0
              ? 'Tout est transmis.'
              : nbEnAttente === 1
                ? "enregistrement en attente d'envoi"
                : "enregistrements en attente d'envoi"}
          </Text>

          {!reseau ? (
            <Text style={styles.horsLigne}>
              Aucun réseau détecté. Les saisies restent sur le terminal et
              partiront automatiquement au retour en zone couverte.
            </Text>
          ) : null}

          <Bouton
            titre={reseau ? 'Synchroniser maintenant' : 'Réessayer'}
            onPress={() => void synchroniser()}
            enCours={enCours}
            desactive={nbEnAttente === 0 && !enCours}
          />
        </Carte>

        {rejetes.length > 0 ? (
          <>
            <Text style={styles.titre}>Rejetés par le serveur ({rejetes.length})</Text>
            <Text style={styles.explication}>
              Ces enregistrements ont été refusés. Les signaler au superviseur :
              ils ne partiront pas d'eux-mêmes.
            </Text>
            {rejetes.map((element) => (
              <Carte key={element.id}>
                <Text style={styles.rejeteTable}>
                  {LIBELLE_TABLE[element.table_cible] ?? element.table_cible}
                </Text>
                <Text style={styles.rejeteDate}>
                  Saisi le {new Date(element.cree_le).toLocaleString('fr-FR')}
                </Text>
                <Text style={styles.rejeteErreur}>{element.derniere_erreur}</Text>
              </Carte>
            ))}
          </>
        ) : null}

        <Text style={styles.titre}>Terminal</Text>
        <Carte>
          <Ligne libelle="Agent" valeur={utilisateur?.nom_complet ?? '—'} />
          <Ligne libelle="Identifiant terminal" valeur={terminalId} />
          <Ligne libelle="Réseau" valeur={reseau ? 'disponible' : 'absent'} />
        </Carte>

        <Bouton titre="Se déconnecter" variante="danger" onPress={deconnecter} />
      </ScrollView>
    </View>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneLibelle}>{libelle}</Text>
      <Text style={styles.ligneValeur}>{valeur}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espacement.m, paddingBottom: espacement.xl },
  chiffre: {
    fontSize: 56,
    fontWeight: '900',
    color: couleurs.primaire,
    textAlign: 'center',
  },
  legende: {
    fontSize: 16,
    color: couleurs.texteFaible,
    textAlign: 'center',
    marginBottom: espacement.m,
  },
  horsLigne: {
    fontSize: 14,
    color: couleurs.alerte,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: espacement.s,
  },
  titre: {
    fontSize: 17,
    fontWeight: '700',
    color: couleurs.texte,
    marginTop: espacement.l,
    marginBottom: espacement.xs,
  },
  explication: {
    fontSize: 13,
    color: couleurs.texteFaible,
    marginBottom: espacement.m,
    lineHeight: 19,
  },
  rejeteTable: { fontSize: 17, fontWeight: '700', color: couleurs.erreur },
  rejeteDate: { fontSize: 13, color: couleurs.texteFaible, marginTop: 2 },
  rejeteErreur: { fontSize: 14, color: couleurs.texte, marginTop: espacement.s },
  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espacement.s,
  },
  ligneLibelle: { fontSize: 15, color: couleurs.texteFaible },
  ligneValeur: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
});
