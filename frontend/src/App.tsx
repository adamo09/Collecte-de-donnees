/**
 * Back-office CADERAC.
 *
 * La navigation est filtrée par rôle, à l'image exacte des dépendances
 * posées sur l'API. Un menu qui propose ce que le compte ne peut pas
 * ouvrir n'est pas seulement inélégant : il apprend à l'utilisateur que
 * les refus du système sont normaux, et c'est ainsi qu'on cesse de lire
 * les messages d'erreur.
 */

import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { Chargement } from '@/composants/Communs';
import { useSession, type Role } from '@/contextes/Session';
import EcranAudit from '@/ecrans/Audit';
import EcranCompletude from '@/ecrans/Completude';
import EcranConnexion from '@/ecrans/Connexion';
import EcranExports from '@/ecrans/Exports';
import EcranFileValidation from '@/ecrans/FileValidation';
import EcranProduction from '@/ecrans/pilotage/Production';
import EcranTrousNonClotures from '@/ecrans/TrousNonClotures';
import EcranConsultation from '@/ecrans/Consultation';
import EcranCharges from '@/ecrans/bureau/Charges';
import EcranMinage from '@/ecrans/bureau/Minage';
import EcranSortiesPiece from '@/ecrans/bureau/SortiesPiece';
import EcranVentes from '@/ecrans/bureau/Ventes';
import EcranComptes from '@/ecrans/referentiels/Comptes';
import EcranEngins from '@/ecrans/referentiels/Engins';
import EcranEquipements from '@/ecrans/referentiels/Equipements';
import EcranNomenclatures from '@/ecrans/referentiels/Nomenclatures';
import EcranPersonnel from '@/ecrans/referentiels/Personnel';
import EcranProduits from '@/ecrans/referentiels/Produits';
import logoCaderac from '@/assets/logo-caderac.png';
import './App.css';

/* Rôles admis par entrée de menu. Ces listes recopient la dépendance
   posée sur le serveur, elles ne l'inventent pas : le menu ne doit rien
   proposer qu'un compte ne puisse ouvrir, ni cacher ce qu'il a le droit
   de faire. Toute divergence entre les deux se paie en 403 inexpliqués. */
const TOUS: Role[] = ['agent_terrain', 'superviseur', 'controleur', 'admin'];
/** Correspond à ExigeSuperviseur côté API. */
const SUPERVISEUR: Role[] = ['superviseur', 'controleur', 'admin'];
const ADMIN: Role[] = ['admin'];

/** Sections de navigation. Le regroupement suit les métiers, non les
 *  tables : un contrôleur vit dans « Pilotage » et « Contrôle », un
 *  administrateur dans « Référentiels », un superviseur dans « Saisie
 *  bureau ». Une section dont aucune entrée n'est accessible disparaît. */
const SECTIONS: {
  titre: string;
  liens: { vers: string; libelle: string; roles: Role[] }[];
}[] = [
  {
    titre: 'Pilotage',
    liens: [
      { vers: '/pilotage/production', libelle: 'Production', roles: SUPERVISEUR },
    ],
  },
  {
    titre: 'Contrôle',
    liens: [
      { vers: '/validation', libelle: 'File de validation', roles: SUPERVISEUR },
      { vers: '/consultation', libelle: 'Consulter les données', roles: TOUS },
      { vers: '/trous-ouverts', libelle: 'Trous non clôturés', roles: TOUS },
      { vers: '/completude', libelle: 'Complétude', roles: SUPERVISEUR },
      { vers: '/exports', libelle: 'Exports', roles: SUPERVISEUR },
      { vers: '/audit', libelle: 'Journal d’audit', roles: SUPERVISEUR },
    ],
  },
  {
    titre: 'Saisie bureau',
    liens: [
      // Incohérence assumée et visible : le serveur réserve la charge engin
      // au superviseur mais ouvre ventes, minage et sorties à tout compte
      // authentifié. Le menu la reflète plutôt que de la masquer — c'est
      // une décision de droits qui reste à prendre, pas un défaut d'écran.
      { vers: '/bureau/charges', libelle: 'Charges engin', roles: SUPERVISEUR },
      { vers: '/bureau/minage', libelle: 'Prestations de minage', roles: TOUS },
      { vers: '/bureau/ventes', libelle: 'Ventes', roles: TOUS },
      { vers: '/bureau/sorties-piece', libelle: 'Sorties magasin', roles: TOUS },
    ],
  },
  {
    titre: 'Référentiels',
    liens: [
      { vers: '/referentiels/engins', libelle: 'Parc d’engins', roles: ADMIN },
      { vers: '/referentiels/equipements', libelle: 'Équipements', roles: ADMIN },
      { vers: '/referentiels/personnel', libelle: 'Personnel', roles: ADMIN },
      { vers: '/referentiels/produits', libelle: 'Produits', roles: ADMIN },
      { vers: '/referentiels/nomenclatures', libelle: 'Tirs et motifs d’arrêt', roles: ADMIN },
      { vers: '/referentiels/comptes', libelle: 'Comptes', roles: ADMIN },
    ],
  },
];

