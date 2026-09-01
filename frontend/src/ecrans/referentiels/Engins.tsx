/**
 * Parc d'engins — le référentiel central.
 *
 * Sans lui, une rotation de dumper n'est qu'une chaîne de caractères. Son
 * alimentation initiale relève d'un inventaire physique sur chaque site :
 * l'import CSV existe pour ça, saisir cent engins un par un n'aurait pas
 * de sens.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import {
  Bouton,
  Carte,
  Champ,
  Chargement,
  Encart,
  Pastille,
  Vide,
} from '@/composants/Communs';
import { ActionsReferentiel } from '@/composants/ActionsReferentiel';
import { ImportCsv } from '@/composants/ImportCsv';
import { Modale } from '@/composants/Modale';
import type { components } from '@/api/schema';
import { nombreOuNull, texteOuNull, useEcriture } from '@/utils/mutations';
import { useSites } from '@/utils/requetes';

type Engin = components['schemas']['EnginSortie'];
type Famille = components['schemas']['FamilleEngin'];

const FAMILLES: { valeur: Famille; libelle: string }[] = [
  { valeur: 'dumper', libelle: 'Dumper' },
  { valeur: 'foreuse', libelle: 'Foreuse' },
  { valeur: 'pelle', libelle: 'Pelle hydraulique' },
  { valeur: 'chargeuse', libelle: 'Chargeuse' },
  { valeur: 'brh', libelle: 'BRH' },
  { valeur: 'bull', libelle: 'Bull' },
  { valeur: 'camion', libelle: 'Camion' },
  { valeur: 'autre', libelle: 'Autre' },
];

const VIDE = {
  numero_parc: '',
  matricule: '',
  famille: 'dumper' as Famille,
  marque: '',
  modele: '',
  site_id: '',
  centre_cout_reference: '',
  capacite_nominale: '',
  unite_capacite: 't',
  puissance_kw: '',
  unite_compteur: 'heures',
};

export default function EcranEngins() {
  const sites = useSites();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  /** Engin en cours d'édition. null = création. */
  const [enEdition, setEnEdition] = useState<Engin | null>(null);
  const [importOuvert, setImportOuvert] = useState(false);
  const [filtreSite, setFiltreSite] = useState('');
  const [filtreFamille, setFiltreFamille] = useState('');

  const engins = useQuery({
    queryKey: ['engins', filtreSite, filtreFamille],
    queryFn: async () => {
      const query: Record<string, string | number | boolean> = { inclure_inactifs: true };
      if (filtreSite) query.site_id = Number(filtreSite);
      if (filtreFamille) query.famille = filtreFamille;
      const { data, error } = await api.GET('/api/v1/referentiels/engins', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const centres = useQuery({
    queryKey: ['centres-de-cout'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/referentiels/centres-de-cout');
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const creation = useEcriture({
    cles: ['engins'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/referentiels/engins', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (engin) =>
      `Engin ${engin.numero_parc} créé. Son étiquette QR porte « ${engin.qr_token} ».`,
    onSucces: () => {
      setFormulaire(VIDE);
      setModaleOuverte(false);
    },
  });

  const modification = useEcriture({
    cles: ['engins', 'engins-actifs'],
    action: async ({ id, corps }: { id: string; corps: Record<string, unknown> }) => {
      const { data, error } = await api.PATCH('/api/v1/referentiels/engins/{engin_id}', {
        params: { path: { engin_id: id } },
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (engin) => `Engin ${engin.numero_parc} mis à jour.`,
    onSucces: () => {
      setEnEdition(null);
      setModaleOuverte(false);
      setFormulaire(VIDE);
    },
  });

  const ouvrirEdition = (engin: Engin) => {
    setEnEdition(engin);
    setFormulaire({
      numero_parc: engin.numero_parc,
      matricule: engin.matricule ?? '',
      famille: engin.famille,
      marque: engin.marque ?? '',
      modele: engin.modele ?? '',
      site_id: String(engin.site_id),
      centre_cout_reference: engin.centre_cout_reference ?? '',
      capacite_nominale: engin.capacite_nominale != null ? String(engin.capacite_nominale) : '',
      unite_capacite: engin.unite_capacite ?? 't',
      puissance_kw: engin.puissance_kw != null ? String(engin.puissance_kw) : '',
      unite_compteur: engin.unite_compteur,
    });
    setModaleOuverte(true);
  };

  const corpsDepuisFormulaire = () => ({
    numero_parc: formulaire.numero_parc.trim().toUpperCase(),
    matricule: texteOuNull(formulaire.matricule),
    famille: formulaire.famille,
    marque: texteOuNull(formulaire.marque),
    modele: texteOuNull(formulaire.modele),
    site_id: Number(formulaire.site_id),
    centre_cout_reference: texteOuNull(formulaire.centre_cout_reference),
    capacite_nominale: nombreOuNull(formulaire.capacite_nominale),
    unite_capacite: nombreOuNull(formulaire.capacite_nominale)
      ? formulaire.unite_capacite
      : null,
    puissance_kw: nombreOuNull(formulaire.puissance_kw),
    unite_compteur: formulaire.unite_compteur,
  });

  /** À la modification, le numéro de parc n'est pas transmis : il porte le
   *  jeton QR gravé sur l'engin, le changer invaliderait l'étiquette. */
  const corpsModification = () => {
    const { numero_parc: _ignore, ...reste } = corpsDepuisFormulaire();
    return reste;
  };

  const parSite = useMemo(() => {
    const compte = new Map<number, number>();
    for (const e of engins.data ?? []) {
      compte.set(e.site_id, (compte.get(e.site_id) ?? 0) + 1);
    }
    return compte;
  }, [engins.data]);

  const valide =
    formulaire.numero_parc.trim().length > 0 && formulaire.site_id !== '';

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Parc d'engins</h1>
          <p>
            Le socle du système : sans référentiel, une rotation n'est qu'une
            chaîne de caractères. Le jeton QR est dérivé du numéro de parc, il
            reste donc reproductible si une étiquette doit être regravée.
          </p>
        </div>
      </header>

      {(creation.retour ?? modification.retour) && (
        <Encart ton={(creation.retour ?? modification.retour)!.ton}>
          {(creation.retour ?? modification.retour)!.texte}
        </Encart>
      )}

      <Carte>
        <div className="filtres">
          <Champ libelle="Site">
            <select value={filtreSite} onChange={(e) => setFiltreSite(e.target.value)}>
              <option value="">Tous les sites</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} ({parSite.get(s.id) ?? 0})
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Famille">
            <select value={filtreFamille} onChange={(e) => setFiltreFamille(e.target.value)}>
              <option value="">Toutes</option>
              {FAMILLES.map((f) => (
                <option key={f.valeur} value={f.valeur}>{f.libelle}</option>
              ))}
            </select>
          </Champ>
          <div className="filtres__compteur">
            <strong>{engins.data?.length ?? 0}</strong> engin
            {(engins.data?.length ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton variante="secondaire" onClick={() => setImportOuvert(true)}>
              Importer un CSV
            </Bouton>
            <Bouton
              onClick={() => {
                setEnEdition(null);
                setFormulaire(VIDE);
                setModaleOuverte(true);
              }}
            >
              Ajouter un engin
            </Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {engins.isPending ? (
          <Chargement />
        ) : engins.isError ? (
          <Encart ton="erreur">{(engins.error as Error).message}</Encart>
        ) : (engins.data?.length ?? 0) === 0 ? (
          <Vide
            texte={
              filtreSite || filtreFamille
                ? 'Aucun engin ne correspond à ce filtre.'
                : "Le parc n'est pas encore inventorié. Importer un CSV ou ajouter les engins un par un."
            }
          />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>N° de parc</th>
                  <th>Famille</th>
                  <th>Immatriculation</th>
                  <th>Marque et modèle</th>
                  <th>Site</th>
                  <th>Centre de coût</th>
                  <th className="num">Capacité</th>
                  <th className="num">Compteur</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {engins.data!.map((engin: Engin) => (
                  <tr key={engin.id}>
                    <td className="mono">{engin.numero_parc}</td>
                    <td>{FAMILLES.find((f) => f.valeur === engin.famille)?.libelle}</td>
                    <td>{engin.matricule ?? '—'}</td>
                    <td>{[engin.marque, engin.modele].filter(Boolean).join(' ') || '—'}</td>
                    <td>{sites.data?.find((s) => s.id === engin.site_id)?.code ?? engin.site_id}</td>
                    <td>{engin.centre_cout_reference ?? '—'}</td>
                    <td className="num">
                      {engin.capacite_nominale
                        ? `${engin.capacite_nominale} ${engin.unite_capacite ?? ''}`
                        : '—'}
                    </td>
                    <td className="num">
                      {engin.compteur_actuel != null
                        ? `${engin.compteur_actuel} ${engin.unite_compteur}`
                        : '—'}
                    </td>
                    <td>
                      <Pastille ton={engin.actif ? 'succes' : 'neutre'}>
                        {engin.actif ? 'Actif' : 'Retiré'}
                      </Pastille>
                    </td>
                    <td>
                      <ActionsReferentiel
                        actif={engin.actif}
                        libelleObjet={`L'engin ${engin.numero_parc}`}
                        enCours={modification.isPending}
                        onModifier={() => ouvrirEdition(engin)}
                        onBasculerActif={() =>
                          modification.mutate({
                            id: engin.id,
                            corps: { actif: !engin.actif },
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
        titre={enEdition ? `Modifier ${enEdition.numero_parc}` : 'Ajouter un engin'}
        aide={
          enEdition
            ? "Le numéro de parc n'est pas modifiable : il porte le jeton QR gravé sur l'engin."
            : 'Le numéro de parc suit la nomenclature CADERAC : DU pour les dumpers, FE pour les foreuses.'
        }
        ouverte={modaleOuverte}
        onFermer={() => {
          setModaleOuverte(false);
          setEnEdition(null);
        }}
        largeur={620}
        erreur={
          (enEdition ? modification.retour : creation.retour)?.ton === 'erreur'
            ? (enEdition ? modification.retour : creation.retour)?.texte
            : null
        }
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
              onClick={() =>
                enEdition
                  ? modification.mutate({ id: enEdition.id, corps: corpsModification() })
                  : creation.mutate(corpsDepuisFormulaire())
              }
              disabled={!valide || creation.isPending || modification.isPending}
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
          <Champ libelle="Numéro de parc *">
            <input
              value={formulaire.numero_parc}
              onChange={(e) => setFormulaire({ ...formulaire, numero_parc: e.target.value })}
              placeholder="DU01"
              autoFocus={!enEdition}
              disabled={enEdition !== null}
            />
          </Champ>
          <Champ libelle="Famille *">
            <select
              value={formulaire.famille}
              onChange={(e) =>
                setFormulaire({ ...formulaire, famille: e.target.value as Famille })
              }
            >
              {FAMILLES.map((f) => (
                <option key={f.valeur} value={f.valeur}>{f.libelle}</option>
              ))}
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
          <Champ libelle="Centre de coût de référence" aide="Affectation analytique habituelle.">
            <select
              value={formulaire.centre_cout_reference}
              onChange={(e) =>
                setFormulaire({ ...formulaire, centre_cout_reference: e.target.value })
              }
            >
              <option value="">Aucun</option>
              {centres.data?.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Immatriculation">
            <input
              value={formulaire.matricule}
              onChange={(e) => setFormulaire({ ...formulaire, matricule: e.target.value })}
            />
          </Champ>
          <Champ libelle="Marque">
            <input
              value={formulaire.marque}
              onChange={(e) => setFormulaire({ ...formulaire, marque: e.target.value })}
            />
          </Champ>
          <Champ libelle="Modèle">
            <input
              value={formulaire.modele}
              onChange={(e) => setFormulaire({ ...formulaire, modele: e.target.value })}
            />
          </Champ>
          <Champ
            libelle="Capacité nominale"
            aide="Affinée ensuite par la campagne de pesage."
          >
            <input
              type="number"
              step="0.01"
              min="0"
              value={formulaire.capacite_nominale}
              onChange={(e) =>
                setFormulaire({ ...formulaire, capacite_nominale: e.target.value })
              }
            />
          </Champ>
          <Champ libelle="Unité de capacité">
            <select
              value={formulaire.unite_capacite}
              onChange={(e) => setFormulaire({ ...formulaire, unite_capacite: e.target.value })}
            >
              <option value="t">tonnes</option>
              <option value="m3">m³</option>
            </select>
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
          <Champ libelle="Unité de compteur">
            <select
              value={formulaire.unite_compteur}
              onChange={(e) => setFormulaire({ ...formulaire, unite_compteur: e.target.value })}
            >
              <option value="heures">heures</option>
              <option value="km">kilomètres</option>
            </select>
          </Champ>
        </div>
      </Modale>

      <ImportCsv
        ouvert={importOuvert}
        onFermer={() => setImportOuvert(false)}
        titre="Importer un parc d'engins"
        colonnes={[
          { nom: 'numero_parc', obligatoire: true, aide: 'DU01' },
          { nom: 'famille', obligatoire: true, aide: 'dumper, foreuse, pelle…' },
          { nom: 'site', obligatoire: true, aide: 'Code du site : KOS, BKE…' },
          { nom: 'matricule' },
          { nom: 'marque' },
          { nom: 'modele' },
          { nom: 'centre_cout_reference', aide: 'CP01, CP03…' },
          { nom: 'capacite_nominale', aide: 'En tonnes' },
          { nom: 'puissance_kw' },
        ]}
        cleInvalidation="engins"
        envoyer={async (ligne) => {
          const site = sites.data?.find(
            (s) => s.code.toUpperCase() === (ligne.site ?? '').toUpperCase(),
          );
          if (!site) throw new Error(`Site « ${ligne.site} » inconnu.`);
          const { error } = await api.POST('/api/v1/referentiels/engins', {
            body: {
              numero_parc: (ligne.numero_parc ?? '').trim().toUpperCase(),
              famille: (ligne.famille ?? '').trim().toLowerCase(),
              site_id: site.id,
              matricule: texteOuNull(ligne.matricule ?? ''),
              marque: texteOuNull(ligne.marque ?? ''),
              modele: texteOuNull(ligne.modele ?? ''),
              centre_cout_reference: texteOuNull(ligne.centre_cout_reference ?? ''),
              capacite_nominale: nombreOuNull(ligne.capacite_nominale ?? ''),
              unite_capacite: nombreOuNull(ligne.capacite_nominale ?? '') ? 't' : null,
              puissance_kw: nombreOuNull(ligne.puissance_kw ?? ''),
            } as never,
          });
          if (error) throw new Error(messageErreur(error));
        }}
      />
    </>
  );
}
