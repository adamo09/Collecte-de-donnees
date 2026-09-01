/**
 * Lecture d'un fichier CSV pour l'import des référentiels.
 *
 * L'inventaire initial du parc porte sur quatre sites : le saisir engin
 * par engin dans un formulaire serait absurde. Le format attendu est celui
 * qu'Excel produit en configuration française — séparateur point-virgule,
 * accents en UTF-8 ou en Latin-1.
 */

export interface ResultatLecture {
  entetes: string[];
  lignes: Record<string, string>[];
  erreurs: string[];
}

/** Devine le séparateur d'après la première ligne. Excel français produit
 *  des points-virgules, les outils anglo-saxons des virgules. */
function devinerSeparateur(premiereLigne: string): string {
  const points = (premiereLigne.match(/;/g) ?? []).length;
  const virgules = (premiereLigne.match(/,/g) ?? []).length;
  const tabulations = (premiereLigne.match(/\t/g) ?? []).length;
  if (tabulations > points && tabulations > virgules) return '\t';
  return points >= virgules ? ';' : ',';
}

/** Découpe une ligne en respectant les guillemets. */
function decouper(ligne: string, separateur: string): string[] {
  const champs: string[] = [];
  let courant = '';
  let entreGuillemets = false;

  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i += 1;
      } else {
        entreGuillemets = !entreGuillemets;
      }
    } else if (c === separateur && !entreGuillemets) {
      champs.push(courant);
      courant = '';
    } else {
      courant += c;
    }
  }
  champs.push(courant);
  return champs.map((c) => c.trim());
}

export function lireCsv(contenu: string): ResultatLecture {
  const erreurs: string[] = [];
  // Le BOM produit par Excel deviendrait sinon une partie du premier en-tête.
  const texte = contenu.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lignesBrutes = texte.split('\n').filter((l) => l.trim() !== '');

  if (lignesBrutes.length === 0) {
    return { entetes: [], lignes: [], erreurs: ['Le fichier est vide.'] };
  }

  const separateur = devinerSeparateur(lignesBrutes[0]!);
  const entetes = decouper(lignesBrutes[0]!, separateur).map((e) =>
    e.toLowerCase().replace(/\s+/g, '_'),
  );

  const lignes: Record<string, string>[] = [];
  for (const [index, brute] of lignesBrutes.slice(1).entries()) {
    const champs = decouper(brute, separateur);
    if (champs.length !== entetes.length) {
      erreurs.push(
        `Ligne ${index + 2} : ${champs.length} colonne(s) au lieu de ${entetes.length}.`,
      );
      continue;
    }
    lignes.push(Object.fromEntries(entetes.map((e, i) => [e, champs[i] ?? ''])));
  }

  return { entetes, lignes, erreurs };
}

export function lireFichier(fichier: File): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(String(lecteur.result ?? ''));
    lecteur.onerror = () => rejeter(new Error('Fichier illisible.'));
    lecteur.readAsText(fichier, 'utf-8');
  });
}
