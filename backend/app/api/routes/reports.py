"""Pothole reports API."""

from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import Pothole, Complaint, Contractor, CitizenReport
from app.schemas import PotholeResponse, PotholeListResponse
from app.services.loop_closure import ESCALATION_LADDER

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas for pothole actions
# ---------------------------------------------------------------------------


class StatusUpdateRequest(BaseModel):
    status: str  # "resolved", "detected", "in_progress", etc.
    resolution_notes: Optional[str] = None


class EscalateRequest(BaseModel):
    """Escalate the open complaint for this pothole by one level."""

    notes: Optional[str] = None


class NotifyRequest(BaseModel):
    """Send a notification to the relevant authority about this pothole."""

    channel: str = "sms"  # sms, email, push
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# List / Detail
# ---------------------------------------------------------------------------


def _enrich_pothole(pothole, contractor_map: dict) -> PotholeResponse:
    """Convert a Pothole ORM object to PotholeResponse with contractor name."""
    resp = PotholeResponse.model_validate(pothole)
    cid = pothole.assigned_contractor_id
    if cid and cid in contractor_map:
        resp.assigned_contractor_name = contractor_map[cid]
    return resp


def _build_contractor_map(db: Session, contractor_ids: set) -> dict:
    """Fetch contractor names for a set of IDs → {id: name}."""
    if not contractor_ids:
        return {}
    rows = (
        db.query(Contractor.id, Contractor.name)
        .filter(Contractor.id.in_(contractor_ids))
        .all()
    )
    return {r[0]: r[1] for r in rows}


@router.get("", response_model=PotholeListResponse)
def get_potholes(
    severity: Optional[str] = Query(None),
    highway_ref: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
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

    # Batch-resolve contractor names
    cids = {p.assigned_contractor_id for p in potholes if p.assigned_contractor_id}
    cmap = _build_contractor_map(db, cids)

    return PotholeListResponse(
        total=total,
        potholes=[_enrich_pothole(p, cmap) for p in potholes],
    )


@router.get("/{pothole_id}", response_model=PotholeResponse)
def get_pothole(pothole_id: str, db: Session = Depends(get_db)):
    """Get a single pothole by ID."""
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")
    cmap = _build_contractor_map(
        db,
        {pothole.assigned_contractor_id} if pothole.assigned_contractor_id else set(),
    )
    return _enrich_pothole(pothole, cmap)


# ---------------------------------------------------------------------------
# Admin Actions — used from the interactive map
# ---------------------------------------------------------------------------


@router.patch("/{pothole_id}/status")
def update_pothole_status(
    pothole_id: str, data: StatusUpdateRequest, db: Session = Depends(get_db)
):
    """
    Update a pothole's status.  Typically used by an admin to mark a pothole
    as resolved/closed or to reopen it.
    """
    VALID_STATUSES = {
        "detected",
        "complaint_filed",
        "acknowledged",
        "in_progress",
        "resolved",
        "escalated",
        "re_detected",
        "verified_resolved",
    }
    if data.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{data.status}'. Must be one of: {', '.join(sorted(VALID_STATUSES))}",
        )

    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")

    old_status = pothole.status
    pothole.status = data.status

    # Sync is_resolved flag
    if data.status in ("resolved", "verified_resolved"):
        pothole.is_resolved = True
        if not pothole.resolved_at:
            pothole.resolved_at = datetime.now()
    elif data.status in (
        "detected",
        "re_detected",
        "complaint_filed",
        "escalated",
        "in_progress",
        "acknowledged",
    ):
        pothole.is_resolved = False
        pothole.resolved_at = None

    # If resolving, also resolve the most recent open complaint
    if data.status in ("resolved", "verified_resolved"):
        complaint = (
            db.query(Complaint)
            .filter(
                Complaint.pothole_id == pothole_id,
                Complaint.status.notin_(["resolved", "closed"]),
            )
            .order_by(Complaint.filed_at.desc())
            .first()
        )
        if complaint:
            complaint.status = "resolved"
            complaint.resolved_at = datetime.now()
            if data.resolution_notes:
                complaint.resolution_notes = data.resolution_notes

    db.commit()
    db.refresh(pothole)

    return {
        "id": pothole.id,
        "old_status": old_status,
        "new_status": pothole.status,
        "is_resolved": pothole.is_resolved,
    }


