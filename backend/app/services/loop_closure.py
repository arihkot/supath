"""
Loop Closure Service — Core SUPATH differentiator.

Implements:
1. Auto-escalation: Complaints open beyond thresholds get escalated
2. Re-verification: Re-scan resolved potholes to confirm repair quality
3. Loop closure: If pothole re-detected after resolution, reopen complaint
"""

from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models import Pothole, Complaint, Contractor
from app.config import settings


# Escalation levels with descriptions
ESCALATION_LADDER = [
    {"level": "department", "label": "Department Level", "days": 0},
    {
        "level": "reminder",
        "label": "Reminder Sent",
        "days": settings.ESCALATION_REMINDER,
    },
    {
        "level": "district",
        "label": "District Collector",
        "days": settings.ESCALATION_DISTRICT,
    },
    {
        "level": "state",
        "label": "State Authority (PWD)",
        "days": settings.ESCALATION_STATE,
    },
    {
        "level": "media_alert",
        "label": "Media Alert / RTI",
        "days": settings.ESCALATION_CRITICAL,
    },
    {
        "level": "final",
        "label": "Chief Secretary / National Portal",
        "days": settings.ESCALATION_FINAL,
    },
]


def run_auto_escalation(db: Session) -> dict:
    """
    Check all open complaints and escalate those past thresholds.
    Returns summary of escalations performed.
    """
    now = datetime.now()
    escalated = []

    open_complaints = (
        db.query(Complaint)
        .filter(
            Complaint.status.in_(["filed", "acknowledged", "in_progress", "escalated"])
        )
        .all()
    )

    for complaint in open_complaints:
        filed_at = complaint.filed_at
        if not filed_at:
            continue

        days_open = (now - filed_at).days

        # Determine what escalation level this complaint should be at
        target_level = "department"
        for step in ESCALATION_LADDER:
            if days_open >= step["days"]:
                target_level = step["level"]

        # Current level index
        current_idx = next(
            (
                i
                for i, s in enumerate(ESCALATION_LADDER)
                if s["level"] == complaint.escalation_level
            ),
            0,
        )
        target_idx = next(
            (i for i, s in enumerate(ESCALATION_LADDER) if s["level"] == target_level),
            0,
        )

        if target_idx > current_idx:
            # Escalate
            complaint.escalation_level = target_level
            complaint.escalation_count = target_idx
            complaint.last_escalated_at = now
            complaint.status = "escalated"

            escalated.append(
                {
                    "complaint_ref": complaint.complaint_ref,
                    "pothole_id": complaint.pothole_id,
                    "days_open": days_open,
                    "from_level": ESCALATION_LADDER[current_idx]["label"],
                    "to_level": ESCALATION_LADDER[target_idx]["label"],
                }
            )

            # If escalated to district+ level, flag the contractor if assigned
            if target_idx >= 2 and complaint.assigned_contractor_id:
                contractor = (
                    db.query(Contractor)
                    .filter(Contractor.id == complaint.assigned_contractor_id)
                    .first()
                )
                if contractor and not contractor.flagged:
                    contractor.flagged = True
                    contractor.flag_reason = (
                        f"Complaint {complaint.complaint_ref} escalated to "
                        f"{ESCALATION_LADDER[target_idx]['label']} after {days_open} days"
                    )

    db.commit()

    return {
        "checked": len(open_complaints),
        "escalated": len(escalated),
        "details": escalated,
    }


