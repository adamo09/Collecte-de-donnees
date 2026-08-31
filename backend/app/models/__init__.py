"""Modèles SQLAlchemy du périmètre de collecte V1."""

from app.models.collecte import (
    AffectationReelleEngin,
    CampagnePesage,
    ChargeEngin,
    EvenementEngin,
    EvenementEquipement,
    MinageEnginMobilise,
    PeseePontBascule,
    PrestationMinage,
    RotationDumper,
    SortiePiece,
    Tir,
    TrouForage,
    Vente,
)
from app.models.referentiels import (
    CauseArret,
    CentreDeCout,
    Engin,
    EquipementConcassage,
    Personnel,
    Produit,
    ProduitParcours,
    Site,
    Utilisateur,
)
from app.models.tracabilite import (
    AuditModification,
    LotEnregistrement,
    LotSynchronisation,
    VersionReferentiel,
)

__all__ = [
    # Référentiels
    "Site",
    "Utilisateur",
    "CentreDeCout",
    "Engin",
    "EquipementConcassage",
    "Personnel",
    "Produit",
    "ProduitParcours",
    "CauseArret",
    # Collecte
    "Tir",
    "TrouForage",
    "PrestationMinage",
    "MinageEnginMobilise",
    "EvenementEngin",
    "RotationDumper",
    "CampagnePesage",
    "EvenementEquipement",
    "SortiePiece",
    "PeseePontBascule",
    "Vente",
    "ChargeEngin",
    "AffectationReelleEngin",
    # Traçabilité et synchronisation
    "AuditModification",
    "LotSynchronisation",
    "LotEnregistrement",
    "VersionReferentiel",
]
