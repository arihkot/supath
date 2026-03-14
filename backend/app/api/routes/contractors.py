"""Contractor management API."""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Contractor, Pothole, Highway, Complaint
from app.schemas import ContractorResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class ContractorCreate(BaseModel):
    name: str
    registration_id: str
    district: Optional[str] = None
    contact_phone: Optional[str] = None
    total_contracts: int = 0
    completed_contracts: int = 0
    avg_repair_days: float = 0.0
    reputation_score: float = 50.0
    road_quality_score: float = 50.0
    flagged: bool = False
    flag_reason: Optional[str] = None


class ContractorUpdate(BaseModel):
    name: Optional[str] = None
    district: Optional[str] = None
    contact_phone: Optional[str] = None
    total_contracts: Optional[int] = None
    completed_contracts: Optional[int] = None
    avg_repair_days: Optional[float] = None
    reputation_score: Optional[float] = None
    road_quality_score: Optional[float] = None
    flagged: Optional[bool] = None
    flag_reason: Optional[str] = None


@router.get("")
def get_contractors(db: Session = Depends(get_db)):
    """Get all contractors with reputation scores and assignment counts."""
    contractors = (
        db.query(Contractor).order_by(Contractor.reputation_score.desc()).all()
    )

    # Compute assignment counts in bulk
    pothole_counts = dict(
        db.query(Pothole.assigned_contractor_id, func.count(Pothole.id))
        .filter(Pothole.assigned_contractor_id.isnot(None))
        .group_by(Pothole.assigned_contractor_id)
        .all()
    )
    highway_counts = dict(
        db.query(Highway.assigned_contractor_id, func.count(Highway.id))
        .filter(Highway.assigned_contractor_id.isnot(None))
        .group_by(Highway.assigned_contractor_id)
        .all()
    )

    results = []
    for c in contractors:
        resp = ContractorResponse.model_validate(c)
        resp.assigned_potholes = pothole_counts.get(c.id, 0)
        resp.assigned_highways = highway_counts.get(c.id, 0)
        results.append(resp)

    return {
        "total": len(results),
        "contractors": results,
    }


@router.get("/{contractor_id}")
def get_contractor(contractor_id: str, db: Session = Depends(get_db)):
    """Get a single contractor."""
    contractor = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    resp = ContractorResponse.model_validate(contractor)
    resp.assigned_potholes = (
        db.query(func.count(Pothole.id))
        .filter(Pothole.assigned_contractor_id == contractor_id)
        .scalar()
        or 0
    )
    resp.assigned_highways = (
        db.query(func.count(Highway.id))
        .filter(Highway.assigned_contractor_id == contractor_id)
        .scalar()
        or 0
    )
    return resp


@router.post("", status_code=201)
def create_contractor(body: ContractorCreate, db: Session = Depends(get_db)):
    """Create a new contractor."""
    existing = (
        db.query(Contractor)
        .filter(Contractor.registration_id == body.registration_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Contractor with registration_id '{body.registration_id}' already exists",
        )

    contractor = Contractor(
        id=str(uuid.uuid4()),
        name=body.name,
        registration_id=body.registration_id,
        district=body.district,
        contact_phone=body.contact_phone,
        total_contracts=body.total_contracts,
        completed_contracts=body.completed_contracts,
        avg_repair_days=body.avg_repair_days,
        reputation_score=body.reputation_score,
        road_quality_score=body.road_quality_score,
        flagged=body.flagged,
        flag_reason=body.flag_reason,
    )
    db.add(contractor)
    db.commit()
    db.refresh(contractor)

    resp = ContractorResponse.model_validate(contractor)
    resp.assigned_potholes = 0
    resp.assigned_highways = 0
    return resp


@router.patch("/{contractor_id}")
def update_contractor(
    contractor_id: str, body: ContractorUpdate, db: Session = Depends(get_db)
):
    """Update a contractor's details."""
    contractor = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(contractor, field, value)

    db.commit()
    db.refresh(contractor)

    resp = ContractorResponse.model_validate(contractor)
    resp.assigned_potholes = (
        db.query(func.count(Pothole.id))
        .filter(Pothole.assigned_contractor_id == contractor_id)
        .scalar()
        or 0
    )
    resp.assigned_highways = (
        db.query(func.count(Highway.id))
        .filter(Highway.assigned_contractor_id == contractor_id)
        .scalar()
        or 0
    )
    return resp


@router.delete("/{contractor_id}")
def delete_contractor(contractor_id: str, db: Session = Depends(get_db)):
    """Delete a contractor. Clears assignment references on potholes,
    complaints, and highways that point to this contractor."""
    contractor = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    # Null out FK references
    db.query(Pothole).filter(Pothole.assigned_contractor_id == contractor_id).update(
        {"assigned_contractor_id": None}, synchronize_session="fetch"
    )
    db.query(Complaint).filter(
        Complaint.assigned_contractor_id == contractor_id
    ).update({"assigned_contractor_id": None}, synchronize_session="fetch")
    db.query(Highway).filter(Highway.assigned_contractor_id == contractor_id).update(
        {"assigned_contractor_id": None, "assigned_contractor_name": None},
        synchronize_session="fetch",
    )

    db.delete(contractor)
    db.commit()
    return {"deleted": True, "id": contractor_id}
