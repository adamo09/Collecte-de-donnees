"""Point d'entrée de l'API CADERAC."""

import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import __version__
from app.api.v1.routeur import routeur_v1
from app.core.config import parametres
from app.db.session import moteur

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s — %(message)s",
)
journal = logging.getLogger("caderac")

DESCRIPTION = """
Système de collecte de données terrain **CADERAC** — périmètre V1.

Ce système couvre la collecte, le contrôle et la restitution des données
opérationnelles des quatre carrières. **Le calcul des coûts de production
et de revient n'en fait pas partie** : il est assuré par le gestionnaire
externe à partir des exports produits ici.

### Ce que l'API garantit

* **Travail hors ligne.** Les identifiants sont générés par le terminal.
  Renvoyer un lot déjà transmis ne crée aucun doublon.
* **Réel et estimé jamais confondus.** Un tonnage pesé et un tonnage estimé
  occupent deux colonnes distinctes, et aucun total ne les additionne.
* **Traçabilité portée par la donnée.** Chaque enregistrement porte son
  mode de collecte, son auteur, ses deux horodatages et son statut.
* **Exports figés.** Les vues `v_export_*` constituent le contrat
  d'interface avec le gestionnaire externe.
"""

application = FastAPI(
    title="CADERAC — Collecte de données terrain",
    description=DESCRIPTION,
    version=__version__,
    docs_url="/documentation",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    contact={"name": "Direction du Contrôle de Gestion CADERAC"},
)

application.add_middleware(
    CORSMiddleware,
    allow_origins=parametres.origines_cors,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

application.include_router(routeur_v1, prefix=parametres.api_v1_prefix)


@application.exception_handler(SQLAlchemyError)
def gerer_erreur_base(requete: Request, erreur: SQLAlchemyError) -> JSONResponse:
    """Ne jamais exposer une trace SQL brute à un terminal de terrain."""
    journal.exception("Erreur base de données sur %s", requete.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": (
                "Erreur interne lors de l'accès aux données. "
                "Les données envoyées n'ont pas été enregistrées : réessayer."
            )
        },
    )


@application.get("/sante", tags=["Service"], summary="État du service")
def sante() -> dict:
    """Sonde de disponibilité, utilisée par la supervision et par les terminaux."""
    try:
        with moteur.connect() as connexion:
            connexion.execute(text("SELECT 1"))
        base = "ok"
    except SQLAlchemyError:
        journal.exception("Base de données injoignable")
        base = "injoignable"

    return {
        "service": "caderac-collecte",
        "version": __version__,
        "environnement": parametres.environnement,
        "base_de_donnees": base,
    }


@application.get("/", include_in_schema=False)
def accueil() -> dict:
    return {
        "service": "CADERAC — Collecte de données terrain",
        "version": __version__,
        "documentation": "/documentation",
    }
