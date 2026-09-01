/**
 * Hook de mutation partagé.
 *
 * Toutes les écritures du back-office suivent la même trame : envoyer,
 * rafraîchir les listes concernées, afficher un retour lisible. Le
 * centraliser évite qu'un écran oublie d'invalider son cache et affiche
 * pendant une minute une donnée qu'il vient lui-même de modifier.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { messageErreur } from '@/api/client';

export interface Retour {
  ton: 'succes' | 'erreur';
  texte: string;
}

export function useEcriture<TArgs, TResultat>({
  action,
  cles,
  messageSucces,
  onSucces,
}: {
  action: (args: TArgs) => Promise<TResultat>;
  /** Clés de requête à rafraîchir après l'écriture. */
  cles: string[];
  messageSucces: (resultat: TResultat, args: TArgs) => string;
  onSucces?: (resultat: TResultat) => void;
}) {
  const clientRequetes = useQueryClient();
  const [retour, setRetour] = useState<Retour | null>(null);

  const mutation = useMutation({
    mutationFn: action,
    onSuccess: (resultat, args) => {
      setRetour({ ton: 'succes', texte: messageSucces(resultat, args) });
      for (const cle of cles) {
        void clientRequetes.invalidateQueries({ queryKey: [cle] });
      }
      onSucces?.(resultat);
    },
    onError: (erreur: unknown) =>
      setRetour({
        ton: 'erreur',
        texte: erreur instanceof Error ? erreur.message : messageErreur(erreur),
      }),
  });

  return { ...mutation, retour, setRetour };
}

/** Convertit une valeur de formulaire en nombre, ou en null si vide.
 *  Les champs numériques HTML rendent une chaîne, y compris vide. */
export function nombreOuNull(valeur: string): number | null {
  const nettoye = valeur.replace(',', '.').trim();
  if (nettoye === '') return null;
  const converti = Number(nettoye);
  return Number.isFinite(converti) ? converti : null;
}

/** Une chaîne vide n'est pas une valeur : l'API attend null. */
export function texteOuNull(valeur: string): string | null {
  const nettoye = valeur.trim();
  return nettoye === '' ? null : nettoye;
}
