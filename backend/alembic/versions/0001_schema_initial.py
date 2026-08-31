"""Schéma initial CADERAC — périmètre collecte V1.

Le DDL vit dans des fichiers .sql versionnés (alembic/sql/) plutôt que
dans du code Python : le commanditaire relit du SQL, et les colonnes
générées, les triggers et les vues s'expriment mal en opérations Alembic.

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REPERTOIRE_SQL = Path(__file__).resolve().parent.parent / "sql"


def _executer(nom_fichier: str) -> None:
    op.execute((REPERTOIRE_SQL / nom_fichier).read_text(encoding="utf-8"))


def upgrade() -> None:
    _executer("0001_schema_initial.sql")
    _executer("0002_vues_export.sql")
    _executer("0003_donnees_reference.sql")


def downgrade() -> None:
    # Le schéma occupe entièrement le schéma « public » : le recréer est
    # plus sûr qu'un DROP table par table dont l'ordre dépend des clés
    # étrangères.
    op.execute("DROP SCHEMA public CASCADE")
    op.execute("CREATE SCHEMA public")
