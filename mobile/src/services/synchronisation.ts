/**
 * Vidage de la file d'envoi vers le serveur.
 *
 * Le mécanisme repose entièrement sur l'idempotence garantie par l'API :
 * chaque enregistrement porte un UUID produit ici, et le lot lui-même porte
 * une clé d'idempotence. Une coupure au mauvais moment ne peut donc ni
 * dupliquer une rotation, ni en perdre une.
 */

import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';

import {
  cloturerLot,
  compterEnAttente,
  elementsDuLot,
  elementsEnAttente,
  lotEnSouffrance,
  marquerEnvoye,
  marquerRejete,
  purgerEnvoisAnciens,
  rattacherAuLot,
  type ElementFile,
} from '@/services/basedonnees';
import { ErreurApi, ErreurReseau, transmettreLot } from '@/services/api';
import { construireLot } from '@/services/lot';
import type { AccuseLot } from '@/types/modele';

/** Un lot trop gros échoue en bloc sur une connexion instable ; un lot trop
 *  petit multiplie les allers-retours. Cent enregistrements correspondent à
 *  une bonne demi-journée de rotations. */
const TAILLE_LOT = 100;

export interface ResultatSynchronisation {
  effectuee: boolean;
  raison?: 'hors_ligne' | 'file_vide';
  nbAcceptes: number;
  nbRejetes: number;
  nbDoublons: number;
  restants: number;
  erreur?: string;
}

export function nouvelIdentifiant(): string {
  return Crypto.randomUUID();
}

export async function enLigne(): Promise<boolean> {
  const etat = await Network.getNetworkStateAsync();
  return Boolean(etat.isConnected && etat.isInternetReachable !== false);
}

async function appliquerAccuse(accuse: AccuseLot, elements: ElementFile[]): Promise<void> {
  const parIdentifiant = new Map(accuse.details.map((d) => [d.id, d]));
  const acceptes: string[] = [];

  for (const element of elements) {
    const detail = parIdentifiant.get(element.id);
    if (!detail) {
      // Absent de l'accusé : on le laisse en attente plutôt que de le
      // considérer parti. Mieux vaut un doublon détecté par le serveur
      // qu'une donnée perdue.
      continue;
    }
    if (detail.accepte) {
      acceptes.push(element.id);
    } else {
      await marquerRejete(element.id, detail.erreur ?? 'Rejeté par le serveur.');
    }
  }
  await marquerEnvoye(acceptes);
  await cloturerLot(accuse.lot_id, accuse.resultat);
}

/**
 * Vide la file d'envoi. Sans réseau, l'appel n'a aucun effet et n'est pas
 * une erreur : c'est le fonctionnement normal en carrière.
 */
export async function synchroniser(terminalId: string): Promise<ResultatSynchronisation> {
  const vide = { nbAcceptes: 0, nbRejetes: 0, nbDoublons: 0 };

  if (!(await enLigne())) {
    return { effectuee: false, raison: 'hors_ligne', ...vide, restants: await compterEnAttente() };
  }

  // Un lot déjà constitué mais non acquitté est réexpédié tel quel, avec le
  // même identifiant : le serveur reconnaîtra un renvoi.
  const lotExistant = await lotEnSouffrance();
  const lotId = lotExistant ?? nouvelIdentifiant();
  const elements = lotExistant
    ? await elementsDuLot(lotExistant)
    : await elementsEnAttente(TAILLE_LOT);

  if (elements.length === 0) {
    return { effectuee: false, raison: 'file_vide', ...vide, restants: 0 };
  }

  if (!lotExistant) {
    await rattacherAuLot(lotId, elements.map((e) => e.id));
  }

  try {
    const accuse = await transmettreLot(construireLot(lotId, terminalId, elements));
    await appliquerAccuse(accuse, elements);
    await purgerEnvoisAnciens();

    return {
      effectuee: true,
      nbAcceptes: accuse.nb_acceptes,
      nbRejetes: accuse.nb_rejetes,
      nbDoublons: accuse.nb_doublons,
      restants: await compterEnAttente(),
    };
  } catch (erreur) {
    if (erreur instanceof ErreurReseau) {
      // Le lot reste rattaché : il repartira à l'identique au prochain essai.
      return {
        effectuee: false,
        raison: 'hors_ligne',
        ...vide,
        restants: await compterEnAttente(),
      };
    }
    if (erreur instanceof ErreurApi && erreur.statut === 413) {
      // Lot refusé pour sa taille : il sera redécoupé au prochain passage.
      for (const element of elements.slice(TAILLE_LOT / 2)) {
        await marquerRejete(element.id, 'Lot trop volumineux, à renvoyer séparément.');
      }
    }
    return {
      effectuee: false,
      ...vide,
      restants: await compterEnAttente(),
      erreur: erreur instanceof Error ? erreur.message : String(erreur),
    };
  }
}

/**
 * Vide la file en autant de lots que nécessaire.
 * S'arrête au premier échec pour ne pas s'acharner sur un réseau absent.
 */
export async function synchroniserTout(
  terminalId: string,
  maxLots = 20,
): Promise<ResultatSynchronisation> {
  let cumul: ResultatSynchronisation = {
    effectuee: false,
    nbAcceptes: 0,
    nbRejetes: 0,
    nbDoublons: 0,
    restants: await compterEnAttente(),
  };

  for (let i = 0; i < maxLots; i += 1) {
    const resultat = await synchroniser(terminalId);
    cumul = {
      ...resultat,
      effectuee: cumul.effectuee || resultat.effectuee,
      nbAcceptes: cumul.nbAcceptes + resultat.nbAcceptes,
      nbRejetes: cumul.nbRejetes + resultat.nbRejetes,
      nbDoublons: cumul.nbDoublons + resultat.nbDoublons,
    };
    if (!resultat.effectuee || resultat.restants === 0) break;
  }
  return cumul;
}
