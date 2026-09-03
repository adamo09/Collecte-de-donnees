/**
 * Primitives graphiques du back-office, en SVG écrit à la main.
 *
 * Trois règles tenues ici, parce qu'un graphique faux se lit sans qu'on
 * sache qu'il est faux :
 *
 *  — jamais deux échelles verticales dans un même cadre. Deux grandeurs
 *    d'ordres différents donnent deux graphiques côte à côte, jamais deux
 *    axes qui se croisent au gré de leur cadrage ;
 *  — la couleur ne porte jamais seule une information : chaque série est
 *    aussi nommée, hachurée ou pointillée ;
 *  — le pesé et l'estimé se distinguent par la texture, pas seulement par
 *    la teinte. C'est le seul encodage qui survit à une photocopie, et la
 *    distinction est trop structurante pour dépendre d'une imprimante.
 */

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import './Graphiques.css';

/** Palette des catégories, validée pour les dyschromatopsies : écart
 *  minimal ΔE 14,9 (deutéranopie) entre deux teintes voisines. Le marine
 *  de la marque en est absent — trop sombre et trop peu saturé pour servir
 *  de teinte de série, il reste la couleur du texte et du cadre. */
export const COULEURS_CATEGORIE: Record<string, string> = {
  technique: '#2E74B5',
  organisationnel: '#2FA39B',
  externe: '#C96A16',
};

