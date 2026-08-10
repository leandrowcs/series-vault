from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
import httpx
from sqlmodel import Session, select
from app.api.schemas import SeriesCreate
from app.db.session import get_session
from app.db.models import Series, Season, Episode, EpisodeWatch
from app.services.sync_service import sync_series_by_tmdb_id
from app.services.tmdb_client import tmdb_search_by_name

router = APIRouter()


def _tmdb_http_exception(exc: httpx.RequestError) -> HTTPException:
    if isinstance(exc, httpx.TimeoutException):
        return HTTPException(status_code=504, detail="TMDb request timed out while syncing series")
    return HTTPException(status_code=502, detail="Could not reach TMDb while syncing series")


def _serialize_tracked_series(series: Series, completed_percent: float = 0) -> dict:
    genres = [
        mapping.genre.name
        for mapping in series.genres
        if mapping.genre
    ]
    cast = sorted(
        [mapping for mapping in series.cast if mapping.person],
        key=lambda mapping: mapping.cast_order if mapping.cast_order is not None else 999,
    )

    return {
        "id": series.id,
        "tmdb_id": series.tmdb_id,
        "title": series.title,
        "overview": series.overview,
        "poster_path": series.poster_path,
        "backdrop_path": series.backdrop_path,
        "status": series.status,
        "first_air_date": series.first_air_date,
        "last_air_date": series.last_air_date,
        "episode_run_time": series.episode_run_time,
        "number_of_seasons": series.number_of_seasons,
        "number_of_episodes": series.number_of_episodes or 0,
        "completed_percent": round(completed_percent, 1),
        "genres": genres,
        "actors": [
            {
                "name": mapping.person.name,
                "character": mapping.character,
                "profile_path": mapping.person.profile_path,
            }
            for mapping in cast[:10]
        ],
        "last_synced_at": series.last_synced_at,
    }


@router.get("", include_in_schema=False)
def search_series(query: str = Query(..., min_length=1)) -> List[dict]:
    try:
        return tmdb_search_by_name(query)
    except httpx.RequestError as exc:
        raise _tmdb_http_exception(exc)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"TMDb returned status {exc.response.status_code}")


@router.get("/")
def search_series_with_slash(query: str = Query(..., min_length=1)) -> List[dict]:
    return search_series(query)


@router.get("/tracked")
def get_tracked_series(session: Session = Depends(get_session)) -> List[dict]:
    tracked = session.exec(select(Series)).all()
    result = []
    for series in tracked:
        total_episodes = len(
            [
                episode
                for season in series.seasons
                if season.season_number > 0
                for episode in season.episodes
            ]
        ) or series.number_of_episodes or 0
        watched_list = session.exec(
            select(EpisodeWatch)
            .join(Episode, EpisodeWatch.episode_id == Episode.id)
            .join(Season, Episode.season_id == Season.id)
            .where(Season.series_id == series.id, Season.season_number > 0)
        ).all()
        watched_count = len(watched_list)
        completion = (watched_count / total_episodes * 100) if total_episodes else 0
        serialized = _serialize_tracked_series(series, completion)
        serialized["number_of_episodes"] = total_episodes
        result.append(serialized)
    return result


@router.post("", include_in_schema=False)
def add_series(series_create: SeriesCreate = Body(...), session: Session = Depends(get_session)):
    existing = session.exec(select(Series).where(Series.tmdb_id == series_create.tmdb_id)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Series already registered")
    try:
        series = sync_series_by_tmdb_id(session, series_create.tmdb_id)
    except httpx.RequestError as exc:
        raise _tmdb_http_exception(exc)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"TMDb returned status {exc.response.status_code}")
    return _serialize_tracked_series(series)


@router.post("/")
def add_series_with_slash(series_create: SeriesCreate = Body(...), session: Session = Depends(get_session)):
    return add_series(series_create, session)


@router.get("/{series_id}")
def get_series(series_id: int = Path(..., gt=0), session: Session = Depends(get_session)):
    series = session.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    return _serialize_tracked_series(series)


@router.get("/{series_id}/episodes")
def get_series_episodes(series_id: int = Path(..., gt=0), session: Session = Depends(get_session)) -> List[dict]:
    series = session.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    episodes = []
    for season in series.seasons:
        for episode in season.episodes:
            watched = session.exec(
                select(EpisodeWatch).where(EpisodeWatch.episode_id == episode.id)
            ).first()
            episodes.append(
                {
                    "id": episode.id,
                    "tmdb_episode_id": episode.tmdb_episode_id,
                    "season_number": season.season_number,
                    "episode_number": episode.episode_number,
                    "title": episode.title,
                    "overview": episode.overview,
                    "air_date": episode.air_date,
                    "runtime": episode.runtime,
                    "still_path": episode.still_path,
                    "watched": bool(watched),
                    "progress_percent": watched.progress_percent if watched else 0,
                }
            )
    episodes.sort(key=lambda item: (item["season_number"], item["episode_number"]))
    return episodes
