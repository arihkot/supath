"""Complaint management API."""

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import Complaint, Pothole
from app.schemas import ComplaintResponse, ComplaintBase

router = APIRouter()


def generate_complaint_ref():
    year = datetime.now().year
    uid = uuid.uuid4().hex[:5].upper()
    return f"CG/PG/{year}/{uid}"


@router.get("")
def get_complaints(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get all complaints with optional filters."""
    query = db.query(Complaint)

    if status:
        query = query.filter(Complaint.status == status)

    total = query.count()
    complaints = (
        query.order_by(Complaint.filed_at.desc()).offset(offset).limit(limit).all()
    )

    return {
        "total": total,
        "complaints": [ComplaintResponse.model_validate(c) for c in complaints],
    }


@router.post("")
def file_complaint(data: ComplaintBase, db: Session = Depends(get_db)):
    """Auto-file a complaint for a detected pothole."""
    pothole = db.query(Pothole).filter(Pothole.id == data.pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")

    # Generate complaint
    complaint = Complaint(
        pothole_id=data.pothole_id,
        complaint_ref=generate_complaint_ref(),
        portal=data.portal,
        description=data.description
        or f"Pothole detected on {pothole.highway_ref or 'highway'} near {pothole.nearest_city or 'unknown location'}. "
        f"Severity: {pothole.severity}. GPS: {pothole.latitude}, {pothole.longitude}. "
        f"Detected via {pothole.source}. Immediate attention required.",
        status="filed",
    )
    db.add(complaint)

    # Update pothole status
    pothole.status = "complaint_filed"
    db.commit()
    db.refresh(complaint)

    return ComplaintResponse.model_validate(complaint)


@router.get("/{complaint_id}")
def get_complaint(complaint_id: str, db: Session = Depends(get_db)):
    """Get a single complaint by ID."""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return ComplaintResponse.model_validate(complaint)
