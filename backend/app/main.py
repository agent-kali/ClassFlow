"""ClassFlow API — entrypoint.

Mount routers, configure middleware, run startup tasks.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.config import settings
from backend.app.core.db import Base, engine
from backend.app.routers import admin, auth, schedule

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(application: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="ClassFlow API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"(http://(localhost|127\.0\.0\.1):517\d|https://.*\.onrender\.com)",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
app.include_router(schedule.router)
app.include_router(admin.router)
app.include_router(auth.router)
