import unittest
from unittest.mock import patch

from app.services.sync_service import _fetch_season_details


class SyncServiceTests(unittest.TestCase):
    def test_fetch_season_details_keeps_requested_order(self) -> None:
        def fake_get_season_details(_tmdb_id: int, season_number: int) -> dict:
            return {"season_number": season_number}

        with patch("app.services.sync_service.tmdb_get_season_details", side_effect=fake_get_season_details):
            details = _fetch_season_details(123, [3, 1, 2])

        self.assertEqual(
            details,
            [
                {"season_number": 3},
                {"season_number": 1},
                {"season_number": 2},
            ],
        )


if __name__ == "__main__":
    unittest.main()
