/** CP09 — Ventes (ch. 10.2).
 *
 *  Une vente peut être rattachée à une pesée au pont-bascule : c'est ce
 *  rattachement qui permet de confronter le tonnage facturé au tonnage
 *  effectivement pesé.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import {
  Bouton, Carte, Champ, Chargement, Encart, Manques, StatutPastille, Vide, dateCourte, jourCourt,
} from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import { nombreOuNull, texteOuNull, useEcriture } from '@/utils/mutations';
import { useSites } from '@/utils/requetes';

const VIDE = {
  site_id: '',
  date_vente: new Date().toISOString().slice(0, 10),
  client: '',
  produit_id: '',
  quantite_t: '',
  montant: '',
  pesee_id: '',
  numero_facture: '',
  commentaire: '',
};

export default function EcranVentes() {
  const sites = useSites();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [filtreSite, setFiltreSite] = useState('');

  const produits = useQuery({
    queryKey: ['produits'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/referentiels/produits');
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const ventes = useQuery({
    queryKey: ['ventes', filtreSite],
    queryFn: async () => {
      const query: Record<string, string | number> = { limite: 200 };
      if (filtreSite) query.site_id = Number(filtreSite);
      const { data, error } = await api.GET('/api/v1/expedition/ventes', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
  });

  // Pesées du site choisi, pour proposer un rattachement pertinent.
  const pesees = useQuery({
    enabled: modaleOuverte && formulaire.site_id !== '',
    queryKey: ['pesees', formulaire.site_id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/expedition/pesees', {
        params: { query: { site_id: Number(formulaire.site_id), limite: 100 } as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data!.elements;
    },
  });

  const creation = useEcriture({
    cles: ['ventes'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/expedition/ventes', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: () => 'Vente enregistrée.',
    onSucces: () => {
      setFormulaire(VIDE);
      setModaleOuverte(false);
    },
  });

  const nomProduit = (id: string | null | undefined) =>
    produits.data?.find((p) => p.id === id)?.libelle ?? '—';

  const peseeChoisie = useMemo(
    () => pesees.data?.find((p) => p.id === formulaire.pesee_id),
    [pesees.data, formulaire.pesee_id],
  );

  const manques: string[] = [];
  if (formulaire.site_id === '') manques.push('site');
  if (formulaire.date_vente === '') manques.push('date de vente');

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Ventes</h1>
          <p>
            Chargement client, expédition et facturation. Rattacher la pesée
            correspondante permet de confronter le tonnage facturé au tonnage
            réellement pesé au pont-bascule.
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
            <strong>{ventes.data?.total ?? 0}</strong> vente
            {(ventes.data?.total ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton onClick={() => setModaleOuverte(true)}>Saisir une vente</Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {ventes.isPending ? (
          <Chargement />
        ) : ventes.isError ? (
          <Encart ton="erreur">{(ventes.error as Error).message}</Encart>
        ) : ventes.data.elements.length === 0 ? (
          <Vide texte="Aucune vente enregistrée." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site</th>
                  <th>Client</th>
                  <th>Produit</th>
                  <th className="num">Quantité</th>
                  <th className="num">Montant</th>
                  <th>Pesée</th>
                  <th>Facture</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {ventes.data.elements.map((v) => (
                  <tr key={v.id}>
                    <td>{jourCourt(v.date_vente)}</td>
                    <td>{sites.data?.find((s) => s.id === v.site_id)?.code ?? v.site_id}</td>
                    <td>{v.client ?? '—'}</td>
                    <td>{nomProduit(v.produit_id)}</td>
                    <td className="num">{v.quantite_t ? `${v.quantite_t} t` : '—'}</td>
                    <td className="num">
                      {v.montant ? `${Number(v.montant).toLocaleString('fr-FR')} ${v.devise}` : '—'}
                    </td>
                    <td>{v.pesee_id ? 'rattachée' : <span className="manque">aucune</span>}</td>
                    <td className="mono">{v.numero_facture ?? '—'}</td>
                    <td><StatutPastille statut={v.statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <Modale
        titre="Saisir une vente"
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
                  site_id: Number(formulaire.site_id),
                  date_vente: formulaire.date_vente,
                  client: texteOuNull(formulaire.client),
                  produit_id: texteOuNull(formulaire.produit_id),
                  quantite_t: nombreOuNull(formulaire.quantite_t),
                  montant: nombreOuNull(formulaire.montant),
                  pesee_id: texteOuNull(formulaire.pesee_id),
                  numero_facture: texteOuNull(formulaire.numero_facture),
                  commentaire: texteOuNull(formulaire.commentaire),
                  source_collecte: 'saisie_directe',
                })
              }
            >
              {creation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
          </>
        }
      >
        {peseeChoisie?.poids_t && formulaire.quantite_t &&
          Math.abs(Number(peseeChoisie.poids_t) - Number(formulaire.quantite_t)) > 0.5 && (
            <Encart ton="alerte">
              La quantité facturée ({formulaire.quantite_t} t) s'écarte du poids pesé
              ({peseeChoisie.poids_t} t). Vérifier avant d'enregistrer.
            </Encart>
          )}
        <div className="grille-champs">
          <Champ libelle="Site *">
            <select
              value={formulaire.site_id}
              onChange={(e) =>
                setFormulaire({ ...formulaire, site_id: e.target.value, pesee_id: '' })
              }
            >
              <option value="">Choisir…</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Date de la vente *">
            <input
              type="date"
              value={formulaire.date_vente}
              onChange={(e) => setFormulaire({ ...formulaire, date_vente: e.target.value })}
            />
          </Champ>
          <Champ libelle="Client">
            <input
              value={formulaire.client}
              onChange={(e) => setFormulaire({ ...formulaire, client: e.target.value })}
            />
          </Champ>
          <Champ libelle="Produit">
            <select
              value={formulaire.produit_id}
              onChange={(e) => setFormulaire({ ...formulaire, produit_id: e.target.value })}
            >
              <option value="">Aucun</option>
              {produits.data?.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Quantité (t)">
            <input
              type="number"
              step="0.001"
              min="0"
              value={formulaire.quantite_t}
              onChange={(e) => setFormulaire({ ...formulaire, quantite_t: e.target.value })}
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
          <Champ
            libelle="Pesée rattachée"
            aide={
              formulaire.site_id
                ? 'Pesées récentes du site.'
                : 'Choisir d’abord un site.'
            }
          >
            <select
              value={formulaire.pesee_id}
              onChange={(e) => setFormulaire({ ...formulaire, pesee_id: e.target.value })}
              disabled={!formulaire.site_id}
            >
              <option value="">Aucune</option>
              {pesees.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {dateCourte(p.horodatage)} — {p.immatriculation ?? '?'} — {p.poids_t ?? '?'} t
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Numéro de facture">
            <input
              value={formulaire.numero_facture}
              onChange={(e) => setFormulaire({ ...formulaire, numero_facture: e.target.value })}
            />
          </Champ>
        </div>
      </Modale>
    </>
  );
}
