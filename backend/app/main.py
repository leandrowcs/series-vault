from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.db.base import create_db_and_tables
from app.api.routes import auth, series, episodes, watch, calendar, stats, sync

app = FastAPI(title="Series Vault API", version="0.1.0")

allowed_origins = [str(origin).rstrip("/") for origin in settings.frontend_origins]
allowed_origins.extend(["http://localhost:3000", "http://127.0.0.1:3000", "http://0.0.0.0:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(series.router, prefix="/series", tags=["series"])
app.include_router(episodes.router, prefix="/episodes", tags=["episodes"])
app.include_router(watch.router, prefix="/watch", tags=["watch"])
app.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])
app.include_router(sync.router, prefix="/sync", tags=["sync"])


@app.get("/", include_in_schema=False)
def root() -> JSONResponse:
    return JSONResponse(status_code=200, content={"message": "Series Vault API is running"})


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> JSONResponse:
    return JSONResponse(status_code=204, content=None)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
