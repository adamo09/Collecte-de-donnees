/** Session de l'utilisateur du back-office. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, EVENEMENT_SESSION_PERDUE, jetons, messageErreur } from '@/api/client';
import type { components } from '@/api/schema';

export type Utilisateur = components['schemas']['UtilisateurSortie'];
export type Role = Utilisateur['role'];

interface ValeurSession {
  pret: boolean;
  utilisateur: Utilisateur | null;
  seConnecter: (login: string, motDePasse: string) => Promise<void>;
  seDeconnecter: () => void;
  /** Le contrôleur consolide les quatre sites ; les autres rôles sont
   *  cantonnés au leur. */
  voitTousLesSites: boolean;
  peutValider: boolean;
  peutExporter: boolean;
}

const Contexte = createContext<ValeurSession | null>(null);

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [pret, setPret] = useState(false);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);

  const charger = useCallback(async () => {
    if (!jetons.acces()) {
      setUtilisateur(null);
      return;
    }
    const { data } = await api.GET('/api/v1/auth/moi');
    setUtilisateur(data ?? null);
  }, []);

  useEffect(() => {
    void charger().finally(() => setPret(true));
  }, [charger]);

  // Le client HTTP signale une session définitivement perdue : on revient à
  // l'écran de connexion au lieu de laisser des écrans vides.
  useEffect(() => {
    const surPerte = () => setUtilisateur(null);
    window.addEventListener(EVENEMENT_SESSION_PERDUE, surPerte);
    return () => window.removeEventListener(EVENEMENT_SESSION_PERDUE, surPerte);
  }, []);

  const seConnecter = useCallback(
    async (login: string, mot_de_passe: string) => {
      const { data, error } = await api.POST('/api/v1/auth/connexion-json', {
        body: { login, mot_de_passe },
      });
      if (error || !data) {
        throw new Error(messageErreur(error, 'Connexion refusée.'));
      }
      jetons.enregistrer(data.access_token, data.refresh_token);
      await charger();
    },
    [charger],
  );

  const seDeconnecter = useCallback(() => {
    jetons.effacer();
    setUtilisateur(null);
  }, []);

  const valeur = useMemo<ValeurSession>(() => {
    const role = utilisateur?.role;
    return {
      pret,
      utilisateur,
      seConnecter,
      seDeconnecter,
      voitTousLesSites: role === 'controleur' || role === 'admin',
      peutValider: role === 'superviseur' || role === 'controleur' || role === 'admin',
      peutExporter: role === 'superviseur' || role === 'controleur' || role === 'admin',
    };
  }, [pret, utilisateur, seConnecter, seDeconnecter]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): ValeurSession {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error('useSession doit être utilisé dans un FournisseurSession.');
  return valeur;
}
