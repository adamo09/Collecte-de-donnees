"""Moteur et sessions SQLAlchemy."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import parametres

moteur = create_engine(
    parametres.url_base_de_donnees,
    pool_pre_ping=True,      # une carrière n'a pas toujours un réseau stable
    pool_size=10,
    max_overflow=20,
    echo=False,
)

FabriqueSession = sessionmaker(bind=moteur, autocommit=False, autoflush=False)


def obtenir_session() -> Generator[Session, None, None]:
    """Dépendance FastAPI fournissant une session par requête."""
    session = FabriqueSession()
    try:
        yield session
    finally:
        session.close()
