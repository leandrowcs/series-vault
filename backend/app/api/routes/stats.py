from fastapi import APIRouter, Depends
from sqlmodel import Session
from app.db.session import get_session
from app.services.stats_service import (
    get_overview_stats,
    get_genre_stats,
    get_actor_stats,
    get_year_stats,
    get_top_series,
)

router = APIRouter()


@router.get("/overview")
def overview(session: Session = Depends(get_session)):
    return get_overview_stats(session)


@router.get("/genres")
def genres(session: Session = Depends(get_session)):
    return get_genre_stats(session)


@router.get("/actors")
def actors(session: Session = Depends(get_session)):
    return get_actor_stats(session)


@router.get("/years")
def years(session: Session = Depends(get_session)):
    return get_year_stats(session)


@router.get("/top-series")
def top_series(session: Session = Depends(get_session)):
    return get_top_series(session)
