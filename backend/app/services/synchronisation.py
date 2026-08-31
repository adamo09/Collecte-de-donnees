"""Moteur d'ingestion des lots envoyés par les terminaux (ch. 12).

Trois garanties structurent ce module :

1. **Idempotence.** Les identifiants sont produits par le terminal. Renvoyer
   un lot déjà reçu ne crée aucun doublon : la réponse d'origine est rejouée
   à l'identique.
2. **Acceptation partielle.** Un enregistrement invalide ne fait pas échouer
   le lot entier. Chaque insertion est isolée dans un point de reprise, et
   le terminal reçoit le sort de chacun de ses enregistrements.
3. **Traçabilité.** Le serveur impose lui-même l'auteur, l'horodatage de
   réception et le statut initial. Un terminal ne peut ni usurper un auteur
   ni déclarer une donnée déjà validée.
"""

import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.collecte import (
    AffectationReelleEngin,
    ChargeEngin,
    EvenementEngin,
    EvenementEquipement,
    MinageEnginMobilise,
    PeseePontBascule,
    PrestationMinage,
    RotationDumper,
    SortiePiece,
    TrouForage,
)
from app.models.enums import ResultatLot, StatutValidation
from app.models.referentiels import Utilisateur
from app.models.tracabilite import LotEnregistrement, LotSynchronisation
from app.schemas.synchronisation import (
    LotSynchronisationEntree,
    LotSynchronisationSortie,
    ResultatEnregistrement,
)
from app.services.reference import generer_reference_trou

# Champs que le terminal ne peut jamais fixer lui-même.
CHAMPS_RESERVES_SERVEUR = {
    "auteur_id",
    "recu_le",
    "statut",
    "valide_par",
    "valide_le",
    "lot_id",
    "reference",
    "cloture_le",
}


@dataclass(frozen=True)
class DescripteurTable:
    """Associe une liste du lot à la table qu'elle alimente."""

    champ_lot: str
    nom_table: str
    modele: type[Base]
    apres_construction: Callable[[Session, Any], None] | None = None


def _finaliser_trou(session: Session, trou: TrouForage) -> None:
    """Attribue la référence lisible et l'horodatage de clôture."""
    if trou.reference is None:
        trou.reference = generer_reference_trou(session, trou)
    if trou.heure_fin is not None and trou.cloture_le is None:
        trou.cloture_le = datetime.now(UTC)


TABLES_SYNCHRONISABLES: tuple[DescripteurTable, ...] = (
    DescripteurTable("trous_forage", "trou_forage", TrouForage, _finaliser_trou),
    DescripteurTable("evenements_engin", "evenement_engin", EvenementEngin),
    DescripteurTable("rotations_dumper", "rotation_dumper", RotationDumper),
    DescripteurTable("evenements_equipement", "evenement_equipement", EvenementEquipement),
    DescripteurTable("pesees", "pesee_pont_bascule", PeseePontBascule),
    DescripteurTable("prestations_minage", "prestation_minage", PrestationMinage),
    DescripteurTable("sorties_piece", "sortie_piece", SortiePiece),
    DescripteurTable("charges_engin", "charge_engin", ChargeEngin),
    DescripteurTable(
        "affectations_reelles", "affectation_reelle_engin", AffectationReelleEngin
    ),
)


class LotTropVolumineux(Exception):
    """Le lot dépasse la taille maximale acceptée."""


def _construire_objet(
    descripteur: DescripteurTable,
    entree: BaseModel,
    utilisateur: Utilisateur,
    lot_id: uuid.UUID,
    recu_le: datetime,
) -> tuple[Base, uuid.UUID, list[MinageEnginMobilise]]:
    """Transforme un enregistrement du lot en objet ORM prêt à insérer."""
    donnees = entree.model_dump(exclude_none=False)

    # Les engins mobilisés d'une prestation de minage sont une table liée.
    engins_mobilises_bruts = donnees.pop("engins_mobilises", None) or []

    for champ in CHAMPS_RESERVES_SERVEUR:
        donnees.pop(champ, None)

    identifiant = donnees.pop("id", None) or uuid.uuid4()

    # saisi_le est l'horodatage terrain. Si le terminal ne l'a pas fourni,
    # l'heure de réception en tient lieu, faute de mieux.
    if donnees.get("saisi_le") is None:
        donnees["saisi_le"] = recu_le

    objet = descripteur.modele(
        id=identifiant,
        auteur_id=utilisateur.id,
        recu_le=recu_le,
        statut=StatutValidation.BRUTE,
        lot_id=lot_id,
        **donnees,
    )

    engins_mobilises = [
        MinageEnginMobilise(
            prestation_id=identifiant,
            engin_id=e["engin_id"],
            duree_heures=e.get("duree_heures"),
        )
        for e in engins_mobilises_bruts
    ]
    return objet, identifiant, engins_mobilises


def _message_erreur(erreur: Exception) -> str:
    """Rend une erreur de base lisible par un agent de terrain."""
    detail = str(getattr(erreur, "orig", erreur)).strip()
    premiere_ligne = detail.splitlines()[0] if detail else type(erreur).__name__
    return premiere_ligne[:500]


