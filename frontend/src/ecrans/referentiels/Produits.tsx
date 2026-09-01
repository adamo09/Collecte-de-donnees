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
import { ActionsReferentiel } from '@/composants/ActionsReferentiel';
import { Modale } from '@/composants/Modale';
import type { components } from '@/api/schema';
import { texteOuNull, useEcriture } from '@/utils/mutations';
import { useSites } from '@/utils/requetes';

type Niveau = components['schemas']['NiveauConcassage'];
type Produit = components['schemas']['ProduitSortie'];

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
  const [enEdition, setEnEdition] = useState<Produit | null>(null);

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

  const modification = useEcriture({
    cles: ['produits'],
    action: async ({ id, corps }: { id: string; corps: Record<string, unknown> }) => {
      const { data, error } = await api.PATCH('/api/v1/referentiels/produits/{produit_id}', {
        params: { path: { produit_id: id } },
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (p) => `Produit ${p.code} mis à jour.`,
    onSucces: () => {
      setEnEdition(null);
      setModaleOuverte(false);
      setFormulaire(VIDE);
      setParcours([]);
    },
  });

  const ouvrirEdition = (produit: Produit) => {
    setEnEdition(produit);
    setFormulaire({
      code: produit.code,
      libelle: produit.libelle,
      granulometrie: produit.granulometrie ?? '',
      site_id: produit.site_id != null ? String(produit.site_id) : '',
    });
    // Le parcours est ordonné : on le recharge dans l'ordre stocké.
    setParcours([...produit.parcours].sort((a, b) => a.ordre - b.ordre).map((e) => e.niveau));
    setModaleOuverte(true);
  };

  const retour = creation.retour ?? modification.retour;

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

      {retour && <Encart ton={retour.ton}>{retour.texte}</Encart>}

      <Carte>
        <div className="filtres">
          <div className="filtres__compteur">
            <strong>{produits.data?.length ?? 0}</strong> produit
            {(produits.data?.length ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton
              onClick={() => {
                setEnEdition(null);
                setFormulaire(VIDE);
                setParcours([]);
                setModaleOuverte(true);
              }}
            >
              Ajouter un produit
            </Bouton>
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
                  <th />
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
                    <td>
                      <ActionsReferentiel
                        actif={produit.actif}
                        libelleObjet={`Le produit ${produit.code}`}
                        enCours={modification.isPending}
                        onModifier={() => ouvrirEdition(produit)}
                        onBasculerActif={() =>
                          modification.mutate({
                            id: produit.id,
                            corps: { actif: !produit.actif },
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <Modale
        titre={enEdition ? `Modifier ${enEdition.code}` : 'Ajouter un produit'}
        aide={
          enEdition
            ? "Le code n'est pas modifiable : les pesées et les ventes déjà enregistrées y renvoient."
            : "Cocher les niveaux dans l'ordre où le produit les traverse."
        }
        ouverte={modaleOuverte}
        onFermer={() => {
          setModaleOuverte(false);
          setEnEdition(null);
        }}
        erreur={retour?.ton === 'erreur' ? retour.texte : null}
        actions={
          <>
            <Bouton
              variante="secondaire"
              onClick={() => {
                setModaleOuverte(false);
                setEnEdition(null);
              }}
            >
              Annuler
            </Bouton>
            <Bouton
              disabled={!valide || creation.isPending || modification.isPending}
              onClick={() => {
                const commun = {
                  libelle: formulaire.libelle.trim(),
                  granulometrie: texteOuNull(formulaire.granulometrie),
                  site_id: formulaire.site_id ? Number(formulaire.site_id) : null,
                  parcours: parcours.map((niveau, index) => ({ ordre: index + 1, niveau })),
                };
                if (enEdition) {
                  modification.mutate({ id: enEdition.id, corps: commun });
                } else {
                  creation.mutate({ code: formulaire.code.trim(), ...commun });
                }
              }}
            >
              {creation.isPending || modification.isPending
                ? 'Enregistrement…'
                : enEdition
                  ? 'Enregistrer'
                  : 'Créer'}
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
              autoFocus={!enEdition}
              disabled={enEdition !== null}
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
