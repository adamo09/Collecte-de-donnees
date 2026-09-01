/** CP02 — Prestations de minage (ch. 7).
 *
 *  Quelques dizaines de factures par an. Fiabiliser un moteur OCR pour ce
 *  volume serait un mauvais investissement : la saisie manuelle avec photo
 *  jointe prend cinq minutes et ne présente aucun risque d'extraction
 *  erronée. C'est un choix documenté, pas un manque.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import {
  Bouton, Carte, Champ, Chargement, Encart, Manques, StatutPastille, Vide, jourCourt,
} from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import { nombreOuNull, texteOuNull, useEcriture } from '@/utils/mutations';
import { useSites } from '@/utils/requetes';

function nouvelIdentifiant(): string {
  return crypto.randomUUID();
}

const VIDE = {
  site_id: '',
  tir_id: '',
  date_prestation: new Date().toISOString().slice(0, 10),
  prestataire: '',
  numero_facture: '',
  montant: '',
  mode_reception: 'papier',
  piece_jointe_url: '',
  commentaire: '',
};

export default function EcranMinage() {
  const sites = useSites();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [filtreSite, setFiltreSite] = useState('');

  const tirs = useQuery({
    queryKey: ['tirs', filtreSite],
    queryFn: async () => {
      const query: Record<string, string | number> = { limite: 100 };
      if (formulaire.site_id) query.site_id = Number(formulaire.site_id);
      const { data, error } = await api.GET('/api/v1/referentiels/tirs', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const prestations = useQuery({
    queryKey: ['prestations-minage', filtreSite],
    queryFn: async () => {
      const query: Record<string, string | number> = { limite: 200 };
      if (filtreSite) query.site_id = Number(filtreSite);
      const { data, error } = await api.GET('/api/v1/minage/prestations', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
  });

  const creation = useEcriture({
    cles: ['prestations-minage'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/minage/prestations', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: () => 'Prestation enregistrée. Joindre la facture scannée si ce n’est pas fait.',
    onSucces: () => {
      setFormulaire(VIDE);
      setModaleOuverte(false);
    },
  });

  const manques: string[] = [];
  if (formulaire.site_id === '') manques.push('site');
  if (formulaire.date_prestation === '') manques.push('date de prestation');

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Prestations de minage</h1>
          <p>
            Le minage est réalisé par un prestataire externe. Le système se
            limite à la traçabilité du document et au rattachement du coût au
            tir concerné — le tir est la référence commune avec la foration.
          </p>
        </div>
      </header>

      {creation.retour && <Encart ton={creation.retour.ton}>{creation.retour.texte}</Encart>}

      <Carte>
        <div className="filtres">
          <Champ libelle="Site">
            <select value={filtreSite} onChange={(e) => setFiltreSite(e.target.value)}>
              <option value="">Tous les sites</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <div className="filtres__compteur">
            <strong>{prestations.data?.total ?? 0}</strong> prestation
            {(prestations.data?.total ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton onClick={() => setModaleOuverte(true)}>Saisir une prestation</Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {prestations.isPending ? (
          <Chargement />
        ) : prestations.isError ? (
          <Encart ton="erreur">{(prestations.error as Error).message}</Encart>
        ) : prestations.data.elements.length === 0 ? (
          <Vide texte="Aucune prestation de minage enregistrée." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site</th>
                  <th>Prestataire</th>
                  <th>N° de facture</th>
                  <th className="num">Montant</th>
                  <th>Réception</th>
                  <th>Justificatif</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {prestations.data.elements.map((p) => (
                  <tr key={p.id}>
                    <td>{jourCourt(p.date_prestation)}</td>
                    <td>{sites.data?.find((s) => s.id === p.site_id)?.code ?? p.site_id}</td>
                    <td>{p.prestataire ?? '—'}</td>
                    <td className="mono">{p.numero_facture ?? '—'}</td>
                    <td className="num">
                      {p.montant ? `${Number(p.montant).toLocaleString('fr-FR')} ${p.devise}` : '—'}
                    </td>
                    <td>{p.mode_reception ?? '—'}</td>
                    <td>
                      {p.piece_jointe_url ? (
                        <a href={p.piece_jointe_url} target="_blank" rel="noreferrer">Voir</a>
                      ) : (
                        <span className="manque">absent</span>
                      )}
                    </td>
                    <td><StatutPastille statut={p.statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <Modale
        titre="Saisir une prestation de minage"
        aide="Cinq minutes par facture, sans risque d'erreur d'extraction — d'où le choix de ne pas recourir à l'OCR en V1."
        ouverte={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        largeur={620}
        actions={
          <>
            <Manques manques={manques} />
            <Bouton variante="secondaire" onClick={() => setModaleOuverte(false)}>Annuler</Bouton>
            <Bouton
              disabled={manques.length > 0 || creation.isPending}
              onClick={() =>
                creation.mutate({
                  id: nouvelIdentifiant(),
                  site_id: Number(formulaire.site_id),
                  tir_id: texteOuNull(formulaire.tir_id),
                  date_prestation: formulaire.date_prestation,
                  prestataire: texteOuNull(formulaire.prestataire),
                  numero_facture: texteOuNull(formulaire.numero_facture),
                  montant: nombreOuNull(formulaire.montant),
                  mode_reception: formulaire.mode_reception,
                  piece_jointe_url: texteOuNull(formulaire.piece_jointe_url),
                  commentaire: texteOuNull(formulaire.commentaire),
                  source_collecte: 'saisie_directe',
                  engins_mobilises: [],
                })
              }
            >
              {creation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
          </>
        }
      >
        <div className="grille-champs">
          <Champ libelle="Site *">
            <select
              value={formulaire.site_id}
              onChange={(e) => setFormulaire({ ...formulaire, site_id: e.target.value, tir_id: '' })}
            >
              <option value="">Choisir…</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Tir concerné" aide="Référence commune avec la foration.">
            <select
              value={formulaire.tir_id}
              onChange={(e) => setFormulaire({ ...formulaire, tir_id: e.target.value })}
            >
              <option value="">Aucun</option>
              {tirs.data
                ?.filter((t) => !formulaire.site_id || t.site_id === Number(formulaire.site_id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.numero_t}{t.date_tir ? ` — ${jourCourt(t.date_tir)}` : ''}
                  </option>
                ))}
            </select>
          </Champ>
          <Champ libelle="Date de la prestation *">
            <input
              type="date"
              value={formulaire.date_prestation}
              onChange={(e) => setFormulaire({ ...formulaire, date_prestation: e.target.value })}
            />
          </Champ>
          <Champ libelle="Prestataire">
            <input
              value={formulaire.prestataire}
              onChange={(e) => setFormulaire({ ...formulaire, prestataire: e.target.value })}
            />
          </Champ>
          <Champ libelle="Numéro de facture">
            <input
              value={formulaire.numero_facture}
              onChange={(e) => setFormulaire({ ...formulaire, numero_facture: e.target.value })}
            />
          </Champ>
          <Champ libelle="Montant (XOF)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={formulaire.montant}
              onChange={(e) => setFormulaire({ ...formulaire, montant: e.target.value })}
            />
          </Champ>
          <Champ libelle="Mode de réception">
            <select
              value={formulaire.mode_reception}
              onChange={(e) => setFormulaire({ ...formulaire, mode_reception: e.target.value })}
            >
              <option value="papier">Document papier</option>
              <option value="pdf">PDF</option>
              <option value="excel">Fichier Excel</option>
            </select>
          </Champ>
          <Champ
            libelle="Justificatif"
            aide="Adresse de la photo ou du scan de la facture."
          >
            <input
              value={formulaire.piece_jointe_url}
              onChange={(e) =>
                setFormulaire({ ...formulaire, piece_jointe_url: e.target.value })
              }
              placeholder="https://…"
            />
          </Champ>
          <Champ libelle="Commentaire">
            <input
              value={formulaire.commentaire}
              onChange={(e) => setFormulaire({ ...formulaire, commentaire: e.target.value })}
            />
          </Champ>
        </div>
      </Modale>
    </>
  );
}
