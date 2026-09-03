/**
 * Back-office CADERAC.
 *
 * Périmètre V1 : la boucle quotidienne du contrôleur. Les référentiels et
 * la gestion des comptes restent accessibles via la documentation
 * interactive de l'API — un administrateur s'en accommode quelques
 * semaines, un contrôleur non.
 */

import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { Chargement } from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import EcranAudit from '@/ecrans/Audit';
import EcranCompletude from '@/ecrans/Completude';
import EcranConnexion from '@/ecrans/Connexion';
import EcranExports from '@/ecrans/Exports';
import EcranFileValidation from '@/ecrans/FileValidation';
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

/** Sections de navigation. Le regroupement suit les métiers, non les
 *  tables : un contrôleur vit dans « Contrôle », un administrateur dans
 *  « Référentiels », un superviseur dans « Saisie bureau ». */
const SECTIONS = [
  {
    titre: 'Contrôle',
    liens: [
      { vers: '/validation', libelle: 'File de validation' },
      { vers: '/consultation', libelle: 'Consulter les données' },
      { vers: '/trous-ouverts', libelle: 'Trous non clôturés' },
      { vers: '/completude', libelle: 'Complétude' },
      { vers: '/exports', libelle: 'Exports' },
      { vers: '/audit', libelle: 'Journal d’audit' },
    ],
  },
  {
    titre: 'Saisie bureau',
    liens: [
      { vers: '/bureau/charges', libelle: 'Charges engin' },
      { vers: '/bureau/minage', libelle: 'Prestations de minage' },
      { vers: '/bureau/ventes', libelle: 'Ventes' },
      { vers: '/bureau/sorties-piece', libelle: 'Sorties magasin' },
    ],
  },
  {
    titre: 'Référentiels',
    reserveAdmin: true,
    liens: [
      { vers: '/referentiels/engins', libelle: 'Parc d’engins' },
      { vers: '/referentiels/equipements', libelle: 'Équipements' },
      { vers: '/referentiels/personnel', libelle: 'Personnel' },
      { vers: '/referentiels/produits', libelle: 'Produits' },
      { vers: '/referentiels/nomenclatures', libelle: 'Tirs et motifs d’arrêt' },
      { vers: '/referentiels/comptes', libelle: 'Comptes' },
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
  const { pret, utilisateur, seDeconnecter, estAdmin } = useSession();

  if (!pret) return <Chargement texte="Ouverture de la session…" />;
  if (!utilisateur) return <EcranConnexion />;

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
          {SECTIONS.filter((s) => !s.reserveAdmin || estAdmin).map((section) => (
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

          <Route path="*" element={<Navigate to="/validation" replace />} />
        </Routes>
      </main>
    </div>
  );
}
