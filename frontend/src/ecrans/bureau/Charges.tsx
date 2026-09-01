/** Charges engin — administratives et de fonctionnement (ch. 11.1).
 *
 *  Cette table ne porte aucune règle de calcul : le système enregistre des
 *  montants, il ne les impute pas. La période couverte permet au
 *  gestionnaire d'étaler une assurance annuelle sur les mois concernés
 *  plutôt que sur le seul mois de son paiement.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import {
  Bouton, Carte, Champ, Chargement, Encart, Manques, StatutPastille, Vide, jourCourt,
} from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import type { components } from '@/api/schema';
import { nombreOuNull, texteOuNull, useEcriture } from '@/utils/mutations';
import { useEngins } from '@/utils/requetes';

type Nature = components['schemas']['NatureCharge'];

const CATEGORIES = [
  'assurance', 'vignette', 'stationnement', 'taxe', 'carburant', 'maintenance',
  'pieces', 'consommables', 'pneumatiques', 'lubrifiants', 'energie', 'autre',
];

const VIDE = {
  engin_id: '',
  nature: 'fonctionnement' as Nature,
  categorie: 'carburant',
  date_charge: new Date().toISOString().slice(0, 10),
  montant: '',
  periode_debut: '',
  periode_fin: '',
  reference_document: '',
  commentaire: '',
};

export default function EcranCharges() {
  const engins = useEngins();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [filtreEngin, setFiltreEngin] = useState('');
  const [filtreNature, setFiltreNature] = useState('');

  const charges = useQuery({
    queryKey: ['charges', filtreEngin, filtreNature],
    queryFn: async () => {
      const query: Record<string, string | number> = { limite: 200 };
      if (filtreEngin) query.engin_id = filtreEngin;
      if (filtreNature) query.nature = filtreNature;
      const { data, error } = await api.GET('/api/v1/parc/charges', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
  });

  const creation = useEcriture({
    cles: ['charges'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/parc/charges', { body: corps as never });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: () => 'Charge enregistrée. Elle attend le contrôle avant de partir à l’export.',
    onSucces: () => {
      setFormulaire({ ...VIDE, engin_id: formulaire.engin_id });
      setModaleOuverte(false);
    },
  });

  const nomEngin = (id: string) =>
    engins.data?.find((e) => e.id === id)?.numero_parc ?? id.slice(0, 8);

  const periodeIncomplete =
    Boolean(formulaire.periode_debut) !== Boolean(formulaire.periode_fin);
  const manques: string[] = [];
  if (formulaire.engin_id === '') manques.push('engin');
  if (formulaire.categorie === '') manques.push('catégorie');
  if (periodeIncomplete) manques.push('période (les deux bornes ou aucune)');

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Charges engin</h1>
          <p>
            Assurances, vignettes, carburant, maintenance, pneumatiques. Le
            système enregistre des montants, il ne les impute pas : c'est le
            gestionnaire externe qui construit les coûts.
          </p>
        </div>
      </header>

      {creation.retour && <Encart ton={creation.retour.ton}>{creation.retour.texte}</Encart>}

      <Carte>
        <div className="filtres">
          <Champ libelle="Engin">
            <select value={filtreEngin} onChange={(e) => setFiltreEngin(e.target.value)}>
              <option value="">Tous les engins</option>
              {engins.data?.map((e) => (
                <option key={e.id} value={e.id}>{e.numero_parc}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Nature">
            <select value={filtreNature} onChange={(e) => setFiltreNature(e.target.value)}>
              <option value="">Toutes</option>
              <option value="administrative">Administrative</option>
              <option value="fonctionnement">Fonctionnement</option>
            </select>
          </Champ>
          <div className="filtres__compteur">
            <strong>{charges.data?.total ?? 0}</strong> charge
            {(charges.data?.total ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton onClick={() => setModaleOuverte(true)}>Saisir une charge</Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {charges.isPending ? (
          <Chargement />
        ) : charges.isError ? (
          <Encart ton="erreur">{(charges.error as Error).message}</Encart>
        ) : charges.data.elements.length === 0 ? (
          <Vide texte="Aucune charge enregistrée pour ce filtre." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Engin</th>
                  <th>Nature</th>
                  <th>Catégorie</th>
                  <th className="num">Montant</th>
                  <th>Période couverte</th>
                  <th>Document</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {charges.data.elements.map((c) => (
                  <tr key={c.id}>
                    <td>{jourCourt(c.date_charge)}</td>
                    <td className="mono">{nomEngin(c.engin_id)}</td>
                    <td>{c.nature}</td>
                    <td>{c.categorie}</td>
                    <td className="num">
                      {c.montant ? `${Number(c.montant).toLocaleString('fr-FR')} ${c.devise}` : '—'}
                    </td>
                    <td>
                      {c.periode_debut && c.periode_fin
                        ? `${jourCourt(c.periode_debut)} → ${jourCourt(c.periode_fin)}`
                        : '—'}
                    </td>
                    <td>{c.reference_document ?? '—'}</td>
                    <td><StatutPastille statut={c.statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <Modale
        titre="Saisir une charge"
        aide="Pour une charge annuelle, renseigner la période couverte : c'est elle qui permet de l'étaler."
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
                  engin_id: formulaire.engin_id,
                  nature: formulaire.nature,
                  categorie: formulaire.categorie,
                  date_charge: formulaire.date_charge,
                  montant: nombreOuNull(formulaire.montant),
                  periode_debut: texteOuNull(formulaire.periode_debut),
                  periode_fin: texteOuNull(formulaire.periode_fin),
                  reference_document: texteOuNull(formulaire.reference_document),
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
        {periodeIncomplete && (
          <Encart ton="alerte">
            La période doit être renseignée entièrement ou pas du tout.
          </Encart>
        )}
        <div className="grille-champs">
          <Champ libelle="Engin *">
            <select
              value={formulaire.engin_id}
              onChange={(e) => setFormulaire({ ...formulaire, engin_id: e.target.value })}
            >
              <option value="">Choisir…</option>
              {engins.data?.map((e) => (
                <option key={e.id} value={e.id}>{e.numero_parc} — {e.famille}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Nature *">
            <select
              value={formulaire.nature}
              onChange={(e) =>
                setFormulaire({ ...formulaire, nature: e.target.value as Nature })
              }
            >
              <option value="fonctionnement">Fonctionnement</option>
              <option value="administrative">Administrative</option>
            </select>
          </Champ>
          <Champ libelle="Catégorie *">
            <select
              value={formulaire.categorie}
              onChange={(e) => setFormulaire({ ...formulaire, categorie: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Champ>
          <Champ libelle="Date de la charge *">
            <input
              type="date"
              value={formulaire.date_charge}
              onChange={(e) => setFormulaire({ ...formulaire, date_charge: e.target.value })}
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
          <Champ libelle="Référence du document">
            <input
              value={formulaire.reference_document}
              onChange={(e) =>
                setFormulaire({ ...formulaire, reference_document: e.target.value })
              }
              placeholder="Facture n° …"
            />
          </Champ>
          <Champ libelle="Période couverte — début">
            <input
              type="date"
              value={formulaire.periode_debut}
              onChange={(e) => setFormulaire({ ...formulaire, periode_debut: e.target.value })}
            />
          </Champ>
          <Champ libelle="Période couverte — fin">
            <input
              type="date"
              value={formulaire.periode_fin}
              onChange={(e) => setFormulaire({ ...formulaire, periode_fin: e.target.value })}
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