const LIBELLE_ROLE: Record<string, string> = {
  agent_terrain: 'Agent de terrain',
  superviseur: 'Superviseur',
  controleur: 'Contrôleur',
  admin: 'Administrateur',
};

export default function App() {
  const { pret, utilisateur, seDeconnecter } = useSession();

  if (!pret) return <Chargement texte="Ouverture de la session…" />;
  if (!utilisateur) return <EcranConnexion />;

  const role = utilisateur.role as Role;
  const sections = SECTIONS.map((section) => ({
    ...section,
    liens: section.liens.filter((lien) => lien.roles.includes(role)),
  })).filter((section) => section.liens.length > 0);

  // La page d'accueil est la première entrée que le compte peut ouvrir :
  // renvoyer tout le monde vers la file de validation offrait un 403 à
  // l'agent de terrain dès sa connexion.
  const accueil = sections[0]?.liens[0]?.vers ?? '/consultation';

  return (
    <div className="cadre">
      <aside className="cote">
        <div className="cote__marque">
          {/* Le logo est marine sur fond transparent : posé tel quel sur la
              barre latérale marine, il disparaîtrait. Une plaque claire le
              rétablit — c'est le placement prévu par la charte. */}
          <img className="cote__logo" src={logoCaderac} alt="CADERAC Carrières" />
          <span className="cote__sous">Contrôle de gestion</span>
        </div>

        <nav className="cote__nav" aria-label="Navigation principale">
          {sections.map((section) => (
            <div key={section.titre} className="cote__section">
              <p className="cote__section-titre">{section.titre}</p>
              {section.liens.map((lien) => (
                <NavLink
                  key={lien.vers}
                  to={lien.vers}
                  className={({ isActive }) =>
                    `cote__lien${isActive ? ' cote__lien--actif' : ''}`
                  }
                >
                  {lien.libelle}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="cote__pied">
          <div className="cote__compte">
            <strong>{utilisateur.nom_complet}</strong>
            <span>{LIBELLE_ROLE[utilisateur.role] ?? utilisateur.role}</span>
          </div>
          <button type="button" className="cote__deconnexion" onClick={seDeconnecter}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="principal">
        <Routes>
          <Route path="/pilotage/production" element={<EcranProduction />} />
          {/* L'écran s'appelait « Indicateurs » : les liens déjà
              distribués doivent continuer de fonctionner. */}
          <Route path="/indicateurs" element={<Navigate to="/pilotage/production" replace />} />
          <Route path="/validation" element={<EcranFileValidation />} />
          <Route path="/trous-ouverts" element={<EcranTrousNonClotures />} />
          <Route path="/completude" element={<EcranCompletude />} />
          <Route path="/exports" element={<EcranExports />} />
          <Route path="/audit" element={<EcranAudit />} />
          <Route path="/consultation" element={<EcranConsultation />} />

          <Route path="/bureau/charges" element={<EcranCharges />} />
          <Route path="/bureau/minage" element={<EcranMinage />} />
          <Route path="/bureau/ventes" element={<EcranVentes />} />
          <Route path="/bureau/sorties-piece" element={<EcranSortiesPiece />} />

          <Route path="/referentiels/engins" element={<EcranEngins />} />
          <Route path="/referentiels/equipements" element={<EcranEquipements />} />
          <Route path="/referentiels/personnel" element={<EcranPersonnel />} />
          <Route path="/referentiels/produits" element={<EcranProduits />} />
          <Route path="/referentiels/nomenclatures" element={<EcranNomenclatures />} />
          <Route path="/referentiels/comptes" element={<EcranComptes />} />

          <Route path="*" element={<Navigate to={accueil} replace />} />
        </Routes>
      </main>
    </div>
  );
}
