/**
 * Base SQLite locale.
 *
 * L'application est conçue pour fonctionner sans réseau pendant toute une
 * journée de poste. Rien n'est envoyé directement : toute saisie entre
 * d'abord dans la file d'envoi locale, et n'en sort qu'une fois acquittée
 * par le serveur. Une donnée saisie ne peut donc pas être perdue parce que
 * le réseau était absent au moment du geste.
 */

import * as SQLite from 'expo-sqlite';

import type { TableCollecte } from '@/types/modele';

const NOM_BASE = 'caderac.db';

export type StatutEnvoi = 'en_attente' | 'envoye' | 'rejete';

export interface ElementFile {
  id: string;
  table_cible: TableCollecte;
  charge: Record<string, unknown>;
  cree_le: string;
  lot_id: string | null;
  tentatives: number;
  statut: StatutEnvoi;
  derniere_erreur: string | null;
}

let base: SQLite.SQLiteDatabase | null = null;

export async function ouvrirBase(): Promise<SQLite.SQLiteDatabase> {
  if (base) return base;
  base = await SQLite.openDatabaseAsync(NOM_BASE);
  await initialiser(base);
  return base;
}

async function initialiser(bd: SQLite.SQLiteDatabase): Promise<void> {
  await bd.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- File d'envoi : la source de vérité tant qu'une donnée n'est pas
    -- acquittée par le serveur.
    CREATE TABLE IF NOT EXISTS file_envoi (
      id              TEXT PRIMARY KEY,   -- UUID généré ici, clé d'idempotence
      table_cible     TEXT NOT NULL,
      charge          TEXT NOT NULL,      -- JSON de l'enregistrement
      cree_le         TEXT NOT NULL,
      lot_id          TEXT,               -- lot dans lequel il a été expédié
      tentatives      INTEGER NOT NULL DEFAULT 0,
      statut          TEXT NOT NULL DEFAULT 'en_attente',
      derniere_erreur TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_file_statut ON file_envoi(statut, cree_le);

    -- Copie locale des référentiels, avec le numéro de version qui permet
    -- de savoir s'il faut la rafraîchir.
    CREATE TABLE IF NOT EXISTS referentiel (
      nom      TEXT PRIMARY KEY,
      version  INTEGER NOT NULL,
      contenu  TEXT NOT NULL,
      maj_le   TEXT NOT NULL
    );

    -- Historique des lots, pour rejouer un envoi avec le même identifiant.
    CREATE TABLE IF NOT EXISTS lot (
      id         TEXT PRIMARY KEY,
      cree_le    TEXT NOT NULL,
      envoye_le  TEXT,
      resultat   TEXT
    );

    -- Trous ouverts localement : le second scan doit rester possible même
    -- si le premier n'a pas encore été synchronisé.
    CREATE TABLE IF NOT EXISTS trou_ouvert (
      id           TEXT PRIMARY KEY,
      foreuse_id   TEXT NOT NULL,
      foreuse_parc TEXT NOT NULL,
      tir_id       TEXT,
      heure_debut  TEXT NOT NULL,
      compteur_debut REAL,
      cloture      INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// --- File d'envoi -----------------------------------------------------

export async function empiler(
  id: string,
  table: TableCollecte,
  charge: Record<string, unknown>,
): Promise<void> {
  const bd = await ouvrirBase();
  await bd.runAsync(
    `INSERT OR REPLACE INTO file_envoi (id, table_cible, charge, cree_le, statut)
     VALUES (?, ?, ?, ?, 'en_attente')`,
    id,
    table,
    JSON.stringify(charge),
    new Date().toISOString(),
  );
}

export async function elementsEnAttente(limite = 200): Promise<ElementFile[]> {
  const bd = await ouvrirBase();
  const lignes = await bd.getAllAsync<Record<string, never>>(
    `SELECT * FROM file_envoi WHERE statut = 'en_attente' ORDER BY cree_le LIMIT ?`,
    limite,
  );
  return lignes.map(convertir);
}

export async function elementsRejetes(): Promise<ElementFile[]> {
  const bd = await ouvrirBase();
  const lignes = await bd.getAllAsync<Record<string, never>>(
    `SELECT * FROM file_envoi WHERE statut = 'rejete' ORDER BY cree_le DESC`,
  );
  return lignes.map(convertir);
}

function convertir(ligne: Record<string, unknown>): ElementFile {
  return {
    id: String(ligne.id),
    table_cible: ligne.table_cible as TableCollecte,
    charge: JSON.parse(String(ligne.charge)) as Record<string, unknown>,
    cree_le: String(ligne.cree_le),
    lot_id: ligne.lot_id ? String(ligne.lot_id) : null,
    tentatives: Number(ligne.tentatives ?? 0),
    statut: ligne.statut as StatutEnvoi,
    derniere_erreur: ligne.derniere_erreur ? String(ligne.derniere_erreur) : null,
  };
}

export async function compterEnAttente(): Promise<number> {
  const bd = await ouvrirBase();
  const ligne = await bd.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM file_envoi WHERE statut = 'en_attente'`,
  );
  return ligne?.n ?? 0;
}

export async function compterRejetes(): Promise<number> {
  const bd = await ouvrirBase();
  const ligne = await bd.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM file_envoi WHERE statut = 'rejete'`,
  );
  return ligne?.n ?? 0;
}

/** Rattache des éléments au lot qui va les emporter.
 *
 *  Le lot est enregistré avant l'envoi : si la connexion tombe, le même
 *  identifiant sera réutilisé au réessai, et le serveur reconnaîtra un
 *  renvoi plutôt que de créer des doublons. */
export async function rattacherAuLot(lotId: string, identifiants: string[]): Promise<void> {
  if (identifiants.length === 0) return;
  const bd = await ouvrirBase();
  await bd.runAsync(
    `INSERT OR IGNORE INTO lot (id, cree_le) VALUES (?, ?)`,
    lotId,
    new Date().toISOString(),
  );
  const marqueurs = identifiants.map(() => '?').join(',');
  await bd.runAsync(
    `UPDATE file_envoi SET lot_id = ?, tentatives = tentatives + 1
     WHERE id IN (${marqueurs})`,
    lotId,
    ...identifiants,
  );
}

/** Lot déjà constitué mais dont l'envoi n'a pas abouti. */
export async function lotEnSouffrance(): Promise<string | null> {
  const bd = await ouvrirBase();
  const ligne = await bd.getFirstAsync<{ lot_id: string }>(
    `SELECT DISTINCT lot_id FROM file_envoi
     WHERE statut = 'en_attente' AND lot_id IS NOT NULL LIMIT 1`,
  );
  return ligne?.lot_id ?? null;
}

export async function elementsDuLot(lotId: string): Promise<ElementFile[]> {
  const bd = await ouvrirBase();
  const lignes = await bd.getAllAsync<Record<string, never>>(
    `SELECT * FROM file_envoi WHERE lot_id = ? AND statut = 'en_attente' ORDER BY cree_le`,
    lotId,
  );
  return lignes.map(convertir);
}

export async function marquerEnvoye(identifiants: string[]): Promise<void> {
  if (identifiants.length === 0) return;
  const bd = await ouvrirBase();
  const marqueurs = identifiants.map(() => '?').join(',');
  await bd.runAsync(
    `UPDATE file_envoi SET statut = 'envoye', derniere_erreur = NULL
     WHERE id IN (${marqueurs})`,
    ...identifiants,
  );
}

export async function marquerRejete(id: string, erreur: string): Promise<void> {
  const bd = await ouvrirBase();
  await bd.runAsync(
    `UPDATE file_envoi SET statut = 'rejete', derniere_erreur = ? WHERE id = ?`,
    erreur,
    id,
  );
}

/** Remet un enregistrement rejeté dans la file, après correction par l'agent. */
export async function reprendre(id: string, charge: Record<string, unknown>): Promise<void> {
  const bd = await ouvrirBase();
  await bd.runAsync(
    `UPDATE file_envoi SET charge = ?, statut = 'en_attente', lot_id = NULL,
                           derniere_erreur = NULL
     WHERE id = ?`,
    JSON.stringify(charge),
    id,
  );
}

export async function cloturerLot(lotId: string, resultat: string): Promise<void> {
  const bd = await ouvrirBase();
  await bd.runAsync(
    `UPDATE lot SET envoye_le = ?, resultat = ? WHERE id = ?`,
    new Date().toISOString(),
    resultat,
    lotId,
  );
}

/** Purge les envois acquittés de plus de N jours.
 *
 *  Ils sont conservés quelque temps : un agent doit pouvoir vérifier que
 *  sa saisie de la veille est bien partie. */
export async function purgerEnvoisAnciens(jours = 7): Promise<number> {
  const bd = await ouvrirBase();
  const limite = new Date(Date.now() - jours * 86_400_000).toISOString();
  const resultat = await bd.runAsync(
    `DELETE FROM file_envoi WHERE statut = 'envoye' AND cree_le < ?`,
    limite,
  );
  return resultat.changes;
}

// --- Référentiels -----------------------------------------------------

export async function enregistrerReferentiel(
  nom: string,
  version: number,
  contenu: unknown,
): Promise<void> {
  const bd = await ouvrirBase();
  await bd.runAsync(
    `INSERT OR REPLACE INTO referentiel (nom, version, contenu, maj_le) VALUES (?, ?, ?, ?)`,
    nom,
    version,
    JSON.stringify(contenu),
    new Date().toISOString(),
  );
}

export async function lireReferentiel<T>(nom: string): Promise<T | null> {
  const bd = await ouvrirBase();
  const ligne = await bd.getFirstAsync<{ contenu: string }>(
    `SELECT contenu FROM referentiel WHERE nom = ?`,
    nom,
  );
  return ligne ? (JSON.parse(ligne.contenu) as T) : null;
}

export async function versionsLocales(): Promise<Record<string, number>> {
  const bd = await ouvrirBase();
  const lignes = await bd.getAllAsync<{ nom: string; version: number }>(
    `SELECT nom, version FROM referentiel`,
  );
  return Object.fromEntries(lignes.map((l) => [l.nom, l.version]));
}

// --- Trous ouverts ----------------------------------------------------

export interface TrouOuvert {
  id: string;
  foreuse_id: string;
  foreuse_parc: string;
  tir_id: string | null;
  heure_debut: string;
  compteur_debut: number | null;
}

export async function ouvrirTrou(trou: TrouOuvert): Promise<void> {
  const bd = await ouvrirBase();
  await bd.runAsync(
    `INSERT OR REPLACE INTO trou_ouvert
       (id, foreuse_id, foreuse_parc, tir_id, heure_debut, compteur_debut, cloture)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    trou.id,
    trou.foreuse_id,
    trou.foreuse_parc,
    trou.tir_id,
    trou.heure_debut,
    trou.compteur_debut,
  );
}

export async function trousOuverts(): Promise<TrouOuvert[]> {
  const bd = await ouvrirBase();
  return bd.getAllAsync<TrouOuvert>(
    `SELECT id, foreuse_id, foreuse_parc, tir_id, heure_debut, compteur_debut
     FROM trou_ouvert WHERE cloture = 0 ORDER BY heure_debut`,
  );
}

export async function cloturerTrouLocal(id: string): Promise<void> {
  const bd = await ouvrirBase();
  await bd.runAsync(`UPDATE trou_ouvert SET cloture = 1 WHERE id = ?`, id);
}

/** Efface toute trace locale. Utilisé à la déconnexion : un terminal
 *  partagé ne doit pas exposer les saisies de l'agent précédent. */
export async function effacerTout(): Promise<void> {
  const bd = await ouvrirBase();
  await bd.execAsync(
    `DELETE FROM file_envoi; DELETE FROM referentiel; DELETE FROM lot; DELETE FROM trou_ouvert;`,
  );
}
