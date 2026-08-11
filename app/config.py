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
    # Isolation slots; survivors board the convoy (capacity - brig = 5)
    brig_capacity: int = 3
    convoy_seats: int = 5
    # RESOLVE boarding window after convoy arrives (seconds, before phase scale)
    convoy_boarding_seconds: int = 180
    # How many AI seats are SYNTHETIC (rest of AI seats + all humans = HUMAN).
    # Agents never see this in Helixa prompts — system/dataset only.
    synthetic_count: int = 2
    # Refreshed on every room write / event append
    room_ttl_seconds: int = 86400
    history_event_limit: int = 200

    # Match phase clock (see app/services/phase_machine.py)
    # 1.0 = full design lengths; 0.2 ≈ 84s Pitch instead of 7m (good for local playtests)
    phase_duration_scale: float = 0.2
    phase_scheduler_interval_seconds: float = 1.0
    # Wait for other humans before filling AI seats (matchmaking screen)
    matchmaking_seconds: float = 30.0

    # Helixa game-agent (private chat / кулуары)
    helixa_base_url: str = "http://localhost:8000"
    helixa_internal_token: str = ""
    helixa_timeout_seconds: float = 4.0
    helixa_resolve_timeout_seconds: float = 2.5
    helixa_enabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
