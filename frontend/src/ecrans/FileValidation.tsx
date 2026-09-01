/**
 * File d'attente du contrôle — l'écran central du back-office.
 *
 * C'est ici que se joue la qualité de ce qui part au gestionnaire externe :
 * une donnée non contrôlée n'atteint jamais un export. L'écran est conçu
 * pour le balayage et l'action en masse, pas pour la consultation pièce
 * par pièce.
 */

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import {
  Bouton,
  Carte,
  Champ,
  Chargement,
  Encart,
  StatutPastille,
  Vide,
  dateCourte,
} from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import { useSites } from '@/utils/requetes';
import './FileValidation.css';

type Ligne = {
  table_cible: string;
  id: string;
  site_id: number;
  statut: string;
  saisi_le: string;
  recu_le: string;
  auteur_id: string;
};

const LIBELLE_TABLE: Record<string, string> = {
  trou_forage: 'Trou de forage',
  evenement_engin: 'Événement engin',
  rotation_dumper: 'Rotation dumper',
  evenement_equipement: 'Événement équipement',
  pesee_pont_bascule: 'Pesée pont-bascule',
  prestation_minage: 'Prestation de minage',
  sortie_piece: 'Sortie magasin',
  vente: 'Vente',
  charge_engin: 'Charge engin',
  affectation_reelle_engin: 'Affectation réelle',
  campagne_pesage: 'Campagne de pesage',
};

