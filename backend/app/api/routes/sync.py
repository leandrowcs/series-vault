from fastapi import APIRouter, Depends, HTTPException, Path
import httpx
from sqlmodel import Session, select
from app.db.session import get_session
from app.db.models import Series
from app.services.sync_service import sync_series_by_tmdb_id

router = APIRouter()


def _tmdb_http_exception(exc: httpx.RequestError) -> HTTPException:
    if isinstance(exc, httpx.TimeoutException):
        return HTTPException(status_code=504, detail="TMDb request timed out while syncing series")
    return HTTPException(status_code=502, detail="Could not reach TMDb while syncing series")


@router.post("/series/{series_id}")
def sync_series(series_id: int = Path(..., gt=0), session: Session = Depends(get_session)):
    series = session.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    try:
        synced = sync_series_by_tmdb_id(session, series.tmdb_id)
    except httpx.RequestError as exc:
        raise _tmdb_http_exception(exc)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"TMDb returned status {exc.response.status_code}")
    return synced


@router.post("/all")
def sync_all_series(session: Session = Depends(get_session)):
    series_list = session.exec(select(Series)).all()
    synced = []
    for series in series_list:
        try:
            synced.append(sync_series_by_tmdb_id(session, series.tmdb_id))
        except httpx.RequestError as exc:
            raise _tmdb_http_exception(exc)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail=f"TMDb returned status {exc.response.status_code}")
    return synced


@router.get("/status")
def sync_status(session: Session = Depends(get_session)):
    series_list = session.exec(select(Series)).all()
    return [{"series_id": series.id, "tmdb_id": series.tmdb_id, "last_synced_at": series.last_synced_at} for series in series_list]
