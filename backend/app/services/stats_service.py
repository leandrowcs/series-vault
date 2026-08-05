from typing import List
from sqlalchemy import func
from sqlmodel import Session, select
from app.db.models import Episode, EpisodeWatch, Season, Series, SeriesGenre, Genre, SeriesCast, Person


def get_genre_stats(session: Session) -> List[dict]:
    statement = (
        select(Genre.name, func.count(EpisodeWatch.id))
        .join(SeriesGenre, SeriesGenre.genre_id == Genre.id)
        .join(Series, Series.id == SeriesGenre.series_id)
        .join(Season, Season.series_id == Series.id)
        .join(Episode, Episode.season_id == Season.id)
        .join(EpisodeWatch, EpisodeWatch.episode_id == Episode.id)
        .group_by(Genre.name)
        .order_by(func.count(EpisodeWatch.id).desc())
    )
    return [{"genre": row[0], "count": row[1]} for row in session.exec(statement).all()]


def get_actor_stats(session: Session) -> List[dict]:
    statement = (
        select(Person.name, Person.profile_path, func.count(EpisodeWatch.id))
        .join(SeriesCast, SeriesCast.person_id == Person.id)
        .join(Series, Series.id == SeriesCast.series_id)
        .join(Season, Season.series_id == Series.id)
        .join(Episode, Episode.season_id == Season.id)
        .join(EpisodeWatch, EpisodeWatch.episode_id == Episode.id)
        .group_by(Person.name, Person.profile_path)
        .order_by(func.count(EpisodeWatch.id).desc())
        .limit(10)
    )
    return [{"actor": row[0], "profile_path": row[1], "count": row[2]} for row in session.exec(statement).all()]


def get_year_stats(session: Session) -> List[dict]:
    statement = (
        select(Series.first_air_date, func.count(EpisodeWatch.id))
        .join(Season, Season.series_id == Series.id)
        .join(Episode, Episode.season_id == Season.id)
        .join(EpisodeWatch, EpisodeWatch.episode_id == Episode.id)
        .group_by(Series.first_air_date)
        .order_by(func.count(EpisodeWatch.id).desc())
        .limit(10)
    )
    return [{"year": row[0], "count": row[1]} for row in session.exec(statement).all()]


def get_top_series(session: Session) -> List[dict]:
    statement = (
        select(Series.title, Series.poster_path, func.count(EpisodeWatch.id))
        .join(Season, Season.series_id == Series.id)
        .join(Episode, Episode.season_id == Season.id)
        .join(EpisodeWatch, EpisodeWatch.episode_id == Episode.id)
        .group_by(Series.title, Series.poster_path)
        .order_by(func.count(EpisodeWatch.id).desc())
        .limit(10)
    )
    return [{"series": row[0], "poster_path": row[1], "count": row[2]} for row in session.exec(statement).all()]


def get_overview_stats(session: Session) -> dict:
    total_watched = session.exec(select(func.count(EpisodeWatch.id))).one()
    total_runtime = session.exec(select(func.sum(EpisodeWatch.runtime_minutes))).one() or 0
    return {
        "total_watched_episodes": total_watched,
        "total_runtime_minutes": total_runtime,
    }
