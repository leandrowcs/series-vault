from pathlib import Path
from typing import List

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings


def find_env_file() -> str:
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[2] / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    ]
    for path in candidates:
        if path.exists():
            return str(path)
    return ".env"


class Settings(BaseSettings):
    database_url: str
    tmdb_api_key: str
    google_client_id: str
    google_client_secret: str
    oauth_redirect_uri: str
    secret_key: str
    frontend_origins: List[AnyHttpUrl] = ["http://localhost:3000"]

    class Config:
        env_file = find_env_file()
        env_file_encoding = "utf-8"


settings = Settings()
