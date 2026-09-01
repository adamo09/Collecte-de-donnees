/** Équipements de concassage (ch. 4.2).
 *
 *  Le rattachement d'un convoyeur à un niveau délimite le périmètre de ce
 *  niveau : c'est lui qui permettra, en phase 2, d'affecter automatiquement
 *  une sortie de pièce au bon niveau.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import { Bouton, Carte, Champ, Chargement, Encart, Manques, Pastille, Vide } from '@/composants/Communs';
import { ActionsReferentiel } from '@/composants/ActionsReferentiel';
import { Modale } from '@/composants/Modale';
import type { components } from '@/api/schema';
import { nombreOuNull, texteOuNull, useEcriture } from '@/utils/mutations';
import { useSites } from '@/utils/requetes';

type Equipement = components['schemas']['EquipementSortie'];
type TypeEquipement = components['schemas']['TypeEquipement'];
type Niveau = components['schemas']['NiveauConcassage'];

const TYPES: { valeur: TypeEquipement; libelle: string }[] = [
  { valeur: 'concasseur', libelle: 'Concasseur' },
  { valeur: 'broyeur', libelle: 'Broyeur' },
  { valeur: 'crible', libelle: 'Crible' },
  { valeur: 'convoyeur', libelle: 'Convoyeur' },
  { valeur: 'moteur', libelle: 'Moteur' },
  { valeur: 'trommel', libelle: 'Trommel' },
  { valeur: 'autre', libelle: 'Autre' },
];

const NIVEAUX: { valeur: Niveau; libelle: string }[] = [
  { valeur: 'primaire', libelle: 'Primaire' },
  { valeur: 'secondaire', libelle: 'Secondaire' },
  { valeur: 'tertiaire', libelle: 'Tertiaire' },
  { valeur: 'quaternaire', libelle: 'Quaternaire' },
  { valeur: 'trommel', libelle: 'Trommel' },
];

const VIDE = {
  designation: '',
  type: 'concasseur' as TypeEquipement,
  site_id: '',
  ligne: '',
  niveau: '' as Niveau | '',
  poste: '',
  puissance_kw: '',
};

export default function EcranEquipements() {
  const sites = useSites();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState<Equipement | null>(null);
  const [filtreSite, setFiltreSite] = useState('');

  const equipements = useQuery({
    queryKey: ['equipements', filtreSite],
    queryFn: async () => {
      const query: Record<string, string | number | boolean> = { inclure_inactifs: true };
      if (filtreSite) query.site_id = Number(filtreSite);
      const { data, error } = await api.GET('/api/v1/referentiels/equipements', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const creation = useEcriture({
    cles: ['equipements'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/referentiels/equipements', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (e) => `« ${e.designation} » créé. Étiquette QR : ${e.qr_token}.`,
    onSucces: () => {
      setFormulaire(VIDE);
      setModaleOuverte(false);
    },
  });

  const modification = useEcriture({
    cles: ['equipements'],
    action: async ({ id, corps }: { id: string; corps: Record<string, unknown> }) => {
      const { data, error } = await api.PATCH(
        '/api/v1/referentiels/equipements/{equipement_id}',
        { params: { path: { equipement_id: id } }, body: corps as never },
      );
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (e) => `« ${e.designation} » mis à jour.`,
    onSucces: () => {
      setEnEdition(null);
      setModaleOuverte(false);
      setFormulaire(VIDE);
    },
  });

  const ouvrirEdition = (equipement: Equipement) => {
    setEnEdition(equipement);
    setFormulaire({
      designation: equipement.designation,
      type: equipement.type,
      site_id: String(equipement.site_id),
      ligne: equipement.ligne ?? '',
      niveau: equipement.niveau ?? '',
      poste: equipement.poste ?? '',
      puissance_kw: equipement.puissance_kw != null ? String(equipement.puissance_kw) : '',
    });
    setModaleOuverte(true);
  };

  const corps = () => ({
    designation: formulaire.designation.trim(),
    type: formulaire.type,
    site_id: Number(formulaire.site_id),
    ligne: texteOuNull(formulaire.ligne),
    niveau: formulaire.niveau || null,
    poste: texteOuNull(formulaire.poste),
    puissance_kw: nombreOuNull(formulaire.puissance_kw),
  });

  const retour = creation.retour ?? modification.retour;
  const manques: string[] = [];
  if (formulaire.designation.trim() === '') manques.push('désignation');
  if (formulaire.site_id === '') manques.push('site');

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Équipements de concassage</h1>
          <p>
            Concasseurs, cribles, convoyeurs et moteurs. Le rattachement à un
            niveau délimite le périmètre de ce niveau et conditionne, en phase 2,
            l'affectation automatique des sorties de pièces.
          </p>
        </div>
      </header>

      {retour && <Encart ton={retour.ton}>{retour.texte}</Encart>}

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
            <strong>{equipements.data?.length ?? 0}</strong> équipement
            {(equipements.data?.length ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton
              onClick={() => {
                setEnEdition(null);
                setFormulaire(VIDE);
                setModaleOuverte(true);
              }}
            >
              Ajouter un équipement
            </Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {equipements.isPending ? (
          <Chargement />
        ) : equipements.isError ? (
          <Encart ton="erreur">{(equipements.error as Error).message}</Encart>
        ) : (equipements.data?.length ?? 0) === 0 ? (
          <Vide texte="Aucun équipement enregistré." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Type</th>
                  <th>Site</th>
                  <th>Ligne</th>
                  <th>Niveau</th>
                  <th className="num">Puissance</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {equipements.data!.map((eq) => (
                  <tr key={eq.id}>
                    <td>{eq.designation}</td>
                    <td>{TYPES.find((t) => t.valeur === eq.type)?.libelle}</td>
                    <td>{sites.data?.find((s) => s.id === eq.site_id)?.code ?? eq.site_id}</td>
                    <td>{eq.ligne ?? '—'}</td>
                    <td>{eq.niveau ? NIVEAUX.find((n) => n.valeur === eq.niveau)?.libelle : '—'}</td>
                    <td className="num">{eq.puissance_kw ? `${eq.puissance_kw} kW` : '—'}</td>
                    <td>
                      <Pastille ton={eq.actif ? 'succes' : 'neutre'}>
                        {eq.actif ? 'Actif' : 'Retiré'}
                      </Pastille>
                    </td>
                    <td>
                      <ActionsReferentiel
                        actif={eq.actif}
                        libelleObjet={`« ${eq.designation} »`}
                        enCours={modification.isPending}
                        onModifier={() => ouvrirEdition(eq)}
                        onBasculerActif={() =>
                          modification.mutate({ id: eq.id, corps: { actif: !eq.actif } })
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
        titre={enEdition ? `Modifier « ${enEdition.designation} »` : 'Ajouter un équipement'}
        ouverte={modaleOuverte}
        onFermer={() => {
          setModaleOuverte(false);
          setEnEdition(null);
        }}
        erreur={retour?.ton === 'erreur' ? retour.texte : null}
        actions={
          <>
            <Manques manques={manques} />
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
              disabled={manques.length > 0 || creation.isPending || modification.isPending}
              onClick={() =>
                enEdition
                  ? modification.mutate({ id: enEdition.id, corps: corps() })
                  : creation.mutate(corps())
              }
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
          <Champ libelle="Désignation *">
            <input
              value={formulaire.designation}
              onChange={(e) => setFormulaire({ ...formulaire, designation: e.target.value })}
              placeholder="Concasseur primaire L1"
              autoFocus
            />
          </Champ>
          <Champ libelle="Type *">
            <select
              value={formulaire.type}
              onChange={(e) =>
                setFormulaire({ ...formulaire, type: e.target.value as TypeEquipement })
              }
            >
              {TYPES.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
            </select>
          </Champ>
          <Champ libelle="Site *">
            <select
              value={formulaire.site_id}
              onChange={(e) => setFormulaire({ ...formulaire, site_id: e.target.value })}
            >
              <option value="">Choisir…</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Niveau de concassage">
            <select
              value={formulaire.niveau}
              onChange={(e) =>
                setFormulaire({ ...formulaire, niveau: e.target.value as Niveau | '' })
              }
            >
              <option value="">Aucun</option>
              {NIVEAUX.map((n) => <option key={n.valeur} value={n.valeur}>{n.libelle}</option>)}
            </select>
          </Champ>
          <Champ libelle="Ligne">
            <input
              value={formulaire.ligne}
              onChange={(e) => setFormulaire({ ...formulaire, ligne: e.target.value })}
              placeholder="Ligne 1"
            />
          </Champ>
          <Champ libelle="Puissance (kW)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={formulaire.puissance_kw}
              onChange={(e) => setFormulaire({ ...formulaire, puissance_kw: e.target.value })}
            />
          </Champ>
        </div>
      </Modale>
    </>
  );
}
