"""Configuration applicative, lue depuis l'environnement."""

from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Parametres(BaseSettings):
    """Paramètres de l'application, surchargeables par variables d'environnement."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Base de données ---------------------------------------------
    postgres_user: str = "caderac"
    postgres_password: str = "caderac"
    postgres_db: str = "caderac"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url: str | None = None

    # --- Sécurité ----------------------------------------------------
    secret_key: str = "cle_de_developpement_a_remplacer_en_production"
    algorithme_jwt: str = "HS256"
    access_token_expire_minutes: int = 720      # 12 h : une journée de poste
    refresh_token_expire_days: int = 30         # un terminal peut rester hors ligne longtemps

    # --- Application -------------------------------------------------
    environnement: str = "developpement"
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    # Au-delà de ce délai, un trou de forage sans second scan est signalé
    # comme anomalie (ch. 6 du document de modélisation).
    delai_alerte_trou_non_cloture_heures: int = 12

    # Nombre maximum d'enregistrements acceptés dans un lot de synchronisation.
    taille_max_lot_synchronisation: int = 1000

    # --- Compte administrateur initial -------------------------------
    admin_login: str = "admin"
    admin_mot_de_passe: str = "admin"
    admin_nom_complet: str = "Administrateur CADERAC"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def url_base_de_donnees(self) -> str:
        """URL SQLAlchemy, reconstruite si DATABASE_URL n'est pas fournie."""
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def origines_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def en_production(self) -> bool:
        return self.environnement.lower() in {"production", "prod"}


@lru_cache
def obtenir_parametres() -> Parametres:
    return Parametres()


parametres = obtenir_parametres()
