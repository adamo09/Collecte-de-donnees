"""Base déclarative SQLAlchemy commune à tous les modèles."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Classe de base des modèles CADERAC."""
