"""Loop closure and auto-escalation API."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.config import settings
from app.services.loop_closure import (
    run_auto_escalation,
    verify_resolution,
    get_potholes_due_for_verification,
    get_escalation_summary,
)

router = APIRouter()


class VerifyRequest(BaseModel):
    pothole_id: str
    still_detected: bool
    confidence: float = 0.0


@router.get("/config")
def get_escalation_config():
    """Return escalation ladder thresholds from app settings."""
    return {
        "ladder": [
            {
                "level": "department",
                "label": "Department Level",
                "days": 0,
                "color": "bg-slate-400",
            },
            {
                "level": "reminder",
                "label": "Reminder Sent",
                "days": settings.ESCALATION_REMINDER,
                "color": "bg-blue-400",
            },
            {
                "level": "district",
                "label": "District Collector",
                "days": settings.ESCALATION_DISTRICT,
                "color": "bg-amber-400",
            },
            {
                "level": "state",
                "label": "State Authority (PWD)",
                "days": settings.ESCALATION_STATE,
                "color": "bg-orange-500",
            },
            {
                "level": "media_alert",
                "label": "Media Alert / RTI",
                "days": settings.ESCALATION_CRITICAL,
                "color": "bg-red-500",
            },
            {
                "level": "final",
                "label": "Chief Secretary / National Portal",
                "days": settings.ESCALATION_FINAL,
                "color": "bg-red-800",
            },
        ]
    }


@router.post("/escalate")
def trigger_auto_escalation(db: Session = Depends(get_db)):
    """Run auto-escalation check on all open complaints."""
    result = run_auto_escalation(db)
    return result


@router.post("/verify")
def verify_pothole_resolution(data: VerifyRequest, db: Session = Depends(get_db)):
    """
    Verify if a resolved pothole is actually fixed (loop closure).
    If still_detected=true, the complaint is reopened and escalated.
    """
    result = verify_resolution(
        db,
        pothole_id=data.pothole_id,
        still_detected=data.still_detected,
        confidence=data.confidence,
    )
    if result.get("not_found"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/pending-verification")
def get_pending_verifications(
    days: int = 7,
    db: Session = Depends(get_db),
):
    """Get resolved potholes that are due for re-verification."""
    potholes = get_potholes_due_for_verification(db, days_since_resolution=days)
    return {
        "total": len(potholes),
        "potholes": potholes,
    }


@router.get("/escalation-summary")
def get_escalation_overview(db: Session = Depends(get_db)):
    """Get breakdown of complaint escalation levels."""
    return get_escalation_summary(db)
