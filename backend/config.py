from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List

# .env lives at the project root (one level above this file's directory)
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    # SSH Tunnel
    SSH_HOST: str
    SSH_PORT: int = 22
    SSH_USER: str
    SSH_KEY_PATH: str
    SSH_LOCAL_PORT: int = 5433

    # MongoDB (via SSH tunnel)
    MONGO_LOCAL_PORT: int = 27018
    MONGO_URI: str = ""

    # Remote PostgreSQL
    DB_HOST: str = "127.0.0.1"
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str

    # App
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = "http://localhost:5173"

    # Security
    SECRET_KEY: str = "change-in-production"

    # News API
    NEWS_API_URL: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    # OHLC column mapping (historic_data table)
    OHLC_TABLE: str = "historic_data"
    OHLC_SCHEMA: str = "public"
    OHLC_COL_SYMBOL: str = "symbol"
    OHLC_COL_DATE: str = "date_time"
    OHLC_COL_OPEN: str = "open"
    OHLC_COL_HIGH: str = "high"
    OHLC_COL_LOW: str = "low"
    OHLC_COL_CLOSE: str = "curr_price"
    OHLC_COL_VOLUME: str = "volume"
    OHLC_COL_TURNOVER: str = "daily_turnover"
    OHLC_COL_MARKETCAP: str = "marketcap_value"

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
