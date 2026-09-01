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
import './App.css';

const LIENS = [
  { vers: '/validation', libelle: 'File de validation' },
  { vers: '/trous-ouverts', libelle: 'Trous non clôturés' },
  { vers: '/completude', libelle: 'Complétude' },
  { vers: '/exports', libelle: 'Exports' },
  { vers: '/audit', libelle: 'Journal d’audit' },
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

  return (
    <div className="cadre">
      <aside className="cote">
        <div className="cote__marque">
          <span className="cote__nom">CADERAC</span>
          <span className="cote__sous">Contrôle de gestion</span>
        </div>

        <nav className="cote__nav" aria-label="Navigation principale">
          {LIENS.map((lien) => (
            <NavLink
              key={lien.vers}
              to={lien.vers}
              className={({ isActive }) => `cote__lien${isActive ? ' cote__lien--actif' : ''}`}
            >
              {lien.libelle}
            </NavLink>
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
          <Route path="*" element={<Navigate to="/validation" replace />} />
        </Routes>
      </main>
    </div>
  );
}
