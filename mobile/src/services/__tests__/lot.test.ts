/**
 * Tests de la construction des lots.
 *
 * La forme du lot est le contrat avec le serveur : une erreur de nom de
 * champ ne se voit qu'au moment de la synchronisation, donc en fin de
 * journée, sur le terrain, quand il est trop tard.
 */

import { construireLot } from '@/services/lot';
import type { EnregistrementAEnvoyer } from '@/services/lot';

function element(
  id: string,
  table: EnregistrementAEnvoyer['table_cible'],
  charge: Record<string, unknown> = {},
): EnregistrementAEnvoyer {
  return { id, table_cible: table, charge };
}

describe('construireLot', () => {
  it('regroupe les enregistrements sous le champ attendu par le serveur', () => {
    const lot = construireLot('LOT-1', 'TAB-KOS-01', [
      element('r1', 'rotation_dumper', { site_id: 1 }),
      element('r2', 'rotation_dumper', { site_id: 1 }),
      element('t1', 'trou_forage', { site_id: 1 }),
    ]);

    expect(lot).toMatchObject({
      lot_id: 'LOT-1',
      terminal_id: 'TAB-KOS-01',
      application_version: '1.0.0',
    });
    expect(lot.rotations_dumper).toHaveLength(2);
    expect(lot.trous_forage).toHaveLength(1);
  });

  it("place l'identifiant local dans le corps de chaque enregistrement", () => {
    const lot = construireLot('LOT-1', 'TAB', [
      element('abc', 'rotation_dumper', { site_id: 1, quantite_estimee_t: 28.5 }),
    ]);

    const rotations = lot.rotations_dumper as Record<string, unknown>[];
    expect(rotations[0]).toEqual({
      id: 'abc',
      site_id: 1,
      quantite_estimee_t: 28.5,
    });
  });

  it("n'ajoute aucune liste vide pour les tables non concernées", () => {
    const lot = construireLot('LOT-1', 'TAB', [element('r1', 'rotation_dumper')]);

    expect(lot).not.toHaveProperty('pesees');
    expect(lot).not.toHaveProperty('charges_engin');
  });

  it('accepte un lot vide sans produire de liste parasite', () => {
    const lot = construireLot('LOT-1', 'TAB', []);
    expect(Object.keys(lot).sort()).toEqual([
      'application_version',
      'envoye_le',
      'lot_id',
      'terminal_id',
    ]);
  });

  it('couvre les neuf tables synchronisables', () => {
    const lot = construireLot('LOT-1', 'TAB', [
      element('a', 'trou_forage'),
      element('b', 'evenement_engin'),
      element('c', 'rotation_dumper'),
      element('d', 'evenement_equipement'),
      element('e', 'pesee_pont_bascule'),
      element('f', 'prestation_minage'),
      element('g', 'sortie_piece'),
      element('h', 'charge_engin'),
      element('i', 'affectation_reelle_engin'),
    ]);

    for (const champ of [
      'trous_forage',
      'evenements_engin',
      'rotations_dumper',
      'evenements_equipement',
      'pesees',
      'prestations_minage',
      'sorties_piece',
      'charges_engin',
      'affectations_reelles',
    ]) {
      expect(lot[champ]).toHaveLength(1);
    }
  });
});
