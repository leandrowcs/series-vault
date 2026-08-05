from pathlib import Path

backend_app_dir = Path(__file__).resolve().parent.parent / "backend" / "app"
__path__ = [str(backend_app_dir)]
