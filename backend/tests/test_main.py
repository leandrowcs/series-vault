import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.main import app


class MainRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_root_returns_service_status(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": "Series Vault API is running"})

    def test_series_search_without_trailing_slash_returns_results(self) -> None:
        search_result = [{"tmdb_id": 1396, "name": "Breaking Bad"}]

        with patch("app.api.routes.series.tmdb_search_by_name", return_value=search_result):
            response = self.client.get("/series", params={"query": "breaking bad"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), search_result)

    def test_add_series_tmdb_timeout_returns_gateway_timeout(self) -> None:
        with patch(
            "app.api.routes.series.sync_series_by_tmdb_id",
            side_effect=httpx.TimeoutException("TMDb timeout"),
        ):
            response = self.client.post("/series", json={"tmdb_id": 987654321})

        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.json()["detail"], "TMDb request timed out while syncing series")


if __name__ == "__main__":
    unittest.main()