@router.post("/{pothole_id}/escalate")
def escalate_pothole(
    pothole_id: str, data: EscalateRequest, db: Session = Depends(get_db)
):
    """
    Escalate the open complaint for a pothole by one level on the ladder.
    If no complaint exists, one is auto-filed first.
    """
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")

    # Find or create complaint
    complaint = (
        db.query(Complaint)
        .filter(
            Complaint.pothole_id == pothole_id,
            Complaint.status.notin_(["resolved", "closed"]),
        )
        .order_by(Complaint.filed_at.desc())
        .first()
    )

    if not complaint:
        import uuid

        complaint = Complaint(
            pothole_id=pothole_id,
            complaint_ref=f"CG/PG/{datetime.now().year}/{uuid.uuid4().hex[:5].upper()}",
            portal="admin_escalation",
            description=(
                f"Admin-escalated: {pothole.highway_ref or 'highway'} near "
                f"{pothole.nearest_city or 'unknown'}. Severity: {pothole.severity}."
            ),
            status="escalated",
        )
        db.add(complaint)
        db.flush()
        pothole.status = "escalated"

    # Find current index in ladder
    current_idx = next(
        (
            i
            for i, s in enumerate(ESCALATION_LADDER)
            if s["level"] == complaint.escalation_level
        ),
        0,
    )
    next_idx = min(current_idx + 1, len(ESCALATION_LADDER) - 1)

    if next_idx == current_idx:
        # Already at max escalation
        db.commit()
        return {
            "id": pothole.id,
            "complaint_ref": complaint.complaint_ref,
            "escalation_level": ESCALATION_LADDER[current_idx]["level"],
            "escalation_label": ESCALATION_LADDER[current_idx]["label"],
            "already_max": True,
        }

    old_level = ESCALATION_LADDER[current_idx]["label"]
    complaint.escalation_level = ESCALATION_LADDER[next_idx]["level"]
    complaint.escalation_count = next_idx
    complaint.last_escalated_at = datetime.now()
    complaint.status = "escalated"
    pothole.status = "escalated"

    if data.notes:
        complaint.resolution_notes = (
            f"[ADMIN ESCALATION] {data.notes} | "
            f"Escalated from {old_level} to {ESCALATION_LADDER[next_idx]['label']}"
        )

    # Flag contractor if escalated to district+ level
    if next_idx >= 2 and complaint.assigned_contractor_id:
        contractor = (
            db.query(Contractor)
            .filter(Contractor.id == complaint.assigned_contractor_id)
            .first()
        )
        if contractor and not contractor.flagged:
            contractor.flagged = True
            contractor.flag_reason = (
                f"Admin escalated complaint {complaint.complaint_ref} to "
                f"{ESCALATION_LADDER[next_idx]['label']}"
            )

    db.commit()

    return {
        "id": pothole.id,
        "complaint_ref": complaint.complaint_ref,
        "old_level": old_level,
        "escalation_level": ESCALATION_LADDER[next_idx]["level"],
        "escalation_label": ESCALATION_LADDER[next_idx]["label"],
        "escalation_count": complaint.escalation_count,
        "already_max": False,
    }


class PotholeUpdateRequest(BaseModel):
    severity: Optional[str] = None
    assigned_contractor_id: Optional[str] = None
    highway_ref: Optional[str] = None
    nearest_city: Optional[str] = None
    district: Optional[str] = None
    road_segment: Optional[str] = None


