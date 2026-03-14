// ---------------------------------------------------------------------------
// Shared domain types — used by api.ts and page components
// ---------------------------------------------------------------------------

export interface Pothole {
  id: string;
  latitude: number;
  longitude: number;
  severity: string;
  severity_score?: number;
  confidence_score?: number;
  status: string;
  source: string;
  highway_ref?: string;
  highway_type?: string;
  nearest_city?: string;
  district?: string;
  detected_at?: string;
  resolved_at?: string;
  description?: string;
  is_resolved?: boolean;
  image_url?: string;
  detection_metadata?: Record<string, unknown>;
  assigned_contractor_id?: string;
  assigned_contractor_name?: string;
}

// Response types for pothole admin actions
export interface StatusUpdateResponse {
  id: string;
  old_status: string;
  new_status: string;
  is_resolved: boolean;
}

export interface EscalateResponse {
  id: string;
  complaint_ref: string;
  old_level?: string;
  escalation_level: string;
  escalation_label: string;
  escalation_count?: number;
  already_max: boolean;
}

export interface NotifyResponse {
  id: string;
  notified: boolean;
  channel: string;
  recipient_level: string;
  recipient_label: string;
  message: string;
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
  description?: string;
  resolution_notes?: string;
  filed_at: string;
  resolved_at?: string;
  acknowledged_at?: string;
  in_progress_at?: string;
  escalation_count: number;
  escalation_level: string;
  assigned_contractor_id?: string;
}

export interface ComplaintsResponse {
  complaints: Complaint[];
  total: number;
  status_counts?: Record<string, number>;
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
  contact_phone?: string;
  total_contracts: number;
  completed_contracts: number;
  avg_repair_days?: number;
  reputation_score: number;
  road_quality_score: number;
  flagged: boolean;
  flag_reason?: string;
  assigned_highways?: number;
  assigned_potholes?: number;
}

export interface Highway {
  id: string;
  ref: string;
  name?: string;
  highway_type: string;
  start_city?: string;
  end_city?: string;
  length_km?: number;
  risk_score?: number;
  pothole_count?: number;
  assigned_contractor_id?: string;
  assigned_contractor_name?: string;
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
  total_complaints: number;
  escalation_breakdown: Record<
    string,
    { count: number; label?: string; threshold_days?: number; avg_days?: number }
  >;
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

// ---------------------------------------------------------------------------
// Admin mutation request types
// ---------------------------------------------------------------------------

export interface PotholeUpdateRequest {
  severity?: string;
  assigned_contractor_id?: string | null;
  highway_ref?: string;
  nearest_city?: string;
  district?: string;
  road_segment?: string;
}

export interface ComplaintUpdateRequest {
  status?: string;
  description?: string;
  resolution_notes?: string;
  assigned_contractor_id?: string | null;
}

export interface ContractorCreateRequest {
  name: string;
  registration_id: string;
  district?: string;
  contact_phone?: string;
  total_contracts?: number;
  completed_contracts?: number;
  avg_repair_days?: number;
  reputation_score?: number;
  road_quality_score?: number;
  flagged?: boolean;
  flag_reason?: string;
}

export interface ContractorUpdateRequest {
  name?: string;
  district?: string;
  contact_phone?: string;
  total_contracts?: number;
  completed_contracts?: number;
  avg_repair_days?: number;
  reputation_score?: number;
  road_quality_score?: number;
  flagged?: boolean;
  flag_reason?: string;
}

export interface HighwayUpdateRequest {
  assigned_contractor_id?: string | null;
}
