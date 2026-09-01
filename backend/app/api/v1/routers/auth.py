"""Authentification et gestion des comptes."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.core.config import parametres
from app.core.dependances import ExigeAdmin, SessionBD, UtilisateurConnecte
from app.core.securite import (
    JetonInvalide,
    creer_jeton,
    decoder_jeton,
    hacher_mot_de_passe,
    verifier_mot_de_passe,
)
from app.models.enums import RoleUtilisateur
from app.models.referentiels import Utilisateur
from app.schemas.auth import (
    ChangementMotDePasse,
    DemandeConnexion,
    DemandeRafraichissement,
    Jetons,
    UtilisateurCreation,
    UtilisateurModification,
    UtilisateurSortie,
)
from app.schemas.communs import MessageReponse

routeur = APIRouter(prefix="/auth", tags=["Authentification"])


def _emettre_jetons(utilisateur: Utilisateur) -> Jetons:
    return Jetons(
        access_token=creer_jeton(utilisateur.id, "acces"),
        refresh_token=creer_jeton(utilisateur.id, "rafraichissement"),
        expire_dans_secondes=parametres.access_token_expire_minutes * 60,
    )


def _authentifier(session, login: str, mot_de_passe: str) -> Utilisateur:
    """Vérifie un couple login / mot de passe et retourne le compte."""
    utilisateur = session.execute(
        select(Utilisateur).where(Utilisateur.login == login)
    ).scalar_one_or_none()

    # Message volontairement identique dans les deux cas : distinguer
    # « login inconnu » de « mot de passe faux » faciliterait l'énumération
    # des comptes.
    if utilisateur is None or not verifier_mot_de_passe(
        mot_de_passe, utilisateur.mot_de_passe_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login ou mot de passe incorrect.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not utilisateur.actif:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Ce compte est désactivé."
        )

    utilisateur.derniere_connexion = datetime.now(UTC)
    session.commit()
    return utilisateur


@routeur.post(
    "/connexion",
    response_model=Jetons,
    summary="Ouvrir une session (formulaire OAuth2)",
)
def connexion(
    session: SessionBD,
    formulaire: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Jetons:
    """Point d'entrée standard OAuth2, utilisé par la documentation interactive."""
    return _emettre_jetons(
        _authentifier(session, formulaire.username, formulaire.password)
    )


@routeur.post(
    "/connexion-json",
    response_model=Jetons,
    summary="Ouvrir une session (JSON)",
)
def connexion_json(session: SessionBD, demande: DemandeConnexion) -> Jetons:
    """Variante JSON, plus simple à consommer depuis l'application mobile."""
    return _emettre_jetons(
        _authentifier(session, demande.login, demande.mot_de_passe)
    )


@routeur.post("/rafraichir", response_model=Jetons, summary="Renouveler les jetons")
def rafraichir(session: SessionBD, demande: DemandeRafraichissement) -> Jetons:
    """Renouvelle la paire de jetons à partir du jeton de rafraîchissement.

    Un terminal peut rester des semaines hors couverture : c'est ce jeton,
    à durée de vie longue, qui lui évite une reconnexion sur le terrain.
    """
    try:
        identifiant = decoder_jeton(demande.refresh_token, type_attendu="rafraichissement")
    except JetonInvalide as erreur:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton de rafraîchissement invalide ou expiré.",
        ) from erreur

    utilisateur = session.get(Utilisateur, identifiant)
    if utilisateur is None or not utilisateur.actif:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte introuvable ou désactivé."
        )
    return _emettre_jetons(utilisateur)


@routeur.get("/moi", response_model=UtilisateurSortie, summary="Compte courant")
def moi(utilisateur: UtilisateurConnecte) -> Utilisateur:
    return utilisateur


@routeur.post(
    "/moi/mot-de-passe", response_model=MessageReponse, summary="Changer son mot de passe"
)
def changer_mot_de_passe(
    session: SessionBD, utilisateur: UtilisateurConnecte, demande: ChangementMotDePasse
) -> MessageReponse:
    if not verifier_mot_de_passe(
        demande.mot_de_passe_actuel, utilisateur.mot_de_passe_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Mot de passe actuel incorrect."
        )
    utilisateur.mot_de_passe_hash = hacher_mot_de_passe(demande.nouveau_mot_de_passe)
    session.commit()
    return MessageReponse(message="Mot de passe modifié.")


@routeur.get(
    "/utilisateurs", response_model=list[UtilisateurSortie], summary="Lister les comptes"
)
def lister_utilisateurs(session: SessionBD, _: ExigeAdmin) -> list[Utilisateur]:
    return list(
        session.execute(select(Utilisateur).order_by(Utilisateur.login)).scalars()
    )


@routeur.post(
    "/utilisateurs",
    response_model=UtilisateurSortie,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un compte",
)
def creer_utilisateur(
    session: SessionBD, _: ExigeAdmin, demande: UtilisateurCreation
) -> Utilisateur:
    existant = session.execute(
        select(Utilisateur).where(Utilisateur.login == demande.login)
    ).scalar_one_or_none()
    if existant is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Le login « {demande.login} » est déjà utilisé.",
        )

    utilisateur = Utilisateur(
        login=demande.login,
        mot_de_passe_hash=hacher_mot_de_passe(demande.mot_de_passe),
        nom_complet=demande.nom_complet,
        role=demande.role,
        site_id=demande.site_id,
        matricule=demande.matricule,
    )
    session.add(utilisateur)
    session.commit()
    session.refresh(utilisateur)
    return utilisateur


@routeur.patch(
    "/utilisateurs/{utilisateur_id}",
    response_model=UtilisateurSortie,
    summary="Modifier un compte",
)
def modifier_utilisateur(
    session: SessionBD,
    courant: ExigeAdmin,
    utilisateur_id: str,
    demande: UtilisateurModification,
) -> Utilisateur:
    utilisateur = session.get(Utilisateur, utilisateur_id)
    if utilisateur is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Compte introuvable."
        )

    # Toute action exige un compte actif ET le rôle admin : un
    # administrateur qui se désactive ou se déclasse lui-même n'a plus
    # aucun moyen de revenir en arrière par l'application — pas même
    # celui de se réactiver. Le clic est trop facile, aligné avec le
    # « Désactiver » de toutes les autres lignes, pour rester sans
    # garde-fou.
    #
    # Refuser la seule manœuvre réflexive suffit à garantir qu'il reste
    # toujours un administrateur actif : l'appelant est nécessairement
    # actif et administrateur, donc désactiver quelqu'un d'autre le
    # laisse, lui, pour rouvrir. Un contrôle du « dernier administrateur »
    # ne se déclencherait jamais.
    if str(utilisateur.id) == str(courant.id):
        if demande.actif is False:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Un administrateur ne peut pas désactiver son propre compte : "
                    "il se fermerait la porte. Un autre administrateur le peut."
                ),
            )
        if demande.role is not None and demande.role is not RoleUtilisateur.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Un administrateur ne peut pas retirer son propre rôle : "
                    "il perdrait l'accès aux référentiels et aux comptes."
                ),
            )

    for champ, valeur in demande.model_dump(exclude_unset=True).items():
        setattr(utilisateur, champ, valeur)
    session.commit()
    session.refresh(utilisateur)
    return utilisateur
