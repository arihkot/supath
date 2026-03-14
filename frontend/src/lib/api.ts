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
  StatusUpdateResponse,
  EscalateResponse,
  NotifyResponse,
  PotholeUpdateRequest,
  ComplaintUpdateRequest,
  ContractorCreateRequest,
  ContractorUpdateRequest,
  HighwayUpdateRequest,
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
  async getHighways(): Promise<Highway[]> {
    const data = await this.request<{ total: number; highways: Highway[] }>("/api/highways");
    return data.highways || [];
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
  async getContractors(): Promise<Contractor[]> {
    const data = await this.request<{ total: number; contractors: Contractor[] }>("/api/contractors");
    return data.contractors || [];
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

  // ---------------------------------------------------------------------------
  // Pothole Admin Actions (used from interactive map)
  // ---------------------------------------------------------------------------

  async updatePotholeStatus(id: string, status: string, resolutionNotes?: string) {
    return this.request<StatusUpdateResponse>(`/api/potholes/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolution_notes: resolutionNotes }),
    });
  }

  async escalatePothole(id: string, notes?: string) {
    return this.request<EscalateResponse>(`/api/potholes/${id}/escalate`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  }

  async notifyPothole(id: string, channel: string = "sms", message?: string) {
    return this.request<NotifyResponse>(`/api/potholes/${id}/notify`, {
      method: "POST",
      body: JSON.stringify({ channel, message }),
    });
  }

  // ---------------------------------------------------------------------------
  // Admin CRUD mutations
  // ---------------------------------------------------------------------------

  async updatePothole(id: string, data: PotholeUpdateRequest) {
    return this.request<Pothole>(`/api/potholes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async updateComplaint(id: string, data: ComplaintUpdateRequest) {
    return this.request<Record<string, unknown>>(`/api/complaints/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async createContractor(data: ContractorCreateRequest) {
    return this.request<Contractor>("/api/contractors", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateContractor(id: string, data: ContractorUpdateRequest) {
    return this.request<Contractor>(`/api/contractors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async updateHighway(id: string, data: HighwayUpdateRequest) {
    return this.request<Highway>(`/api/highways/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // ---------------------------------------------------------------------------
  // Admin DELETE actions
  // ---------------------------------------------------------------------------

  async deletePothole(id: string) {
    return this.request<{ deleted: boolean; id: string }>(`/api/potholes/${id}`, {
      method: "DELETE",
    });
  }

  async deleteComplaint(id: string) {
    return this.request<{ deleted: boolean; id: string }>(`/api/complaints/${id}`, {
      method: "DELETE",
    });
  }

  async deleteContractor(id: string) {
    return this.request<{ deleted: boolean; id: string }>(`/api/contractors/${id}`, {
      method: "DELETE",
    });
  }
}

export const api = new ApiClient(API_BASE);
