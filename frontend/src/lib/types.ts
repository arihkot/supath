// ---------------------------------------------------------------------------
// Shared domain types — used by api.ts and page components
// ---------------------------------------------------------------------------

export interface Pothole {
  id: string;
  latitude: number;
  longitude: number;
  severity: string;
  status: string;
  source: string;
  highway_ref?: string;
  nearest_city?: string;
  district?: string;
  detected_at?: string;
  resolved_at?: string;
  description?: string;
}

export interface PotholesResponse {
  potholes: Pothole[];
  total: number;
}

export interface Complaint {
  id: string;
  complaint_ref: string;
  pothole_id: string;
  portal: string;
  status: string;
  filed_at: string;
  resolved_at?: string;
  acknowledged_at?: string;
  escalation_count: number;
  escalation_level: string;
}

export interface ComplaintsResponse {
  complaints: Complaint[];
  total: number;
}

export interface ComplaintCreatedResponse {
  complaint_ref: string;
  id: string;
}

export interface Contractor {
  id: string;
  name: string;
  registration_id: string;
  district?: string;
  total_contracts: number;
  completed_contracts: number;
  avg_repair_days?: number;
  reputation_score: number;
  road_quality_score: number;
  flagged: boolean;
  flag_reason?: string;
}

export interface Highway {
  id: string;
  ref: string;
  name?: string;
  type: string;
  length_km?: number;
}

export interface DashboardStats {
  total_potholes: number;
  active_potholes: number;
  complaints_filed: number;
  resolved: number;
  avg_resolution_days: number;
  severity_counts: Record<string, number>;
  source_breakdown: Record<string, number>;
  complaint_statuses: Record<string, number>;
  top_highways: Array<{ highway: string; count: number }>;
  recent_detections: Pothole[];
  monthly_trend: Array<{ month: string; count: number }>;
}

export interface Detection {
  class_name: string;
  confidence: number;
  severity: string;
  bbox: number[];
}

export interface DetectionResponse {
  potholes_detected: number;
  detections: Detection[];
  severity_summary: Record<string, number>;
  image_url?: string;
  pothole_ids?: string[];
  mock?: boolean;
}

export interface NewsMention {
  id: string;
  source_type: string;
  source_name?: string;
  title?: string;
  content_snippet?: string;
  extracted_location?: string;
  severity_keyword?: string;
  sentiment_score?: number;
  published_at?: string;
}

export interface TrafficAnomaly {
  id: string;
  location: string;
  highway_ref: string;
  anomaly_type: string;
  severity: string;
  detected_at: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  avg_speed_kmph?: number;
  expected_speed_kmph?: number;
  delay_factor?: number;
  likely_cause?: string;
}

export interface WaterloggingZone {
  id: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  risk_level: string;
  elevation_m?: number;
  historical_incidents: number;
  associated_highway_ref?: string;
}

export interface EscalationSummary {
  total: number;
  escalation_breakdown: Record<string, { count: number; avg_days?: number }>;
}

export interface PendingVerification {
  id: string;
  highway_ref?: string;
  severity: string;
  days_since_resolution: number;
  resolved_at?: string;
}

export interface PendingVerificationsResponse {
  potholes: PendingVerification[];
}

export interface EscalationResult {
  checked: number;
  escalated: number;
}

export interface CitizenReportResponse {
  id: string;
  status: string;
  incentive_points?: number;
}

export interface VerifyResolutionResponse {
  id: string;
  status: string;
}

export interface EscalationStep {
  level: string;
  label: string;
  days: number;
  color: string;
}

export interface EscalationConfig {
  ladder: EscalationStep[];
}

export interface IncentiveTier {
  id: string;
  label: string;
  points: number;
  condition_key: string;
  badge_color: string;
  description?: string;
  sort_order: number;
}
