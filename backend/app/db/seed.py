"""Amorçage de la base : compte administrateur et jeu de démonstration.

Exécution :
    python -m app.db.seed                 # compte administrateur seul
    python -m app.db.seed --demonstration # + parc et données d'exemple

Le jeu de démonstration n'a pas vocation à être chargé en production : il
sert à valider la chaîne complète avant l'inventaire physique du parc.
"""

import argparse
import sys
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import parametres
from app.core.securite import hacher_mot_de_passe
from app.db.session import FabriqueSession
from app.models.collecte import EvenementEngin, RotationDumper, Tir, TrouForage
from app.models.enums import (
    FamilleEngin,
    ModeCollecte,
    NatureQuantite,
    NiveauConcassage,
    PosteTravail,
    RoleUtilisateur,
    StatutValidation,
    TypeEquipement,
    TypeEvenementEngin,
)
from app.models.referentiels import (
    Engin,
    EquipementConcassage,
    Personnel,
    Produit,
    ProduitParcours,
    Site,
    Utilisateur,
)


def creer_administrateur(session: Session) -> Utilisateur:
    """Crée le compte administrateur initial s'il n'existe pas déjà."""
    existant = session.execute(
        select(Utilisateur).where(Utilisateur.login == parametres.admin_login)
    ).scalar_one_or_none()
    if existant is not None:
        print(f"  Compte « {parametres.admin_login} » déjà présent.")
        return existant

    admin = Utilisateur(
        login=parametres.admin_login,
        mot_de_passe_hash=hacher_mot_de_passe(parametres.admin_mot_de_passe),
        nom_complet=parametres.admin_nom_complet,
        role=RoleUtilisateur.ADMIN,
    )
    session.add(admin)
    session.commit()
    session.refresh(admin)
    print(f"  Compte administrateur « {admin.login} » créé.")
    if parametres.admin_mot_de_passe in {"admin", "changer_ce_mot_de_passe"}:
        print("  ATTENTION : mot de passe par défaut. Le changer avant toute mise en service.")
    return admin


