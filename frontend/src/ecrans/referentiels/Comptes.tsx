/** Gestion des comptes et des habilitations.
 *
 *  Quatre rôles. Le contrôleur voit les quatre sites parce que la
 *  consolidation multi-sites est précisément son métier ; l'agent de
 *  terrain et le superviseur restent cantonnés au leur.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import { Bouton, Carte, Champ, Chargement, Encart, Pastille, Vide } from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import type { components } from '@/api/schema';
import { texteOuNull, useEcriture } from '@/utils/mutations';
import { useSites } from '@/utils/requetes';

type Role = components['schemas']['RoleUtilisateur'];

const ROLES: { valeur: Role; libelle: string; portee: string }[] = [
  { valeur: 'agent_terrain', libelle: 'Agent de terrain', portee: 'Son site — déclare' },
  { valeur: 'superviseur', libelle: 'Superviseur', portee: 'Son site — déclare et contrôle' },
  { valeur: 'controleur', libelle: 'Contrôleur', portee: 'Tous les sites — valide et exporte' },
  { valeur: 'admin', libelle: 'Administrateur', portee: 'Tous les sites — plus les référentiels' },
];

const VIDE = {
  login: '',
  mot_de_passe: '',
  nom_complet: '',
  role: 'agent_terrain' as Role,
  site_id: '',
  matricule: '',
};

export default function EcranComptes() {
  const sites = useSites();
  const [formulaire, setFormulaire] = useState(VIDE);
  const [modaleOuverte, setModaleOuverte] = useState(false);

  const comptes = useQuery({
    queryKey: ['comptes'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/auth/utilisateurs');
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const creation = useEcriture({
    cles: ['comptes'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/auth/utilisateurs', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (u) => `Compte « ${u.login} » créé. Communiquer le mot de passe à l'intéressé.`,
    onSucces: () => {
      setFormulaire(VIDE);
      setModaleOuverte(false);
    },
  });

  const basculerActif = useEcriture({
    cles: ['comptes'],
    action: async ({ id, actif }: { id: string; actif: boolean }) => {
      const { data, error } = await api.PATCH('/api/v1/auth/utilisateurs/{utilisateur_id}', {
        params: { path: { utilisateur_id: id } },
        body: { actif } as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (u) => `Compte « ${u.login} » ${u.actif ? 'réactivé' : 'désactivé'}.`,
  });

  const retour = creation.retour ?? basculerActif.retour;
  const roleChoisi = ROLES.find((r) => r.valeur === formulaire.role);
  const siteRequis = formulaire.role === 'agent_terrain' || formulaire.role === 'superviseur';
  const valide =
    formulaire.login.trim().length >= 3 &&
    formulaire.mot_de_passe.length >= 8 &&
    formulaire.nom_complet.trim() !== '' &&
    (!siteRequis || formulaire.site_id !== '');

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Comptes</h1>
          <p>
            Quatre rôles, deux portées. Un agent et un superviseur ne voient que
            leur site ; un contrôleur consolide les quatre, ce qui est
            précisément son métier.
          </p>
        </div>
      </header>

      {retour && <Encart ton={retour.ton}>{retour.texte}</Encart>}

      <Carte>
        <div className="filtres">
          <div className="filtres__compteur">
            <strong>{comptes.data?.length ?? 0}</strong> compte
            {(comptes.data?.length ?? 0) > 1 ? 's' : ''}
          </div>
          <div className="filtres__actions">
            <Bouton onClick={() => setModaleOuverte(true)}>Créer un compte</Bouton>
          </div>
        </div>
      </Carte>

      <Carte>
        {comptes.isPending ? (
          <Chargement />
        ) : comptes.isError ? (
          <Encart ton="erreur">{(comptes.error as Error).message}</Encart>
        ) : (comptes.data?.length ?? 0) === 0 ? (
          <Vide texte="Aucun compte." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Identifiant</th>
                  <th>Nom complet</th>
                  <th>Rôle</th>
                  <th>Site</th>
                  <th>Matricule</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comptes.data!.map((compte) => (
                  <tr key={compte.id}>
                    <td className="mono">{compte.login}</td>
                    <td>{compte.nom_complet}</td>
                    <td>{ROLES.find((r) => r.valeur === compte.role)?.libelle ?? compte.role}</td>
                    <td>
                      {compte.site_id
                        ? (sites.data?.find((s) => s.id === compte.site_id)?.code ?? compte.site_id)
                        : 'Tous'}
                    </td>
                    <td>{compte.matricule ?? '—'}</td>
                    <td>
                      <Pastille ton={compte.actif ? 'succes' : 'neutre'}>
                        {compte.actif ? 'Actif' : 'Désactivé'}
                      </Pastille>
                    </td>
                    <td>
                      <Bouton
                        variante="secondaire"
                        disabled={basculerActif.isPending}
                        onClick={() =>
                          basculerActif.mutate({ id: compte.id, actif: !compte.actif })
                        }
                      >
                        {compte.actif ? 'Désactiver' : 'Réactiver'}
                      </Bouton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <Modale
        titre="Créer un compte"
        aide="Le mot de passe est communiqué à l'intéressé, qui pourra le changer lui-même."
        ouverte={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        actions={
          <>
            <Bouton variante="secondaire" onClick={() => setModaleOuverte(false)}>Annuler</Bouton>
            <Bouton
              disabled={!valide || creation.isPending}
              onClick={() =>
                creation.mutate({
                  login: formulaire.login.trim().toLowerCase(),
                  mot_de_passe: formulaire.mot_de_passe,
                  nom_complet: formulaire.nom_complet.trim(),
                  role: formulaire.role,
                  site_id: formulaire.site_id ? Number(formulaire.site_id) : null,
                  matricule: texteOuNull(formulaire.matricule),
                })
              }
            >
              {creation.isPending ? 'Création…' : 'Créer'}
            </Bouton>
          </>
        }
      >
        <div className="grille-champs">
          <Champ libelle="Identifiant *" aide="Trois caractères au moins.">
            <input
              value={formulaire.login}
              onChange={(e) => setFormulaire({ ...formulaire, login: e.target.value })}
              placeholder="agent.kos"
              autoFocus
            />
          </Champ>
          <Champ libelle="Mot de passe *" aide="Huit caractères au moins.">
            <input
              type="password"
              value={formulaire.mot_de_passe}
              onChange={(e) => setFormulaire({ ...formulaire, mot_de_passe: e.target.value })}
            />
          </Champ>
          <Champ libelle="Nom complet *">
            <input
              value={formulaire.nom_complet}
              onChange={(e) => setFormulaire({ ...formulaire, nom_complet: e.target.value })}
            />
          </Champ>
          <Champ libelle="Rôle *" aide={roleChoisi?.portee}>
            <select
              value={formulaire.role}
              onChange={(e) => setFormulaire({ ...formulaire, role: e.target.value as Role })}
            >
              {ROLES.map((r) => <option key={r.valeur} value={r.valeur}>{r.libelle}</option>)}
            </select>
          </Champ>
          <Champ
            libelle={siteRequis ? 'Site *' : 'Site'}
            aide={siteRequis ? 'Obligatoire pour ce rôle.' : 'Facultatif : ce rôle voit tous les sites.'}
          >
            <select
              value={formulaire.site_id}
              onChange={(e) => setFormulaire({ ...formulaire, site_id: e.target.value })}
            >
              <option value="">{siteRequis ? 'Choisir…' : 'Tous les sites'}</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Matricule" aide="Rattachement au personnel, si applicable.">
            <input
              value={formulaire.matricule}
              onChange={(e) => setFormulaire({ ...formulaire, matricule: e.target.value })}
            />
          </Champ>
        </div>
      </Modale>
    </>
  );
}
