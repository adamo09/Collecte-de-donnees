/**
 * Pilotage de la production — un seul écran pour deux lectures.
 *
 * L'exploitation y cherche ce qui s'est produit et ce qui l'a empêché ; le
 * contrôle de gestion y cherche ce sur quoi il peut appuyer un chiffre.
 * Les séparer en deux écrans aurait laissé chacun ignorer ce que l'autre
 * sait : le tonnage de la semaine ne veut rien dire sans la part qui n'a
 * jamais été pesée, et la part d'estimé n'intéresse personne sans le
 * tonnage qu'elle affecte.
 *
 * Aucun coût n'y figure. Les règles d'imputation analytique ne sont pas
 * arrêtées (décision D12) : un coût à la tonne affiché aujourd'hui serait
 * inventé, et il serait cru.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, messageErreur } from '@/api/client';
import { Carte, Champ, Chargement, Encart, Vide } from '@/composants/Communs';
import { BarrePeseEstime, Courbe, Pareto, Tuile } from '@/composants/Graphiques';
import { useSites } from '@/utils/requetes';
import './Production.css';

const nombre = (valeur: number | null | undefined, decimales = 0) =>
  valeur === null || valeur === undefined
    ? null
    : valeur.toLocaleString('fr-FR', {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      });

/** Le jour d'aujourd'hui moins n jours, au format attendu par l'API. */
const ilYA = (jours: number) => {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
};

