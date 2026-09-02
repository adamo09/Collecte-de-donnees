/** Palette et espacements.
 *
 *  Contrastes élevés et cibles tactiles larges : l'application s'utilise en
 *  plein soleil, avec des gants, sur un engin qui vibre.
 */

export const couleurs = {
  // Couleurs relevées sur le logo CADERAC. Le bleu marine de la marque
  // contraste mieux avec le blanc que le bleu précédent (12,7:1 contre
  // 11,6:1) : l'alignement sur la charte a aussi amélioré la lisibilité
  // en plein soleil.
  primaire: '#003559',
  primaireClair: '#0A4C77',
  // Le bleu clair de la marque ne s'emploie que SUR du marine ou sur la
  // vue caméra : sur blanc il tombe à 1,9:1, illisible. Voir accentSurClair.
  accent: '#8AC6E6',
  accentSurClair: '#003559',
  /** Fond d'un élément pressé : teinte pâle du bleu de la marque. */
  presse: '#E4F0F7',
  /** Texte secondaire posé sur une surface marine — 8,9:1. */
  surMarine: '#C3DCEB',
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
