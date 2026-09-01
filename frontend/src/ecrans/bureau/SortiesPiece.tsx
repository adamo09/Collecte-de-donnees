/** Sorties magasin (ch. 9.1).
 *
 *  La cible est un équipement OU un engin, jamais les deux. Le rattachement
 *  au niveau, à la ligne et au site n'est pas saisi : il se déduit de
 *  l'équipement concerné. Une seule information à fournir, aucune
 *  incohérence possible.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import {
  Bouton, Carte, Champ, Chargement, Encart, Manques, StatutPastille, Vide, jourCourt,
} from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import { nombreOuNull, texteOuNull, useEcriture } from '@/utils/mutations';
import { useEngins } from '@/utils/requetes';

function nouvelIdentifiant(): string {
  return crypto.randomUUID();
}

type Cible = 'equipement' | 'engin';

const VIDE = {
  cible: 'engin' as Cible,
  equipement_id: '',
  engin_id: '',
  date_sortie: new Date().toISOString().slice(0, 10),
  reference_piece: '',
  designation: '',
  quantite: '1',
  cout_unitaire: '',
  numero_bon: '',
  commentaire: '',
};

export default function EcranSortiesPiece() {
  const engins = useEngins();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [modaleOuverte, setModaleOuverte] = useState(false);

  const equipements = useQuery({
    queryKey: ['equipements'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/referentiels/equipements');
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const sorties = useQuery({
    queryKey: ['sorties-piece'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/concassage/sorties-piece', {
        params: { query: { limite: 200 } as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
  });

  const creation = useEcriture({
    cles: ['sorties-piece'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/concassage/sorties-piece', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: () => 'Sortie enregistrée.',
    onSucces: () => {
      setFormulaire(VIDE);
      setModaleOuverte(false);
    },
  });

  const nomCible = (
    equipementId: string | null | undefined,
    enginId: string | null | undefined,
  ) => {
    if (equipementId) {
      return equipements.data?.find((e) => e.id === equipementId)?.designation ?? 'équipement';
    }
    if (enginId) return engins.data?.find((e) => e.id === enginId)?.numero_parc ?? 'engin';
    return '—';
  };

  const cibleChoisie =
    formulaire.cible === 'engin' ? formulaire.engin_id : formulaire.equipement_id;
  const manques: string[] = [];
  if (cibleChoisie === '') manques.push(formulaire.cible === 'engin' ? 'engin' : 'équipement');
  if (formulaire.reference_piece.trim() === '') manques.push('référence de la pièce');
  if ((nombreOuNull(formulaire.quantite) ?? 0) <= 0) manques.push('quantité (supérieure à zéro)');

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Sorties magasin</h1>
          <p>
            Pièces de rechange et consommables. La sortie vise un équipement ou
            un engin, jamais les deux : le site, la ligne et le niveau s'en
            déduisent, il n'y a donc rien d'autre à saisir.
          </p>
        </div>
      </header>

      {creation.retour && <Encart ton={creation.retour.ton}>{creation.retour.texte}</Encart>}

      <Carte>
        <div className="filtres">
          <div className="filtres__compteur">
            <strong>{sorties.data?.total ?? 0}</strong> sortie
            {(sorties.data?.total ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton onClick={() => setModaleOuverte(true)}>Saisir une sortie</Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {sorties.isPending ? (
          <Chargement />
        ) : sorties.isError ? (
          <Encart ton="erreur">{(sorties.error as Error).message}</Encart>
        ) : sorties.data.elements.length === 0 ? (
          <Vide texte="Aucune sortie magasin enregistrée." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Destinataire</th>
                  <th className="num">Quantité</th>
                  <th className="num">Coût unitaire</th>
                  <th>N° de bon</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {sorties.data.elements.map((s) => (
                  <tr key={s.id}>
                    <td>{jourCourt(s.date_sortie)}</td>
                    <td className="mono">{s.reference_piece}</td>
                    <td>{s.designation ?? '—'}</td>
                    <td>{nomCible(s.equipement_id, s.engin_id)}</td>
                    <td className="num">{s.quantite}</td>
                    <td className="num">
                      {s.cout_unitaire
                        ? `${Number(s.cout_unitaire).toLocaleString('fr-FR')} ${s.devise}`
                        : '—'}
                    </td>
                    <td className="mono">{s.numero_bon ?? '—'}</td>
                    <td><StatutPastille statut={s.statut} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <Modale
        titre="Saisir une sortie magasin"
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
                  date_sortie: formulaire.date_sortie,
                  equipement_id:
                    formulaire.cible === 'equipement' ? formulaire.equipement_id : null,
                  engin_id: formulaire.cible === 'engin' ? formulaire.engin_id : null,
                  reference_piece: formulaire.reference_piece.trim(),
                  designation: texteOuNull(formulaire.designation),
                  quantite: nombreOuNull(formulaire.quantite),
                  cout_unitaire: nombreOuNull(formulaire.cout_unitaire),
                  numero_bon: texteOuNull(formulaire.numero_bon),
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
        <Champ libelle="Destinataire de la pièce">
          <div className="ligneChoix">
            {(['engin', 'equipement'] as Cible[]).map((c) => (
              <button
                key={c}
                type="button"
                className={`puce${formulaire.cible === c ? ' puce--active' : ''}`}
                onClick={() =>
                  setFormulaire({ ...formulaire, cible: c, engin_id: '', equipement_id: '' })
                }
              >
                {c === 'engin' ? 'Un engin' : 'Un équipement de concassage'}
              </button>
            ))}
          </div>
        </Champ>

        <div className="grille-champs">
          {formulaire.cible === 'engin' ? (
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
          ) : (
            <Champ libelle="Équipement *">
              <select
                value={formulaire.equipement_id}
                onChange={(e) => setFormulaire({ ...formulaire, equipement_id: e.target.value })}
              >
                <option value="">Choisir…</option>
                {equipements.data?.map((e) => (
                  <option key={e.id} value={e.id}>{e.designation}</option>
                ))}
              </select>
            </Champ>
          )}
          <Champ libelle="Date de sortie *">
            <input
              type="date"
              value={formulaire.date_sortie}
              onChange={(e) => setFormulaire({ ...formulaire, date_sortie: e.target.value })}
            />
          </Champ>
          <Champ libelle="Référence de la pièce *">
            <input
              value={formulaire.reference_piece}
              onChange={(e) => setFormulaire({ ...formulaire, reference_piece: e.target.value })}
            />
          </Champ>
          <Champ libelle="Désignation">
            <input
              value={formulaire.designation}
              onChange={(e) => setFormulaire({ ...formulaire, designation: e.target.value })}
            />
          </Champ>
          <Champ libelle="Quantité *">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formulaire.quantite}
              onChange={(e) => setFormulaire({ ...formulaire, quantite: e.target.value })}
            />
          </Champ>
          <Champ libelle="Coût unitaire (XOF)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={formulaire.cout_unitaire}
              onChange={(e) => setFormulaire({ ...formulaire, cout_unitaire: e.target.value })}
            />
          </Champ>
          <Champ libelle="Numéro de bon">
            <input
              value={formulaire.numero_bon}
              onChange={(e) => setFormulaire({ ...formulaire, numero_bon: e.target.value })}
            />
          </Champ>
        </div>
      </Modale>
    </>
  );
}
