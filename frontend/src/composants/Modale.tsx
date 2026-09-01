/** Boîte de dialogue, utilisée pour les créations et les corrections. */

import { useEffect, useRef, type ReactNode } from 'react';

import './Modale.css';

export function Modale({
  titre,
  aide,
  ouverte,
  onFermer,
  children,
  actions,
  largeur = 520,
}: {
  titre: string;
  aide?: string;
  ouverte: boolean;
  onFermer: () => void;
  children: ReactNode;
  actions?: ReactNode;
  largeur?: number;
}) {
  const dialogue = useRef<HTMLDialogElement>(null);

  // <dialog> natif : gestion du focus, de la touche Échap et du fond
  // inerte assurée par le navigateur, sans bibliothèque.
  useEffect(() => {
    const element = dialogue.current;
    if (!element) return;
    if (ouverte && !element.open) element.showModal();
    if (!ouverte && element.open) element.close();
  }, [ouverte]);

  return (
    <dialog
      ref={dialogue}
      className="modale"
      style={{ maxWidth: largeur }}
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      onClick={(e) => {
        // Un clic hors du panneau ferme, comme partout ailleurs.
        if (e.target === dialogue.current) onFermer();
      }}
    >
      <form method="dialog" className="modale__panneau" onSubmit={(e) => e.preventDefault()}>
        <header className="modale__tete">
          <div>
            <h2>{titre}</h2>
            {aide && <p>{aide}</p>}
          </div>
          <button
            type="button"
            className="modale__fermer"
            onClick={onFermer}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div className="modale__corps">{children}</div>

        {actions && <footer className="modale__pied">{actions}</footer>}
      </form>
    </dialog>
  );
}
