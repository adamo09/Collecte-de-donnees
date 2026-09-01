/**
 * Client HTTP typé, généré depuis le schéma OpenAPI du serveur.
 *
 * Les types de `schema.d.ts` sont produits par `npm run generer-client`.
 * L'intérêt n'est pas le confort de saisie : les vues d'export sont un
 * contrat figé avec le gestionnaire externe, et une colonne renommée côté
 * serveur doit casser la compilation du front — pas être découverte trois
 * semaines plus tard dans un fichier livré au client.
 */

import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from '@/api/schema';

const CLE_ACCES = 'caderac.jeton_acces';
const CLE_RAFRAICHISSEMENT = 'caderac.jeton_rafraichissement';

export const jetons = {
  acces: () => localStorage.getItem(CLE_ACCES),
  rafraichissement: () => localStorage.getItem(CLE_RAFRAICHISSEMENT),
  enregistrer(acces: string, rafraichissement: string) {
    localStorage.setItem(CLE_ACCES, acces);
    localStorage.setItem(CLE_RAFRAICHISSEMENT, rafraichissement);
  },
  effacer() {
    localStorage.removeItem(CLE_ACCES);
    localStorage.removeItem(CLE_RAFRAICHISSEMENT);
  },
};

/** Signalé lorsque la session est perdue : l'application retourne alors
 *  à l'écran de connexion, plutôt que d'afficher des écrans vides. */
export const EVENEMENT_SESSION_PERDUE = 'caderac:session-perdue';

let rafraichissementEnCours: Promise<boolean> | null = null;

async function rafraichir(): Promise<boolean> {
  const jeton = jetons.rafraichissement();
  if (!jeton) return false;
  try {
    const reponse = await fetch('/api/v1/auth/rafraichir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: jeton }),
    });
    if (!reponse.ok) return false;
    const corps = (await reponse.json()) as {
      access_token: string;
      refresh_token: string;
    };
    jetons.enregistrer(corps.access_token, corps.refresh_token);
    return true;
  } catch {
    return false;
  }
}

const authentification: Middleware = {
  onRequest({ request }) {
    const jeton = jetons.acces();
    if (jeton) request.headers.set('Authorization', `Bearer ${jeton}`);
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status !== 401) return response;

    // Un seul renouvellement à la fois : plusieurs écrans peuvent
    // s'apercevoir de l'expiration en même temps.
    rafraichissementEnCours ??= rafraichir().finally(() => {
      rafraichissementEnCours = null;
    });
    const renouvele = await rafraichissementEnCours;

    if (!renouvele) {
      jetons.effacer();
      window.dispatchEvent(new Event(EVENEMENT_SESSION_PERDUE));
      return response;
    }

    const rejeu = new Request(request);
    rejeu.headers.set('Authorization', `Bearer ${jetons.acces()}`);
    return fetch(rejeu);
  },
};

export const api = createClient<paths>({ baseUrl: '' });
api.use(authentification);

/** Rend lisible l'erreur renvoyée par l'API.
 *
 *  FastAPI répond soit un détail textuel, soit une liste d'erreurs de
 *  validation : l'utilisateur doit voir une phrase, pas un objet JSON. */
export function messageErreur(erreur: unknown, repli = 'Une erreur est survenue.'): string {
  if (!erreur || typeof erreur !== 'object') return repli;
  const detail = (erreur as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const lignes = detail
      .map((d) => {
        const champ = Array.isArray(d?.loc) ? d.loc.slice(1).join('.') : '';
        return champ ? `${champ} : ${d.msg}` : d.msg;
      })
      .filter(Boolean);
    if (lignes.length) return lignes.join(' · ');
  }
  return repli;
}
