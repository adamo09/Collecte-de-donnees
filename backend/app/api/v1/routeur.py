"""Agrégation des routeurs de l'API v1."""

from fastapi import APIRouter

from app.api.v1.routers import (
    auth,
    concassage,
    expedition,
    exports,
    foration,
    marinage,
    minage,
    parc,
    referentiels,
    synchronisation,
    validation,
)

routeur_v1 = APIRouter()

# L'ordre détermine celui des sections dans la documentation interactive :
# authentification, socle, puis les modules dans l'ordre des centres de coûts.
routeur_v1.include_router(auth.routeur)
routeur_v1.include_router(referentiels.routeur)
routeur_v1.include_router(synchronisation.routeur)
routeur_v1.include_router(foration.routeur)
routeur_v1.include_router(minage.routeur)
routeur_v1.include_router(marinage.routeur)
routeur_v1.include_router(concassage.routeur)
routeur_v1.include_router(expedition.routeur)
routeur_v1.include_router(parc.routeur)
routeur_v1.include_router(validation.routeur)
routeur_v1.include_router(exports.routeur)
