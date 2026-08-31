/** Session de l'agent : compte, référentiels locaux, état de la file. */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import * as api from '@/services/api';
import {
  compterEnAttente,
  compterRejetes,
  effacerTout,
  enregistrerReferentiel,
  lireReferentiel,
  ouvrirBase,
} from '@/services/basedonnees';
import { enLigne, synchroniserTout } from '@/services/synchronisation';
import type { ParametragePoste, Utilisateur } from '@/types/modele';

const CLE_TERMINAL = 'caderac.identifiant_terminal';

interface ValeurSession {
  pret: boolean;
  utilisateur: Utilisateur | null;
  parametrage: ParametragePoste | null;
  terminalId: string;
  connecte: boolean;
  reseau: boolean;
  nbEnAttente: number;
  nbRejetes: number;
  seConnecter: (login: string, motDePasse: string) => Promise<void>;
  seDeconnecter: () => Promise<void>;
  rafraichirParametrage: () => Promise<void>;
  rafraichirCompteurs: () => Promise<void>;
  lancerSynchronisation: () => Promise<{ acceptes: number; rejetes: number; restants: number }>;
}

const ContexteSession = createContext<ValeurSession | null>(null);

export function FournisseurSession({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [parametrage, setParametrage] = useState<ParametragePoste | null>(null);
  const [terminalId, setTerminalId] = useState('');
  const [reseau, setReseau] = useState(false);
  const [nbEnAttente, setNbEnAttente] = useState(0);
  const [nbRejetes, setNbRejetes] = useState(0);

  const rafraichirCompteurs = useCallback(async () => {
    setNbEnAttente(await compterEnAttente());
    setNbRejetes(await compterRejetes());
  }, []);

  /** Recharge les référentiels depuis le serveur, et retombe sur la copie
   *  locale s'il est injoignable : un agent hors réseau doit pouvoir
   *  travailler avec le référentiel de la veille. */
  const rafraichirParametrage = useCallback(async () => {
    try {
      const distant = await api.parametragePoste();
      setParametrage(distant);
      await enregistrerReferentiel('parametrage', Date.now(), distant);
    } catch {
      const local = await lireReferentiel<ParametragePoste>('parametrage');
      if (local) setParametrage(local);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await ouvrirBase();

      let identifiant = await SecureStore.getItemAsync(CLE_TERMINAL);
      if (!identifiant) {
        identifiant = `TERM-${Crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        await SecureStore.setItemAsync(CLE_TERMINAL, identifiant);
      }
      setTerminalId(identifiant);

      setReseau(await enLigne());
      await rafraichirCompteurs();

      if (await api.jetonAcces()) {
        try {
          setUtilisateur(await api.monCompte());
          await rafraichirParametrage();
        } catch {
          // Hors réseau au démarrage : la copie locale suffit à travailler.
          const local = await lireReferentiel<ParametragePoste>('parametrage');
          if (local) setParametrage(local);
        }
      }
      setPret(true);
    })();
  }, [rafraichirCompteurs, rafraichirParametrage]);

  // Sonde réseau régulière. La synchronisation n'est pas déclenchée
  // automatiquement : l'agent doit garder la maîtrise du moment où son
  // terminal consomme de la batterie et du forfait.
  useEffect(() => {
    const minuterie = setInterval(() => {
      void enLigne().then(setReseau);
    }, 15_000);
    return () => clearInterval(minuterie);
  }, []);

  const seConnecter = useCallback(
    async (login: string, motDePasse: string) => {
      await api.connexion(login, motDePasse);
      setUtilisateur(await api.monCompte());
      await rafraichirParametrage();
      await rafraichirCompteurs();
    },
    [rafraichirCompteurs, rafraichirParametrage],
  );

  const seDeconnecter = useCallback(async () => {
    // La file est purgée avec le reste : c'est pourquoi l'écran de
    // déconnexion avertit lorsqu'il reste des données non transmises.
    await api.effacerJetons();
    await effacerTout();
    setUtilisateur(null);
    setParametrage(null);
    await rafraichirCompteurs();
  }, [rafraichirCompteurs]);

  const lancerSynchronisation = useCallback(async () => {
    const resultat = await synchroniserTout(terminalId);
    await rafraichirCompteurs();
    return {
      acceptes: resultat.nbAcceptes,
      rejetes: resultat.nbRejetes,
      restants: resultat.restants,
    };
  }, [terminalId, rafraichirCompteurs]);

  const valeur = useMemo<ValeurSession>(
    () => ({
      pret,
      utilisateur,
      parametrage,
      terminalId,
      connecte: utilisateur !== null,
      reseau,
      nbEnAttente,
      nbRejetes,
      seConnecter,
      seDeconnecter,
      rafraichirParametrage,
      rafraichirCompteurs,
      lancerSynchronisation,
    }),
    [
      pret, utilisateur, parametrage, terminalId, reseau, nbEnAttente, nbRejetes,
      seConnecter, seDeconnecter, rafraichirParametrage, rafraichirCompteurs,
      lancerSynchronisation,
    ],
  );

  return <ContexteSession.Provider value={valeur}>{children}</ContexteSession.Provider>;
}

export function useSession(): ValeurSession {
  const valeur = useContext(ContexteSession);
  if (!valeur) {
    throw new Error('useSession doit être utilisé dans un FournisseurSession.');
  }
  return valeur;
}
