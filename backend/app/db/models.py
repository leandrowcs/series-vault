from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    google_sub: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    name: Optional[str]
    picture: Optional[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: datetime = Field(default_factory=datetime.utcnow)
    watches: List["EpisodeWatch"] = Relationship(back_populates="user")


class Genre(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tmdb_genre_id: int = Field(index=True, unique=True)
    name: str
    series: List["SeriesGenre"] = Relationship(back_populates="genre")


class Person(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tmdb_person_id: int = Field(index=True, unique=True)
    name: str
    profile_path: Optional[str]
    known_for_department: Optional[str]
    cast: List["SeriesCast"] = Relationship(back_populates="person")


class SeriesGenre(SQLModel, table=True):
    series_id: Optional[int] = Field(default=None, foreign_key="series.id", primary_key=True)
    genre_id: Optional[int] = Field(default=None, foreign_key="genre.id", primary_key=True)
    series: Optional["Series"] = Relationship(back_populates="genres")
    genre: Optional[Genre] = Relationship(back_populates="series")


class SeriesCast(SQLModel, table=True):
    series_id: Optional[int] = Field(default=None, foreign_key="series.id", primary_key=True)
    person_id: Optional[int] = Field(default=None, foreign_key="person.id", primary_key=True)
    character: Optional[str]
    cast_order: Optional[int]
    role_type: Optional[str]
    series: Optional["Series"] = Relationship(back_populates="cast")
    person: Optional[Person] = Relationship(back_populates="cast")


class Series(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tmdb_id: int = Field(index=True, unique=True)
    title: str
    original_title: Optional[str]
    overview: Optional[str]
    poster_path: Optional[str]
    backdrop_path: Optional[str]
    status: Optional[str]
    first_air_date: Optional[str]
    last_air_date: Optional[str]
    episode_run_time: Optional[int]
    number_of_seasons: Optional[int]
    number_of_episodes: Optional[int]
    homepage: Optional[str]
    last_synced_at: Optional[datetime] = Field(default=None)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    seasons: List["Season"] = Relationship(back_populates="series")
    genres: List[SeriesGenre] = Relationship(back_populates="series")
    cast: List[SeriesCast] = Relationship(back_populates="series")


class Season(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    series_id: int = Field(foreign_key="series.id")
    season_number: int
    tmdb_season_id: Optional[int] = Field(index=True, unique=True)
    name: Optional[str]
    overview: Optional[str]
    poster_path: Optional[str]
    air_date: Optional[str]
    episode_count: Optional[int]
    last_synced_at: Optional[datetime] = Field(default=None)
    series: Optional[Series] = Relationship(back_populates="seasons")
    episodes: List["Episode"] = Relationship(back_populates="season")


class Episode(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    season_id: int = Field(foreign_key="season.id")
    tmdb_episode_id: int = Field(index=True, unique=True)
    episode_number: int
    title: Optional[str]
    overview: Optional[str]
    air_date: Optional[str]
    runtime: Optional[int]
    still_path: Optional[str]
    vote_average: Optional[float]
    vote_count: Optional[int]
    last_synced_at: Optional[datetime] = Field(default=None)
    season: Optional[Season] = Relationship(back_populates="episodes")
    watches: List["EpisodeWatch"] = Relationship(back_populates="episode")


class EpisodeWatch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    episode_id: int = Field(foreign_key="episode.id")
    user_id: int = Field(foreign_key="user.id")
    watched_at: datetime = Field(default_factory=datetime.utcnow)
    runtime_minutes: Optional[int]
    progress_percent: Optional[int] = Field(default=100)
    notes: Optional[str]
    episode: Optional[Episode] = Relationship(back_populates="watches")
    user: Optional[User] = Relationship(back_populates="watches")
