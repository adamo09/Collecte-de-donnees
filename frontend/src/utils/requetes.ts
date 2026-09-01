/** Requêtes partagées entre plusieurs écrans. */

import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import type { components } from '@/api/schema';

type Site = components['schemas']['SiteSortie'];
type CentreDeCout = components['schemas']['CentreDeCoutSortie'];
type Engin = components['schemas']['EnginSortie'];

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


/** Les centres de coûts sont une nomenclature figée : CP01 à CP09. */
export function useCentresDeCout() {
  return useQuery({
    queryKey: ['centres-de-cout'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<CentreDeCout[]> => {
      const { data, error } = await api.GET('/api/v1/referentiels/centres-de-cout');
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });
}

/** Parc actif, pour les listes déroulantes des écrans de saisie. */
export function useEngins(siteId?: number) {
  return useQuery({
    queryKey: ['engins-actifs', siteId ?? null],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Engin[]> => {
      const query: Record<string, number> = {};
      if (siteId) query.site_id = siteId;
      const { data, error } = await api.GET('/api/v1/referentiels/engins', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });
}
