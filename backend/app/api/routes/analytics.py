"""Analytics and dashboard stats API."""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Pothole, Complaint, Contractor

router = APIRouter()


@router.get("/dashboard")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get aggregated dashboard statistics."""
    total_potholes = db.query(Pothole).count()
    active_potholes = db.query(Pothole).filter(Pothole.is_resolved == False).count()
    complaints_filed = db.query(Complaint).count()
    resolved = db.query(Pothole).filter(Pothole.is_resolved == True).count()

    # Average resolution days
    resolved_with_dates = (
        db.query(Pothole)
        .filter(
            Pothole.is_resolved == True,
            Pothole.resolved_at.isnot(None),
            Pothole.detected_at.isnot(None),
        )
        .all()
    )

    avg_days = 0.0
    if resolved_with_dates:
        total_days = sum(
            (p.resolved_at - p.detected_at).days
            for p in resolved_with_dates
            if p.resolved_at and p.detected_at
        )
        avg_days = total_days / len(resolved_with_dates)

    # Severity counts
    severity_counts = {}
    for sev in ["critical", "high", "medium", "low"]:
        severity_counts[sev] = db.query(Pothole).filter(Pothole.severity == sev).count()

    # Source breakdown
    source_breakdown = {}
    sources = (
        db.query(Pothole.source, func.count(Pothole.id)).group_by(Pothole.source).all()
    )
    for source, count in sources:
        source_breakdown[source] = count

    # Complaint status breakdown
    complaint_statuses = {}
    statuses = (
        db.query(Complaint.status, func.count(Complaint.id))
        .group_by(Complaint.status)
        .all()
    )
    for status, count in statuses:
        complaint_statuses[status] = count

    # Top affected highways
    top_highways = (
        db.query(Pothole.highway_ref, func.count(Pothole.id).label("count"))
        .filter(Pothole.highway_ref.isnot(None))
        .group_by(Pothole.highway_ref)
        .order_by(func.count(Pothole.id).desc())
        .limit(10)
        .all()
    )

    # Recent detections
    recent = db.query(Pothole).order_by(Pothole.detected_at.desc()).limit(10).all()

    # Monthly trend (last 6 months)
    monthly_trend = []
    now = datetime.now()
    for i in range(5, -1, -1):
        month_start = (now - timedelta(days=30 * i)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        if i > 0:
            month_end = (now - timedelta(days=30 * (i - 1))).replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
        else:
            month_end = now

        count = (
            db.query(Pothole)
            .filter(
                Pothole.detected_at >= month_start,
                Pothole.detected_at < month_end,
            )
            .count()
        )

        monthly_trend.append(
            {
                "month": month_start.strftime("%b %Y"),
                "count": count,
            }
        )

    return {
        "total_potholes": total_potholes,
        "active_potholes": active_potholes,
        "complaints_filed": complaints_filed,
        "resolved": resolved,
        "avg_resolution_days": round(avg_days, 1),
        "severity_counts": severity_counts,
        "source_breakdown": source_breakdown,
        "complaint_statuses": complaint_statuses,
        "top_highways": [{"highway": h, "count": c} for h, c in top_highways],
        "recent_detections": [
            {
                "id": p.id,
                "highway_ref": p.highway_ref,
                "severity": p.severity,
                "source": p.source,
                "status": p.status,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "nearest_city": p.nearest_city,
                "detected_at": p.detected_at.isoformat() if p.detected_at else None,
            }
            for p in recent
        ],
        "monthly_trend": monthly_trend,
    }


@router.get("")
def get_analytics(db: Session = Depends(get_db)):
    """Get detailed analytics data."""
    return get_dashboard_stats(db)
