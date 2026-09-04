/**
 * Consultation des données collectées, et correction motivée.
 *
 * Complète la boucle du contrôleur : la file de validation dit *ce qui
 * reste à faire*, cet écran permet de retrouver *une donnée précise* et de
 * la corriger. Une donnée validée ne se modifie jamais silencieusement —
 * chaque champ touché produit une ligne d'audit portant l'ancienne valeur,
 * la nouvelle, l'auteur et le motif (ch. 5.1).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import {
  Bouton, Carte, Champ, Chargement, Encart, Manques, Pagination, manqueLongueur, StatutPastille, Vide, dateCourte,
} from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import { useEcriture } from '@/utils/mutations';
import { useEngins, useSites } from '@/utils/requetes';
import './Consultation.css';

/** Filtres communs à tous les modules consultables. */
interface Filtres {
  site_id?: number;
  statut?: string;
  engin_id?: string;
  limite: number;
  decalage: number;
}

interface Page {
  total: number;
  elements: Record<string, unknown>[];
}

type Module = {
  cle: string;
  libelle: string;
  /** Chargeur propre au module. Un chemin dynamique passé à api.GET
   *  perdrait le typage engendré depuis OpenAPI, qui est précisément ce
   *  qui doit casser la compilation si l'API change. */
  charger: (filtres: Filtres) => Promise<Page>;
  tableAudit: string;
  colonnes: { champ: string; entete: string; type?: 'date' | 'nombre' }[];
  /** Champs qu'une correction peut viser. La traçabilité et les grandeurs
   *  calculées en sont exclues côté serveur ; les répéter ici évite de
   *  proposer une action qui sera refusée. */
  corrigeables: { champ: string; libelle: string; type: 'texte' | 'nombre' }[];
  filtreEngin?: string;
};

