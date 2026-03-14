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
    # Always compute global status counts (unfiltered) so the UI summary cards
    # reflect the full dataset regardless of the current filter.
    from sqlalchemy import func as sa_func

    status_rows = (
        db.query(Complaint.status, sa_func.count(Complaint.id))
        .group_by(Complaint.status)
        .all()
    )
    status_counts = {s: c for s, c in status_rows}

    query = db.query(Complaint)

    if status:
        query = query.filter(Complaint.status == status)

    total = query.count()
    complaints = (
        query.order_by(Complaint.filed_at.desc()).offset(offset).limit(limit).all()
    )

    return {
        "total": total,
        "status_counts": status_counts,
        "complaints": [ComplaintResponse.model_validate(c) for c in complaints],
    }


@router.post("")
def file_complaint(data: ComplaintBase, db: Session = Depends(get_db)):
    """Auto-file a complaint for a detected pothole."""
    pothole = db.query(Pothole).filter(Pothole.id == data.pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")

    # Prevent duplicate complaints on the same pothole
    existing = (
        db.query(Complaint)
        .filter(
            Complaint.pothole_id == data.pothole_id,
            Complaint.status.notin_(["resolved", "closed"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"An open complaint ({existing.complaint_ref}) already exists for this pothole",
        )

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

    # Update pothole status and sync is_resolved
    pothole.status = "complaint_filed"
    pothole.is_resolved = False
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


from pydantic import BaseModel as _BaseModel


class ComplaintUpdateRequest(_BaseModel):
    status: Optional[str] = None
    description: Optional[str] = None
    resolution_notes: Optional[str] = None
    assigned_contractor_id: Optional[str] = None


@router.patch("/{complaint_id}")
def update_complaint(
    complaint_id: str, data: ComplaintUpdateRequest, db: Session = Depends(get_db)
):
    """Update a complaint's status, description, resolution notes, or contractor."""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    VALID_STATUSES = {
        "filed",
        "acknowledged",
        "in_progress",
        "resolved",
        "escalated",
        "closed",
    }
    if data.status is not None:
        if data.status not in VALID_STATUSES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}",
            )
        complaint.status = data.status
        if data.status == "acknowledged" and not complaint.acknowledged_at:
            complaint.acknowledged_at = datetime.now()
        elif data.status == "in_progress" and not complaint.in_progress_at:
            complaint.in_progress_at = datetime.now()
        elif data.status in ("resolved", "closed") and not complaint.resolved_at:
            complaint.resolved_at = datetime.now()

    if data.description is not None:
        complaint.description = data.description or None
    if data.resolution_notes is not None:
        complaint.resolution_notes = data.resolution_notes or None
    if data.assigned_contractor_id is not None:
        complaint.assigned_contractor_id = data.assigned_contractor_id or None

    db.commit()
    db.refresh(complaint)
    return ComplaintResponse.model_validate(complaint)


@router.delete("/{complaint_id}")
def delete_complaint(complaint_id: str, db: Session = Depends(get_db)):
    """Delete a complaint."""
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    db.delete(complaint)
    db.commit()

    return {"deleted": True, "id": complaint_id}
