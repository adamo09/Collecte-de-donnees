"""Dépendances FastAPI : session, utilisateur courant, contrôle des rôles."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import parametres
from app.core.securite import JetonInvalide, decoder_jeton
from app.db.session import obtenir_session
from app.models.enums import RoleUtilisateur
from app.models.referentiels import Utilisateur

schema_oauth2 = OAuth2PasswordBearer(tokenUrl=f"{parametres.api_v1_prefix}/auth/connexion")

SessionBD = Annotated[Session, Depends(obtenir_session)]


def utilisateur_courant(
    session: SessionBD,
    jeton: Annotated[str, Depends(schema_oauth2)],
) -> Utilisateur:
    """Résout l'utilisateur porté par le jeton d'accès."""
    echec = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Identifiants invalides ou session expirée.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        identifiant = decoder_jeton(jeton, type_attendu="acces")
    except JetonInvalide as erreur:
        raise echec from erreur

    utilisateur = session.get(Utilisateur, identifiant)
    if utilisateur is None:
        raise echec
    if not utilisateur.actif:
        # 401 et non 403 : ce n'est pas un droit qui manque sur cet appel,
        # c'est la session entière qui n'a plus lieu d'être. Le client
        # tente alors de renouveler ses jetons, échoue, et ramène
        # l'utilisateur à l'écran de connexion — au lieu de le laisser
        # devant un écran mort qu'aucun clic ne débloque.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ce compte est désactivé.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return utilisateur


UtilisateurConnecte = Annotated[Utilisateur, Depends(utilisateur_courant)]


def exiger_roles(*roles: RoleUtilisateur) -> Callable[[Utilisateur], Utilisateur]:
    """Restreint un endpoint aux rôles indiqués.

    Le rôle admin passe partout : il n'a pas à être répété dans chaque appel.
    """
    autorises = set(roles) | {RoleUtilisateur.ADMIN}

    def verificateur(utilisateur: UtilisateurConnecte) -> Utilisateur:
        if utilisateur.role not in autorises:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Action réservée aux rôles : "
                    + ", ".join(sorted(r.value for r in autorises))
                ),
            )
        return utilisateur

    return verificateur


# Raccourcis pour les trois niveaux d'habilitation les plus courants.
ExigeControleur = Annotated[
    Utilisateur, Depends(exiger_roles(RoleUtilisateur.CONTROLEUR))
]
ExigeSuperviseur = Annotated[
    Utilisateur, Depends(exiger_roles(RoleUtilisateur.SUPERVISEUR, RoleUtilisateur.CONTROLEUR))
]
ExigeAdmin = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.ADMIN))]


def verifier_acces_site(utilisateur: Utilisateur, site_id: int) -> None:
    """Cloisonne les données par site.

    Un agent de terrain et un superviseur ne voient que leur site
    d'affectation. Contrôleurs et administrateurs voient les quatre sites :
    la consolidation multi-sites est précisément leur métier.
    """
    if utilisateur.role in {RoleUtilisateur.CONTROLEUR, RoleUtilisateur.ADMIN}:
        return
    if utilisateur.site_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aucun site n'est rattaché à ce compte : contacter l'administrateur.",
        )
    if utilisateur.site_id != site_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ce compte n'est pas habilité sur ce site.",
        )