@router.patch("/{pothole_id}")
def update_pothole(
    pothole_id: str, data: PotholeUpdateRequest, db: Session = Depends(get_db)
):
    """Update editable fields on a pothole (severity, location, assigned contractor)."""
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")

    if data.severity is not None:
        VALID_SEVERITIES = {"low", "medium", "high", "critical"}
        if data.severity not in VALID_SEVERITIES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid severity. Must be one of: {', '.join(sorted(VALID_SEVERITIES))}",
            )
        pothole.severity = data.severity
        score_map = {"low": 20.0, "medium": 50.0, "high": 75.0, "critical": 95.0}
        pothole.severity_score = score_map[data.severity]

    if data.assigned_contractor_id is not None:
        if data.assigned_contractor_id == "":
            pothole.assigned_contractor_id = None
        else:
            contractor = (
                db.query(Contractor)
                .filter(Contractor.id == data.assigned_contractor_id)
                .first()
            )
            if not contractor:
                raise HTTPException(status_code=404, detail="Contractor not found")
            pothole.assigned_contractor_id = data.assigned_contractor_id

    if data.highway_ref is not None:
        pothole.highway_ref = data.highway_ref or None
    if data.nearest_city is not None:
        pothole.nearest_city = data.nearest_city or None
    if data.district is not None:
        pothole.district = data.district or None
    if data.road_segment is not None:
        pothole.road_segment = data.road_segment or None

    db.commit()
    db.refresh(pothole)
    cmap = _build_contractor_map(
        db,
        {pothole.assigned_contractor_id} if pothole.assigned_contractor_id else set(),
    )
    return _enrich_pothole(pothole, cmap)


@router.post("/{pothole_id}/notify")
def notify_authority(
    pothole_id: str, data: NotifyRequest, db: Session = Depends(get_db)
):
    """
    Simulate sending a notification to the relevant authority (district
    collector, PWD, media) about a pothole.  In production this would
    integrate with SMS/email gateways.
    """
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")

    # Look up the current escalation level to determine who to notify
    complaint = (
        db.query(Complaint)
        .filter(Complaint.pothole_id == pothole_id)
        .order_by(Complaint.filed_at.desc())
        .first()
    )

    level = complaint.escalation_level if complaint else "department"
    level_label = next(
        (s["label"] for s in ESCALATION_LADDER if s["level"] == level),
        "Department Level",
    )

    # Compose notification message
    msg = data.message or (
        f"Urgent: {pothole.severity.upper()} severity pothole on "
        f"{pothole.highway_ref or 'unknown highway'} near "
        f"{pothole.nearest_city or 'unknown location'} "
        f"(GPS: {pothole.latitude:.5f}, {pothole.longitude:.5f}). "
        f"Current escalation: {level_label}. Immediate action required."
    )

    # In production: dispatch to SMS/email/push gateway.
    # For now we return a simulated success.
    return {
        "id": pothole.id,
        "notified": True,
        "channel": data.channel,
        "recipient_level": level,
        "recipient_label": level_label,
        "message": msg,
    }


@router.post("/backfill-locations")
def backfill_pothole_locations(db: Session = Depends(get_db)):
    """Backfill highway_ref and nearest_city for potholes that are missing them."""
    from app.services.geocoding import enrich_pothole_location

    potholes = (
        db.query(Pothole)
        .filter(
            (Pothole.highway_ref == None) | (Pothole.nearest_city == None)  # noqa: E711
        )
        .all()
    )

    updated = 0
    for p in potholes:
        loc = enrich_pothole_location(p.latitude, p.longitude)
        if not p.highway_ref and loc["highway_ref"]:
            p.highway_ref = loc["highway_ref"]
        if not p.highway_type and loc["highway_type"]:
            p.highway_type = loc["highway_type"]
        if not p.nearest_city and loc["nearest_city"]:
            p.nearest_city = loc["nearest_city"]
        if not p.district and loc["district"]:
            p.district = loc["district"]
        updated += 1

    db.commit()

    return {
        "backfilled": updated,
        "message": f"Updated {updated} potholes with location data.",
    }


@router.delete("/{pothole_id}")
def delete_pothole(pothole_id: str, db: Session = Depends(get_db)):
    """Delete a pothole and its associated complaints and citizen reports."""
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")

    # Delete linked complaints
    deleted_complaints = (
        db.query(Complaint)
        .filter(Complaint.pothole_id == pothole_id)
        .delete(synchronize_session="fetch")
    )

    # Delete linked citizen reports
    deleted_reports = (
        db.query(CitizenReport)
        .filter(CitizenReport.pothole_id == pothole_id)
        .delete(synchronize_session="fetch")
    )

    db.delete(pothole)
    db.commit()

    return {
        "deleted": True,
        "id": pothole_id,
        "deleted_complaints": deleted_complaints,
        "deleted_citizen_reports": deleted_reports,
    }