const MODULES: Module[] = [
  {
    cle: 'rotations',
    libelle: 'Rotations de dumpers',
    charger: async ({ engin_id, ...reste }) => {
      const { data, error } = await api.GET('/api/v1/marinage/rotations', {
        params: { query: { ...reste, dumper_id: engin_id } as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data as unknown as Page;
    },
    tableAudit: 'rotation_dumper',
    filtreEngin: 'dumper_id',
    colonnes: [
      { champ: 'horodatage', entete: 'Horodatage', type: 'date' },
      { champ: 'point_deversement', entete: 'Point de déversement' },
      { champ: 'poids_reel_t', entete: 'Pesé (t)', type: 'nombre' },
      { champ: 'quantite_estimee_t', entete: 'Estimé (t)', type: 'nombre' },
      { champ: 'nature_quantite', entete: 'Nature' },
      { champ: 'poste', entete: 'Poste' },
    ],
    corrigeables: [
      { champ: 'poids_reel_t', libelle: 'Poids pesé (t)', type: 'nombre' },
      { champ: 'quantite_estimee_t', libelle: 'Quantité estimée (t)', type: 'nombre' },
      { champ: 'point_deversement', libelle: 'Point de déversement', type: 'texte' },
      { champ: 'commentaire', libelle: 'Commentaire', type: 'texte' },
    ],
  },
  {
    cle: 'evenements-engin',
    libelle: 'Événements engins',
    charger: async (filtres) => {
      const { data, error } = await api.GET('/api/v1/marinage/evenements-engin', {
        params: { query: filtres as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data as unknown as Page;
    },
    tableAudit: 'evenement_engin',
    filtreEngin: 'engin_id',
    colonnes: [
      { champ: 'horodatage', entete: 'Horodatage', type: 'date' },
      { champ: 'type_evenement', entete: 'Type' },
      { champ: 'cause_code', entete: 'Motif' },
      { champ: 'compteur', entete: 'Compteur', type: 'nombre' },
      { champ: 'carburant_litres', entete: 'Carburant (l)', type: 'nombre' },
      { champ: 'centre_cout_reel', entete: 'Centre de coût réel' },
    ],
    corrigeables: [
      { champ: 'compteur', libelle: 'Relevé de compteur', type: 'nombre' },
      { champ: 'carburant_litres', libelle: 'Carburant (litres)', type: 'nombre' },
      { champ: 'cause_code', libelle: 'Motif codifié', type: 'texte' },
      { champ: 'centre_cout_reel', libelle: 'Centre de coût réel', type: 'texte' },
      { champ: 'commentaire', libelle: 'Commentaire', type: 'texte' },
    ],
  },
  {
    cle: 'trous',
    libelle: 'Trous de forage',
    charger: async ({ engin_id, ...reste }) => {
      const { data, error } = await api.GET('/api/v1/foration/trous', {
        params: { query: { ...reste, foreuse_id: engin_id } as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data as unknown as Page;
    },
    tableAudit: 'trou_forage',
    filtreEngin: 'foreuse_id',
    colonnes: [
      { champ: 'reference', entete: 'Référence' },
      { champ: 'date_foration', entete: 'Date' },
      { champ: 'heure_debut', entete: 'Début', type: 'date' },
      { champ: 'heure_fin', entete: 'Fin', type: 'date' },
      { champ: 'metres_lineaires', entete: 'Mètres', type: 'nombre' },
      { champ: 'numero_taillant', entete: 'Taillant' },
    ],
    corrigeables: [
      { champ: 'metres_lineaires', libelle: 'Mètres linéaires', type: 'nombre' },
      { champ: 'diametre_mm', libelle: 'Diamètre (mm)', type: 'nombre' },
      { champ: 'numero_taillant', libelle: 'Numéro de taillant', type: 'texte' },
      { champ: 'numero_tige', libelle: 'Numéro de tige', type: 'texte' },
      { champ: 'commentaire', libelle: 'Commentaire', type: 'texte' },
    ],
  },
  {
    cle: 'pesees',
    libelle: 'Pesées pont-bascule',
    charger: async ({ engin_id: _ignore, ...reste }) => {
      const { data, error } = await api.GET('/api/v1/expedition/pesees', {
        params: { query: reste as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data as unknown as Page;
    },
    tableAudit: 'pesee_pont_bascule',
    colonnes: [
      { champ: 'horodatage', entete: 'Horodatage', type: 'date' },
      { champ: 'client', entete: 'Client' },
      { champ: 'immatriculation', entete: 'Camion' },
      { champ: 'poids_t', entete: 'Poids (t)', type: 'nombre' },
      { champ: 'numero_bon', entete: 'N° de bon' },
    ],
    corrigeables: [
      { champ: 'poids_t', libelle: 'Poids (t)', type: 'nombre' },
      { champ: 'client', libelle: 'Client', type: 'texte' },
      { champ: 'immatriculation', libelle: 'Immatriculation', type: 'texte' },
      { champ: 'numero_bon', libelle: 'Numéro de bon', type: 'texte' },
    ],
  },
];

type Enregistrement = Record<string, unknown>;

export default function EcranConsultation() {
  const sites = useSites();
  const engins = useEngins();

  const [cleModule, setCleModule] = useState(MODULES[0]!.cle);
  const [siteId, setSiteId] = useState('');
  const [enginId, setEnginId] = useState('');
  const [statut, setStatut] = useState('');
  const [selection, setSelection] = useState<Enregistrement | null>(null);
  const [champCorrige, setChampCorrige] = useState('');
  const [nouvelleValeur, setNouvelleValeur] = useState('');
  const [motif, setMotif] = useState('');
  const [decalage, setDecalage] = useState(0);

  const LIMITE = 50;

  const module = MODULES.find((m) => m.cle === cleModule)!;

  /** Changer de module ou de filtre remet au début : garder le décalage
   *  afficherait une page vide sur une liste plus courte. */
  const filtrer = (appliquer: () => void) => {
    appliquer();
    setDecalage(0);
  };

  const donnees = useQuery({
    queryKey: ['consultation', cleModule, siteId, enginId, statut, decalage],
    queryFn: () =>
      module.charger({
        limite: LIMITE,
        decalage,
        ...(siteId ? { site_id: Number(siteId) } : {}),
        ...(statut ? { statut } : {}),
        ...(enginId && module.filtreEngin ? { engin_id: enginId } : {}),
      }),
  });

  const correction = useEcriture({
    cles: ['consultation', 'file-validation', 'audit'],
    action: async (corps: { id: string; champ: string; valeur: unknown; motif: string }) => {
      const { data, error } = await api.POST(
        '/api/v1/validation/{table_cible}/{enregistrement_id}/correction',
        {
          params: {
            path: { table_cible: module.tableAudit, enregistrement_id: corps.id },
          },
          body: {
            modifications: { [corps.champ]: corps.valeur },
            motif: corps.motif,
          } as never,
        },
      );
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (lignes) =>
      lignes.length === 0
        ? 'Aucun écart : la valeur était déjà celle-là, rien n’a été journalisé.'
        : `Correction journalisée. ${lignes[0]!.champ} : ${lignes[0]!.ancienne_valeur ?? '—'} → ${lignes[0]!.nouvelle_valeur ?? '—'}.`,
    onSucces: () => {
      setSelection(null);
      setChampCorrige('');
      setNouvelleValeur('');
      setMotif('');
    },
  });

  const enginsFiltres = useMemo(() => {
    if (!module.filtreEngin) return [];
    const familles: Record<string, string[]> = {
      rotations: ['dumper'],
      trous: ['foreuse'],
    };
    const attendues = familles[module.cle];
    return (engins.data ?? []).filter((e) => !attendues || attendues.includes(e.famille));
  }, [engins.data, module]);

  const champChoisi = module.corrigeables.find((c) => c.champ === champCorrige);
  // Le motif alimente le journal d'audit : trois caractères sont le
  // minimum en deçà duquel la trace ne renseigne plus personne.
  const manquesCorrection: string[] = [];
  if (champCorrige === '') manquesCorrection.push('champ à corriger');
  if (motif.trim().length < 3) manquesCorrection.push(manqueLongueur('motif', motif.trim().length, 3));
  const correctionValide = selection !== null && manquesCorrection.length === 0;

  const afficher = (valeur: unknown, type?: 'date' | 'nombre') => {
    if (valeur === null || valeur === undefined || valeur === '') return '—';
    if (type === 'date') return dateCourte(String(valeur));
    return String(valeur);
  };

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Consulter les données</h1>
          <p>
            Retrouver un enregistrement précis et, si besoin, le corriger. Une
            donnée validée qui est corrigée retourne au contrôle et doit être
            revalidée avant de repartir vers le gestionnaire.
          </p>
        </div>
      </header>

      {correction.retour && <Encart ton={correction.retour.ton}>{correction.retour.texte}</Encart>}

      <Carte>
        <div className="filtres">
          <Champ libelle="Type de donnée">
            <select
              value={cleModule}
              onChange={(e) => {
                setCleModule(e.target.value);
                setEnginId('');
                setSelection(null);
                setDecalage(0);
              }}
            >
              {MODULES.map((m) => <option key={m.cle} value={m.cle}>{m.libelle}</option>)}
            </select>
          </Champ>
          <Champ libelle="Site">
            <select value={siteId} onChange={(e) => filtrer(() => setSiteId(e.target.value))}>
              <option value="">Tous les sites</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          {module.filtreEngin && (
            <Champ libelle="Engin">
              <select value={enginId} onChange={(e) => filtrer(() => setEnginId(e.target.value))}>
                <option value="">Tous</option>
                {enginsFiltres.map((e) => (
                  <option key={e.id} value={e.id}>{e.numero_parc}</option>
                ))}
              </select>
            </Champ>
          )}
          <Champ libelle="Statut">
            <select value={statut} onChange={(e) => filtrer(() => setStatut(e.target.value))}>
              <option value="">Tous</option>
              <option value="brute">Brute</option>
              <option value="controlee">Contrôlée</option>
              <option value="validee">Validée</option>
              <option value="rejetee">Rejetée</option>
            </select>
          </Champ>
          <div className="filtres__compteur">
            <strong>{donnees.data?.total ?? 0}</strong> enregistrement
            {(donnees.data?.total ?? 0) > 1 ? 's' : ''}
          </div>
        </div>
      </Carte>

      <Carte>
        {donnees.isPending ? (
          <Chargement />
        ) : donnees.isError ? (
          <Encart ton="erreur">{(donnees.error as Error).message}</Encart>
        ) : donnees.data.elements.length === 0 ? (
          <Vide texte="Aucun enregistrement ne correspond à ces critères." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  {module.colonnes.map((c) => (
                    <th key={c.champ} className={c.type === 'nombre' ? 'num' : undefined}>
                      {c.entete}
                    </th>
                  ))}
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {donnees.data.elements.map((ligne) => (
                  <tr key={String(ligne.id)}>
                    {module.colonnes.map((c) => (
                      <td key={c.champ} className={c.type === 'nombre' ? 'num' : undefined}>
                        {afficher(ligne[c.champ], c.type)}
                      </td>
                    ))}
                    <td><StatutPastille statut={String(ligne.statut)} /></td>
                    <td>
                      <Bouton
                        variante="secondaire"
                        onClick={() => {
                          setSelection(ligne);
                          setChampCorrige('');
                          setNouvelleValeur('');
                          setMotif('');
                        }}
                      >
                        Corriger
                      </Bouton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          total={donnees.data?.total ?? 0}
          limite={LIMITE}
          decalage={decalage}
          nom="enregistrement"
          onChanger={setDecalage}
        />
      </Carte>

      <Modale
        titre="Corriger un enregistrement"
        aide="Le motif est obligatoire : il figurera au journal d'audit, à côté de l'ancienne et de la nouvelle valeur."
        ouverte={selection !== null}
        onFermer={() => setSelection(null)}
        largeur={560}
        actions={
          <>
            <Manques manques={manquesCorrection} />
            <Bouton variante="secondaire" onClick={() => setSelection(null)}>Annuler</Bouton>
            <Bouton
              disabled={!correctionValide || correction.isPending}
              onClick={() =>
                correction.mutate({
                  id: String(selection!.id),
                  champ: champCorrige,
                  valeur:
                    nouvelleValeur.trim() === ''
                      ? null
                      : champChoisi?.type === 'nombre'
                        ? Number(nouvelleValeur.replace(',', '.'))
                        : nouvelleValeur,
                  motif: motif.trim(),
                })
              }
            >
              {correction.isPending ? 'Enregistrement…' : 'Corriger'}
            </Bouton>
          </>
        }
      >
        {selection && String(selection.statut) === 'validee' && (
          <Encart ton="alerte">
            Cette donnée est validée : elle a pu être exportée au gestionnaire.
            La corriger la ramènera au statut contrôlé, et elle devra être
            revalidée.
          </Encart>
        )}

        <div className="fiche">
          {selection &&
            module.colonnes.map((c) => (
              <div key={c.champ} className="fiche__ligne">
                <span>{c.entete}</span>
                <strong>{afficher(selection[c.champ], c.type)}</strong>
              </div>
            ))}
        </div>

        <Champ libelle="Champ à corriger *">
          <select
            value={champCorrige}
            onChange={(e) => {
              setChampCorrige(e.target.value);
              const actuel = selection?.[e.target.value];
              setNouvelleValeur(actuel === null || actuel === undefined ? '' : String(actuel));
            }}
          >
            <option value="">Choisir…</option>
            {module.corrigeables.map((c) => (
              <option key={c.champ} value={c.champ}>{c.libelle}</option>
            ))}
          </select>
        </Champ>

        {champChoisi && (
          <Champ
            libelle="Nouvelle valeur"
            aide={`Valeur actuelle : ${afficher(selection?.[champChoisi.champ])}. Laisser vide pour effacer.`}
          >
            <input
              type={champChoisi.type === 'nombre' ? 'number' : 'text'}
              step="0.01"
              value={nouvelleValeur}
              onChange={(e) => setNouvelleValeur(e.target.value)}
            />
          </Champ>
        )}

        <Champ libelle="Motif *" aide="Trois caractères au moins. Conservé définitivement.">
          <textarea
            rows={2}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Relevé corrigé après vérification sur le carreau."
          />
        </Champ>
      </Modale>
    </>
  );
}
