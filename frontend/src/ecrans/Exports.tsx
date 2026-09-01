/**
 * Exports vers le gestionnaire externe.
 *
 * Le gestionnaire ne travaille pas dans l'application : il exploite les
 * données extraites. Cet écran est donc le véritable point de livraison du
 * projet, et il n'expose que des données validées.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, jetons, messageErreur } from '@/api/client';
import { Bouton, Carte, Champ, Chargement, Encart, Vide } from '@/composants/Communs';
import { useSites } from '@/utils/requetes';
import './Exports.css';

export default function EcranExports() {
  const sites = useSites();
  const [nom, setNom] = useState('rotations');
  const [site, setSite] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const catalogue = useQuery({
    queryKey: ['catalogue-exports'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/exports/catalogue');
      if (error) throw new Error(messageErreur(error));
      return (data as { exports: { nom: string; libelle: string; description: string }[] })
        .exports;
    },
  });

  const apercu = useQuery({
    queryKey: ['apercu-export', nom, site, du, au],
    queryFn: async () => {
      const query: Record<string, string | number> = { limite: 200 };
      if (site) query.site = site;
      if (du) query.du = du;
      if (au) query.au = au;
      const { data, error } = await api.GET('/api/v1/exports/{nom_export}', {
        params: { path: { nom_export: nom }, query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data as {
        colonnes: string[];
        nb_lignes: number;
        tronque: boolean;
        lignes: Record<string, unknown>[];
      };
    },
  });

  const definition = catalogue.data?.find((e) => e.nom === nom);
  const filtresActifs = Boolean(site || du || au);

  /** Le téléchargement passe par fetch plutôt que par un lien : le jeton
   *  d'authentification voyage dans un en-tête, pas dans l'URL. */
  const telecharger = async (format: 'xlsx' | 'csv') => {
    setErreur(null);
    setEnCours(true);
    try {
      const parametres = new URLSearchParams({ format });
      if (site) parametres.set('site', site);
      if (du) parametres.set('du', du);
      if (au) parametres.set('au', au);

      const reponse = await fetch(
        `/api/v1/exports/${nom}/fichier?${parametres.toString()}`,
        { headers: { Authorization: `Bearer ${jetons.acces() ?? ''}` } },
      );
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => null);
        throw new Error(messageErreur(corps, `Export refusé (${reponse.status}).`));
      }

      const entete = reponse.headers.get('content-disposition') ?? '';
      const trouve = /filename="?([^";]+)"?/.exec(entete);
      const blob = await reponse.blob();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = trouve?.[1] ?? `caderac_${nom}.${format}`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Téléchargement impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Exports</h1>
          <p>
            Le livrable destiné au gestionnaire externe. Seules les données au
            statut « validée » y figurent — une donnée corrigée après validation
            en sort jusqu'à ce qu'elle soit revalidée.
          </p>
        </div>
      </header>

      {erreur && <Encart ton="erreur">{erreur}</Encart>}

      <Carte>
        <div className="filtres">
          <Champ libelle="Export">
            <select value={nom} onChange={(e) => setNom(e.target.value)}>
              {catalogue.data?.map((e) => (
                <option key={e.nom} value={e.nom}>{e.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Site">
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="">Tous les sites</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.code}>{s.code}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Du">
            <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
          </Champ>
          <Champ libelle="Au" aide="Borne incluse.">
            <input type="date" value={au} onChange={(e) => setAu(e.target.value)} />
          </Champ>
        </div>

        {definition && <p className="export__description">{definition.description}</p>}

        <div className="export__actions">
          <Bouton onClick={() => void telecharger('xlsx')} disabled={enCours}>
            {enCours ? 'Génération…' : 'Télécharger en Excel'}
          </Bouton>
          <Bouton variante="secondaire" onClick={() => void telecharger('csv')} disabled={enCours}>
            Télécharger en CSV
          </Bouton>
        </div>
      </Carte>

      <Carte
        titre="Aperçu"
        aide={
          apercu.data
            ? `${apercu.data.nb_lignes} ligne(s)${apercu.data.tronque ? ', tronqué à 200' : ''} · ${apercu.data.colonnes.length} colonnes`
            : undefined
        }
      >
        {apercu.isPending ? (
          <Chargement />
        ) : apercu.isError ? (
          <Encart ton="erreur">{(apercu.error as Error).message}</Encart>
        ) : apercu.data.lignes.length === 0 ? (
          // Sans filtre, un résultat vide ne dit pas « votre filtre est trop
          // étroit » : il dit qu'aucune donnée n'a encore été validée. Les
          // deux situations appellent des gestes différents.
          filtresActifs ? (
            <Vide texte="Aucune donnée validée ne correspond à ce filtre. Élargir la période ou changer de site." />
          ) : (
            <Vide
              texte={
                "Aucune donnée validée pour cet export. Une donnée n'y figure " +
                "qu'après être passée par le contrôle puis la validation : " +
                "vérifier la file de validation."
              }
            />
          )
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  {apercu.data.colonnes.map((c) => (
                    <th key={c}>{c.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apercu.data.lignes.slice(0, 50).map((ligne, index) => (
                  <tr key={index}>
                    {apercu.data.colonnes.map((c) => (
                      <td key={c}>{formater(ligne[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}

function formater(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '—';
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  const texte = String(valeur);
  // Les horodatages ISO sont tronqués à la minute : la seconde n'apporte
  // rien dans un aperçu et casse la lecture en colonnes.
  return /^\d{4}-\d{2}-\d{2}T/.test(texte) ? texte.slice(0, 16).replace('T', ' ') : texte;
}