def verify_resolution(
    db: Session, pothole_id: str, still_detected: bool, confidence: float = 0.0
) -> dict:
    """
    Loop closure: Verify if a resolved pothole is actually fixed.

    Args:
        pothole_id: The pothole to verify
        still_detected: Whether the pothole was re-detected in new imagery
        confidence: Detection confidence score (0-1)

    Returns:
        Verification result
    """
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        return {"error": "Pothole not found", "not_found": True}

    complaint = (
        db.query(Complaint)
        .filter(Complaint.pothole_id == pothole_id)
        .order_by(Complaint.filed_at.desc())
        .first()
    )

    if still_detected and confidence >= settings.DETECTION_CONFIDENCE:
        # Pothole NOT fixed — reopen
        pothole.is_resolved = False
        pothole.resolved_at = None
        pothole.status = "re_detected"

        result = {
            "status": "re_opened",
            "pothole_id": pothole_id,
            "message": "Pothole re-detected after resolution. Complaint reopened.",
            "confidence": confidence,
        }

        if complaint:
            complaint.status = "escalated"
            complaint.escalation_count += 1
            complaint.last_escalated_at = datetime.now()

            # Auto-escalate by one level from current
            current_idx = next(
                (
                    i
                    for i, s in enumerate(ESCALATION_LADDER)
                    if s["level"] == complaint.escalation_level
                ),
                0,
            )
            next_idx = min(current_idx + 1, len(ESCALATION_LADDER) - 1)
            complaint.escalation_level = ESCALATION_LADDER[next_idx]["level"]
            complaint.resolution_notes = (
                f"[LOOP CLOSURE FAILED] Re-detection at {datetime.now().isoformat()} "
                f"with confidence {confidence:.2f}. Previous resolution was insufficient."
            )

            result["complaint_ref"] = complaint.complaint_ref
            result["escalation_level"] = ESCALATION_LADDER[next_idx]["label"]

            # Flag the contractor
            if complaint.assigned_contractor_id:
                contractor = (
                    db.query(Contractor)
                    .filter(Contractor.id == complaint.assigned_contractor_id)
                    .first()
                )
                if contractor:
                    contractor.flagged = True
                    contractor.flag_reason = (
                        f"Loop closure failure: Pothole {pothole_id} re-detected "
                        f"after claimed resolution"
                    )
                    # Reduce reputation
                    contractor.reputation_score = max(
                        0, contractor.reputation_score - 10
                    )
                    contractor.road_quality_score = max(
                        0, contractor.road_quality_score - 15
                    )
                    result["contractor_flagged"] = contractor.name

    else:
        # Pothole confirmed fixed
        pothole.status = "verified_resolved"
        result = {
            "status": "verified",
            "pothole_id": pothole_id,
            "message": "Repair verified. Loop closure successful.",
        }

        if complaint:
            complaint.status = "closed"
            complaint.resolution_notes = (
                f"[LOOP CLOSURE OK] Verified at {datetime.now().isoformat()}. "
                f"Repair confirmed."
            )
            result["complaint_ref"] = complaint.complaint_ref

            # Reward the contractor
            if complaint.assigned_contractor_id:
                contractor = (
                    db.query(Contractor)
                    .filter(Contractor.id == complaint.assigned_contractor_id)
                    .first()
                )
                if contractor:
                    contractor.completed_contracts += 1
                    contractor.reputation_score = min(
                        100, contractor.reputation_score + 2
                    )
                    contractor.road_quality_score = min(
                        100, contractor.road_quality_score + 3
                    )

    db.commit()
    return result


def get_potholes_due_for_verification(
    db: Session, days_since_resolution: int = 7
) -> list:
    """
    Get potholes resolved more than N days ago that haven't been re-verified.
    These are candidates for loop closure checks.
    """
    cutoff = datetime.now() - timedelta(days=days_since_resolution)

    potholes = (
        db.query(Pothole)
        .filter(
            Pothole.is_resolved == True,
            Pothole.resolved_at.isnot(None),
            Pothole.resolved_at <= cutoff,
            Pothole.status != "verified_resolved",
        )
        .all()
    )

    return [
        {
            "id": p.id,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "highway_ref": p.highway_ref,
            "severity": p.severity,
            "resolved_at": p.resolved_at.isoformat() if p.resolved_at else None,
            "days_since_resolution": (datetime.now() - p.resolved_at).days
            if p.resolved_at
            else 0,
        }
        for p in potholes
    ]


def get_escalation_summary(db: Session) -> dict:
    """Get a summary of complaint escalation states."""
    total = db.query(Complaint).count()

    summary = {}
    for step in ESCALATION_LADDER:
        count = (
            db.query(Complaint)
            .filter(Complaint.escalation_level == step["level"])
            .count()
        )
        summary[step["level"]] = {
            "label": step["label"],
            "count": count,
            "threshold_days": step["days"],
        }

    return {
        "total_complaints": total,
        "escalation_breakdown": summary,
    }
