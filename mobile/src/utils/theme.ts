/** Palette et espacements.
 *
 *  Contrastes élevés et cibles tactiles larges : l'application s'utilise en
 *  plein soleil, avec des gants, sur un engin qui vibre.
 */

export const couleurs = {
  primaire: '#1F3864',
  primaireClair: '#2E5090',
  accent: '#E8A33D',
  fond: '#F4F6F9',
  surface: '#FFFFFF',
  texte: '#1A1A1A',
  texteFaible: '#5A6472',
  bordure: '#D5DBE3',
  succes: '#1E7B34',
  alerte: '#B54708',
  erreur: '#B42318',
  horsLigne: '#5A6472',
} as const;

export const espacement = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;

/** Hauteur minimale d'une cible tactile. Nettement au-dessus des 44 points
 *  habituels : le doigt est ganté et la surface poussiéreuse. */
export const CIBLE_TACTILE = 64;

export const rayons = { s: 6, m: 10, l: 16 } as const;
