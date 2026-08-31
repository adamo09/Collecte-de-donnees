/**
 * Construction du corps d'un lot de synchronisation.
 *
 * Fonction pure, volontairement isolée du stockage local : la forme du lot
 * est le contrat avec le serveur, et elle doit pouvoir être vérifiée sans
 * ouvrir de base SQLite ni dépendre du terminal.
 */

import { CHAMP_DU_LOT, type TableCollecte } from '@/types/modele';

/** Ce qu'il faut connaître d'un élément de la file pour l'expédier. */
export interface EnregistrementAEnvoyer {
  id: string;
  table_cible: TableCollecte;
  charge: Record<string, unknown>;
}

export function construireLot(
  lotId: string,
  terminalId: string,
  elements: readonly EnregistrementAEnvoyer[],
  versionApplication = '1.0.0',
): Record<string, unknown> {
  const lot: Record<string, unknown> = {
    lot_id: lotId,
    terminal_id: terminalId,
    application_version: versionApplication,
    envoye_le: new Date().toISOString(),
  };

  for (const element of elements) {
    const champ = CHAMP_DU_LOT[element.table_cible];
    if (!champ) continue;
    const liste = (lot[champ] as unknown[] | undefined) ?? [];
    // L'identifiant local devient l'identifiant serveur : c'est lui qui
    // porte l'idempotence.
    liste.push({ id: element.id, ...element.charge });
    lot[champ] = liste;
  }
  return lot;
}
