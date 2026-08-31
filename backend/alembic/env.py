"""Configuration Alembic.

L'URL de connexion n'est pas lue depuis alembic.ini mais depuis la
configuration applicative : il ne doit exister qu'une seule source de
vérité pour les paramètres de connexion.
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

# Import nécessaire pour peupler Base.metadata (utilisé par --autogenerate).
import app.models  # noqa: F401
from alembic import context
from app.core.config import parametres
from app.db.base import Base

config = context.config
config.set_main_option("sqlalchemy.url", parametres.url_base_de_donnees)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def executer_migrations_hors_ligne() -> None:
    """Génère le SQL sans se connecter à la base."""
    context.configure(
        url=parametres.url_base_de_donnees,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def executer_migrations_en_ligne() -> None:
    """Applique les migrations sur une connexion réelle."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    executer_migrations_hors_ligne()
else:
    executer_migrations_en_ligne()
