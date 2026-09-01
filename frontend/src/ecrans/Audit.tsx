/**
 * Journal des modifications.
 *
 * Une donnée validée ne doit jamais être modifiée silencieusement : c'est
 * ce journal qui permet au contrôle de gestion de défendre un chiffre
 * contesté devant la direction ou devant un tiers.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import { Carte, Champ, Chargement, Encart, Vide, dateCourte } from '@/composants/Communs';
import './Audit.css';

export default function EcranAudit() {
  const [table, setTable] = useState('');
  const [enregistrement, setEnregistrement] = useState('');

  const audit = useQuery({
    queryKey: ['audit', table, enregistrement],
    queryFn: async () => {
      const query: Record<string, string | number> = { limite: 200 };
      if (table) query.table_cible = table;
      if (enregistrement.trim()) query.enregistrement = enregistrement.trim();
      const { data, error } = await api.GET('/api/v1/validation/audit', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data ?? [];
    },
  });

  const lignes = audit.data ?? [];

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Journal des modifications</h1>
          <p>
            Chaque correction apportée à une donnée synchronisée, avec l'ancienne
            valeur, la nouvelle, l'auteur et le motif. Rien n'est effacé.
          </p>
        </div>
      </header>

      <Carte>
        <div className="filtres">
          <Champ libelle="Type de donnée">
            <select value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">Toutes</option>
              <option value="trou_forage">Trou de forage</option>
              <option value="rotation_dumper">Rotation dumper</option>
              <option value="evenement_engin">Événement engin</option>
              <option value="evenement_equipement">Événement équipement</option>
              <option value="pesee_pont_bascule">Pesée pont-bascule</option>
              <option value="charge_engin">Charge engin</option>
            </select>
          </Champ>
          <Champ libelle="Identifiant" aide="UUID complet de l'enregistrement.">
            <input
              value={enregistrement}
              onChange={(e) => setEnregistrement(e.target.value)}
              placeholder="3fa85f64-5717-…"
            />
          </Champ>
          <div className="filtres__compteur">
            <strong>{lignes.length}</strong> modification{lignes.length > 1 ? 's' : ''}
          </div>
        </div>
      </Carte>

      <Carte>
        {audit.isPending ? (
          <Chargement />
        ) : audit.isError ? (
          <Encart ton="erreur">{(audit.error as Error).message}</Encart>
        ) : lignes.length === 0 ? (
          <Vide texte="Aucune modification enregistrée pour ce filtre." />
        ) : (
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Quand</th>
                  <th>Type</th>
                  <th>Champ</th>
                  <th>Avant</th>
                  <th>Après</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.id}>
                    <td>{dateCourte(ligne.modifie_le)}</td>
                    <td>{ligne.table_cible}</td>
                    <td className="mono">{ligne.champ}</td>
                    <td className="valeur valeur--avant">{ligne.ancienne_valeur ?? '—'}</td>
                    <td className="valeur valeur--apres">{ligne.nouvelle_valeur ?? '—'}</td>
                    <td className="motif">{ligne.motif ?? '—'}</td>
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
