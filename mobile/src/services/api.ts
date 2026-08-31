/**
 * Client HTTP de l'API CADERAC.
 *
 * Aucune fonction de ce module n'est appelée depuis un écran de saisie :
 * les écrans écrivent dans la file locale, et c'est le service de
 * synchronisation qui parle au serveur. Cette séparation est ce qui rend
 * l'application réellement utilisable hors connexion.
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import type { AccuseLot, Jetons, ParametragePoste, Utilisateur } from '@/types/modele';

const URL_API =
  (Constants.expoConfig?.extra?.urlApi as string | undefined) ??
  'http://10.0.2.2:8000/api/v1';

const CLE_ACCES = 'caderac.jeton_acces';
const CLE_RAFRAICHISSEMENT = 'caderac.jeton_rafraichissement';

/** Délai au-delà duquel une requête est abandonnée.
 *
 *  En carrière, une connexion très dégradée est pire qu'une absence de
 *  connexion : elle fait attendre l'agent sans jamais aboutir. */
const DELAI_MS = 20_000;

export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
    readonly corps?: unknown,
  ) {
    super(message);
    this.name = 'ErreurApi';
  }
}

export class ErreurReseau extends Error {
  constructor(message = "Serveur injoignable. Les données restent en file d'envoi.") {
    super(message);
    this.name = 'ErreurReseau';
  }
}

export async function enregistrerJetons(jetons: Jetons): Promise<void> {
  await SecureStore.setItemAsync(CLE_ACCES, jetons.access_token);
  await SecureStore.setItemAsync(CLE_RAFRAICHISSEMENT, jetons.refresh_token);
}

export async function effacerJetons(): Promise<void> {
  await SecureStore.deleteItemAsync(CLE_ACCES);
  await SecureStore.deleteItemAsync(CLE_RAFRAICHISSEMENT);
}

export async function jetonAcces(): Promise<string | null> {
  return SecureStore.getItemAsync(CLE_ACCES);
}

async function appeler<T>(
  chemin: string,
  options: RequestInit = {},
  reessayerApresRafraichissement = true,
): Promise<T> {
  const jeton = await jetonAcces();
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);

  let reponse: Response;
  try {
    reponse = await fetch(`${URL_API}${chemin}`, {
      ...options,
      signal: controleur.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ErreurReseau();
  } finally {
    clearTimeout(minuterie);
  }

  // Jeton d'accès expiré : on tente un renouvellement silencieux avant de
  // renvoyer l'agent vers l'écran de connexion.
  if (reponse.status === 401 && reessayerApresRafraichissement) {
    const renouvele = await rafraichir();
    if (renouvele) return appeler<T>(chemin, options, false);
  }

  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => null);
    const detail =
      (corps as { detail?: unknown } | null)?.detail ?? `Erreur HTTP ${reponse.status}`;
    throw new ErreurApi(
      typeof detail === 'string' ? detail : JSON.stringify(detail),
      reponse.status,
      corps,
    );
  }

  if (reponse.status === 204) return undefined as T;
  return (await reponse.json()) as T;
}

async function rafraichir(): Promise<boolean> {
  const jeton = await SecureStore.getItemAsync(CLE_RAFRAICHISSEMENT);
  if (!jeton) return false;
  try {
    const reponse = await fetch(`${URL_API}/auth/rafraichir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: jeton }),
    });
    if (!reponse.ok) return false;
    await enregistrerJetons((await reponse.json()) as Jetons);
    return true;
  } catch {
    return false;
  }
}

// --- Points d'entrée --------------------------------------------------

export async function connexion(login: string, motDePasse: string): Promise<Jetons> {
  const reponse = await fetch(`${URL_API}/auth/connexion-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, mot_de_passe: motDePasse }),
  }).catch(() => {
    throw new ErreurReseau('Connexion impossible : aucun réseau disponible.');
  });

  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { detail?: string } | null;
    throw new ErreurApi(corps?.detail ?? 'Connexion refusée.', reponse.status);
  }
  const jetons = (await reponse.json()) as Jetons;
  await enregistrerJetons(jetons);
  return jetons;
}

export const monCompte = () => appeler<Utilisateur>('/auth/moi');

export const parametragePoste = (siteId?: number) =>
  appeler<ParametragePoste>(
    `/synchronisation/parametrage${siteId ? `?site_id=${siteId}` : ''}`,
  );

export const versionsReferentiels = () =>
  appeler<{ versions: { nom_referentiel: string; version: number; maj_le: string }[] }>(
    '/synchronisation/versions',
  );

export const transmettreLot = (lot: Record<string, unknown>) =>
  appeler<AccuseLot>('/synchronisation/lots', {
    method: 'POST',
    body: JSON.stringify(lot),
  });

export const consulterLot = (lotId: string) =>
  appeler<AccuseLot>(`/synchronisation/lots/${lotId}`);
