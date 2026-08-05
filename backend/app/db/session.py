from sqlmodel import create_engine, Session
from app.core.config import settings


engine = create_engine(settings.database_url, echo=False, connect_args={"check_same_thread": False})


def get_session() -> Session:
    return Session(engine)
