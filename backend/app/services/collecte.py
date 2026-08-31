"""Enregistrement unitaire d'une donnée collectée.

Les endpoints de saisie directe et le moteur de synchronisation appliquent
exactement les mêmes règles : le serveur impose l'auteur, l'horodatage de
réception et le statut initial, et une donnée déjà présente n'est jamais
dupliquée.
"""

import uuid
from datetime import UTC, datetime
from typing import Any, TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.enums import StatutValidation
from app.models.referentiels import Utilisateur

M = TypeVar("M", bound=Base)

CHAMPS_RESERVES_SERVEUR = {
    "auteur_id",
    "recu_le",
    "statut",
    "valide_par",
    "valide_le",
    "lot_id",
}


def enregistrer(
    session: Session,
    modele: type[M],
    entree: BaseModel,
    utilisateur: Utilisateur,
    *,
    champs_supplementaires: dict[str, Any] | None = None,
) -> tuple[M, bool]:
    """Crée un enregistrement de collecte.

    Retourne le couple (objet, créé). ``créé`` vaut False lorsque
    l'identifiant était déjà connu : c'est un renvoi, pas une erreur.
    """
    donnees = entree.model_dump()
    for champ in CHAMPS_RESERVES_SERVEUR:
        donnees.pop(champ, None)

    identifiant = donnees.pop("id", None) or uuid.uuid4()

    existant = session.get(modele, identifiant)
    if existant is not None:
        return existant, False

    maintenant = datetime.now(UTC)
    if donnees.get("saisi_le") is None:
        donnees["saisi_le"] = maintenant
    if champs_supplementaires:
        donnees.update(champs_supplementaires)

    objet = modele(
        id=identifiant,
        auteur_id=utilisateur.id,
        recu_le=maintenant,
        statut=StatutValidation.BRUTE,
        **donnees,
    )
    session.add(objet)
    try:
        session.commit()
    except IntegrityError as erreur:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Enregistrement refusé par la base : {erreur.orig}",
        ) from erreur
    session.refresh(objet)
    return objet, True
