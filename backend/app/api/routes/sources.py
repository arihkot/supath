"""Data sources API - news, traffic, waterlogging, etc."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import NewsMention, WaterloggingZone, TrafficAnomaly
from app.schemas import TrafficAnomalyResponse

router = APIRouter()


@router.get("/news")
def get_news_mentions(db: Session = Depends(get_db)):
    """Get news and social media mentions related to potholes."""
    mentions = db.query(NewsMention).order_by(NewsMention.published_at.desc()).all()
    return {
        "total": len(mentions),
        "mentions": [
            {
                "id": m.id,
                "source_type": m.source_type,
                "source_name": m.source_name,
                "title": m.title,
                "content_snippet": m.content_snippet,
                "url": m.url,
                "extracted_location": m.extracted_location,
                "latitude": m.latitude,
                "longitude": m.longitude,
                "severity_keyword": m.severity_keyword,
                "sentiment_score": m.sentiment_score,
                "published_at": m.published_at.isoformat() if m.published_at else None,
            }
            for m in mentions
        ],
    }


@router.get("/traffic")
def get_traffic_anomalies(db: Session = Depends(get_db)):
    """Get traffic anomaly data for CG highways from database."""
    anomalies = (
        db.query(TrafficAnomaly).order_by(TrafficAnomaly.occurrences.desc()).all()
    )
    return {
        "total": len(anomalies),
        "anomalies": [TrafficAnomalyResponse.model_validate(a) for a in anomalies],
    }


@router.get("/waterlogging")
def get_waterlogging_zones(db: Session = Depends(get_db)):
    """Get waterlogging-prone zones."""
    zones = db.query(WaterloggingZone).all()
    return {
        "total": len(zones),
        "zones": [
            {
                "id": z.id,
                "latitude": z.latitude,
                "longitude": z.longitude,
                "radius_m": z.radius_m,
                "risk_level": z.risk_level,
                "elevation_m": z.elevation_m,
                "historical_incidents": z.historical_incidents,
                "associated_highway_ref": z.associated_highway_ref,
            }
            for z in zones
        ],
    }
