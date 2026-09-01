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

/** Ce qui manque encore pour que l'envoi soit possible.
 *
 *  Un bouton grisé sans explication est muet : l'utilisateur voit un
 *  formulaire qu'il croit rempli et un bouton qui refuse, sans jamais
 *  savoir lequel des champs le retient — le cas typique étant un mot de
 *  passe pré-rempli par le navigateur, trop court de trois caractères.
 *  La liste se recalcule à chaque frappe et s'efface dès que tout est là.
 */
/** Formule le manque d'un champ soumis à une longueur minimale.
 *
 *  Vide, le champ se nomme simplement ; entamé, il annonce son décompte —
 *  c'est là seulement que le chiffre éclaire, en disant de combien on est
 *  encore loin plutôt que de laisser croire à un champ non rempli. */
export function manqueLongueur(libelle: string, longueur: number, minimum: number): string {
  return longueur === 0 ? libelle : `${libelle} (${longueur} sur ${minimum} caractères)`;
}

export function Manques({ manques }: { manques: string[] }) {
  if (manques.length === 0) return null;
  return (
    <p className="manques" role="status">
      <span className="manques__tete">À compléter :</span> {manques.join(' · ')}
    </p>
  );
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
