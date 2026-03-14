"""Citizen reporting API."""

from __future__ import annotations

import hashlib
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional, List
from pathlib import Path

from app.database import get_db
from app.models import CitizenReport, Pothole, IncentiveTier
from app.config import settings
from app.schemas import IncentiveTierResponse
from app.services.geocoding import enrich_pothole_location

router = APIRouter()


def _calculate_points(
    db: Session,
    latitude: float,
    longitude: float,
    has_image: bool,
    has_location: bool,
) -> int:
    """Calculate incentive points based on tiers stored in the database."""
    tiers = db.query(IncentiveTier).order_by(IncentiveTier.sort_order).all()
    total = 0
    for tier in tiers:
        if tier.condition_key == "photo_with_location" and has_image and has_location:
            total += tier.points
        elif tier.condition_key == "first_in_area" and has_location:
            nearby = (
                db.query(Pothole)
                .filter(
                    Pothole.latitude.between(latitude - 0.005, latitude + 0.005),
                    Pothole.longitude.between(longitude - 0.005, longitude + 0.005),
                )
                .first()
            )
            if not nearby:
                total += tier.points
    # Minimum 5 points for any submission
    return max(total, 5)


@router.get("/incentive-tiers")
def get_incentive_tiers(db: Session = Depends(get_db)):
    """Get all incentive tiers."""
    tiers = db.query(IncentiveTier).order_by(IncentiveTier.sort_order).all()
    return {"tiers": [IncentiveTierResponse.model_validate(t) for t in tiers]}


@router.get("/total-points")
def get_total_points(db: Session = Depends(get_db)):
    """Get cumulative incentive points awarded across all citizen reports."""
    total = db.query(func.sum(CitizenReport.incentive_points)).scalar() or 0
    return {"total_points": total}


@router.post("")
async def submit_citizen_report(
    latitude: float = Form(...),
    longitude: float = Form(...),
    description: Optional[str] = Form(None),
    reporter_name: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
):
    """Submit a citizen pothole report."""
    image_urls = []
    has_image = False

    if files:
        for file in files:
            if file and file.filename:
                has_image = True
                file_id = str(uuid.uuid4())[:8]
                ext = Path(file.filename).suffix
                filename = f"citizen_{file_id}{ext}"
                filepath = Path(settings.UPLOAD_DIR) / "images" / filename

                content = await file.read()
                with open(filepath, "wb") as f:
                    f.write(content)
                image_urls.append(f"/uploads/images/{filename}")

    points = _calculate_points(
        db,
        latitude,
        longitude,
        has_image,
        has_location=(latitude is not None and longitude is not None),
    )

    # Create citizen report
    report = CitizenReport(
        latitude=latitude,
        longitude=longitude,
        description=description,
        reporter_name=reporter_name,
        phone_hash=hashlib.sha256(phone.encode()).hexdigest()[:16] if phone else None,
        image_urls=image_urls,
        incentive_points=points,
    )
    db.add(report)

    # Also create a pothole record from this report
    # Assign severity based on whether photo exists (photo = higher confidence)
    initial_severity = "medium" if has_image else "low"
    loc = enrich_pothole_location(latitude, longitude)
    pothole = Pothole(
        latitude=latitude,
        longitude=longitude,
        severity=initial_severity,
        severity_score=35.0 if has_image else 15.0,
        source="citizen_report",
        image_url=image_urls[0] if image_urls else None,
        road_segment=description,
        status="detected",
        highway_ref=loc["highway_ref"],
        highway_type=loc["highway_type"],
        nearest_city=loc["nearest_city"],
        district=loc["district"],
    )
    db.add(pothole)
    db.commit()

    report.pothole_id = pothole.id
    db.commit()

    return {
        "id": report.id,
        "pothole_id": pothole.id,
        "incentive_points": report.incentive_points,
        "message": "Report submitted successfully. Thank you for contributing!",
    }


@router.get("")
def get_citizen_reports(db: Session = Depends(get_db)):
    """Get all citizen reports."""
    reports = db.query(CitizenReport).order_by(CitizenReport.reported_at.desc()).all()
    return {
        "total": len(reports),
        "reports": [
            {
                "id": r.id,
                "pothole_id": r.pothole_id,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "description": r.description,
                "incentive_points": r.incentive_points,
                "verified": r.verified,
                "reported_at": r.reported_at.isoformat() if r.reported_at else None,
            }
            for r in reports
        ],
    }
