/**
 * Actions sur une ligne de référentiel.
 *
 * Un référentiel n'est jamais supprimé : les données collectées y
 * renvoient, et l'effacer romprait l'historique. Celui qui n'a plus cours
 * est désactivé — il disparaît des listes de saisie sans effacer le passé.
 * Le libellé du bouton le dit explicitement, pour qu'aucun utilisateur ne
 * cherche une suppression qui n'existe pas.
 */

import { Bouton } from '@/composants/Communs';

export function ActionsReferentiel({
  actif,
  onModifier,
  onBasculerActif,
  enCours,
  libelleObjet,
}: {
  actif: boolean;
  onModifier: () => void;
  onBasculerActif: () => void;
  enCours?: boolean;
  libelleObjet: string;
}) {
  return (
    <div className="actions-ligne">
      <Bouton variante="secondaire" onClick={onModifier} disabled={enCours}>
        Modifier
      </Bouton>
      <Bouton
        variante={actif ? 'danger' : 'secondaire'}
        onClick={onBasculerActif}
        disabled={enCours}
        titre={
          actif
            ? `${libelleObjet} disparaîtra des listes de saisie, sans effacer les données passées.`
            : `${libelleObjet} réapparaîtra dans les listes de saisie.`
        }
      >
        {actif ? 'Désactiver' : 'Réactiver'}
      </Bouton>
    </div>
  );
}
