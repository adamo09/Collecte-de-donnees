/** Personnel — matricules, fonctions et rattachements analytiques (ch. 4.4).
 *
 *  Le coût employeur est volontairement absent : c'est une donnée RH que le
 *  gestionnaire externe conserve de son côté.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import { Bouton, Carte, Champ, Chargement, Encart, Pastille, Vide } from '@/composants/Communs';
import { ImportCsv } from '@/composants/ImportCsv';
import { Modale } from '@/composants/Modale';
import { texteOuNull, useEcriture } from '@/utils/mutations';
import { useCentresDeCout, useSites } from '@/utils/requetes';

const VIDE = {
  matricule: '',
  nom_prenoms: '',
  fonction: '',
  site_id: '',
  centre_cout: '',
  date_debut_affect: '',
};

export default function EcranPersonnel() {
  const sites = useSites();
  const centres = useCentresDeCout();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [filtreSite, setFiltreSite] = useState('');

  const personnel = useQuery({
    queryKey: ['personnel', filtreSite],
    queryFn: async () => {
      const query: Record<string, string | number | boolean> = { inclure_inactifs: true };
      if (filtreSite) query.site_id = Number(filtreSite);
      const { data, error } = await api.GET('/api/v1/referentiels/personnel', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const creation = useEcriture({
    cles: ['personnel'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/referentiels/personnel', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (agent) => `${agent.nom_prenoms} enregistré sous le matricule ${agent.matricule}.`,
    onSucces: () => {
      setFormulaire(VIDE);
      setModaleOuverte(false);
    },
  });

  const valide = formulaire.matricule.trim() !== '' && formulaire.nom_prenoms.trim() !== '';

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Personnel</h1>
          <p>
            Matricules des opérateurs, rattachés à un site et à un centre de coût.
            C'est ce matricule que le terminal associe à chaque déclaration.
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
            <strong>{personnel.data?.length ?? 0}</strong> agent
            {(personnel.data?.length ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton variante="secondaire" onClick={() => setImportOuvert(true)}>
              Importer un CSV
            </Bouton>
            <Bouton onClick={() => setModaleOuverte(true)}>Ajouter un agent</Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {personnel.isPending ? (
          <Chargement />
        ) : personnel.isError ? (
          <Encart ton="erreur">{(personnel.error as Error).message}</Encart>
        ) : (personnel.data?.length ?? 0) === 0 ? (
          <Vide texte="Aucun agent enregistré. Importer un CSV ou en ajouter un." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Nom et prénoms</th>
                  <th>Fonction</th>
                  <th>Site</th>
                  <th>Centre de coût</th>
                  <th>Depuis</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {personnel.data!.map((agent) => (
                  <tr key={agent.matricule}>
                    <td className="mono">{agent.matricule}</td>
                    <td>{agent.nom_prenoms}</td>
                    <td>{agent.fonction ?? '—'}</td>
                    <td>{sites.data?.find((s) => s.id === agent.site_id)?.code ?? '—'}</td>
                    <td>{agent.centre_cout ?? '—'}</td>
                    <td>{agent.date_debut_affect ?? '—'}</td>
                    <td>
                      <Pastille ton={agent.actif ? 'succes' : 'neutre'}>
                        {agent.actif ? 'Actif' : 'Parti'}
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
        titre="Ajouter un agent"
        ouverte={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        actions={
          <>
            <Bouton variante="secondaire" onClick={() => setModaleOuverte(false)}>Annuler</Bouton>
            <Bouton
              disabled={!valide || creation.isPending}
              onClick={() =>
                creation.mutate({
                  matricule: formulaire.matricule.trim().toUpperCase(),
                  nom_prenoms: formulaire.nom_prenoms.trim(),
                  fonction: texteOuNull(formulaire.fonction),
                  site_id: formulaire.site_id ? Number(formulaire.site_id) : null,
                  centre_cout: texteOuNull(formulaire.centre_cout),
                  date_debut_affect: texteOuNull(formulaire.date_debut_affect),
                })
              }
            >
              {creation.isPending ? 'Création…' : 'Créer'}
            </Bouton>
          </>
        }
      >
        <div className="grille-champs">
          <Champ libelle="Matricule *">
            <input
              value={formulaire.matricule}
              onChange={(e) => setFormulaire({ ...formulaire, matricule: e.target.value })}
              placeholder="MAT001"
              autoFocus
            />
          </Champ>
          <Champ libelle="Nom et prénoms *">
            <input
              value={formulaire.nom_prenoms}
              onChange={(e) => setFormulaire({ ...formulaire, nom_prenoms: e.target.value })}
            />
          </Champ>
          <Champ libelle="Fonction">
            <input
              value={formulaire.fonction}
              onChange={(e) => setFormulaire({ ...formulaire, fonction: e.target.value })}
              placeholder="Conducteur dumper"
            />
          </Champ>
          <Champ libelle="Site">
            <select
              value={formulaire.site_id}
              onChange={(e) => setFormulaire({ ...formulaire, site_id: e.target.value })}
            >
              <option value="">Aucun</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Centre de coût">
            <select
              value={formulaire.centre_cout}
              onChange={(e) => setFormulaire({ ...formulaire, centre_cout: e.target.value })}
            >
              <option value="">Aucun</option>
              {centres.data?.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Début d'affectation">
            <input
              type="date"
              value={formulaire.date_debut_affect}
              onChange={(e) =>
                setFormulaire({ ...formulaire, date_debut_affect: e.target.value })
              }
            />
          </Champ>
        </div>
      </Modale>

      <ImportCsv
        ouvert={importOuvert}
        onFermer={() => setImportOuvert(false)}
        titre="Importer le personnel"
        cleInvalidation="personnel"
        colonnes={[
          { nom: 'matricule', obligatoire: true, aide: 'MAT001' },
          { nom: 'nom_prenoms', obligatoire: true },
          { nom: 'fonction' },
          { nom: 'site', aide: 'Code du site : KOS, BKE…' },
          { nom: 'centre_cout', aide: 'CP01, CP03…' },
        ]}
        envoyer={async (ligne) => {
          const site = sites.data?.find(
            (s) => s.code.toUpperCase() === (ligne.site ?? '').toUpperCase(),
          );
          if (ligne.site && !site) throw new Error(`Site « ${ligne.site} » inconnu.`);
          const { error } = await api.POST('/api/v1/referentiels/personnel', {
            body: {
              matricule: (ligne.matricule ?? '').trim().toUpperCase(),
              nom_prenoms: (ligne.nom_prenoms ?? '').trim(),
              fonction: texteOuNull(ligne.fonction ?? ''),
              site_id: site?.id ?? null,
              centre_cout: texteOuNull(ligne.centre_cout ?? ''),
            } as never,
          });
          if (error) throw new Error(messageErreur(error));
        }}
      />
    </>
  );
}
