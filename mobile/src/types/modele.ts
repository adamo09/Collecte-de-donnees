/**
 * Types partagés avec l'API CADERAC.
 *
 * Ils reproduisent les schémas Pydantic du backend. Toute divergence se
 * traduirait par un rejet à la synchronisation, donc par une donnée perdue
 * pour l'agent : ces types sont à maintenir avec le contrat serveur.
 */

export type ModeCollecte =
  | 'qr_code'
  | 'saisie_directe'
  | 'ocr'
  | 'import_fichier'
  | 'voix'
  | 'interface_systeme';

export type StatutValidation = 'brute' | 'controlee' | 'validee' | 'rejetee';

export type PosteTravail = 'jour' | 'nuit';

export type NatureQuantite = 'pesee_reelle' | 'estimation';

export type FamilleEngin =
  | 'dumper'
  | 'foreuse'
  | 'chargeuse'
  | 'pelle'
  | 'bull'
  | 'brh'
  | 'camion'
  | 'autre';

export type TypeEvenementEngin =
  | 'debut'
  | 'arret'
  | 'panne'
  | 'maintenance'
  | 'reprise'
  | 'fin'
  | 'ravitaillement';

/** Types d'événements pour lesquels un motif codifié est obligatoire. */
export const EVENEMENTS_AVEC_CAUSE: readonly TypeEvenementEngin[] = [
  'arret',
  'panne',
  'maintenance',
];

export interface Engin {
  id: string;
  numero_parc: string;
  matricule: string | null;
  famille: FamilleEngin;
  capacite_nominale: number | null;
  unite_capacite: string | null;
  unite_compteur: string;
  compteur_actuel: number | null;
  centre_cout_reference: string | null;
  qr_token: string | null;
}

export interface Equipement {
  id: string;
  designation: string;
  type: string;
  ligne: string | null;
  niveau: string | null;
  qr_token: string | null;
}

export interface Agent {
  matricule: string;
  nom_prenoms: string;
  fonction: string | null;
}

export interface CauseArret {
  code: string;
  libelle: string;
  categorie: string | null;
}

export interface CentreDeCout {
  code: string;
  libelle: string;
}

export interface Tir {
  id: string;
  numero_t: string;
  date_tir: string | null;
}

export interface Produit {
  id: string;
  code: string;
  libelle: string;
  granulometrie: string | null;
}

/** Réponse de /synchronisation/parametrage : tout ce qui permet de
 *  travailler hors ligne pendant une journée entière. */
export interface ParametragePoste {
  site_id: number;
  site_code: string;
  versions: { nom_referentiel: string; version: number; maj_le: string }[];
  engins: Engin[];
  equipements: Equipement[];
  personnel: Agent[];
  produits: Produit[];
  causes_arret: CauseArret[];
  centres_de_cout: CentreDeCout[];
  tirs_ouverts: Tir[];
}

export interface Utilisateur {
  id: string;
  login: string;
  nom_complet: string;
  role: 'agent_terrain' | 'superviseur' | 'controleur' | 'admin';
  site_id: number | null;
  matricule: string | null;
}

export interface Jetons {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expire_dans_secondes: number;
}

/** Tables acceptées par l'endpoint de synchronisation, et champ du lot
 *  correspondant. */
export const CHAMP_DU_LOT = {
  trou_forage: 'trous_forage',
  evenement_engin: 'evenements_engin',
  rotation_dumper: 'rotations_dumper',
  evenement_equipement: 'evenements_equipement',
  pesee_pont_bascule: 'pesees',
  prestation_minage: 'prestations_minage',
  sortie_piece: 'sorties_piece',
  charge_engin: 'charges_engin',
  affectation_reelle_engin: 'affectations_reelles',
} as const;

export type TableCollecte = keyof typeof CHAMP_DU_LOT;

export interface ResultatEnregistrement {
  table_cible: string;
  id: string;
  accepte: boolean;
  doublon: boolean;
  erreur: string | null;
}

export interface AccuseLot {
  lot_id: string;
  recu_le: string;
  nb_enregistrements: number;
  nb_acceptes: number;
  nb_rejetes: number;
  nb_doublons: number;
  resultat: 'ok' | 'partiel' | 'rejete';
  details: ResultatEnregistrement[];
  deja_traite: boolean;
}
