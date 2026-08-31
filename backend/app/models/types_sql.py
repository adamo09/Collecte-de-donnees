"""Passerelle entre les énumérations Python et les types ENUM PostgreSQL.

Les types ENUM sont créés par la migration SQL, jamais par SQLAlchemy :
``create_type=False`` évite que l'ORM tente de les recréer.
"""

from enum import Enum as EnumPython

from sqlalchemy.dialects.postgresql import ENUM


def enum_pg(enumeration: type[EnumPython], nom: str) -> ENUM:
    """Construit le type SQLAlchemy correspondant à un ENUM PostgreSQL existant."""
    return ENUM(
        enumeration,
        name=nom,
        create_type=False,
        # Sans cela, SQLAlchemy enverrait le NOM du membre (« QR_CODE »)
        # là où PostgreSQL attend sa VALEUR (« qr_code »).
        values_callable=lambda e: [membre.value for membre in e],
    )
