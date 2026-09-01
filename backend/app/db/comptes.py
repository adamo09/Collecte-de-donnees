"""Dépannage des comptes, en dernier recours et hors interface.

Exécution :
    python -m app.db.comptes lister
    python -m app.db.comptes reactiver admin
    python -m app.db.comptes mot-de-passe admin nouveau_mot_de_passe

Un administrateur qui désactive son propre compte, ou qui oublie son mot
de passe, n'a plus aucun moyen de rentrer par l'application : l'API exige
un compte actif pour toute action, y compris pour réactiver un compte.
L'API refuse désormais ces deux manœuvres (voir modifier_utilisateur),
mais une base déjà dans cet état ne se répare que par ici.

Sous Docker :
    docker compose exec api python -m app.db.comptes reactiver admin
"""

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.securite import hacher_mot_de_passe
from app.db.session import FabriqueSession
from app.models.enums import RoleUtilisateur
from app.models.referentiels import Utilisateur


def _trouver(session: Session, login: str) -> Utilisateur | None:
    return session.execute(
        select(Utilisateur).where(Utilisateur.login == login)
    ).scalar_one_or_none()


def lister(session: Session) -> int:
    comptes = list(
        session.execute(select(Utilisateur).order_by(Utilisateur.login)).scalars()
    )
    if not comptes:
        print("Aucun compte. Amorcer la base : python -m app.db.seed")
        return 1
    largeur = max(len(c.login) for c in comptes)
    for compte in comptes:
        etat = "actif" if compte.actif else "DÉSACTIVÉ"
        print(f"  {compte.login:<{largeur}}  {compte.role.value:<14} {etat}")
    actifs = sum(1 for c in comptes if c.actif and c.role is RoleUtilisateur.ADMIN)
    print(f"\n  {len(comptes)} compte(s), dont {actifs} administrateur(s) actif(s).")
    if actifs == 0:
        print("  Plus aucun administrateur actif : réactiver un compte ci-dessus.")
        return 1
    return 0


def reactiver(session: Session, login: str) -> int:
    compte = _trouver(session, login)
    if compte is None:
        print(f"Compte « {login} » introuvable.", file=sys.stderr)
        return 1
    if compte.actif:
        print(f"Le compte « {login} » est déjà actif.")
        return 0
    compte.actif = True
    session.commit()
    print(f"Compte « {login} » réactivé.")
    return 0


def changer_mot_de_passe(session: Session, login: str, mot_de_passe: str) -> int:
    if len(mot_de_passe) < 8:
        print("Le mot de passe doit faire huit caractères au moins.", file=sys.stderr)
        return 1
    compte = _trouver(session, login)
    if compte is None:
        print(f"Compte « {login} » introuvable.", file=sys.stderr)
        return 1
    compte.mot_de_passe_hash = hacher_mot_de_passe(mot_de_passe)
    session.commit()
    print(f"Mot de passe du compte « {login} » remplacé.")
    return 0


def principal() -> int:
    analyseur = argparse.ArgumentParser(
        prog="python -m app.db.comptes",
        description="Dépannage des comptes, hors interface.",
    )
    sous = analyseur.add_subparsers(dest="commande", required=True)
    sous.add_parser("lister", help="Lister les comptes et leur état.")

    p_reactiver = sous.add_parser("reactiver", help="Réactiver un compte désactivé.")
    p_reactiver.add_argument("login")

    p_mdp = sous.add_parser("mot-de-passe", help="Remplacer le mot de passe d'un compte.")
    p_mdp.add_argument("login")
    p_mdp.add_argument("mot_de_passe")

    arguments = analyseur.parse_args()

    try:
        with FabriqueSession() as session:
            if arguments.commande == "lister":
                return lister(session)
            if arguments.commande == "reactiver":
                return reactiver(session, arguments.login)
            return changer_mot_de_passe(session, arguments.login, arguments.mot_de_passe)
    except SQLAlchemyError as erreur:
        # Celui qui lance cette commande est déjà en difficulté : une trace
        # de pile de trente lignes ne lui apprendrait rien d'utile.
        print(
            f"Base de données injoignable : {erreur.__class__.__name__}.\n"
            "  Vérifier que le service tourne (docker compose ps) et que\n"
            "  DATABASE_URL ou POSTGRES_* pointent sur la bonne base.",
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    sys.exit(principal())
