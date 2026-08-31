# CADERAC — API de collecte

Backend FastAPI du système de collecte terrain. Voir le [README racine](../README.md)
pour la vue d'ensemble et la [documentation](../docs/) pour le détail fonctionnel.

## Démarrage

```bash
pip install -e ".[dev]"
export DATABASE_URL="postgresql+psycopg://caderac:motdepasse@localhost:5432/caderac"
alembic upgrade head
python -m app.db.seed --demonstration
uvicorn app.main:app --reload
```

Documentation interactive : http://localhost:8000/documentation

## Tests

Les tests s'exécutent sur un **vrai PostgreSQL** : le schéma repose sur des
types ENUM, des colonnes générées, des contraintes CHECK et des triggers
qu'aucun autre moteur ne reproduit fidèlement.

```bash
pytest -q                       # base caderac_pytest, créée et détruite automatiquement
TEST_DB_NAME=autre_base pytest   # pour changer de base
```

## Organisation

| Répertoire        | Contenu                                                        |
|-------------------|----------------------------------------------------------------|
| `alembic/sql/`    | DDL versionné — source de vérité du schéma                     |
| `app/models/`     | Modèles SQLAlchemy, alignés sur le DDL                          |
| `app/schemas/`    | Contrats d'entrée et de sortie de l'API                         |
| `app/services/`   | Règles métier : synchronisation, validation, références         |
| `app/api/v1/`     | Routeurs HTTP                                                   |
| `app/exports/`    | Catalogue des exports et génération Excel / CSV                 |
