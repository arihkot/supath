"""Pothole reports API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import Pothole
from app.schemas import PotholeResponse, PotholeListResponse

router = APIRouter()


@router.get("", response_model=PotholeListResponse)
def get_potholes(
    severity: Optional[str] = Query(None),
    highway_ref: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get all pothole reports with optional filters."""
    query = db.query(Pothole)

    if severity:
        query = query.filter(Pothole.severity == severity)
    if highway_ref:
        query = query.filter(Pothole.highway_ref == highway_ref)
    if source:
        query = query.filter(Pothole.source == source)
    if status:
        query = query.filter(Pothole.status == status)

    total = query.count()
    potholes = (
        query.order_by(Pothole.detected_at.desc()).offset(offset).limit(limit).all()
    )

    return PotholeListResponse(
        total=total,
        potholes=[PotholeResponse.model_validate(p) for p in potholes],
    )


@router.get("/{pothole_id}", response_model=PotholeResponse)
def get_pothole(pothole_id: str, db: Session = Depends(get_db)):
    """Get a single pothole by ID."""
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Pothole not found")
    return PotholeResponse.model_validate(pothole)
