"""Énumérations métier.

Les valeurs Python sont rigoureusement identiques aux libellés des types
ENUM PostgreSQL définis dans alembic/sql/0001_schema_initial.sql. Toute
divergence provoquerait une erreur d'insertion silencieuse côté base.
"""

from enum import StrEnum


class ChaineEnum(StrEnum):
    """Énumération dont la valeur est directement sérialisable en JSON.

    StrEnum garantit que ``str(membre)`` rend le libellé attendu par
    PostgreSQL, sans conversion explicite dans les requêtes.
    """


class ModeCollecte(ChaineEnum):
    QR_CODE = "qr_code"
    SAISIE_DIRECTE = "saisie_directe"
    OCR = "ocr"
    IMPORT_FICHIER = "import_fichier"
    VOIX = "voix"
    INTERFACE_SYSTEME = "interface_systeme"


class StatutValidation(ChaineEnum):
    """Cycle de vie d'une donnée collectée (ch. 5).

    brute → controlee → validee, avec rejetee comme issue alternative.
    """

    BRUTE = "brute"
    CONTROLEE = "controlee"
    VALIDEE = "validee"
    REJETEE = "rejetee"


class RoleUtilisateur(ChaineEnum):
    AGENT_TERRAIN = "agent_terrain"
    SUPERVISEUR = "superviseur"
    CONTROLEUR = "controleur"
    ADMIN = "admin"


class FamilleEngin(ChaineEnum):
    DUMPER = "dumper"
    FOREUSE = "foreuse"
    CHARGEUSE = "chargeuse"
    PELLE = "pelle"
    BULL = "bull"
    BRH = "brh"
    CAMION = "camion"
    AUTRE = "autre"


class TypeEquipement(ChaineEnum):
    BROYEUR = "broyeur"
    CONCASSEUR = "concasseur"
    CRIBLE = "crible"
    CONVOYEUR = "convoyeur"
    MOTEUR = "moteur"
    TROMMEL = "trommel"
    AUTRE = "autre"


class NiveauConcassage(ChaineEnum):
    PRIMAIRE = "primaire"
    SECONDAIRE = "secondaire"
    TERTIAIRE = "tertiaire"
    QUATERNAIRE = "quaternaire"
    TROMMEL = "trommel"


class TypeEvenementEngin(ChaineEnum):
    DEBUT = "debut"
    ARRET = "arret"
    PANNE = "panne"
    MAINTENANCE = "maintenance"
    REPRISE = "reprise"
    FIN = "fin"
    RAVITAILLEMENT = "ravitaillement"


class TypeEvenementEquipement(ChaineEnum):
    MARCHE_A_CHARGE = "marche_a_charge"
    MARCHE_A_VIDE = "marche_a_vide"
    ARRET = "arret"
    PANNE = "panne"
    MAINTENANCE = "maintenance"
    REPRISE = "reprise"
    FIN = "fin"


class NatureQuantite(ChaineEnum):
    """Une quantité pesée et une quantité estimée ne sont jamais confondues."""

    PESEE_REELLE = "pesee_reelle"
    ESTIMATION = "estimation"


class PosteTravail(ChaineEnum):
    JOUR = "jour"
    NUIT = "nuit"


class NatureCharge(ChaineEnum):
    ADMINISTRATIVE = "administrative"
    FONCTIONNEMENT = "fonctionnement"


class ResultatLot(ChaineEnum):
    OK = "ok"
    PARTIEL = "partiel"
    REJETE = "rejete"


# Types d'événements traduisant un arrêt : une cause codifiée est alors attendue.
EVENEMENTS_ENGIN_AVEC_CAUSE = {
    TypeEvenementEngin.ARRET,
    TypeEvenementEngin.PANNE,
    TypeEvenementEngin.MAINTENANCE,
}

EVENEMENTS_EQUIPEMENT_AVEC_CAUSE = {
    TypeEvenementEquipement.ARRET,
    TypeEvenementEquipement.PANNE,
    TypeEvenementEquipement.MAINTENANCE,
}
