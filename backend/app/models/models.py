from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.database import Base
import uuid


def generate_uuid():
    return str(uuid.uuid4())[:12].upper()


class Pothole(Base):
    __tablename__ = "potholes"

    id = Column(String, primary_key=True, default=generate_uuid)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    highway_ref = Column(String, nullable=True)  # e.g., "NH 30"
    highway_type = Column(String, nullable=True)  # "NH" or "SH"
    severity = Column(
        String, nullable=False, default="medium"
    )  # low, medium, high, critical
    severity_score = Column(Float, default=50.0)  # 0-100
    confidence_score = Column(Float, default=0.0)  # 0-1 from YOLO
    source = Column(String, nullable=False, default="cv_detection")
    # Sources: cv_detection, citizen_report, dashcam, news, traffic_anomaly, cleaning_vehicle, satellite
    image_url = Column(String, nullable=True)
    detection_metadata = Column(JSON, nullable=True)
    # bbox, class_id, model_version, etc.

    nearest_city = Column(String, nullable=True)
    district = Column(String, nullable=True)
    road_segment = Column(String, nullable=True)  # Descriptive location

    status = Column(String, default="detected")
    # detected, complaint_filed, acknowledged, in_progress, resolved, escalated
    is_resolved = Column(Boolean, default=False)

    detected_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(String, primary_key=True, default=generate_uuid)
    pothole_id = Column(String, nullable=False)
    complaint_ref = Column(String, unique=True, nullable=False)
    # Format: CG/PG/2026/XXXXX

    portal = Column(String, default="pg_portal")
    # pg_portal, state_portal, district_portal
    status = Column(String, default="filed")
    # filed, acknowledged, in_progress, resolved, escalated, closed
    description = Column(Text, nullable=True)
    category = Column(String, default="Road / Highway Maintenance")

    filed_at = Column(DateTime, server_default=func.now())
    acknowledged_at = Column(DateTime, nullable=True)
    in_progress_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    escalation_count = Column(Integer, default=0)
    last_escalated_at = Column(DateTime, nullable=True)
    escalation_level = Column(String, default="department")
    # department, district, state, media_alert

    assigned_contractor_id = Column(String, nullable=True)
    resolution_notes = Column(Text, nullable=True)

    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Contractor(Base):
    __tablename__ = "contractors"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    registration_id = Column(String, unique=True, nullable=False)
    district = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)

    total_contracts = Column(Integer, default=0)
    completed_contracts = Column(Integer, default=0)
    avg_repair_days = Column(Float, default=0.0)
    reputation_score = Column(Float, default=50.0)  # 0-100
    road_quality_score = Column(Float, default=50.0)  # 0-100
    flagged = Column(Boolean, default=False)
    flag_reason = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Highway(Base):
    __tablename__ = "highways"

    id = Column(String, primary_key=True, default=generate_uuid)
    ref = Column(String, nullable=False)  # e.g., "NH 30"
    highway_type = Column(String, nullable=False)  # "NH" or "SH"
    name = Column(String, nullable=True)
    start_city = Column(String, nullable=True)
    end_city = Column(String, nullable=True)
    length_km = Column(Float, nullable=True)
    geojson = Column(Text, nullable=True)  # Full GeoJSON geometry

    risk_score = Column(Float, default=0.0)  # 0-100
    pothole_count = Column(Integer, default=0)
    last_surveyed = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CitizenReport(Base):
    __tablename__ = "citizen_reports"

    id = Column(String, primary_key=True, default=generate_uuid)
    pothole_id = Column(String, nullable=True)  # linked after verification
    reporter_name = Column(String, nullable=True)
    phone_hash = Column(String, nullable=True)  # Hashed for privacy

    image_urls = Column(JSON, default=list)
    video_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    incentive_points = Column(Integer, default=10)
    verified = Column(Boolean, default=False)

    reported_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class NewsMention(Base):
    __tablename__ = "news_mentions"

    id = Column(String, primary_key=True, default=generate_uuid)
    source_type = Column(String, nullable=False)  # newspaper, twitter, reddit
    source_name = Column(String, nullable=True)  # e.g., "Dainik Bhaskar"
    title = Column(String, nullable=True)
    content_snippet = Column(Text, nullable=True)
    url = Column(String, nullable=True)

    extracted_location = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    severity_keyword = Column(String, nullable=True)
    sentiment_score = Column(Float, nullable=True)

    published_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, server_default=func.now())


class WaterloggingZone(Base):
    __tablename__ = "waterlogging_zones"

    id = Column(String, primary_key=True, default=generate_uuid)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_m = Column(Float, default=200.0)
    risk_level = Column(String, default="medium")  # low, medium, high
    elevation_m = Column(Float, nullable=True)
    historical_incidents = Column(Integer, default=0)
    last_monsoon_status = Column(String, nullable=True)
    associated_highway_ref = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now())


class TrafficAnomaly(Base):
    __tablename__ = "traffic_anomalies"

    id = Column(String, primary_key=True, default=generate_uuid)
    highway_ref = Column(String, nullable=False)
    location = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    anomaly_type = Column(String, nullable=False)
    # persistent_slowdown, recurring_congestion, stop_and_go
    severity = Column(String, default="medium")  # low, medium, high, critical
    avg_speed_kmph = Column(Float, nullable=True)
    expected_speed_kmph = Column(Float, nullable=True)
    delay_factor = Column(Float, nullable=True)
    detected_at = Column(DateTime, nullable=True)
    occurrences = Column(Integer, default=0)
    likely_cause = Column(String, nullable=True)
    # road_damage, waterlogging_damage, construction

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class IncentiveTier(Base):
    __tablename__ = "incentive_tiers"

    id = Column(String, primary_key=True, default=generate_uuid)
    label = Column(String, nullable=False)
    points = Column(Integer, nullable=False)
    condition_key = Column(String, nullable=False, unique=True)
    # photo_with_location, verified_report, first_in_area, critical_severity
    badge_color = Column(String, default="amber")
    # amber, green, red — maps to Tailwind colour classes on the frontend
    description = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)

    created_at = Column(DateTime, server_default=func.now())
