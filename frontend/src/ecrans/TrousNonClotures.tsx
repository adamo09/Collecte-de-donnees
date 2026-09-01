/**
 * Trous restés ouverts — l'écran de contrôle quotidien du module foration.
 *
 * L'oubli du second scan est l'anomalie la plus probable de ce module :
 * l'opérateur oublie de clôturer, ou son terminal se décharge. Sans cet
 * écran, le trou reste ouvert indéfiniment et sa durée de foration n'est
 * jamais calculable.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import {
  Carte,
  Champ,
  Chargement,
  Encart,
  Pastille,
  Vide,
  dateCourte,
} from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import { useSites } from '@/utils/requetes';

export default function EcranTrousNonClotures() {
  const { voitTousLesSites } = useSession();
  const sites = useSites();
  const [siteId, setSiteId] = useState('');
  const [seuil, setSeuil] = useState('0');

  const trous = useQuery({
    queryKey: ['trous-non-clotures', siteId, seuil],
    queryFn: async () => {
      const query: Record<string, string | number> = { au_dela_de_heures: Number(seuil) || 0 };
      if (siteId) query.site_id = Number(siteId);
      const { data, error } = await api.GET('/api/v1/foration/trous/non-clotures', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const lignes = trous.data ?? [];
  const anciens = lignes.filter((l) => l.anciennete_heures >= 12).length;

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Trous non clôturés</h1>
          <p>
            Un trou reste ouvert tant que le second scan n'a pas été fait. Au-delà
            de douze heures, appeler le référent du site : ni la durée de foration
            ni l'utilisation de la foreuse ne sont calculables sans clôture.
          </p>
        </div>
      </header>

      {anciens > 0 && (
        <Encart ton="alerte">
          {anciens} trou{anciens > 1 ? 'x' : ''} ouvert{anciens > 1 ? 's' : ''} depuis
          plus de douze heures.
        </Encart>
      )}

      <Carte>
        <div className="filtres">
          <Champ libelle="Site">
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={!voitTousLesSites}
            >
              <option value="">{voitTousLesSites ? 'Tous les sites' : 'Mon site'}</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Ouverts depuis plus de" aide="En heures. 0 affiche tout.">
            <input
              type="number"
              min={0}
              step={1}
              value={seuil}
              onChange={(e) => setSeuil(e.target.value)}
            />
          </Champ>
          <div className="filtres__compteur">
            <strong>{lignes.length}</strong> trou{lignes.length > 1 ? 'x' : ''} ouvert
            {lignes.length > 1 ? 's' : ''}
          </div>
        </div>
      </Carte>

      <Carte>
        {trous.isPending ? (
          <Chargement />
        ) : trous.isError ? (
          <Encart ton="erreur">{(trous.error as Error).message}</Encart>
        ) : lignes.length === 0 ? (
          <Vide texte="Aucun trou en attente de clôture. Tous les seconds scans ont été faits." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Site</th>
                  <th>Foreuse</th>
                  <th>Opérateur</th>
                  <th>Ouvert depuis</th>
                  <th>Début du forage</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((trou) => (
                  <tr key={trou.id}>
                    <td className="mono">{trou.reference ?? '—'}</td>
                    <td>{trou.site}</td>
                    <td>{trou.foreuse}</td>
                    <td>{trou.operateur_matricule ?? '—'}</td>
                    <td className="num">
                      <Pastille ton={trou.anciennete_heures >= 12 ? 'erreur' : 'alerte'}>
                        {trou.anciennete_heures < 1
                          ? `${Math.round(trou.anciennete_heures * 60)} min`
                          : `${trou.anciennete_heures.toFixed(1)} h`}
                      </Pastille>
                    </td>
                    <td>{dateCourte(trou.heure_debut)}</td>
                    <td>{trou.statut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
