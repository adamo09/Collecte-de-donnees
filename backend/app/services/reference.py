"""Génération des identifiants lisibles.

L'UUID d'un trou est produit par le terminal ; sa référence lisible
(KOS-T12-0043) est produite par le serveur, seul à connaître le rang du
trou dans son tir (ch. 6).
"""

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.collecte import Tir, TrouForage
from app.models.referentiels import Site


def _verrouiller_compteur(session: Session, cle: str) -> None:
    """Sérialise l'attribution d'un rang entre transactions concurrentes.

    Un verrou consultatif de transaction est suffisant et se libère seul au
    COMMIT ou au ROLLBACK : deux terminaux qui synchronisent en même temps
    n'obtiendront jamais la même référence.
    """
    session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:cle))"), {"cle": cle}
    )


def generer_reference_trou(session: Session, trou: TrouForage) -> str:
    """Construit la référence lisible d'un trou de forage.

    Rattaché à un tir      : KOS-T12-0043 (rang du trou dans le tir).
    Sans tir déclaré       : KOS-260831-0043 (rang du trou dans la journée).
    """
    code_site = session.execute(
        select(Site.code).where(Site.id == trou.site_id)
    ).scalar_one()

    if trou.tir_id is not None:
        numero_tir = session.execute(
            select(Tir.numero_t).where(Tir.id == trou.tir_id)
        ).scalar_one_or_none()
        prefixe = f"{code_site}-{numero_tir or 'SANSTIR'}"
        condition = TrouForage.tir_id == trou.tir_id
    else:
        prefixe = f"{code_site}-{trou.date_foration:%y%m%d}"
        condition = (TrouForage.site_id == trou.site_id) & (
            TrouForage.date_foration == trou.date_foration
        )

    _verrouiller_compteur(session, prefixe)

    rang = session.execute(
        select(func.count()).select_from(TrouForage).where(condition)
    ).scalar_one()

    # Le verrou garantit l'unicité du rang, mais des références ont pu être
    # créées avant l'introduction du compteur : on avance jusqu'au premier
    # libre plutôt que d'échouer sur la contrainte d'unicité.
    while True:
        rang += 1
        reference = f"{prefixe}-{rang:04d}"
        existe = session.execute(
            select(func.count())
            .select_from(TrouForage)
            .where(TrouForage.reference == reference)
        ).scalar_one()
        if not existe:
            return reference
