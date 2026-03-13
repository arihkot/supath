import type {
  Pothole,
  PotholesResponse,
  ComplaintsResponse,
  ComplaintCreatedResponse,
  Contractor,
  Highway,
  DashboardStats,
  DetectionResponse,
  NewsMention,
  TrafficAnomaly,
  WaterloggingZone,
  EscalationSummary,
  PendingVerificationsResponse,
  EscalationResult,
  CitizenReportResponse,
  VerifyResolutionResponse,
  EscalationConfig,
  IncentiveTier,
} from "./types";
import type { FeatureCollection } from "geojson";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API Error: ${response.status}`);
    }

    return response.json();
  }

  // Health check
  async health() {
    return this.request<{ status: string }>("/health");
  }

  // Potholes
  async getPotholes(params?: {
    severity?: string;
    highway_ref?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.set(key, String(value));
      });
    }
    const query = searchParams.toString();
    return this.request<PotholesResponse>(`/api/potholes${query ? `?${query}` : ""}`);
  }

  async getPothole(id: string) {
    return this.request<Pothole>(`/api/potholes/${id}`);
  }

  // Detection
  async detectImage(file: File, latitude?: number, longitude?: number) {
    const formData = new FormData();
    formData.append("file", file);
    if (latitude) formData.append("latitude", String(latitude));
    if (longitude) formData.append("longitude", String(longitude));

    const url = `${this.baseUrl}/api/detect/image`;
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Detection failed");
    }

    return response.json() as Promise<DetectionResponse>;
  }

  async detectVideo(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const url = `${this.baseUrl}/api/detect/video`;
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Video detection failed");
    }

    return response.json() as Promise<DetectionResponse>;
  }

  // Complaints
  async getComplaints(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.set(key, String(value));
      });
    }
    const query = searchParams.toString();
    return this.request<ComplaintsResponse>(`/api/complaints${query ? `?${query}` : ""}`);
  }

  async createComplaint(potholeId: string, portal = "PG_CG") {
    return this.request<ComplaintCreatedResponse>("/api/complaints", {
      method: "POST",
      body: JSON.stringify({ pothole_id: potholeId, portal }),
    });
  }

  // Highways
  async getHighways() {
    return this.request<Highway[]>("/api/highways");
  }

  async getHighwayGeoJSON() {
    return this.request<FeatureCollection>("/api/highways/geojson");
  }

  async getCGBoundary() {
    return this.request<FeatureCollection>("/api/highways/boundary");
  }

  // Analytics
  async getAnalytics() {
    return this.request<Record<string, unknown>>("/api/analytics");
  }

  async getDashboardStats() {
    return this.request<DashboardStats>("/api/analytics/dashboard");
  }

  // Contractors
  async getContractors() {
    return this.request<Contractor[]>("/api/contractors");
  }

  // Citizen Reports
  async submitCitizenReport(data: FormData) {
    const url = `${this.baseUrl}/api/citizen-reports`;
    const response = await fetch(url, {
      method: "POST",
      body: data,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Report submission failed");
    }

    return response.json() as Promise<CitizenReportResponse>;
  }

  // News & Sources
  async getNewsMentions(): Promise<NewsMention[]> {
    const data = await this.request<{ total: number; mentions: NewsMention[] }>("/api/sources/news");
    return data.mentions || [];
  }

  async getTrafficAnomalies(): Promise<TrafficAnomaly[]> {
    const data = await this.request<{ total: number; anomalies: TrafficAnomaly[] }>("/api/sources/traffic");
    return data.anomalies || [];
  }

  async getWaterloggingZones(): Promise<WaterloggingZone[]> {
    const data = await this.request<{ total: number; zones: WaterloggingZone[] }>("/api/sources/waterlogging");
    return data.zones || [];
  }

  // Loop Closure
  async getEscalationConfig() {
    return this.request<EscalationConfig>("/api/loop-closure/config");
  }

  async triggerEscalation() {
    return this.request<EscalationResult>("/api/loop-closure/escalate", { method: "POST" });
  }

  async verifyResolution(potholeId: string, stillDetected: boolean, confidence: number = 0) {
    return this.request<VerifyResolutionResponse>("/api/loop-closure/verify", {
      method: "POST",
      body: JSON.stringify({
        pothole_id: potholeId,
        still_detected: stillDetected,
        confidence,
      }),
    });
  }

  async getPendingVerifications(days: number = 7) {
    return this.request<PendingVerificationsResponse>(`/api/loop-closure/pending-verification?days=${days}`);
  }

  async getEscalationSummary() {
    return this.request<EscalationSummary>("/api/loop-closure/escalation-summary");
  }

  async getIncentiveTiers(): Promise<{ tiers: IncentiveTier[] }> {
    return this.request<{ tiers: IncentiveTier[] }>("/api/citizen-reports/incentive-tiers");
  }

  async getTotalPoints(): Promise<{ total_points: number }> {
    return this.request<{ total_points: number }>("/api/citizen-reports/total-points");
  }
}

export const api = new ApiClient(API_BASE);
