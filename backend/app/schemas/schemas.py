from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# --- Pothole Schemas ---


class PotholeBase(BaseModel):
    latitude: float
    longitude: float
    highway_ref: Optional[str] = None
    highway_type: Optional[str] = None
    severity: str = "medium"
    severity_score: float = 50.0
    source: str = "cv_detection"
    nearest_city: Optional[str] = None
    district: Optional[str] = None
    road_segment: Optional[str] = None


class PotholeCreate(PotholeBase):
    confidence_score: float = 0.0
    image_url: Optional[str] = None
    detection_metadata: Optional[dict] = None


class PotholeResponse(PotholeBase):
    id: str
    confidence_score: float
    image_url: Optional[str] = None
    detection_metadata: Optional[dict] = None
    status: str
    is_resolved: bool
    detected_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PotholeListResponse(BaseModel):
    total: int
    potholes: list[PotholeResponse]


# --- Complaint Schemas ---


class ComplaintBase(BaseModel):
    pothole_id: str
    portal: str = "pg_portal"
    description: Optional[str] = None


class ComplaintResponse(BaseModel):
    id: str
    pothole_id: str
    complaint_ref: str
    portal: str
    status: str
    description: Optional[str] = None
    category: str
    filed_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    escalation_count: int
    escalation_level: str
    assigned_contractor_id: Optional[str] = None

    class Config:
        from_attributes = True


# --- Contractor Schemas ---


class ContractorResponse(BaseModel):
    id: str
    name: str
    registration_id: str
    district: Optional[str] = None
    total_contracts: int
    completed_contracts: int
    avg_repair_days: float
    reputation_score: float
    road_quality_score: float
    flagged: bool
    flag_reason: Optional[str] = None

    class Config:
        from_attributes = True


# --- Highway Schemas ---


class HighwayResponse(BaseModel):
    id: str
    ref: str
    highway_type: str
    name: Optional[str] = None
    start_city: Optional[str] = None
    end_city: Optional[str] = None
    length_km: Optional[float] = None
    risk_score: float
    pothole_count: int

    class Config:
        from_attributes = True


# --- Detection Schemas ---


class DetectionResult(BaseModel):
    potholes_detected: int
    detections: list[dict]
    image_url: Optional[str] = None
    severity_summary: dict


# --- Dashboard Schemas ---


class DashboardStats(BaseModel):
    total_potholes: int
    active_potholes: int
    complaints_filed: int
    resolved: int
    avg_resolution_days: float
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    detection_sources: dict
    recent_detections: list[PotholeResponse]
    complaint_status_breakdown: dict
    top_highways: list[dict]
    monthly_trend: list[dict]


# --- Citizen Report Schemas ---


class CitizenReportCreate(BaseModel):
    latitude: float
    longitude: float
    description: Optional[str] = None
    reporter_name: Optional[str] = None
    phone: Optional[str] = None


class CitizenReportResponse(BaseModel):
    id: str
    pothole_id: Optional[str] = None
    latitude: float
    longitude: float
    description: Optional[str] = None
    incentive_points: int
    verified: bool
    reported_at: datetime

    class Config:
        from_attributes = True


# --- News Mention Schemas ---


class NewsMentionResponse(BaseModel):
    id: str
    source_type: str
    source_name: Optional[str] = None
    title: Optional[str] = None
    content_snippet: Optional[str] = None
    extracted_location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    severity_keyword: Optional[str] = None
    sentiment_score: Optional[float] = None
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Waterlogging Zone Schemas ---


class WaterloggingZoneResponse(BaseModel):
    id: str
    latitude: float
    longitude: float
    radius_m: float
    risk_level: str
    elevation_m: Optional[float] = None
    historical_incidents: int
    associated_highway_ref: Optional[str] = None

    class Config:
        from_attributes = True


# --- Traffic Anomaly Schemas ---


class TrafficAnomalyResponse(BaseModel):
    id: str
    highway_ref: str
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    anomaly_type: str
    severity: str
    avg_speed_kmph: Optional[float] = None
    expected_speed_kmph: Optional[float] = None
    delay_factor: Optional[float] = None
    detected_at: Optional[datetime] = None
    occurrences: int
    likely_cause: Optional[str] = None

    class Config:
        from_attributes = True


# --- Incentive Tier Schemas ---


class IncentiveTierResponse(BaseModel):
    id: str
    label: str
    points: int
    condition_key: str
    badge_color: str
    description: Optional[str] = None
    sort_order: int

    class Config:
        from_attributes = True
