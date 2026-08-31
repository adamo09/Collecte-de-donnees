"""Hachage des mots de passe et jetons d'accès.

bcrypt et PyJWT sont utilisés directement plutôt qu'à travers passlib et
python-jose : ces deux surcouches ajoutent des dépendances lourdes pour un
besoin qui tient en quelques lignes, et passlib 1.7.4 est incompatible avec
bcrypt 4.1 et supérieur.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import bcrypt
import jwt

from app.core.config import parametres

# bcrypt ignore silencieusement ce qui dépasse 72 octets : on tronque
# explicitement pour que le comportement soit visible et reproductible.
LONGUEUR_MAX_MOT_DE_PASSE = 72

TypeJeton = Literal["acces", "rafraichissement"]


def hacher_mot_de_passe(mot_de_passe: str) -> str:
    octets = mot_de_passe.encode("utf-8")[:LONGUEUR_MAX_MOT_DE_PASSE]
    return bcrypt.hashpw(octets, bcrypt.gensalt()).decode("utf-8")


def verifier_mot_de_passe(mot_de_passe: str, empreinte: str) -> bool:
    octets = mot_de_passe.encode("utf-8")[:LONGUEUR_MAX_MOT_DE_PASSE]
    try:
        return bcrypt.checkpw(octets, empreinte.encode("utf-8"))
    except ValueError:
        # Empreinte corrompue ou d'un format inconnu : refus, sans exception.
        return False


def creer_jeton(
    sujet: uuid.UUID | str,
    type_jeton: TypeJeton = "acces",
    duree: timedelta | None = None,
) -> str:
    """Émet un jeton JWT signé pour l'utilisateur indiqué."""
    if duree is None:
        duree = (
            timedelta(minutes=parametres.access_token_expire_minutes)
            if type_jeton == "acces"
            # Un terminal peut rester des semaines hors couverture réseau :
            # le jeton de rafraîchissement doit survivre à cette absence.
            else timedelta(days=parametres.refresh_token_expire_days)
        )
    maintenant = datetime.now(UTC)
    charge: dict[str, Any] = {
        "sub": str(sujet),
        "type": type_jeton,
        "iat": maintenant,
        "exp": maintenant + duree,
    }
    return jwt.encode(charge, parametres.secret_key, algorithm=parametres.algorithme_jwt)


class JetonInvalide(Exception):
    """Jeton absent, expiré, mal signé ou du mauvais type."""


def decoder_jeton(jeton: str, type_attendu: TypeJeton = "acces") -> uuid.UUID:
    """Retourne l'identifiant de l'utilisateur porté par le jeton."""
    try:
        charge = jwt.decode(
            jeton, parametres.secret_key, algorithms=[parametres.algorithme_jwt]
        )
    except jwt.PyJWTError as erreur:
        raise JetonInvalide(str(erreur)) from erreur

    if charge.get("type") != type_attendu:
        raise JetonInvalide(
            f"jeton de type « {charge.get('type')} » là où « {type_attendu} » est attendu"
        )
    try:
        return uuid.UUID(charge["sub"])
    except (KeyError, ValueError) as erreur:
        raise JetonInvalide("sujet du jeton illisible") from erreur
