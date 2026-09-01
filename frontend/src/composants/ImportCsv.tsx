/**
 * Import CSV d'un référentiel.
 *
 * L'inventaire initial du parc porte sur quatre sites : le saisir engin par
 * engin serait absurde. L'import montre d'abord ce qu'il a compris, puis
 * envoie ligne par ligne et rend compte de chaque échec — un fichier de
 * cent lignes dont trois sont fautives doit en importer quatre-vingt-dix-sept,
 * pas échouer en bloc.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Bouton, Encart, Pastille } from '@/composants/Communs';
import { Modale } from '@/composants/Modale';
import { lireCsv, lireFichier } from '@/utils/csv';
import './ImportCsv.css';

export interface ColonneAttendue {
  nom: string;
  obligatoire?: boolean;
  aide?: string;
}

interface EchecLigne {
  numero: number;
  cle: string;
  erreur: string;
}

export function ImportCsv({
  ouvert,
  onFermer,
  titre,
  colonnes,
  envoyer,
  cleInvalidation,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  colonnes: ColonneAttendue[];
  envoyer: (ligne: Record<string, string>) => Promise<void>;
  cleInvalidation: string;
}) {
  const clientRequetes = useQueryClient();
  const [lignes, setLignes] = useState<Record<string, string>[]>([]);
  const [entetes, setEntetes] = useState<string[]>([]);
  const [erreursLecture, setErreursLecture] = useState<string[]>([]);
  const [echecs, setEchecs] = useState<EchecLigne[]>([]);
  const [reussies, setReussies] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [progression, setProgression] = useState(0);

  const reinitialiser = () => {
    setLignes([]);
    setEntetes([]);
    setErreursLecture([]);
    setEchecs([]);
    setReussies(null);
    setProgression(0);
  };

  const choisirFichier = async (fichier: File) => {
    reinitialiser();
    const resultat = lireCsv(await lireFichier(fichier));
    setEntetes(resultat.entetes);
    setLignes(resultat.lignes);
    setErreursLecture(resultat.erreurs);
  };

  const obligatoiresManquantes = colonnes
    .filter((c) => c.obligatoire && entetes.length > 0 && !entetes.includes(c.nom))
    .map((c) => c.nom);

  const importer = async () => {
    setEnCours(true);
    setEchecs([]);
    setProgression(0);
    const rates: EchecLigne[] = [];
    let ok = 0;

    for (const [index, ligne] of lignes.entries()) {
      try {
        await envoyer(ligne);
        ok += 1;
      } catch (e) {
        const premiere = colonnes[0]?.nom ?? '';
        rates.push({
          numero: index + 2, // +1 pour l'en-tête, +1 pour partir de 1
          cle: ligne[premiere] ?? `ligne ${index + 2}`,
          erreur: e instanceof Error ? e.message : String(e),
        });
      }
      setProgression(index + 1);
    }

    setReussies(ok);
    setEchecs(rates);
    setEnCours(false);
    void clientRequetes.invalidateQueries({ queryKey: [cleInvalidation] });
  };

  return (
    <Modale
      titre={titre}
      aide="Fichier CSV, séparateur point-virgule ou virgule. La première ligne porte les noms de colonnes."
      ouverte={ouvert}
      onFermer={() => {
        reinitialiser();
        onFermer();
      }}
      largeur={720}
      actions={
        <>
          <Bouton
            variante="secondaire"
            onClick={() => {
              reinitialiser();
              onFermer();
            }}
          >
            {reussies === null ? 'Annuler' : 'Fermer'}
          </Bouton>
          <Bouton
            onClick={() => void importer()}
            disabled={
              lignes.length === 0 || enCours || obligatoiresManquantes.length > 0 || reussies !== null
            }
          >
            {enCours
              ? `Import… ${progression}/${lignes.length}`
              : `Importer ${lignes.length || ''} ligne(s)`}
          </Bouton>
        </>
      }
    >
      <div className="import__colonnes">
        <p className="import__intitule">Colonnes attendues</p>
        <ul>
          {colonnes.map((c) => (
            <li key={c.nom}>
              <code>{c.nom}</code>
              {c.obligatoire && <span className="import__requis">obligatoire</span>}
              {c.aide && <span className="import__aide">{c.aide}</span>}
              {entetes.length > 0 && (
                <Pastille ton={entetes.includes(c.nom) ? 'succes' : c.obligatoire ? 'erreur' : 'neutre'}>
                  {entetes.includes(c.nom) ? 'trouvée' : 'absente'}
                </Pastille>
              )}
            </li>
          ))}
        </ul>
      </div>

      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          if (fichier) void choisirFichier(fichier);
        }}
      />

      {obligatoiresManquantes.length > 0 && (
        <Encart ton="erreur">
          Colonnes obligatoires absentes du fichier : {obligatoiresManquantes.join(', ')}.
        </Encart>
      )}

      {erreursLecture.length > 0 && (
        <Encart ton="alerte">
          {erreursLecture.length} ligne(s) mal formée(s), ignorée(s) :{' '}
          {erreursLecture.slice(0, 3).join(' ')}
        </Encart>
      )}

      {lignes.length > 0 && reussies === null && (
        <div className="import__apercu">
          <p className="import__intitule">
            Aperçu — {lignes.length} ligne(s), 3 premières
          </p>
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>{entetes.map((e) => <th key={e}>{e}</th>)}</tr>
              </thead>
              <tbody>
                {lignes.slice(0, 3).map((ligne, i) => (
                  <tr key={i}>
                    {entetes.map((e) => <td key={e}>{ligne[e] || '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reussies !== null && (
        <Encart ton={echecs.length === 0 ? 'succes' : 'alerte'}>
          {reussies} ligne(s) importée(s)
          {echecs.length > 0 ? `, ${echecs.length} en échec.` : '.'}
        </Encart>
      )}

      {echecs.length > 0 && (
        <div className="import__echecs">
          <p className="import__intitule">Lignes refusées</p>
          <div className="tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr><th>Ligne</th><th>Clé</th><th>Motif du refus</th></tr>
              </thead>
              <tbody>
                {echecs.map((e) => (
                  <tr key={e.numero}>
                    <td className="num">{e.numero}</td>
                    <td className="mono">{e.cle}</td>
                    <td>{e.erreur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modale>
  );
}