const nombreFr = (valeur: number, decimales = 0) =>
  valeur.toLocaleString('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });

export function Tuile({
  libelle,
  valeur,
  unite,
  aide,
  alerte,
}: {
  libelle: string;
  valeur: number | string | null;
  unite?: string;
  aide?: ReactNode;
  alerte?: boolean;
}) {
  return (
    <div className={`tuile${alerte ? ' tuile--alerte' : ''}`}>
      <p className="tuile__libelle">{libelle}</p>
      <p className="tuile__valeur">
        {valeur === null ? <span className="tuile__vide">—</span> : valeur}
        {unite && valeur !== null && <span className="tuile__unite">{unite}</span>}
      </p>
      {aide && <p className="tuile__aide">{aide}</p>}
    </div>
  );
}

/** Répartition du tonnage entre mesure et estimation.
 *
 *  Les deux parts ne sont pas additionnées en un « tonnage total » : la
 *  barre montre leur poids relatif, et chaque part porte sa valeur en
 *  clair. L'estimé est hachuré — la texture dit « ce chiffre est un dire,
 *  pas une mesure » mieux qu'une nuance de couleur. */
export function BarrePeseEstime({
  pese,
  estime,
}: {
  pese: number;
  estime: number;
}) {
  const hachures = useId();
  const total = pese + estime;
  if (total <= 0) {
    return <p className="etat-vide">Aucun tonnage déclaré sur la période.</p>;
  }
  const partPese = (pese / total) * 100;

  return (
    <div className="parts">
      <svg
        className="parts__barre"
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${nombreFr(pese, 1)} tonnes pesées, ${nombreFr(estime, 1)} tonnes estimées`}
      >
        <defs>
          <pattern
            id={hachures}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" fill="#FCF1DC" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#A96F14" strokeWidth="1.8" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={partPese} height="8" rx="1.2" fill="#003559" />
        {/* Un blanc de 0,4 unité sépare les deux aplats : sans lui, l'œil
            lit une barre continue, donc un total. */}
        <rect
          x={partPese + 0.4}
          y="0"
          width={Math.max(100 - partPese - 0.4, 0)}
          height="8"
          rx="1.2"
          fill={`url(#${hachures})`}
        />
      </svg>
      <ul className="parts__legende">
        <li>
          <span className="parts__puce parts__puce--pese" />
          <strong>{nombreFr(pese, 1)} t</strong> pesées au pont-bascule
        </li>
        <li>
          <span className="parts__puce parts__puce--estime" />
          <strong>{nombreFr(estime, 1)} t</strong> estimées par le chauffeur
        </li>
      </ul>
    </div>
  );
}

export type LigneCause = {
  code: string;
  libelle: string;
  categorie: string;
  occurrences: number;
  occurrences_mesurees: number;
  heures: number;
};

/** Pareto des causes d'arrêt.
 *
 *  Classé par heures perdues tant qu'il en existe : c'est l'impact qui
 *  hiérarchise, pas la fréquence. Si aucun arrêt n'a encore été clôturé,
 *  aucune heure n'est connue — le graphique bascule alors sur le nombre
 *  d'arrêts et le dit, plutôt que d'afficher une rangée de zéros. */
export function Pareto({ lignes }: { lignes: LigneCause[] }) {
  const heuresConnues = lignes.some((l) => l.heures > 0);
  const valeur = (l: LigneCause) => (heuresConnues ? l.heures : l.occurrences);
  const classees = [...lignes].sort((a, b) => valeur(b) - valeur(a));
  const maximum = Math.max(...classees.map(valeur), 1);
  const cumul = classees.reduce((somme, l) => somme + valeur(l), 0);

  const categories = [...new Set(classees.map((l) => l.categorie))];

  return (
    <div className="pareto">
      {!heuresConnues && (
        <p className="pareto__avis">
          Aucun arrêt n'a encore d'événement de reprise : la durée perdue est
          inconnue. Le classement porte ici sur le nombre d'arrêts.
        </p>
      )}
      <ul className="pareto__liste">
        {classees.map((ligne) => {
          const incomplet = ligne.occurrences_mesurees < ligne.occurrences;
          return (
            <li key={ligne.code} className="pareto__ligne">
              <span className="pareto__nom" title={ligne.categorie}>
                {ligne.libelle}
              </span>
              <span className="pareto__piste">
                <span
                  className="pareto__barre"
                  style={{
                    width: `${(valeur(ligne) / maximum) * 100}%`,
                    background: COULEURS_CATEGORIE[ligne.categorie] ?? '#748394',
                  }}
                />
              </span>
              <span className="pareto__valeur">
                {heuresConnues ? `${nombreFr(ligne.heures, 1)} h` : `${ligne.occurrences} arrêts`}
              </span>
              <span className={`pareto__detail${incomplet ? ' pareto__detail--partiel' : ''}`}>
                {heuresConnues
                  ? `${ligne.occurrences} arrêt${ligne.occurrences > 1 ? 's' : ''}`
                  : ''}
                {incomplet &&
                  ` · ${ligne.occurrences - ligne.occurrences_mesurees} non clôturé${
                    ligne.occurrences - ligne.occurrences_mesurees > 1 ? 's' : ''
                  }`}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="pareto__pied">
        <ul className="legende">
          {categories.map((c) => (
            <li key={c}>
              <span
                className="legende__puce"
                style={{ background: COULEURS_CATEGORIE[c] ?? '#748394' }}
              />
              {c}
            </li>
          ))}
        </ul>
        {heuresConnues && (
          <p className="pareto__cumul">{nombreFr(cumul, 1)} h d'arrêt mesurées au total</p>
        )}
      </div>
    </div>
  );
}

export type SerieCourbe = { nom: string; valeurs: number[]; pointille?: boolean };

/**
 * Petit multiple : un cadre, une échelle, une grandeur.
 *
 * Superposer ici des rotations et des tonnes obligerait à un second axe,
 * dont le cadrage — choisi par le développeur, pas par les données —
 * ferait dire au graphique n'importe quelle corrélation. Deux grandeurs,
 * deux cadres côte à côte : la comparaison reste à la charge du lecteur,
 * qui est le seul à savoir ce qu'il cherche.
 */
export function Courbe({
  titre,
  unite,
  jours,
  series,
  decimales = 0,
}: {
  titre: string;
  unite: string;
  jours: string[];
  series: SerieCourbe[];
  decimales?: number;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const L = 320;
  const H = 120;

  const toutes = series.flatMap((s) => s.valeurs);
  const haut = Math.max(...toutes, 1);
  // Les graduations s'arrondissent à l'entier : la décimale d'un tonnage
  // n'apporte rien sur un axe, et elle appartient à l'infobulle. Elle
  // n'apporterait qu'un caractère de plus à loger dans la gouttière.
  const graduations = [1, 0.5, 0].map((part) => nombreFr(haut * part));
  // La gouttière se dimensionne sur la plus longue graduation. Fixée en
  // dur, elle rognait « 1 197 » en « .197 » dès que le tonnage passait le
  // millier — un axe tronqué se lit sans qu'on voie qu'il l'est.
  const largeurChiffre = 5.1;
  const MG = {
    gauche: 9 + Math.max(...graduations.map((g) => g.length)) * largeurChiffre,
    droite: 6,
    haut: 10,
    bas: 18,
  };
  // L'axe part de zéro : une base tronquée transforme une variation de 3 %
  // en falaise. Un indicateur d'exploitation se lit en ordre de grandeur.
  const x = (i: number) =>
    MG.gauche +
    (jours.length <= 1 ? 0 : (i / (jours.length - 1)) * (L - MG.gauche - MG.droite));
  const y = (v: number) => MG.haut + (1 - v / haut) * (H - MG.haut - MG.bas);

  const chemin = (valeurs: number[]) =>
    valeurs.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const surDeplacement = (evenement: React.MouseEvent<SVGSVGElement>) => {
    const cadre = evenement.currentTarget.getBoundingClientRect();
    const ratio = (evenement.clientX - cadre.left) / cadre.width;
    const traceur = (ratio * L - MG.gauche) / (L - MG.gauche - MG.droite);
    const index = Math.round(traceur * (jours.length - 1));
    setSurvol(index >= 0 && index < jours.length ? index : null);
  };

  const jourLisible = (valeur: string | undefined) => {
    const d = new Date(valeur ?? '');
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <figure className="courbe">
      <figcaption className="courbe__titre">
        {titre} <span className="courbe__unite">({unite})</span>
      </figcaption>
      <div className="courbe__cadre">
        <svg
          viewBox={`0 0 ${L} ${H}`}
          className="courbe__svg"
          onMouseMove={surDeplacement}
          onMouseLeave={() => setSurvol(null)}
          role="img"
          aria-label={`${titre}, du ${jourLisible(jours[0])} au ${jourLisible(jours[jours.length - 1])}`}
        >
          {[1, 0.5, 0].map((part, rang) => (
            <g key={part}>
              <line
                x1={MG.gauche}
                y1={y(haut * part)}
                x2={L - MG.droite}
                y2={y(haut * part)}
                className="courbe__grille"
              />
              <text x={MG.gauche - 5} y={y(haut * part) + 3} className="courbe__graduation">
                {graduations[rang]}
              </text>
            </g>
          ))}

          {survol !== null && (
            <line
              x1={x(survol)}
              y1={MG.haut}
              x2={x(survol)}
              y2={H - MG.bas}
              className="courbe__traceur"
            />
          )}

          {series.map((serie, rang) => (
            <path
              key={serie.nom}
              d={chemin(serie.valeurs)}
              fill="none"
              className={`courbe__trait courbe__trait--${rang}`}
              strokeDasharray={serie.pointille ? '5 3' : undefined}
            />
          ))}

          {survol !== null &&
            series.map((serie, rang) => (
              <circle
                key={serie.nom}
                cx={x(survol)}
                cy={y(serie.valeurs[survol] ?? 0)}
                r="4"
                className={`courbe__point courbe__point--${rang}`}
              />
            ))}

          <text x={MG.gauche} y={H - 5} className="courbe__jour">
            {jourLisible(jours[0])}
          </text>
          <text x={L - MG.droite} y={H - 5} textAnchor="end" className="courbe__jour">
            {jourLisible(jours[jours.length - 1])}
          </text>
        </svg>

        {survol !== null && (
          <div
            className="courbe__infobulle"
            style={{
              left: `${(x(survol) / L) * 100}%`,
              transform: survol > jours.length / 2 ? 'translateX(-100%)' : undefined,
            }}
          >
            <strong>{jourLisible(jours[survol])}</strong>
            {series.map((serie) => (
              <span key={serie.nom}>
                {serie.nom} : {nombreFr(serie.valeurs[survol] ?? 0, decimales)} {unite}
              </span>
            ))}
          </div>
        )}
      </div>
      {series.length > 1 && (
        <ul className="legende">
          {series.map((serie, rang) => (
            <li key={serie.nom}>
              <span className={`legende__trait legende__trait--${rang}`} />
              {serie.nom}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
