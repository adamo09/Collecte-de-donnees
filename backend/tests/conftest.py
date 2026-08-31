"""Fixtures de test.

Les tests s'exécutent sur un vrai PostgreSQL, pas sur SQLite : le schéma
repose sur des types ENUM, des colonnes générées, des contraintes CHECK et
des triggers qu'aucun autre moteur ne reproduit. Tester ailleurs
reviendrait à ne pas tester les garanties du modèle.
"""

import os
import subprocess
import uuid
from collections.abc import Generator
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

RACINE = Path(__file__).resolve().parent.parent

# Base dédiée aux tests : jamais celle de développement.
URL_ADMIN = os.environ.get(
    "TEST_ADMIN_URL", "postgresql+psycopg://caderac:caderac@127.0.0.1:5432/postgres"
)
NOM_BASE_TEST = os.environ.get("TEST_DB_NAME", "caderac_pytest")
URL_TEST = URL_ADMIN.rsplit("/", 1)[0] + f"/{NOM_BASE_TEST}"

os.environ["DATABASE_URL"] = URL_TEST
os.environ["SECRET_KEY"] = "cle_de_test_ne_pas_utiliser_en_production"
os.environ["ENVIRONNEMENT"] = "test"


@pytest.fixture(scope="session", autouse=True)
def base_de_donnees() -> Generator[None, None, None]:
    """Recrée la base de test et y applique les migrations."""
    moteur_admin = create_engine(URL_ADMIN, isolation_level="AUTOCOMMIT")
    with moteur_admin.connect() as connexion:
        connexion.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :nom AND pid <> pg_backend_pid()"
            ),
            {"nom": NOM_BASE_TEST},
        )
        connexion.execute(text(f'DROP DATABASE IF EXISTS "{NOM_BASE_TEST}"'))
        connexion.execute(text(f'CREATE DATABASE "{NOM_BASE_TEST}"'))
    moteur_admin.dispose()

    environnement = {**os.environ, "DATABASE_URL": URL_TEST}
    resultat = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=RACINE,
        env=environnement,
        capture_output=True,
        text=True,
    )
    if resultat.returncode != 0:
        raise RuntimeError(f"Échec des migrations :\n{resultat.stderr}")

    yield

    moteur_admin = create_engine(URL_ADMIN, isolation_level="AUTOCOMMIT")
    with moteur_admin.connect() as connexion:
        connexion.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :nom AND pid <> pg_backend_pid()"
            ),
            {"nom": NOM_BASE_TEST},
        )
        connexion.execute(text(f'DROP DATABASE IF EXISTS "{NOM_BASE_TEST}"'))
    moteur_admin.dispose()


# Tables vidées entre deux tests. Les référentiels chargés par la migration
# (sites, centres de coûts, causes d'arrêt) sont conservés.
TABLES_A_VIDER = (
    "lot_enregistrement",
    "audit_modification",
    "minage_engin_mobilise",
    "trou_forage",
    "prestation_minage",
    "evenement_engin",
    "rotation_dumper",
    "campagne_pesage",
    "evenement_equipement",
    "sortie_piece",
    "vente",
    "pesee_pont_bascule",
    "charge_engin",
    "affectation_reelle_engin",
    "lot_synchronisation",
    "tir",
    "produit_parcours",
    "produit",
    "equipement_concassage",
    "engin",
    "personnel",
    "utilisateur",
)


@pytest.fixture
def session() -> Generator[Session, None, None]:
    """Session applicative, sur une base vidée de ses données de collecte."""
    from app.db.session import moteur

    with moteur.begin() as connexion:
        connexion.execute(
            text(f"TRUNCATE {', '.join(TABLES_A_VIDER)} RESTART IDENTITY CASCADE")
        )

    fabrique = sessionmaker(bind=moteur, autocommit=False, autoflush=False)
    with fabrique() as s:
        yield s


@pytest.fixture
def comptes(session: Session) -> dict:
    """Un compte par rôle, tous rattachés au site KOS sauf le contrôleur."""
    from app.core.securite import hacher_mot_de_passe
    from app.models.enums import RoleUtilisateur
    from app.models.referentiels import Utilisateur

    site = session.execute(text("SELECT id FROM site WHERE code = 'KOS'")).scalar_one()

    crees = {}
    for login, role, site_id in (
        ("agent", RoleUtilisateur.AGENT_TERRAIN, site),
        ("superviseur", RoleUtilisateur.SUPERVISEUR, site),
        ("controleur", RoleUtilisateur.CONTROLEUR, None),
        ("administrateur", RoleUtilisateur.ADMIN, None),
    ):
        utilisateur = Utilisateur(
            login=login,
            mot_de_passe_hash=hacher_mot_de_passe("motdepasse123"),
            nom_complet=login.capitalize(),
            role=role,
            site_id=site_id,
        )
        session.add(utilisateur)
        crees[login] = utilisateur
    session.commit()
    for utilisateur in crees.values():
        session.refresh(utilisateur)

    assert isinstance(site, int)
    crees["site_id"] = site  # type: ignore[assignment]
    return crees


@pytest.fixture
def parc(session: Session, comptes: dict) -> dict:
    """Une foreuse, deux dumpers, un opérateur et un tir."""
    from app.models.collecte import Tir
    from app.models.enums import FamilleEngin
    from app.models.referentiels import Engin, Personnel

    site_id = comptes["site_id"]

    session.add(
        Personnel(
            matricule="MAT001",
            nom_prenoms="Koné Ibrahim",
            fonction="Foreur",
            site_id=site_id,
            centre_cout="CP01",
        )
    )

    engins = {}
    for numero, famille, capacite in (
        ("FE01", FamilleEngin.FOREUSE, None),
        ("DU01", FamilleEngin.DUMPER, Decimal("28.50")),
        ("DU02", FamilleEngin.DUMPER, Decimal("25.00")),
    ):
        engin = Engin(
            numero_parc=numero,
            famille=famille,
            site_id=site_id,
            capacite_nominale=capacite,
            unite_capacite="t" if capacite else None,
            qr_token=f"ENG:{numero}",
        )
        session.add(engin)
        engins[numero] = engin

    tir = Tir(numero_t="T01", site_id=site_id, date_tir=date.today())
    session.add(tir)
    session.commit()
    for engin in engins.values():
        session.refresh(engin)
    session.refresh(tir)

    return {"site_id": site_id, "engins": engins, "tir": tir}


@pytest.fixture
def client(session: Session):
    """Client HTTP partageant la session de test."""
    from fastapi.testclient import TestClient

    from app.db.session import obtenir_session
    from app.main import application

    def session_de_test():
        yield session

    application.dependency_overrides[obtenir_session] = session_de_test
    with TestClient(application) as c:
        yield c
    application.dependency_overrides.clear()


@pytest.fixture
def entetes(client, comptes):
    """Fabrique d'en-têtes d'authentification pour un login donné."""

    def fabriquer(login: str = "agent") -> dict:
        reponse = client.post(
            "/api/v1/auth/connexion-json",
            json={"login": login, "mot_de_passe": "motdepasse123"},
        )
        assert reponse.status_code == 200, reponse.text
        return {"Authorization": f"Bearer {reponse.json()['access_token']}"}

    return fabriquer


def horodatage(heures: int = 0, minutes: int = 0) -> str:
    """Horodatage ISO décalé par rapport à maintenant."""
    from datetime import timedelta

    return (datetime.now(UTC) - timedelta(hours=heures, minutes=minutes)).isoformat()


def nouvel_id() -> str:
    return str(uuid.uuid4())
