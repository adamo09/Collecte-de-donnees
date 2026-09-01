/** Écran de connexion au back-office. */

import { useState, type FormEvent } from 'react';

import { Bouton, Champ, Encart } from '@/composants/Communs';
import { useSession } from '@/contextes/Session';
import './Connexion.css';

export default function EcranConnexion() {
  const { seConnecter, motifDeconnexion } = useSession();
  const [login, setLogin] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const soumettre = async (evenement: FormEvent) => {
    evenement.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await seConnecter(login.trim(), motDePasse);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <main className="connexion">
      <form className="connexion__boite" onSubmit={soumettre}>
        <p className="connexion__marque">Kossihouen · Bouaké · Aboisso · Laoudi Ba</p>
        <h1 className="connexion__titre">CADERAC</h1>
        <p className="connexion__sous-titre">Contrôle et validation des données terrain</p>

        {erreur ? (
          <Encart ton="erreur">{erreur}</Encart>
        ) : (
          motifDeconnexion && <Encart ton="alerte">{motifDeconnexion}</Encart>
        )}

        <Champ libelle="Identifiant">
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Champ>

        <Champ libelle="Mot de passe">
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Champ>

        <Bouton type="submit" disabled={enCours || !login.trim() || !motDePasse}>
          {enCours ? 'Connexion…' : 'Se connecter'}
        </Bouton>
      </form>
    </main>
  );
}
