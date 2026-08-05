import os
import sys
import unittest
from pathlib import Path


class ConfigLoadingTests(unittest.TestCase):
    def test_settings_loads_backend_env_from_repo_root(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        backend_dir = repo_root / "backend"

        os.chdir(repo_root)
        sys.path.insert(0, str(backend_dir))

        sys.modules.pop("app.core.config", None)
        sys.modules.pop("app.main", None)

        import app.core.config as config

        self.assertEqual(config.settings.database_url, "sqlite:///./series_vault.db")
        self.assertEqual(config.settings.tmdb_api_key, "a614a51491938c111596ebd4d493d6ad")
        self.assertEqual(config.settings.google_client_id, "582466824884-ln7neocaqf0l5b6k3833o1nl28efbmi7.apps.googleusercontent.com")


if __name__ == "__main__":
    unittest.main()
