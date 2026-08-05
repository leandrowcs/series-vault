from datetime import datetime
from typing import Optional
from sqlmodel import Session, select
from app.db.models import EpisodeWatch, Episode, User


def _get_default_user(session: Session) -> User:
    user = session.exec(select(User).where(User.google_sub == "default")).first()
    if user is None:
        user = User(google_sub="default", email="default@local", name="Default User")
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def mark_episode_watch(
    session: Session,
    episode_id: int,
    watched: bool = True,
    progress_percent: Optional[int] = None,
    notes: Optional[str] = None,
) -> EpisodeWatch:
    episode = session.get(Episode, episode_id)
    if episode is None:
        raise ValueError("Episode not found")
    user = _get_default_user(session)
    existing = session.exec(
        select(EpisodeWatch).where(EpisodeWatch.episode_id == episode_id, EpisodeWatch.user_id == user.id)
    ).first()

    if watched:
        if existing is None:
            existing = EpisodeWatch(
                episode_id=episode_id,
                user_id=user.id,
                runtime_minutes=episode.runtime,
                progress_percent=progress_percent if progress_percent is not None else 100,
                notes=notes,
            )
        else:
            existing.progress_percent = progress_percent if progress_percent is not None else existing.progress_percent or 100
            existing.notes = notes if notes is not None else existing.notes
            existing.watched_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    if existing is not None:
        session.delete(existing)
        session.commit()
    return None


def get_watched_episodes(session: Session):
    user = _get_default_user(session)
    return session.exec(select(EpisodeWatch).where(EpisodeWatch.user_id == user.id)).all()
