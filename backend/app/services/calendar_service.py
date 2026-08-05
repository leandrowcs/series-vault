from datetime import datetime, date
from typing import List, Optional
from sqlmodel import Session, select
from app.db.models import Episode, EpisodeWatch, Season, Series


def get_calendar_events(session: Session, start: date, end: date) -> List[dict]:
    episodes = session.exec(
        select(Episode)
        .where(Episode.air_date >= start.isoformat(), Episode.air_date <= end.isoformat())
    ).all()
    events = []
    for episode in episodes:
        season = session.get(Season, episode.season_id)
        if not season:
            continue
        series = session.get(Series, season.series_id)
        if not series:
            continue
        events.append(
            {
                "episode_id": episode.id,
                "series_id": series.id,
                "series_title": series.title,
                "season_number": season.season_number,
                "episode_number": episode.episode_number,
                "title": episode.title,
                "air_date": episode.air_date,
                "still_path": episode.still_path,
                "series_poster_path": series.poster_path,
                "watched": bool(session.exec(select(EpisodeWatch).where(EpisodeWatch.episode_id == episode.id)).first()),
            }
        )
    return events


def get_new_episodes(session: Session, since: date) -> List[dict]:
    episodes = session.exec(
        select(Episode)
        .where(Episode.air_date >= since.isoformat())
    ).all()
    items = []
    for episode in episodes:
        season = session.get(Season, episode.season_id)
        if not season:
            continue
        series = session.get(Series, season.series_id)
        if not series:
            continue
        items.append(
            {
                "episode_id": episode.id,
                "series_id": series.id,
                "series_title": series.title,
                "season_number": season.season_number,
                "episode_number": episode.episode_number,
                "title": episode.title,
                "air_date": episode.air_date,
                "still_path": episode.still_path,
                "series_poster_path": series.poster_path,
            }
        )
    return items
