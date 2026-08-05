import httpx
from app.core.config import settings

BASE_URL = "https://api.themoviedb.org/3"


def _get_client():
    return httpx.Client(base_url=BASE_URL, timeout=10.0)


def tmdb_search_by_name(query: str) -> list[dict]:
    with _get_client() as client:
        response = client.get(
            "/search/tv",
            params={"api_key": settings.tmdb_api_key, "query": query, "include_adult": False},
        )
        response.raise_for_status()
        data = response.json()
    return [
        {
            "tmdb_id": item["id"],
            "name": item.get("name"),
            "first_air_date": item.get("first_air_date"),
            "overview": item.get("overview"),
            "poster_path": item.get("poster_path"),
        }
        for item in data.get("results", [])
    ]


def tmdb_get_tv_details(tmdb_id: int) -> dict:
    with _get_client() as client:
        response = client.get(
            f"/tv/{tmdb_id}",
            params={"api_key": settings.tmdb_api_key, "append_to_response": "credits"},
        )
        response.raise_for_status()
        return response.json()


def tmdb_get_season_details(tmdb_id: int, season_number: int) -> dict:
    with _get_client() as client:
        response = client.get(
            f"/tv/{tmdb_id}/season/{season_number}",
            params={"api_key": settings.tmdb_api_key},
        )
        response.raise_for_status()
        return response.json()
