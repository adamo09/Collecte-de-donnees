/** Composants d'interface partagés du back-office. */

import type { ReactNode } from 'react';

import './Communs.css';

export type Ton = 'neutre' | 'info' | 'succes' | 'alerte' | 'erreur';

export function Bouton({
  children,
  onClick,
  variante = 'primaire',
  disabled,
  type = 'button',
  titre,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: 'primaire' | 'secondaire' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  titre?: string;
}) {
  return (
    <button
      type={type}
      className={`bouton bouton--${variante}`}
      onClick={onClick}
      disabled={disabled}
      title={titre}
    >
      {children}
    </button>
  );
}

export function Pastille({ ton, children }: { ton: Ton; children: ReactNode }) {
  return <span className={`pastille pastille--${ton}`}>{children}</span>;
}

/** Le statut de validation est l'information la plus scannée de
 *  l'application : il est encodé en couleur autant qu'en texte. */
export function StatutPastille({ statut }: { statut: string }) {
  const tons: Record<string, Ton> = {
    brute: 'alerte',
    controlee: 'info',
    validee: 'succes',
    rejetee: 'erreur',
  };
  const libelles: Record<string, string> = {
    brute: 'Brute',
    controlee: 'Contrôlée',
    validee: 'Validée',
    rejetee: 'Rejetée',
  };
  return <Pastille ton={tons[statut] ?? 'neutre'}>{libelles[statut] ?? statut}</Pastille>;
}

export function Encart({
  ton = 'info',
  children,
}: {
  ton?: Ton;
  children: ReactNode;
}) {
  return <div className={`encart encart--${ton}`}>{children}</div>;
}

export function Carte({ titre, aide, actions, children }: {
  titre?: string;
  aide?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="carte">
      {(titre || actions) && (
        <header className="carte__tete">
          <div>
            {titre && <h2 className="carte__titre">{titre}</h2>}
            {aide && <p className="carte__aide">{aide}</p>}
          </div>
          {actions && <div className="carte__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Chargement({ texte = 'Chargement…' }: { texte?: string }) {
  return <p className="etat-vide" role="status">{texte}</p>;
}

export function Vide({ texte }: { texte: string }) {
  return <p className="etat-vide">{texte}</p>;
}

export function Champ({
  libelle,
  aide,
  children,
}: {
  libelle: string;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <label className="champ">
      <span className="champ__libelle">{libelle}</span>
      {children}
      {aide && <span className="champ__aide">{aide}</span>}
    </label>
  );
}

/** Horodatage court, en heure locale. Les colonnes de dates sont lues en
 *  balayage : le format long les rendrait illisibles. */
export function dateCourte(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function jourCourt(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
