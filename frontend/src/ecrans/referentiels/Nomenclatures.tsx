/** Tirs et motifs d'arrêt.
 *
 *  La nomenclature des arrêts est une table plutôt qu'un type figé : elle
 *  s'enrichit avec l'usage terrain sans migration de schéma (ch. 4.4). Un
 *  motif saisi en texte libre n'est pas exploitable statistiquement —
 *  « panne », « panne moteur » et « pb moteur » deviendraient trois motifs.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import { Bouton, Carte, Champ, Chargement, Encart, Pastille, Vide } from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import { texteOuNull, useEcriture } from '@/utils/mutations';
import { useSites } from '@/utils/requetes';

const CATEGORIES = ['technique', 'organisationnel', 'externe'] as const;

export default function EcranNomenclatures() {
  const sites = useSites();
  const [modaleTir, setModaleTir] = useState(false);
  const [modaleCause, setModaleCause] = useState(false);
  const [tir, setTir] = useState({ numero_t: '', site_id: '', date_tir: '' });
  const [cause, setCause] = useState({ code: '', libelle: '', categorie: 'technique' });

  const tirs = useQuery({
    queryKey: ['tirs'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/referentiels/tirs', {
        params: { query: { limite: 100 } as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const causes = useQuery({
    queryKey: ['causes-arret'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/referentiels/causes-arret', {
        params: { query: { inclure_inactifs: true } as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const creerTir = useEcriture({
    cles: ['tirs'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/referentiels/tirs', { body: corps as never });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (t) => `Tir ${t.numero_t} déclaré.`,
    onSucces: () => {
      setTir({ numero_t: '', site_id: '', date_tir: '' });
      setModaleTir(false);
    },
  });

  const creerCause = useEcriture({
    cles: ['causes-arret'],
    action: async (corps: Record<string, unknown>) => {
      const { data, error } = await api.POST('/api/v1/referentiels/causes-arret', {
        body: corps as never,
      });
      if (error) throw new Error(messageErreur(error));
      return data!;
    },
    messageSucces: (c) => `Motif « ${c.libelle} » ajouté à la nomenclature.`,
    onSucces: () => {
      setCause({ code: '', libelle: '', categorie: 'technique' });
      setModaleCause(false);
    },
  });

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Tirs et motifs d'arrêt</h1>
          <p>
            Le tir est la référence commune entre la foration et le minage. La
            nomenclature des arrêts s'enrichit avec l'usage terrain, sans
            migration : c'est ce qui permet de compter les arrêts par cause.
          </p>
        </div>
      </header>

      {creerTir.retour && <Encart ton={creerTir.retour.ton}>{creerTir.retour.texte}</Encart>}
      {creerCause.retour && <Encart ton={creerCause.retour.ton}>{creerCause.retour.texte}</Encart>}

      <Carte
        titre="Tirs"
        aide="Chaque trou de forage et chaque prestation de minage s'y rattachent."
        actions={<Bouton onClick={() => setModaleTir(true)}>Déclarer un tir</Bouton>}
      >
        {tirs.isPending ? (
          <Chargement />
        ) : (tirs.data?.length ?? 0) === 0 ? (
          <Vide texte="Aucun tir déclaré." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr><th>Numéro</th><th>Site</th><th>Date</th></tr>
              </thead>
              <tbody>
                {tirs.data!.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.numero_t}</td>
                    <td>{sites.data?.find((s) => s.id === t.site_id)?.code ?? t.site_id}</td>
                    <td>{t.date_tir ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <Carte
        titre="Motifs d'arrêt"
        aide="Liste fermée mais enrichissable. Un motif libre reste possible, mais doit rester l'exception."
        actions={<Bouton onClick={() => setModaleCause(true)}>Ajouter un motif</Bouton>}
      >
        {causes.isPending ? (
          <Chargement />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr><th>Code</th><th>Libellé</th><th>Catégorie</th><th>État</th></tr>
              </thead>
              <tbody>
                {causes.data!.map((c) => (
                  <tr key={c.code}>
                    <td className="mono">{c.code}</td>
                    <td>{c.libelle}</td>
                    <td>
                      <Pastille
                        ton={
                          c.categorie === 'technique'
                            ? 'erreur'
                            : c.categorie === 'organisationnel'
                              ? 'alerte'
                              : 'info'
                        }
                      >
                        {c.categorie ?? '—'}
                      </Pastille>
                    </td>
                    <td>
                      <Pastille ton={c.actif ? 'succes' : 'neutre'}>
                        {c.actif ? 'Actif' : 'Retiré'}
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
        titre="Déclarer un tir"
        ouverte={modaleTir}
        onFermer={() => setModaleTir(false)}
        actions={
          <>
            <Bouton variante="secondaire" onClick={() => setModaleTir(false)}>Annuler</Bouton>
            <Bouton
              disabled={!tir.numero_t.trim() || !tir.site_id || creerTir.isPending}
              onClick={() =>
                creerTir.mutate({
                  numero_t: tir.numero_t.trim().toUpperCase(),
                  site_id: Number(tir.site_id),
                  date_tir: texteOuNull(tir.date_tir),
                })
              }
            >
              {creerTir.isPending ? 'Création…' : 'Créer'}
            </Bouton>
          </>
        }
      >
        <div className="grille-champs">
          <Champ libelle="Numéro de tir *">
            <input
              value={tir.numero_t}
              onChange={(e) => setTir({ ...tir, numero_t: e.target.value })}
              placeholder="T12"
              autoFocus
            />
          </Champ>
          <Champ libelle="Site *">
            <select value={tir.site_id} onChange={(e) => setTir({ ...tir, site_id: e.target.value })}>
              <option value="">Choisir…</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Date du tir">
            <input
              type="date"
              value={tir.date_tir}
              onChange={(e) => setTir({ ...tir, date_tir: e.target.value })}
            />
          </Champ>
        </div>
      </Modale>

      <Modale
        titre="Ajouter un motif d'arrêt"
        aide="Le code sert de clé : court, en majuscules, stable dans le temps."
        ouverte={modaleCause}
        onFermer={() => setModaleCause(false)}
        actions={
          <>
            <Bouton variante="secondaire" onClick={() => setModaleCause(false)}>Annuler</Bouton>
            <Bouton
              disabled={!cause.code.trim() || !cause.libelle.trim() || creerCause.isPending}
              onClick={() =>
                creerCause.mutate({
                  code: cause.code.trim().toUpperCase(),
                  libelle: cause.libelle.trim(),
                  categorie: cause.categorie,
                })
              }
            >
              {creerCause.isPending ? 'Ajout…' : 'Ajouter'}
            </Bouton>
          </>
        }
      >
        <div className="grille-champs">
          <Champ libelle="Code *">
            <input
              value={cause.code}
              onChange={(e) => setCause({ ...cause, code: e.target.value })}
              placeholder="PANNE_BOITE"
              autoFocus
            />
          </Champ>
          <Champ libelle="Libellé *">
            <input
              value={cause.libelle}
              onChange={(e) => setCause({ ...cause, libelle: e.target.value })}
              placeholder="Panne de boîte de vitesses"
            />
          </Champ>
          <Champ libelle="Catégorie">
            <select
              value={cause.categorie}
              onChange={(e) => setCause({ ...cause, categorie: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Champ>
        </div>
      </Modale>
    </>
  );
}