export default function EcranFileValidation() {
  const { utilisateur, voitTousLesSites } = useSession();
  const clientRequetes = useQueryClient();
  const sites = useSites();

  const [siteId, setSiteId] = useState<string>('');
  const [statut, setStatut] = useState<string>('');
  const [table, setTable] = useState<string>('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [motif, setMotif] = useState('');
  const [retour, setRetour] = useState<{ ton: 'succes' | 'erreur'; texte: string } | null>(null);

  const parametres = useMemo(() => {
    const p: Record<string, string | number> = { limite: 500 };
    if (siteId) p.site_id = Number(siteId);
    if (statut) p.statut = statut;
    if (table) p.table_cible = table;
    return p;
  }, [siteId, statut, table]);

  const file = useQuery({
    queryKey: ['file-validation', parametres],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/validation/file', {
        params: { query: parametres as never },
      });
      if (error) throw new Error(messageErreur(error));
      return (data ?? []) as Ligne[];
    },
  });

  const lignes = file.data ?? [];

  // Une action en lot ne porte que sur une seule table à la fois :
  // l'endpoint de validation groupée est typé par table.
  const tablesSelectionnees = useMemo(() => {
    const tables = new Set<string>();
    for (const ligne of lignes) if (selection.has(ligne.id)) tables.add(ligne.table_cible);
    return tables;
  }, [lignes, selection]);

  const tableUnique = tablesSelectionnees.size === 1 ? [...tablesSelectionnees][0]! : null;

  const changerStatut = useMutation({
    mutationFn: async ({ vers }: { vers: 'controlee' | 'validee' | 'rejetee' }) => {
      if (!tableUnique) throw new Error('Sélection portant sur plusieurs tables.');
      const { data, error } = await api.POST(
        '/api/v1/validation/{table_cible}/statut-lot',
        {
          params: { path: { table_cible: tableUnique } },
          body: {
            identifiants: [...selection],
            nouveau_statut: vers,
            motif: motif.trim() || null,
          },
        },
      );
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    onSuccess: (resultat) => {
      const refuses = resultat.nb_refuses;
      setRetour({
        ton: refuses > 0 ? 'erreur' : 'succes',
        texte:
          `${resultat.nb_appliques} enregistrement(s) traité(s)` +
          (refuses > 0
            ? ` — ${refuses} refusé(s) : ${
                resultat.details.find((d) => !d.applique)?.erreur ?? 'motif inconnu'
              }`
            : '.'),
      });
      setSelection(new Set());
      setMotif('');
      void clientRequetes.invalidateQueries({ queryKey: ['file-validation'] });
    },
    onError: (erreur: Error) => setRetour({ ton: 'erreur', texte: erreur.message }),
  });

  const basculer = useCallback((id: string) => {
    setSelection((precedente) => {
      const suivante = new Set(precedente);
      if (suivante.has(id)) suivante.delete(id);
      else suivante.add(id);
      return suivante;
    });
  }, []);

  const toutBasculer = useCallback(() => {
    setSelection((precedente) =>
      precedente.size === lignes.length ? new Set() : new Set(lignes.map((l) => l.id)),
    );
  }, [lignes]);

  const rejetSansMotif = !motif.trim();

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>File de validation</h1>
          <p>
            Tout ce qui reste à contrôler ou à valider, toutes tables confondues.
            Seules les données validées atteignent le gestionnaire externe.
          </p>
        </div>
      </header>

      {retour && <Encart ton={retour.ton}>{retour.texte}</Encart>}

      <Carte>
        <div className="filtres">
          <Champ libelle="Site">
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={!voitTousLesSites}
            >
              <option value="">
                {voitTousLesSites ? 'Tous les sites' : 'Mon site'}
              </option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>

          <Champ libelle="Statut">
            <select value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="">Brute et contrôlée</option>
              <option value="brute">Brute uniquement</option>
              <option value="controlee">Contrôlée uniquement</option>
            </select>
          </Champ>

          <Champ libelle="Type de donnée">
            <select value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">Toutes</option>
              {Object.entries(LIBELLE_TABLE).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>{libelle}</option>
              ))}
            </select>
          </Champ>

          <div className="filtres__compteur">
            <strong>{lignes.length}</strong> en attente
            {file.isFetching && <span className="filtres__maj"> · actualisation…</span>}
          </div>
        </div>
      </Carte>

      {selection.size > 0 && (
        <div className="barre-action" role="region" aria-label="Actions sur la sélection">
          <span className="barre-action__compte">
            {selection.size} sélectionné{selection.size > 1 ? 's' : ''}
          </span>

          {tableUnique ? (
            <>
              <input
                className="barre-action__motif"
                placeholder="Motif — obligatoire pour un rejet"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                aria-label="Motif"
              />
              <Bouton
                variante="secondaire"
                onClick={() => changerStatut.mutate({ vers: 'controlee' })}
                disabled={changerStatut.isPending}
              >
                Marquer contrôlées
              </Bouton>
              <Bouton
                onClick={() => changerStatut.mutate({ vers: 'validee' })}
                disabled={changerStatut.isPending || !utilisateur}
                titre="Réservé au contrôleur"
              >
                Valider
              </Bouton>
              <Bouton
                variante="danger"
                onClick={() => changerStatut.mutate({ vers: 'rejetee' })}
                disabled={changerStatut.isPending || rejetSansMotif}
                titre={rejetSansMotif ? 'Un rejet doit être motivé' : undefined}
              >
                Rejeter
              </Bouton>
            </>
          ) : (
            <span className="barre-action__avertissement">
              La sélection mêle {tablesSelectionnees.size} types de données.
              Filtrer sur un seul type pour agir en lot.
            </span>
          )}

          <Bouton variante="secondaire" onClick={() => setSelection(new Set())}>
            Annuler
          </Bouton>
        </div>
      )}

      <Carte>
        {file.isPending ? (
          <Chargement />
        ) : file.isError ? (
          <Encart ton="erreur">{(file.error as Error).message}</Encart>
        ) : lignes.length === 0 ? (
          // « Tout est traité » serait un mensonge sur une base encore vide :
          // les deux causes possibles sont énoncées.
          <Vide
            texte={
              siteId || statut || table
                ? 'Rien à contrôler pour ce filtre.'
                : "Rien à contrôler : soit tout est traité, soit aucune donnée " +
                  "n'a encore été synchronisée depuis les terminaux."
            }
          />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th className="colonne-case">
                    <input
                      type="checkbox"
                      checked={selection.size === lignes.length && lignes.length > 0}
                      onChange={toutBasculer}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Site</th>
                  <th>Saisi le terrain</th>
                  <th>Reçu au serveur</th>
                  <th>Identifiant</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr
                    key={ligne.id}
                    className={selection.has(ligne.id) ? 'selectionnee' : undefined}
                  >
                    <td className="colonne-case">
                      <input
                        type="checkbox"
                        checked={selection.has(ligne.id)}
                        onChange={() => basculer(ligne.id)}
                        aria-label={`Sélectionner ${ligne.id}`}
                      />
                    </td>
                    <td>{LIBELLE_TABLE[ligne.table_cible] ?? ligne.table_cible}</td>
                    <td><StatutPastille statut={ligne.statut} /></td>
                    <td>{sites.data?.find((s) => s.id === ligne.site_id)?.code ?? ligne.site_id}</td>
                    <td>{dateCourte(ligne.saisi_le)}</td>
                    <td>{dateCourte(ligne.recu_le)}</td>
                    <td className="mono">{ligne.id.slice(0, 8)}</td>
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
