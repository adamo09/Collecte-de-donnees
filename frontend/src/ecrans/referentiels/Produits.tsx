/** Produits et parcours de concassage (ch. 4.3).
 *
 *  Le parcours ordonné est une donnée de paramétrage à faible volume mais à
 *  forte conséquence : un produit qui ne traverse pas un niveau ne doit pas
 *  en supporter le coût. Collecté en V1, exploité en phase 2.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import { Bouton, Carte, Champ, Chargement, Encart, Pastille, Vide } from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import type { components } from '@/api/schema';
import { texteOuNull, useEcriture } from '@/utils/mutations';
import { useSites } from '@/utils/requetes';

type Niveau = components['schemas']['NiveauConcassage'];

const NIVEAUX: { valeur: Niveau; libelle: string }[] = [
  { valeur: 'primaire', libelle: 'Primaire' },
  { valeur: 'secondaire', libelle: 'Secondaire' },
  { valeur: 'tertiaire', libelle: 'Tertiaire' },
  { valeur: 'quaternaire', libelle: 'Quaternaire' },
  { valeur: 'trommel', libelle: 'Trommel' },
];

const VIDE = { code: '', libelle: '', granulometrie: '', site_id: '' };

export default function EcranProduits() {
  const sites = useSites();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [parcours, setParcours] = useState<Niveau[]>([]);
  const [modaleOuverte, setModaleOuverte] = useState(false);

  const produits = useQuery({
    queryKey: ['produits'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/referentiels/produits', {
        params: { query: { inclure_inactifs: true } as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const creation = useEcriture({
    cles: ['produits'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/referentiels/produits', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (p) => `Produit ${p.code} créé avec ${p.parcours.length} niveau(x) de parcours.`,
    onSucces: () => {
      setFormulaire(VIDE);
      setParcours([]);
      setModaleOuverte(false);
    },
  });

  const basculerNiveau = (niveau: Niveau) =>
    setParcours((precedent) =>
      precedent.includes(niveau)
        ? precedent.filter((n) => n !== niveau)
        : [...precedent, niveau],
    );

  const valide = formulaire.code.trim() !== '' && formulaire.libelle.trim() !== '';

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Produits</h1>
          <p>
            Désignations commerciales et parcours de concassage. L'ordre des
            niveaux compte : un produit qui ne traverse pas un niveau ne doit pas
            en supporter le coût.
          </p>
        </div>
      </header>

      {creation.retour && <Encart ton={creation.retour.ton}>{creation.retour.texte}</Encart>}

      <Carte>
        <div className="filtres">
          <div className="filtres__compteur">
            <strong>{produits.data?.length ?? 0}</strong> produit
            {(produits.data?.length ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton onClick={() => setModaleOuverte(true)}>Ajouter un produit</Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {produits.isPending ? (
          <Chargement />
        ) : produits.isError ? (
          <Encart ton="erreur">{(produits.error as Error).message}</Encart>
        ) : (produits.data?.length ?? 0) === 0 ? (
          <Vide texte="Aucun produit enregistré." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Désignation</th>
                  <th>Granulométrie</th>
                  <th>Site</th>
                  <th>Parcours de concassage</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {produits.data!.map((produit) => (
                  <tr key={produit.id}>
                    <td className="mono">{produit.code}</td>
                    <td>{produit.libelle}</td>
                    <td>{produit.granulometrie ?? '—'}</td>
                    <td>{sites.data?.find((s) => s.id === produit.site_id)?.code ?? '—'}</td>
                    <td>
                      {produit.parcours.length === 0
                        ? '—'
                        : produit.parcours
                            .map((e) => NIVEAUX.find((n) => n.valeur === e.niveau)?.libelle)
                            .join(' → ')}
                    </td>
                    <td>
                      <Pastille ton={produit.actif ? 'succes' : 'neutre'}>
                        {produit.actif ? 'Actif' : 'Retiré'}
                      </Pastille>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <Modale
        titre="Ajouter un produit"
        aide="Cocher les niveaux dans l'ordre où le produit les traverse."
        ouverte={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        actions={
          <>
            <Bouton variante="secondaire" onClick={() => setModaleOuverte(false)}>Annuler</Bouton>
            <Bouton
              disabled={!valide || creation.isPending}
              onClick={() =>
                creation.mutate({
                  code: formulaire.code.trim(),
                  libelle: formulaire.libelle.trim(),
                  granulometrie: texteOuNull(formulaire.granulometrie),
                  site_id: formulaire.site_id ? Number(formulaire.site_id) : null,
                  parcours: parcours.map((niveau, index) => ({ ordre: index + 1, niveau })),
                })
              }
            >
              {creation.isPending ? 'Création…' : 'Créer'}
            </Bouton>
          </>
        }
      >
        <div className="grille-champs">
          <Champ libelle="Code *">
            <input
              value={formulaire.code}
              onChange={(e) => setFormulaire({ ...formulaire, code: e.target.value })}
              placeholder="6-10"
              autoFocus
            />
          </Champ>
          <Champ libelle="Désignation *">
            <input
              value={formulaire.libelle}
              onChange={(e) => setFormulaire({ ...formulaire, libelle: e.target.value })}
              placeholder="Gravier 6/10"
            />
          </Champ>
          <Champ libelle="Granulométrie">
            <input
              value={formulaire.granulometrie}
              onChange={(e) => setFormulaire({ ...formulaire, granulometrie: e.target.value })}
              placeholder="6/10"
            />
          </Champ>
          <Champ libelle="Site">
            <select
              value={formulaire.site_id}
              onChange={(e) => setFormulaire({ ...formulaire, site_id: e.target.value })}
            >
              <option value="">Tous</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
        </div>

        <Champ
          libelle="Parcours de concassage"
          aide={
            parcours.length > 0
              ? `Ordre retenu : ${parcours
                  .map((n) => NIVEAUX.find((x) => x.valeur === n)?.libelle)
                  .join(' → ')}`
              : 'Cocher les niveaux traversés, dans l’ordre.'
          }
        >
          <div className="ligneChoix">
            {NIVEAUX.map((n) => {
              const rang = parcours.indexOf(n.valeur);
              return (
                <button
                  key={n.valeur}
                  type="button"
                  className={`puce${rang >= 0 ? ' puce--active' : ''}`}
                  onClick={() => basculerNiveau(n.valeur)}
                >
                  {rang >= 0 && <span className="puce__rang">{rang + 1}</span>}
                  {n.libelle}
                </button>
              );
            })}
          </div>
        </Champ>
      </Modale>
    </>
  );
}
