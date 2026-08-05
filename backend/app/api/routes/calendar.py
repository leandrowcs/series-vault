from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session
from app.db.session import get_session
from app.services.calendar_service import get_calendar_events, get_new_episodes

router = APIRouter()


@router.get("/")
def calendar_events(
    start: Optional[date] = Query(default=None),
    end: Optional[date] = Query(default=None),
    session: Session = Depends(get_session),
):
    if start is None or end is None:
        raise HTTPException(status_code=400, detail="start and end query params are required")
    return get_calendar_events(session, start, end)


@router.get("/new-episodes")
def new_episodes(since: date = Query(...), session: Session = Depends(get_session)):
    return get_new_episodes(session, since)
