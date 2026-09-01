"""Le schéma OpenAPI versionné doit refléter l'API réelle.

`backend/openapi.json` n'est pas un artefact décoratif : c'est lui qui
engendre les types TypeScript du back-office. S'il dérive de l'API, le
front compile contre un contrat qui n'existe plus — et l'erreur n'apparaît
qu'à l'exécution, chez le contrôleur.
"""

import json
from pathlib import Path

import pytest

from app.main import application

CHEMIN = Path(__file__).resolve().parent.parent / "openapi.json"


@pytest.fixture(scope="module")
def schema_versionne() -> dict:
    if not CHEMIN.exists():
        pytest.fail(
            "backend/openapi.json est absent. Le régénérer :\n"
            '  python -c "import json; from app.main import application; '
            "json.dump(application.openapi(), open('openapi.json','w'), "
            'ensure_ascii=False, indent=1)"'
        )
    return json.loads(CHEMIN.read_text(encoding="utf-8"))


def _operations(schema: dict) -> dict[str, str]:
    """Associe « MÉTHODE chemin » à l'identifiant d'opération."""
    return {
        f"{methode.upper()} {chemin}": operation["operationId"]
        for chemin, methodes in schema["paths"].items()
        for methode, operation in methodes.items()
        if methode in ("get", "post", "patch", "put", "delete")
    }


def test_le_schema_versionne_couvre_les_memes_operations(schema_versionne):
    reelles = _operations(application.openapi())
    versionnees = _operations(schema_versionne)

    manquantes = sorted(set(reelles) - set(versionnees))
    obsoletes = sorted(set(versionnees) - set(reelles))

    assert not manquantes, (
        "Opérations absentes du schéma versionné : "
        f"{manquantes}. Régénérer backend/openapi.json."
    )
    assert not obsoletes, (
        f"Opérations disparues de l'API mais encore dans le schéma : {obsoletes}."
    )


def test_les_identifiants_d_operation_sont_stables(schema_versionne):
    """Un identifiant renommé casse le client TypeScript sans prévenir."""
    reelles = _operations(application.openapi())
    versionnees = _operations(schema_versionne)

    ecarts = {
        cle: (versionnees[cle], reelles[cle])
        for cle in set(reelles) & set(versionnees)
        if reelles[cle] != versionnees[cle]
    }
    assert not ecarts, f"Identifiants d'opération modifiés : {ecarts}"


def test_les_identifiants_sont_lisibles_et_uniques():
    """Les noms générés par défaut par FastAPI produisent un client illisible."""
    identifiants = list(_operations(application.openapi()).values())

    assert len(identifiants) == len(set(identifiants)), "Identifiants dupliqués."
    verbeux = [i for i in identifiants if "_api_v1_" in i]
    assert not verbeux, (
        f"Identifiants générés par défaut, non nettoyés : {verbeux[:5]}"
    )


def test_les_vues_d_export_restent_exposees(schema_versionne):
    """Le catalogue d'export est le contrat avec le gestionnaire externe."""
    chemins = set(schema_versionne["paths"])
    for attendu in (
        "/api/v1/exports/catalogue",
        "/api/v1/exports/{nom_export}",
        "/api/v1/exports/{nom_export}/fichier",
    ):
        assert attendu in chemins, f"Chemin d'export disparu : {attendu}"
