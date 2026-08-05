from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SeriesCreate(BaseModel):
    tmdb_id: int


class EpisodeWatchUpdate(BaseModel):
    watched: bool = True
    progress_percent: Optional[int] = None
    notes: Optional[str] = None


class EpisodeWatchResponse(BaseModel):
    episode_id: int
    user_id: int
    watched_at: datetime
    runtime_minutes: Optional[int]
    progress_percent: Optional[int]
    notes: Optional[str]

    model_config = ConfigDict(from_attributes=True)
