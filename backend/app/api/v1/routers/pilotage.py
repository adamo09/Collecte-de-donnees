"""Indicateurs de pilotage (ch. 15).

Un seul écran pour deux publics : l'exploitation et le contrôle de gestion.
Aucun coût n'y figure tant que les règles d'imputation ne sont pas arrêtées.
"""

from datetime import date

from fastapi import APIRouter

from app.core.dependances import ExigeSuperviseur, SessionBD
from app.schemas.pilotage import Indicateurs
from app.services import indicateurs

routeur = APIRouter(prefix="/pilotage", tags=["Pilotage"])


@routeur.get(
    "/indicateurs",
    response_model=Indicateurs,
    summary="Indicateurs de la période",
)
def lire_indicateurs(
    session: SessionBD,
    _: ExigeSuperviseur,
    site: str | None = None,
    du: date | None = None,
    au: date | None = None,
) -> dict:
    """Production, foration, disponibilité des engins et qualité de la collecte.

    Sans période, les trente derniers jours. La borne haute est incluse.
    """
    return indicateurs.calculer(session, site=site, du=du, au=au)
