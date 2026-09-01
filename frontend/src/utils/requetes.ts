/** Requêtes partagées entre plusieurs écrans. */

import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import type { components } from '@/api/schema';

type Site = components['schemas']['SiteSortie'];

/** Les sites changent une fois par an : inutile de les recharger à chaque
 *  navigation. */
export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Site[]> => {
      const { data, error } = await api.GET('/api/v1/referentiels/sites');
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });
}