def _rejouer_reponse(
    session: Session, lot: LotSynchronisation
) -> LotSynchronisationSortie:
    """Reconstruit la réponse d'un lot déjà traité, sans rien réinsérer."""
    lignes = session.execute(
        select(LotEnregistrement).where(LotEnregistrement.lot_id == lot.id)
    ).scalars()
    details = [
        ResultatEnregistrement(
            table_cible=ligne.table_cible,
            id=ligne.enregistrement,
            accepte=ligne.accepte,
            doublon=ligne.doublon,
            erreur=ligne.erreur,
        )
        for ligne in lignes
    ]
    return LotSynchronisationSortie(
        lot_id=lot.id,
        recu_le=lot.recu_le,
        nb_enregistrements=lot.nb_enregistrements,
        nb_acceptes=lot.nb_acceptes,
        nb_rejetes=lot.nb_rejetes,
        nb_doublons=sum(1 for d in details if d.doublon),
        resultat=lot.resultat,
        details=details,
        deja_traite=True,
    )


def ingerer_lot(
    session: Session,
    entree: LotSynchronisationEntree,
    utilisateur: Utilisateur,
    taille_maximale: int,
) -> LotSynchronisationSortie:
    """Ingère un lot et retourne le sort de chacun de ses enregistrements."""
    # Idempotence : un lot déjà reçu n'est jamais retraité.
    lot_existant = session.get(LotSynchronisation, entree.lot_id)
    if lot_existant is not None:
        return _rejouer_reponse(session, lot_existant)

    total = entree.nombre_total()
    if total > taille_maximale:
        raise LotTropVolumineux(
            f"Ce lot contient {total} enregistrements ; le maximum accepté est "
            f"{taille_maximale}. Le terminal doit le découper."
        )

    recu_le = datetime.now(UTC)
    lot = LotSynchronisation(
        id=entree.lot_id,
        terminal_id=entree.terminal_id,
        utilisateur_id=utilisateur.id,
        application_version=entree.application_version,
        nb_enregistrements=total,
        envoye_le=entree.envoye_le,
        recu_le=recu_le,
        resultat=ResultatLot.OK,
    )
    session.add(lot)
    # Le lot doit exister avant les enregistrements qui le référencent.
    session.flush()

    details: list[ResultatEnregistrement] = []

    for descripteur in TABLES_SYNCHRONISABLES:
        enregistrements: Sequence[BaseModel] = getattr(entree, descripteur.champ_lot)
        for element in enregistrements:
            details.append(
                _inserer_enregistrement(
                    session, descripteur, element, utilisateur, lot, recu_le
                )
            )

    nb_acceptes = sum(1 for d in details if d.accepte)
    nb_rejetes = len(details) - nb_acceptes
    nb_doublons = sum(1 for d in details if d.doublon)

    lot.nb_acceptes = nb_acceptes
    lot.nb_rejetes = nb_rejetes
    lot.resultat = (
        ResultatLot.OK
        if nb_rejetes == 0
        else ResultatLot.REJETE
        if nb_acceptes == 0
        else ResultatLot.PARTIEL
    )
    session.commit()

    return LotSynchronisationSortie(
        lot_id=lot.id,
        recu_le=recu_le,
        nb_enregistrements=total,
        nb_acceptes=nb_acceptes,
        nb_rejetes=nb_rejetes,
        nb_doublons=nb_doublons,
        resultat=lot.resultat,
        details=details,
        deja_traite=False,
    )


def _inserer_enregistrement(
    session: Session,
    descripteur: DescripteurTable,
    element: BaseModel,
    utilisateur: Utilisateur,
    lot: LotSynchronisation,
    recu_le: datetime,
) -> ResultatEnregistrement:
    """Insère un enregistrement, isolé pour ne pas compromettre le lot."""
    identifiant = getattr(element, "id", None) or uuid.uuid4()

    # Déjà présent : c'est un renvoi, pas une erreur. Le terminal peut purger
    # sa file d'envoi.
    if session.get(descripteur.modele, identifiant) is not None:
        return _journaliser(
            session, lot, descripteur.nom_table, identifiant,
            accepte=True, doublon=True, erreur=None,
        )

    try:
        # Point de reprise : l'échec d'un enregistrement n'annule que lui.
        with session.begin_nested():
            objet, identifiant, lies = _construire_objet(
                descripteur, element, utilisateur, lot.id, recu_le
            )
            session.add(objet)
            if descripteur.apres_construction is not None:
                descripteur.apres_construction(session, objet)
            session.flush()
            for lie in lies:
                session.add(lie)
            session.flush()
    except (IntegrityError, SQLAlchemyError, ValueError, TypeError) as erreur:
        return _journaliser(
            session, lot, descripteur.nom_table, identifiant,
            accepte=False, doublon=False, erreur=_message_erreur(erreur),
        )

    return _journaliser(
        session, lot, descripteur.nom_table, identifiant,
        accepte=True, doublon=False, erreur=None,
    )


def _journaliser(
    session: Session,
    lot: LotSynchronisation,
    nom_table: str,
    identifiant: uuid.UUID,
    *,
    accepte: bool,
    doublon: bool,
    erreur: str | None,
) -> ResultatEnregistrement:
    """Consigne le sort d'un enregistrement et le renvoie au terminal."""
    session.add(
        LotEnregistrement(
            lot_id=lot.id,
            table_cible=nom_table,
            enregistrement=identifiant,
            accepte=accepte,
            doublon=doublon,
            erreur=erreur,
        )
    )
    session.flush()
    return ResultatEnregistrement(
        table_cible=nom_table,
        id=identifiant,
        accepte=accepte,
        doublon=doublon,
        erreur=erreur,
    )
