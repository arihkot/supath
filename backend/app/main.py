"""
SUPATH - Surveillance and Unified Pothole Alert and Tracking Hub
FastAPI Backend Application
"""

import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()

    # Create upload directory
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(exist_ok=True)
    (upload_dir / "images").mkdir(exist_ok=True)
    (upload_dir / "videos").mkdir(exist_ok=True)

    # Seed database if empty
    from app.data.seed.seeder import seed_if_empty

    seed_if_empty()

    # Pre-load and warm up the YOLO model so first request isn't slow
    from app.services.detector import warmup_model

    warmup_model()

    yield
    # Shutdown


app = FastAPI(
    title=settings.APP_NAME,
    description="Surveillance and Unified Pothole Alert and Tracking Hub - Autonomous Pothole Intelligence for Chhattisgarh",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads
uploads_path = Path(settings.UPLOAD_DIR)
uploads_path.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

# Import and register routes
from app.api.routes import (
    detection,
    reports,
    complaints,
    highways,
    analytics,
    contractors,
    citizens,
    sources,
    loop_closure,
)

app.include_router(detection.router, prefix="/api/detect", tags=["Detection"])
app.include_router(reports.router, prefix="/api/potholes", tags=["Potholes"])
app.include_router(complaints.router, prefix="/api/complaints", tags=["Complaints"])
app.include_router(highways.router, prefix="/api/highways", tags=["Highways"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(contractors.router, prefix="/api/contractors", tags=["Contractors"])
app.include_router(
    citizens.router, prefix="/api/citizen-reports", tags=["Citizen Reports"]
)
app.include_router(sources.router, prefix="/api/sources", tags=["Data Sources"])
app.include_router(
    loop_closure.router, prefix="/api/loop-closure", tags=["Loop Closure"]
)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "region": "Chhattisgarh",
    }
