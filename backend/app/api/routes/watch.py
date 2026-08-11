from typing import List
from fastapi import APIRouter, Depends, HTTPException, Path, Body, Query
from sqlmodel import Session
from app.db.session import get_session
from app.api.schemas import EpisodeWatchUpdate, EpisodeWatchResponse
from app.services.watch_service import mark_episode_watch, get_watched_episodes

router = APIRouter()


@router.patch("", include_in_schema=False)
def update_episode_watch_entrypoint(
    episode_id: int = Query(..., alias="episodeId", gt=0),
    payload: EpisodeWatchUpdate = Body(...),
    session: Session = Depends(get_session),
) -> EpisodeWatchResponse:
    return update_episode_watch(episode_id, payload, session)


@router.delete("", include_in_schema=False)
def remove_episode_watch_entrypoint(
    episode_id: int = Query(..., alias="episodeId", gt=0),
    session: Session = Depends(get_session),
):
    return remove_episode_watch(episode_id, session)


@router.patch("/episodes/{episode_id}")
def update_episode_watch(
    episode_id: int = Path(..., gt=0),
    payload: EpisodeWatchUpdate = Body(...),
    session: Session = Depends(get_session),
) -> EpisodeWatchResponse:
    try:
        watch = mark_episode_watch(
            session,
            episode_id,
            watched=payload.watched,
            progress_percent=payload.progress_percent,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    if watch is None:
        raise HTTPException(status_code=204)
    return watch


@router.delete("/episodes/{episode_id}")
def remove_episode_watch(episode_id: int = Path(..., gt=0), session: Session = Depends(get_session)):
    try:
        result = mark_episode_watch(session, episode_id, watched=False)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    if result is None:
        return {"detail": "Episode unwatched"}
    return {"detail": "Episode watch removed"}


@router.get("/", response_model=List[EpisodeWatchResponse])
def list_watched_episodes(session: Session = Depends(get_session)):
    return get_watched_episodes(session)
