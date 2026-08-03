from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        "postgresql+asyncpg://bunker:bunker@localhost:5433/turing_sandbox"
    )
    redis_url: str = "redis://localhost:6380/0"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    cors_origins: str = "*"
    min_human_players: int = 1
    room_capacity: int = 8

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
