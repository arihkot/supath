"""Contractor management API."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Contractor
from app.schemas import ContractorResponse

router = APIRouter()


@router.get("")
def get_contractors(db: Session = Depends(get_db)):
    """Get all contractors with reputation scores."""
    contractors = (
        db.query(Contractor).order_by(Contractor.reputation_score.desc()).all()
    )
    return {
        "total": len(contractors),
        "contractors": [ContractorResponse.model_validate(c) for c in contractors],
    }


@router.get("/{contractor_id}")
def get_contractor(contractor_id: str, db: Session = Depends(get_db)):
    """Get a single contractor."""
    contractor = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not contractor:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Contractor not found")
    return ContractorResponse.model_validate(contractor)
