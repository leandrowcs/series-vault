import unittest

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from app.db.models import Episode, Season, Series
from app.db.session import get_session
from app.main import app


class WatchRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

        with Session(self.engine) as session:
            series = Series(tmdb_id=101, title="Test Series")
            session.add(series)
            session.commit()
            session.refresh(series)

            season = Season(series_id=series.id, season_number=1, tmdb_season_id=201)
            session.add(season)
            session.commit()
            session.refresh(season)

            episode = Episode(
                season_id=season.id,
                tmdb_episode_id=301,
                episode_number=1,
                title="Pilot",
                runtime=42,
            )
            session.add(episode)
            session.commit()
            session.refresh(episode)
            self.episode_id = episode.id

        def override_get_session():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = override_get_session
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_mark_episode_watch_returns_created_watch(self) -> None:
        response = self.client.patch(
            f"/watch/episodes/{self.episode_id}",
            json={"watched": True, "progress_percent": 100},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["episode_id"], self.episode_id)
        self.assertEqual(response.json()["progress_percent"], 100)
        self.assertIsInstance(response.json()["watched_at"], str)


if __name__ == "__main__":
    unittest.main()
