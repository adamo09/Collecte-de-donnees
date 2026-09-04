/**
 * Complétude de la collecte — l'indicateur de pilotage du déploiement.
 *
 * « Un système parfaitement conçu mais alimenté à 40 % produit des données
 * inutilisables. » Le suivi quotidien, dès le premier jour du pilote, est ce
 * qui permet de détecter une équipe qui a cessé de déclarer avant que trois
 * semaines de données soient perdues.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import { Carte, Champ, Chargement, Encart, Vide, jourCourt } from '@/composants/Communs';
import { useSites } from '@/utils/requetes';
import './Completude.css';

type LigneCompletude = Record<string, string | number | null>;

const nombre = (valeur: unknown) => (typeof valeur === 'number' ? valeur : 0);

export default function EcranCompletude() {
  const sites = useSites();
  const [site, setSite] = useState('');
  // Sept jours par défaut : c'est hier et avant-hier qu'on regarde. Trente
  // jours d'historique antérieur au pilote noieraient le signal.
  const [jours, setJours] = useState('7');

  const completude = useQuery({
    queryKey: ['completude', site],
    queryFn: async () => {
      const query: Record<string, string | number> = { limite: 400 };
      if (site) query.site = site;
      const { data, error } = await api.GET('/api/v1/exports/{nom_export}', {
        params: { path: { nom_export: 'completude' }, query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data as { tronque: boolean; lignes: LigneCompletude[] };
    },
  });

  const lignes = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() - Number(jours));
    return [...(completude.data?.lignes ?? [])]
      .filter((l) => new Date(String(l.jour)) >= limite)
      .sort((a, b) => String(b.jour).localeCompare(String(a.jour)));
  }, [completude.data, jours]);

  // L'export de complétude ne pagine pas : au plafond, ce sont les jours
  // les plus anciens qui manquent. Le taire laisserait croire à un site
  // resté muet, alors qu'il n'a simplement pas été chargé.
  const tronque = completude.data?.tronque ?? false;

  /** Un jour n'est « muet » que si le site avait des engins censés déclarer.
   *  Un site dont le parc n'est pas encore inventorié n'est pas en défaut :
   *  le signaler en rouge viderait l'alerte de son sens. */
  const estMuet = (ligne: LigneCompletude) =>
    nombre(ligne.engins_sans_declaration) > 0 &&
    nombre(ligne.trous_declares) === 0 &&
    nombre(ligne.rotations_declarees) === 0 &&
    nombre(ligne.evenements_engins_declares) === 0;

  const muets = lignes.filter(estMuet);
  const sansParc = lignes.filter(
    (l) => nombre(l.engins_sans_declaration) === 0 && nombre(l.trous_declares) === 0,
  ).length;

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Complétude de la collecte</h1>
          <p>
            Qui déclare, qui ne déclare pas. Un jour est signalé lorsque le site
            disposait d'engins actifs et qu'aucun d'eux n'a rien déclaré — pas
            lorsque son parc n'est pas encore inventorié.
          </p>
        </div>
      </header>

      {tronque && (
        <Encart ton="alerte">
          L'historique est tronqué : les jours les plus anciens ne sont pas
          chargés. Filtrer sur un site pour voir sa période complète.
        </Encart>
      )}

      {muets.length > 0 && (
        <Encart ton="alerte">
          {muets.length} jour-site sans aucune déclaration alors que des engins y
          sont actifs. Appeler le référent des sites concernés :{' '}
          {[...new Set(muets.map((l) => String(l.site)))].join(', ')}.
        </Encart>
      )}

      <Carte>
        <div className="filtres">
          <Champ libelle="Site">
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="">Tous les sites</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.code}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Période">
            <select value={jours} onChange={(e) => setJours(e.target.value)}>
              <option value="7">7 derniers jours</option>
              <option value="14">14 derniers jours</option>
              <option value="30">30 derniers jours</option>
            </select>
          </Champ>
          <div className="filtres__compteur">
            <strong>{lignes.length}</strong> jour-site
            {sansParc > 0 && (
              <span className="filtres__maj"> · {sansParc} sans parc inventorié</span>
            )}
          </div>
        </div>
      </Carte>

      <Carte>
        {completude.isPending ? (
          <Chargement />
        ) : completude.isError ? (
          <Encart ton="erreur">{(completude.error as Error).message}</Encart>
        ) : lignes.length === 0 ? (
          <Vide texte="Aucune donnée sur la période." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau tableau--completude">
              <thead>
                <tr>
                  <th>Jour</th>
                  <th>Site</th>
                  <th className="num">Trous</th>
                  <th className="num">dont validés</th>
                  <th className="num">non clôturés</th>
                  <th className="num">Rotations</th>
                  <th className="num">Événements</th>
                  <th className="num">Engins muets</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne, index) => {
                  const muet = estMuet(ligne);
                  const nonClotures = nombre(ligne.trous_non_clotures);
                  return (
                    <tr
                      key={`${ligne.site}-${ligne.jour}-${index}`}
                      className={muet ? 'ligne--muette' : undefined}
                    >
                      <td>{jourCourt(String(ligne.jour))}</td>
                      <td>
                        {String(ligne.site)}
                        {muet && <span className="marque-muette" title="Aucune déclaration" />}
                      </td>
                      <td className="num">{nombre(ligne.trous_declares) || '—'}</td>
                      <td className="num">{nombre(ligne.trous_valides) || '—'}</td>
                      <td className="num">
                        {nonClotures > 0 ? (
                          <span className="alerte-nombre">{nonClotures}</span>
                        ) : '—'}
                      </td>
                      <td className="num">{nombre(ligne.rotations_declarees) || '—'}</td>
                      <td className="num">
                        {nombre(ligne.evenements_engins_declares) || '—'}
                      </td>
                      <td className="num">
                        {nombre(ligne.engins_sans_declaration) > 0
                          ? nombre(ligne.engins_sans_declaration)
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
