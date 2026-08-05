from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional
from sqlmodel import Session, select
from app.db.models import (
    Series,
    Season,
    Episode,
    Genre,
    SeriesGenre,
    Person,
    SeriesCast,
)
from app.services.tmdb_client import tmdb_get_tv_details, tmdb_get_season_details

MAX_SEASON_FETCH_WORKERS = 6


def _get_or_create_genre(session: Session, genre_data: dict) -> Genre:
    genre = session.exec(select(Genre).where(Genre.tmdb_genre_id == genre_data["id"])).first()
    if genre is None:
        genre = Genre(tmdb_genre_id=genre_data["id"], name=genre_data["name"])
        session.add(genre)
        session.commit()
        session.refresh(genre)
    return genre


def _get_or_create_person(session: Session, person_data: dict) -> Person:
    person = session.exec(select(Person).where(Person.tmdb_person_id == person_data["id"])).first()
    if person is None:
        person = Person(
            tmdb_person_id=person_data["id"],
            name=person_data.get("name", ""),
            profile_path=person_data.get("profile_path"),
            known_for_department=person_data.get("known_for_department"),
        )
        session.add(person)
        session.commit()
        session.refresh(person)
    return person


def _update_or_create_series(session: Session, data: dict) -> Series:
    series = session.exec(select(Series).where(Series.tmdb_id == data["id"])).first()
    if series is None:
        series = Series(tmdb_id=data["id"], title=data.get("name", ""))
    series.title = data.get("name", "")
    series.original_title = data.get("original_name")
    series.overview = data.get("overview")
    series.poster_path = data.get("poster_path")
    series.backdrop_path = data.get("backdrop_path")
    series.status = data.get("status")
    series.first_air_date = data.get("first_air_date")
    series.last_air_date = data.get("last_air_date")
    episode_run_time = data.get("episode_run_time")
    series.episode_run_time = episode_run_time[0] if isinstance(episode_run_time, list) and episode_run_time else None
    series.number_of_seasons = data.get("number_of_seasons")
    series.number_of_episodes = data.get("number_of_episodes")
    series.homepage = data.get("homepage")
    series.last_synced_at = datetime.utcnow()
    series.updated_at = datetime.utcnow()
    session.add(series)
    session.commit()
    session.refresh(series)
    return series


def _sync_genres(session: Session, series: Series, genres: list[dict]) -> None:
    for genre_data in genres:
        genre = _get_or_create_genre(session, genre_data)
        if not session.exec(
            select(SeriesGenre).where(
                SeriesGenre.series_id == series.id,
                SeriesGenre.genre_id == genre.id,
            )
        ).first():
            mapping = SeriesGenre(series_id=series.id, genre_id=genre.id)
            session.add(mapping)
    session.commit()


def _sync_cast(session: Session, series: Series, credits: dict) -> None:
    cast_data = credits.get("cast", [])[:10]
    for cast_item in cast_data:
        person = _get_or_create_person(session, cast_item)
        existing = session.exec(
            select(SeriesCast).where(
                SeriesCast.series_id == series.id,
                SeriesCast.person_id == person.id,
            )
        ).first()
        if not existing:
            mapping = SeriesCast(
                series_id=series.id,
                person_id=person.id,
                character=cast_item.get("character"),
                cast_order=cast_item.get("order"),
                role_type="main",
            )
            session.add(mapping)
    session.commit()


def _sync_season(session: Session, series: Series, season_data: dict) -> None:
    season = session.exec(
        select(Season).where(Season.series_id == series.id, Season.season_number == season_data["season_number"])
    ).first()
    if season is None:
        season = Season(series_id=series.id, season_number=season_data["season_number"])
    season.tmdb_season_id = season_data.get("id")
    season.name = season_data.get("name")
    season.overview = season_data.get("overview")
    season.poster_path = season_data.get("poster_path")
    season.air_date = season_data.get("air_date")
    season.episode_count = season_data.get("episode_count")
    season.last_synced_at = datetime.utcnow()
    session.add(season)
    session.commit()
    session.refresh(season)
    for episode_data in season_data.get("episodes", []):
        _sync_episode(session, season, episode_data)


def _sync_episode(session: Session, season: Season, episode_data: dict) -> None:
    episode = session.exec(
        select(Episode).where(Episode.tmdb_episode_id == episode_data["id"])
    ).first()
    if episode is None:
        episode = Episode(season_id=season.id, tmdb_episode_id=episode_data["id"], episode_number=episode_data.get("episode_number", 0))
    episode.season_id = season.id
    episode.episode_number = episode_data.get("episode_number", 0)
    episode.title = episode_data.get("name")
    episode.overview = episode_data.get("overview")
    episode.air_date = episode_data.get("air_date")
    episode.runtime = episode_data.get("runtime")
    episode.still_path = episode_data.get("still_path")
    episode.vote_average = episode_data.get("vote_average")
    episode.vote_count = episode_data.get("vote_count")
    episode.last_synced_at = datetime.utcnow()
    session.add(episode)
    session.commit()


def _fetch_season_details(tmdb_id: int, season_numbers: list[int]) -> list[dict]:
    if not season_numbers:
        return []

    workers = min(MAX_SEASON_FETCH_WORKERS, len(season_numbers))
    season_details_by_number: dict[int, dict] = {}

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(tmdb_get_season_details, tmdb_id, season_number): season_number
            for season_number in season_numbers
        }

        for future in as_completed(futures):
            season_number = futures[future]
            season_details_by_number[season_number] = future.result()

    return [
        season_details_by_number[season_number]
        for season_number in season_numbers
        if season_number in season_details_by_number
    ]


def sync_series_by_tmdb_id(session: Session, tmdb_id: int) -> Series:
    tv_data = tmdb_get_tv_details(tmdb_id)
    series = _update_or_create_series(session, tv_data)
    _sync_genres(session, series, tv_data.get("genres", []))
    _sync_cast(session, series, tv_data.get("credits", {}))

    season_numbers = [
        season_item["season_number"]
        for season_item in tv_data.get("seasons", [])
        if season_item.get("season_number") is not None
    ]

    for season_details in _fetch_season_details(tmdb_id, season_numbers):
        _sync_season(session, series, season_details)
    return series
