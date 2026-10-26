import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

def as_bool(value, default=True):
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Smart Production Monitoring API")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    db_host: str = os.getenv("DB_HOST", "127.0.0.1")
    db_ports: tuple = tuple(int(p.strip()) for p in os.getenv("DB_PORTS", "3306,3307").split(",") if p.strip())
    db_name: str = os.getenv("DB_NAME", "smart_production_db")
    db_user: str = os.getenv("DB_USER", "root")
    db_password: str = os.getenv("DB_PASSWORD", "")
    db_connect_timeout: int = int(os.getenv("DB_CONNECT_TIMEOUT", "5"))
    auto_create_database: bool = as_bool(os.getenv("AUTO_CREATE_DATABASE"), True)
    auto_create_tables: bool = as_bool(os.getenv("AUTO_CREATE_TABLES"), True)
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "")
    jwt_access_token_minutes: int = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "60"))
    cors_origins: tuple = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "*").split(",")
        if origin.strip()
    ) or ("*",)

settings = Settings()