def charger_demonstration(session: Session, admin: Utilisateur) -> None:
    """Charge un parc réduit et quelques journées de collecte."""
    if session.execute(select(Engin).limit(1)).scalar_one_or_none() is not None:
        print("  Des engins existent déjà : jeu de démonstration ignoré.")
        return

    kossihouen = session.execute(
        select(Site).where(Site.code == "KOS")
    ).scalar_one()

    # --- Comptes couvrant les quatre rôles -------------------------------
    comptes = [
        ("agent.kos", "Kouassi Amani", RoleUtilisateur.AGENT_TERRAIN),
        ("superviseur.kos", "Traoré Fatoumata", RoleUtilisateur.SUPERVISEUR),
        ("controleur", "N'Guessan Yao", RoleUtilisateur.CONTROLEUR),
    ]
    utilisateurs: dict[str, Utilisateur] = {}
    for login, nom, role in comptes:
        compte = Utilisateur(
            login=login,
            mot_de_passe_hash=hacher_mot_de_passe("caderac2026"),
            nom_complet=nom,
            role=role,
            site_id=kossihouen.id if role != RoleUtilisateur.CONTROLEUR else None,
        )
        session.add(compte)
        utilisateurs[login] = compte
    session.flush()

    # --- Personnel -------------------------------------------------------
    personnel = [
        Personnel(
            matricule=f"MAT{i:03d}",
            nom_prenoms=nom,
            fonction=fonction,
            site_id=kossihouen.id,
            centre_cout=centre,
            date_debut_affect=date(2024, 1, 15),
        )
        for i, (nom, fonction, centre) in enumerate(
            [
                ("Koné Ibrahim", "Foreur", "CP01"),
                ("Ouattara Salif", "Conducteur dumper", "CP03"),
                ("Bamba Aya", "Conducteur dumper", "CP03"),
                ("Diallo Moussa", "Conducteur pelle", "CP03"),
                ("Yao Kouadio", "Opérateur concassage", "CP04"),
                ("Silué Adama", "Agent pont-bascule", "CP09"),
            ],
            start=1,
        )
    ]
    session.add_all(personnel)

    # --- Parc d'engins ---------------------------------------------------
    engins_def = [
        ("FE01", FamilleEngin.FOREUSE, "CP01", None, "Atlas Copco", "ROC D7"),
        ("DU01", FamilleEngin.DUMPER, "CP03", Decimal("28.50"), "Volvo", "A30G"),
        ("DU02", FamilleEngin.DUMPER, "CP03", Decimal("28.50"), "Volvo", "A30G"),
        ("DU03", FamilleEngin.DUMPER, "CP03", Decimal("25.00"), "Caterpillar", "725C"),
        ("PE01", FamilleEngin.PELLE, "CP03", None, "Komatsu", "PC300"),
        ("BR01", FamilleEngin.BRH, "CP03", None, "Atlas Copco", "HB3100"),
        ("CH01", FamilleEngin.CHARGEUSE, "CP09", Decimal("5.00"), "Caterpillar", "966H"),
    ]
    engins: dict[str, Engin] = {}
    for numero, famille, centre, capacite, marque, modele in engins_def:
        engin = Engin(
            numero_parc=numero,
            matricule=f"{numero}-CI",
            famille=famille,
            marque=marque,
            modele=modele,
            site_id=kossihouen.id,
            centre_cout_reference=centre,
            capacite_nominale=capacite,
            unite_capacite="t" if capacite else None,
            unite_compteur="heures",
            qr_token=f"ENG:{numero}",
            date_mise_en_service=date(2023, 6, 1),
        )
        session.add(engin)
        engins[numero] = engin
    session.flush()

    # --- Équipements de concassage --------------------------------------
    equipements = [
        ("Concasseur primaire L1", TypeEquipement.CONCASSEUR, NiveauConcassage.PRIMAIRE),
        ("Concasseur secondaire L1", TypeEquipement.CONCASSEUR, NiveauConcassage.SECONDAIRE),
        ("Crible tertiaire L1", TypeEquipement.CRIBLE, NiveauConcassage.TERTIAIRE),
        ("Convoyeur C1", TypeEquipement.CONVOYEUR, NiveauConcassage.PRIMAIRE),
    ]
    for designation, type_eq, niveau in equipements:
        equipement = EquipementConcassage(
            designation=designation,
            type=type_eq,
            site_id=kossihouen.id,
            ligne="Ligne 1",
            niveau=niveau,
        )
        session.add(equipement)
        session.flush()
        equipement.qr_token = f"EQP:{equipement.id}"

    # --- Produits et parcours de concassage ------------------------------
    produits_def = [
        ("0-3", "Sable concassé 0/3", "0/3",
         [NiveauConcassage.PRIMAIRE, NiveauConcassage.SECONDAIRE]),
        ("6-10", "Gravier 6/10", "6/10",
         [NiveauConcassage.PRIMAIRE, NiveauConcassage.SECONDAIRE,
          NiveauConcassage.TERTIAIRE]),
        ("15-25", "Gravier 15/25", "15/25",
         [NiveauConcassage.PRIMAIRE, NiveauConcassage.SECONDAIRE]),
    ]
    for code, libelle, granulometrie, parcours in produits_def:
        produit = Produit(
            code=code, libelle=libelle, site_id=kossihouen.id, granulometrie=granulometrie
        )
        session.add(produit)
        session.flush()
        for ordre, niveau in enumerate(parcours, start=1):
            session.add(
                ProduitParcours(produit_id=produit.id, ordre=ordre, niveau=niveau)
            )

    # --- Tir et trous de forage ------------------------------------------
    tir = Tir(numero_t="T12", site_id=kossihouen.id, date_tir=date.today())
    session.add(tir)
    session.flush()

    agent = utilisateurs["agent.kos"]
    # La journée simulée se termine à l'instant présent : sans cela, un
    # trou « ouvert » porterait un horodatage futur et n'apparaîtrait pas
    # dans l'écran des trous non clôturés, qui raisonne en ancienneté.
    debut_journee = (datetime.now(UTC) - timedelta(hours=8)).replace(
        minute=0, second=0, microsecond=0
    )
    aujourdhui = debut_journee.date()

    for index in range(6):
        heure_debut = debut_journee + timedelta(minutes=45 * index)
        # Le dernier trou reste ouvert : il alimente l'écran de contrôle des
        # trous non clôturés, l'anomalie la plus probable du module (ch. 6).
        cloture = index < 5
        session.add(
            TrouForage(
                id=uuid.uuid4(),
                reference=f"KOS-T12-{index + 1:04d}",
                site_id=kossihouen.id,
                tir_id=tir.id,
                foreuse_id=engins["FE01"].id,
                operateur_matricule="MAT001",
                poste=PosteTravail.JOUR,
                date_foration=aujourdhui,
                heure_debut=heure_debut,
                compteur_debut=Decimal(4820 + index),
                diametre_mm=Decimal("102"),
                maille_longueur_m=Decimal("3.0"),
                maille_largeur_m=Decimal("2.8"),
                gps_latitude=Decimal("5.481200"),
                gps_longitude=Decimal("-4.318500"),
                heure_fin=heure_debut + timedelta(minutes=38) if cloture else None,
                compteur_fin=Decimal(4820 + index) + Decimal("0.63") if cloture else None,
                metres_lineaires=Decimal("12.5") if cloture else None,
                numero_taillant="TAI-2291" if cloture else None,
                cloture_le=datetime.now(UTC) if cloture else None,
                source_collecte=ModeCollecte.QR_CODE,
                auteur_id=agent.id,
                saisi_le=heure_debut,
                recu_le=datetime.now(UTC),
                statut=StatutValidation.VALIDEE if index < 3 else StatutValidation.BRUTE,
                valide_par=utilisateurs["controleur"].id if index < 3 else None,
                valide_le=datetime.now(UTC) if index < 3 else None,
            )
        )

    # --- Rotations de dumpers --------------------------------------------
    # Deux natures de quantité coexistent volontairement : DU01 dispose d'une
    # pesée réelle, les autres d'une estimation issue de la capacité nominale.
    for index in range(24):
        dumper = ["DU01", "DU02", "DU03"][index % 3]
        pesee_reelle = dumper == "DU01" and index % 6 == 0
        session.add(
            RotationDumper(
                id=uuid.uuid4(),
                dumper_id=engins[dumper].id,
                site_id=kossihouen.id,
                horodatage=debut_journee + timedelta(minutes=18 * index),
                point_deversement="Concassage primaire",
                poste=PosteTravail.JOUR,
                operateur_matricule="MAT002" if dumper == "DU01" else "MAT003",
                centre_cout_reel="CP03",
                poids_reel_t=Decimal("29.10") if pesee_reelle else None,
                quantite_estimee_t=None if pesee_reelle else engins[dumper].capacite_nominale,
                nature_quantite=(
                    NatureQuantite.PESEE_REELLE if pesee_reelle else NatureQuantite.ESTIMATION
                ),
                source_collecte=ModeCollecte.SAISIE_DIRECTE,
                auteur_id=agent.id,
                saisi_le=debut_journee + timedelta(minutes=18 * index),
                recu_le=datetime.now(UTC),
                statut=StatutValidation.VALIDEE if index < 12 else StatutValidation.BRUTE,
                valide_par=utilisateurs["controleur"].id if index < 12 else None,
                valide_le=datetime.now(UTC) if index < 12 else None,
            )
        )

    # --- Événements engins -----------------------------------------------
    evenements = [
        (TypeEvenementEngin.DEBUT, 0, None, None),
        (TypeEvenementEngin.ARRET, 150, "PAUSE", None),
        (TypeEvenementEngin.REPRISE, 180, None, None),
        (TypeEvenementEngin.PANNE, 300, "PANNE_HYD", None),
        (TypeEvenementEngin.REPRISE, 390, None, None),
        (TypeEvenementEngin.RAVITAILLEMENT, 420, None, Decimal("180")),
        (TypeEvenementEngin.FIN, 600, None, None),
    ]
    for type_evt, minutes, cause, carburant in evenements:
        session.add(
            EvenementEngin(
                id=uuid.uuid4(),
                engin_id=engins["PE01"].id,
                site_id=kossihouen.id,
                centre_cout_reel="CP03",
                type_evenement=type_evt,
                horodatage=debut_journee + timedelta(minutes=minutes),
                compteur=Decimal(9100) + Decimal(minutes) / Decimal(60),
                cause_code=cause,
                carburant_litres=carburant,
                operateur_matricule="MAT004",
                poste=PosteTravail.JOUR,
                source_collecte=ModeCollecte.QR_CODE,
                auteur_id=agent.id,
                saisi_le=debut_journee + timedelta(minutes=minutes),
                recu_le=datetime.now(UTC),
                statut=StatutValidation.VALIDEE,
                valide_par=utilisateurs["controleur"].id,
                valide_le=datetime.now(UTC),
            )
        )

    session.commit()
    print("  Jeu de démonstration chargé sur le site KOS (mot de passe : caderac2026).")


def principal() -> int:
    analyseur = argparse.ArgumentParser(description="Amorçage de la base CADERAC.")
    analyseur.add_argument(
        "--demonstration",
        action="store_true",
        help="Charger un parc réduit et quelques journées de collecte.",
    )
    arguments = analyseur.parse_args()

    print("Amorçage de la base CADERAC…")
    with FabriqueSession() as session:
        admin = creer_administrateur(session)
        if arguments.demonstration:
            charger_demonstration(session, admin)
    print("Terminé.")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