export default function EcranProduction() {
  const sites = useSites();
  const [site, setSite] = useState('');
  const [jours, setJours] = useState('30');

  const du = ilYA(Number(jours));
  const au = ilYA(0);

  const requete = useQuery({
    queryKey: ['indicateurs', site, du, au],
    queryFn: async () => {
      const query: Record<string, string> = { du, au };
      if (site) query.site = site;
      const { data, error } = await api.GET('/api/v1/pilotage/indicateurs', {
        params: { query: query as never },
      });
      if (error) throw new Error(messageErreur(error));
      return data;
    },
  });

  if (requete.isPending) return <Chargement texte="Calcul des indicateurs…" />;
  if (requete.isError) {
    return <Encart ton="erreur">{(requete.error as Error).message}</Encart>;
  }

  const { production, foration, engins, causes_arret, serie, collecte } = requete.data;
  const enAttente = Object.values(collecte.en_attente).reduce((s, n) => s + n, 0);
  const brutes = collecte.en_attente.brute ?? 0;
  const joursSerie = serie.map((point) => point.jour);
  const vide = production.rotations === 0 && foration.trous === 0 && causes_arret.length === 0;

  return (
    <>
      <header className="page__tete">
        <div>
          <h1>Production</h1>
          <p>
            Ce qui a été produit, ce qui l'a empêché, et la confiance qu'on peut
            accorder aux chiffres. Seules les données <strong>validées</strong> y
            entrent : l'écran lit exactement la matière que reçoit le gestionnaire
            externe, jamais davantage.
          </p>
        </div>
      </header>

      <Carte>
        <div className="filtres">
          <Champ libelle="Site">
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="">Tous les sites</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.code}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Période" aide="Jusqu'à aujourd'hui inclus.">
            <select value={jours} onChange={(e) => setJours(e.target.value)}>
              <option value="7">7 derniers jours</option>
              <option value="30">30 derniers jours</option>
              <option value="90">90 derniers jours</option>
            </select>
          </Champ>
        </div>
      </Carte>

      {vide ? (
        <Carte>
          <Vide
            texte={
              "Aucune donnée validée sur cette période. Les indicateurs se " +
              "nourrissent de la file de validation : tant qu'une saisie n'a pas " +
              "été contrôlée puis validée, elle ne compte nulle part."
            }
          />
        </Carte>
      ) : (
        <>
          <Carte
            titre="Production"
            aide="Marinage — rotations de dumpers déclarées et validées."
          >
            <div className="tuiles">
              <Tuile libelle="Rotations" valeur={nombre(production.rotations)} />
              <Tuile
                libelle="Dumpers ayant tourné"
                valeur={nombre(production.dumpers_actifs)}
              />
              <Tuile
                libelle="Tonnage pesé"
                valeur={nombre(production.tonnage_pese_t, 1)}
                unite="t"
                aide={`${production.lignes_pesees} rotation(s) passée(s) au pont-bascule`}
              />
              <Tuile
                libelle="Tonnage estimé"
                valeur={nombre(production.tonnage_estime_t, 1)}
                unite="t"
                aide="Déclaré par le chauffeur, jamais mesuré"
              />
              <Tuile
                libelle="Part estimée"
                valeur={nombre(production.part_estimee_pct, 1)}
                unite="%"
                alerte={(production.part_estimee_pct ?? 0) > 50}
                aide="Au-delà de la moitié, un coût à la tonne reposerait surtout sur des dires"
              />
            </div>

            <h3 className="sous-titre">Répartition du tonnage</h3>
            <p className="note">
              Ces deux tonnages ne s'additionnent pas. L'un est une mesure, l'autre
              une appréciation ; leur somme n'aurait aucune unité défendable devant
              un contrôleur. La barre montre leur poids relatif, rien de plus.
            </p>
            <BarrePeseEstime
              pese={production.tonnage_pese_t}
              estime={production.tonnage_estime_t}
            />
          </Carte>

          <Carte
            titre="Activité quotidienne"
            aide="Trois grandeurs, trois cadres : aucune n'est mise à l'échelle d'une autre."
          >
            <div className="courbes">
              <Courbe
                titre="Rotations"
                unite="par jour"
                jours={joursSerie}
                series={[{ nom: 'Rotations', valeurs: serie.map((p) => p.rotations) }]}
              />
              <Courbe
                titre="Trous forés"
                unite="par jour"
                jours={joursSerie}
                series={[{ nom: 'Trous', valeurs: serie.map((p) => p.trous) }]}
              />
              <Courbe
                titre="Tonnage"
                unite="t"
                decimales={1}
                jours={joursSerie}
                series={[
                  { nom: 'Pesé', valeurs: serie.map((p) => p.tonnage_pese_t) },
                  {
                    nom: 'Estimé',
                    valeurs: serie.map((p) => p.tonnage_estime_t),
                    pointille: true,
                  },
                ]}
              />
            </div>
          </Carte>

          <Carte
            titre="Disponibilité des engins"
            aide="Déduite du journal d'événements : aucune durée n'est saisie sur le terrain."
          >
            <div className="tuiles">
              <Tuile
                libelle="Taux de disponibilité"
                valeur={nombre(engins.taux_disponibilite_pct, 1)}
                unite="%"
                aide="Heures de marche rapportées aux heures déclarées"
              />
              <Tuile libelle="Heures de marche" valeur={nombre(engins.heures_marche, 1)} unite="h" />
              <Tuile libelle="Heures d'arrêt" valeur={nombre(engins.heures_arret, 1)} unite="h" />
              <Tuile
                libelle="Carburant"
                valeur={nombre(engins.carburant_litres, 1)}
                unite="L"
                aide={`${engins.engins_declarants} engin(s) ayant déclaré un ravitaillement`}
              />
              <Tuile
                libelle="États non clôturés"
                valeur={nombre(engins.etats_non_clotures)}
                alerte={engins.etats_non_clotures > 0}
                aide="Un état sans événement suivant : sa durée reste inconnue"
              />
            </div>

            <h3 className="sous-titre">Causes d'arrêt</h3>
            {causes_arret.length === 0 ? (
              <Vide texte="Aucun arrêt motivé sur la période." />
            ) : (
              <Pareto lignes={causes_arret} />
            )}
          </Carte>

          <Carte titre="Foration" aide="CP01 — préparation du tir.">
            <div className="tuiles">
              <Tuile libelle="Trous forés" valeur={nombre(foration.trous)} />
              <Tuile
                libelle="Mètres linéaires"
                valeur={nombre(foration.metres_lineaires, 1)}
                unite="m"
              />
              <Tuile
                libelle="Durée moyenne par trou"
                valeur={nombre(foration.duree_moyenne_min, 1)}
                unite="min"
                aide="Calculée sur les seuls trous clôturés"
              />
              <Tuile
                libelle="Trous non clôturés"
                valeur={nombre(foration.trous_non_clotures)}
                alerte={foration.trous_non_clotures > 0}
                aide="Aucune durée mesurable tant qu'ils restent ouverts"
              />
            </div>
          </Carte>

          <Carte
            titre="Qualité de la collecte"
            aide="Ce que les chiffres ci-dessus ne contiennent pas encore."
          >
            <div className="tuiles">
              <Tuile
                libelle="En attente de validation"
                valeur={nombre(enAttente)}
                alerte={brutes > 0}
                aide="Absentes des indicateurs comme des exports"
              />
              <Tuile
                libelle="Dont jamais contrôlées"
                valeur={nombre(brutes)}
                alerte={brutes > 0}
              />
              <Tuile
                libelle="Doyenne de la file"
                valeur={nombre(collecte.age_max_heures, 1)}
                unite="h"
                alerte={(collecte.age_max_heures ?? 0) > 72}
                aide="Au-delà de trois jours, le saisisseur ne se souvient plus du contexte"
              />
            </div>
            {enAttente > 0 && (
              <p className="note">
                Tant que ces {enAttente} enregistrement(s) restent dans la file, les
                indicateurs de cette page les ignorent. Un taux de disponibilité
                calculé sur une collecte à moitié validée dit ce qu'a fait la moitié
                validée, pas ce qu'a fait la carrière.
              </p>
            )}
          </Carte>

          <Encart ton="neutre">
            <strong>Aucun coût ne figure sur cet écran.</strong> Les règles
            d'imputation analytique — unité d'œuvre, amortissements, étalement des
            charges, traitement de la marche à vide — n'ont pas été arrêtées
            (décision D12 du cahier des charges). Les quantités, les temps et les
            consommations sont livrés ici ; leur combinaison en coût à la tonne
            viendra quand les règles existeront, et pas avant.
          </Encart>
        </>
      )}
    </>
  );
}
