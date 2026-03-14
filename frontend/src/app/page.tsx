"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import type {
  DashboardStats,
  Pothole,
  TrafficAnomaly,
  WaterloggingZone,
  NewsMention,
  Contractor,
  EscalationSummary,
} from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  MapPin,
  Clock,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Newspaper,
  Droplets,
  Car,
  HardHat,
  ShieldAlert,
  Eye,
  Radio,
  Activity,
  RefreshCw,
  Download,
  ChevronDown,
  FileDown,
  Layers,
  FileText,
  Loader2,
} from "lucide-react";
import {
  jsPDF,
  autoTable,
  addReportHeader,
  addSectionTitle,
  addKeyValue,
  savePDF,
  getLastTableY,
  fmtDateShort,
  TABLE_HEAD_STYLE,
  TABLE_ALT_ROW_STYLE,
  TABLE_MARGIN,
  TABLE_BODY_STYLE,
} from "@/lib/pdf-export";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Line,
  LineChart,
  Cell,
  Pie,
  PieChart,
} from "recharts";

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

const severityColors: Record<string, string> = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

const severityBadgeVariants: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

const severityChartColors: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#16a34a",
};

const sourceChartColors: Record<string, string> = {
  cv_detection: "#1e293b",
  citizen_report: "#2563eb",
  dashcam: "#7c3aed",
  news: "#db2777",
  traffic_anomaly: "#0891b2",
  cleaning_vehicle: "#059669",
  satellite: "#ca8a04",
};

const complaintStatusColors: Record<string, string> = {
  filed: "#6b7280",
  acknowledged: "#3b82f6",
  in_progress: "#f59e0b",
  resolved: "#16a34a",
  escalated: "#dc2626",
};

const riskLevelColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  moderate: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

// ---------------------------------------------------------------------------
// PDF export — topic types & generators
// ---------------------------------------------------------------------------

type DashboardTopicKey =
  | "overview"
  | "severity"
  | "source"
  | "highway"
  | "monthly"
  | "traffic"
  | "waterlogging"
  | "contractors"
  | "news"
  | "detections"
  | "escalation";

const DASHBOARD_TOPIC_LABELS: Record<DashboardTopicKey, string> = {
  overview: "Overview Summary",
  severity: "Severity Breakdown",
  source: "Source Breakdown",
  highway: "Highway Analysis",
  monthly: "Monthly Trends",
  traffic: "Traffic Anomalies",
  waterlogging: "Waterlogging Zones",
  contractors: "Contractor Performance",
  news: "News & Media Mentions",
  detections: "Recent Detections",
  escalation: "Escalation Summary",
};

interface DashboardExportData {
  data: DashboardStats;
  traffic: TrafficAnomaly[];
  waterlogging: WaterloggingZone[];
  news: NewsMention[];
  contractors: Contractor[];
  escalation: EscalationSummary | null;
}

function exportDashboardEntirePDF(d: DashboardExportData) {
  const doc = new jsPDF({ orientation: "landscape" });
  let y = addReportHeader(doc, "Complete Dashboard Export", `Total potholes: ${d.data.total_potholes}`);

  // Overview stats
  y = addSectionTitle(doc, y, "Overview Statistics");
  y = addKeyValue(doc, y, "Total Potholes", String(d.data.total_potholes));
  y = addKeyValue(doc, y, "Active", String(d.data.active_potholes));
  y = addKeyValue(doc, y, "Resolved", String(d.data.resolved));
  y = addKeyValue(doc, y, "Complaints Filed", String(d.data.complaints_filed));
  y = addKeyValue(doc, y, "Avg Resolution", `${d.data.avg_resolution_days} days`);
  const rr = d.data.total_potholes > 0 ? ((d.data.resolved / d.data.total_potholes) * 100).toFixed(1) : "0";
  y = addKeyValue(doc, y, "Resolution Rate", `${rr}%`);
  y += 4;

  // Severity
  y = addSectionTitle(doc, y, "Severity Distribution");
  y = addKeyValue(doc, y, "Severity", Object.entries(d.data.severity_counts).map(([k, v]) => `${k}: ${v}`).join("  |  "));
  y += 2;

  // Source
  y = addKeyValue(doc, y, "Sources", Object.entries(d.data.source_breakdown).map(([k, v]) => `${k}: ${v}`).join("  |  "));
  y += 4;

  // Top Highways table
  y = addSectionTitle(doc, y, "Top Affected Highways");
  autoTable(doc, {
    startY: y,
    head: [["Highway", "Pothole Count"]],
    body: d.data.top_highways.slice(0, 15).map((h) => [h.highway, String(h.count)]),
    styles: TABLE_BODY_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: TABLE_MARGIN,
  });
  y = getLastTableY(doc) + 10;

  // Monthly Trend
  y = addSectionTitle(doc, y, "Monthly Detection Trend");
  autoTable(doc, {
    startY: y,
    head: [["Month", "Detections"]],
    body: d.data.monthly_trend.map((m) => [m.month, String(m.count)]),
    styles: TABLE_BODY_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: TABLE_MARGIN,
  });
  y = getLastTableY(doc) + 10;

  // Complaint statuses
  y = addSectionTitle(doc, y, "Complaint Statuses");
  y = addKeyValue(doc, y, "Statuses", Object.entries(d.data.complaint_statuses).map(([k, v]) => `${k}: ${v}`).join("  |  "));
  y += 4;

  // Traffic Anomalies
  if (d.traffic.length > 0) {
    y = addSectionTitle(doc, y, `Traffic Anomalies (${d.traffic.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Highway", "Location", "Type", "Severity", "Speed", "Expected", "Delay", "Cause", "Detected"]],
      body: d.traffic.map((a) => [
        a.highway_ref, a.location, a.anomaly_type, a.severity,
        a.avg_speed_kmph != null ? `${a.avg_speed_kmph} km/h` : "-",
        a.expected_speed_kmph != null ? `${a.expected_speed_kmph} km/h` : "-",
        a.delay_factor != null ? `${a.delay_factor}x` : "-",
        a.likely_cause || "-",
        fmtDateShort(a.detected_at),
      ]),
      styles: TABLE_BODY_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      margin: TABLE_MARGIN,
    });
    y = getLastTableY(doc) + 10;
  }

  // Waterlogging
  if (d.waterlogging.length > 0) {
    y = addSectionTitle(doc, y, `Waterlogging Zones (${d.waterlogging.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Highway", "Lat", "Lon", "Risk", "Radius", "Elevation", "Historical"]],
      body: d.waterlogging.map((z) => [
        z.associated_highway_ref || "-", z.latitude.toFixed(4), z.longitude.toFixed(4),
        z.risk_level, `${z.radius_m}m`, z.elevation_m != null ? `${z.elevation_m}m` : "-",
        String(z.historical_incidents),
      ]),
      styles: TABLE_BODY_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      margin: TABLE_MARGIN,
    });
    y = getLastTableY(doc) + 10;
  }

  // Contractors
  if (d.contractors.length > 0) {
    y = addSectionTitle(doc, y, `Contractors (${d.contractors.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Name", "Reg ID", "District", "Contracts", "Completed", "Avg Days", "Reputation", "Quality", "Flagged"]],
      body: d.contractors.map((c) => [
        c.name, c.registration_id, c.district || "-",
        String(c.total_contracts), String(c.completed_contracts),
        c.avg_repair_days?.toFixed(1) || "-",
        c.reputation_score.toFixed(1), c.road_quality_score.toFixed(1),
        c.flagged ? `Yes: ${c.flag_reason || ""}` : "No",
      ]),
      styles: TABLE_BODY_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      margin: TABLE_MARGIN,
    });
    y = getLastTableY(doc) + 10;
  }

  // News
  if (d.news.length > 0) {
    y = addSectionTitle(doc, y, `News & Media (${d.news.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Title", "Source", "Location", "Severity", "Sentiment", "Published"]],
      body: d.news.map((n) => [
        (n.title || "Untitled").slice(0, 60), n.source_name || n.source_type,
        n.extracted_location || "-", n.severity_keyword || "-",
        n.sentiment_score != null ? n.sentiment_score.toFixed(2) : "-",
        fmtDateShort(n.published_at),
      ]),
      styles: TABLE_BODY_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      margin: TABLE_MARGIN,
    });
    y = getLastTableY(doc) + 10;
  }

  // Escalation summary
  if (d.escalation?.escalation_breakdown) {
    y = addSectionTitle(doc, y, "Escalation Summary");
    y = addKeyValue(doc, y, "Total Complaints", String(d.escalation.total_complaints));
    for (const [level, info] of Object.entries(d.escalation.escalation_breakdown)) {
      y = addKeyValue(doc, y, info.label || level, `${info.count} complaints${info.threshold_days ? ` (>=${info.threshold_days}d)` : ""}`);
    }
    y += 4;
  }

  // Recent detections table
  if (d.data.recent_detections.length > 0) {
    doc.addPage();
    let ty = 20;
    ty = addSectionTitle(doc, ty, `Recent Detections (${d.data.recent_detections.length})`);
    autoTable(doc, {
      startY: ty,
      head: [["#", "Highway", "City", "Severity", "Source", "Status", "Lat", "Lon", "Detected"]],
      body: d.data.recent_detections.map((p, i) => [
        String(i + 1), p.highway_ref || "-", p.nearest_city || "-",
        p.severity, p.source, p.status,
        p.latitude?.toFixed(5) || "-", p.longitude?.toFixed(5) || "-",
        fmtDateShort(p.detected_at),
      ]),
      styles: TABLE_BODY_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      margin: TABLE_MARGIN,
    });
  }

  savePDF(doc, "dashboard-complete");
}

function exportDashboardTopicPDF(d: DashboardExportData, topic: DashboardTopicKey) {
  const doc = new jsPDF();
  const label = DASHBOARD_TOPIC_LABELS[topic];
  let y = addReportHeader(doc, `Topic Export \u2014 ${label}`, `Total potholes: ${d.data.total_potholes}`);

  switch (topic) {
    case "overview": {
      y = addSectionTitle(doc, y, "Overview Summary");
      y = addKeyValue(doc, y, "Total Potholes", String(d.data.total_potholes));
      y = addKeyValue(doc, y, "Active", String(d.data.active_potholes));
      y = addKeyValue(doc, y, "Resolved", String(d.data.resolved));
      y = addKeyValue(doc, y, "Complaints Filed", String(d.data.complaints_filed));
      y = addKeyValue(doc, y, "Avg Resolution", `${d.data.avg_resolution_days} days`);
      const rr = d.data.total_potholes > 0 ? ((d.data.resolved / d.data.total_potholes) * 100).toFixed(1) : "0";
      y = addKeyValue(doc, y, "Resolution Rate", `${rr}%`);
      const cr = d.data.total_potholes > 0 ? ((d.data.complaints_filed / d.data.total_potholes) * 100).toFixed(1) : "0";
      y = addKeyValue(doc, y, "Complaint Rate", `${cr}%`);
      y += 4;
      y = addKeyValue(doc, y, "Severity", Object.entries(d.data.severity_counts).map(([k, v]) => `${k}: ${v}`).join("  |  "));
      y = addKeyValue(doc, y, "Sources", Object.entries(d.data.source_breakdown).map(([k, v]) => `${k}: ${v}`).join("  |  "));
      y = addKeyValue(doc, y, "Complaints", Object.entries(d.data.complaint_statuses).map(([k, v]) => `${k}: ${v}`).join("  |  "));
      y = addKeyValue(doc, y, "Traffic Anomalies", String(d.traffic.length));
      y = addKeyValue(doc, y, "Waterlogging Zones", String(d.waterlogging.length));
      y = addKeyValue(doc, y, "News Mentions", String(d.news.length));
      break;
    }
    case "severity": {
      y = addSectionTitle(doc, y, "Severity Distribution");
      const total = Object.values(d.data.severity_counts).reduce((a, b) => a + b, 0);
      for (const [sev, count] of Object.entries(d.data.severity_counts)) {
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
        y = addKeyValue(doc, y, sev.toUpperCase(), `${count} (${pct}%)`);
      }
      break;
    }
    case "source": {
      y = addSectionTitle(doc, y, "Source Breakdown");
      const total = Object.values(d.data.source_breakdown).reduce((a, b) => a + b, 0);
      autoTable(doc, {
        startY: y,
        head: [["Source", "Count", "Percentage"]],
        body: Object.entries(d.data.source_breakdown).map(([k, v]) => [
          k, String(v), total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%",
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }
    case "highway": {
      y = addSectionTitle(doc, y, "Top Affected Highways");
      autoTable(doc, {
        startY: y,
        head: [["#", "Highway", "Pothole Count"]],
        body: d.data.top_highways.map((h, i) => [String(i + 1), h.highway, String(h.count)]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }
    case "monthly": {
      y = addSectionTitle(doc, y, "Monthly Detection Trend");
      autoTable(doc, {
        startY: y,
        head: [["Month", "Detections"]],
        body: d.data.monthly_trend.map((m) => [m.month, String(m.count)]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }
    case "traffic": {
      y = addSectionTitle(doc, y, `Traffic Anomalies (${d.traffic.length})`);
      if (d.traffic.length === 0) {
        y = addKeyValue(doc, y, "Status", "No traffic anomalies recorded");
      } else {
        autoTable(doc, {
          startY: y,
          head: [["Highway", "Location", "Type", "Severity", "Speed", "Expected", "Delay", "Cause", "Detected"]],
          body: d.traffic.map((a) => [
            a.highway_ref, a.location, a.anomaly_type, a.severity,
            a.avg_speed_kmph != null ? `${a.avg_speed_kmph} km/h` : "-",
            a.expected_speed_kmph != null ? `${a.expected_speed_kmph} km/h` : "-",
            a.delay_factor != null ? `${a.delay_factor}x` : "-",
            a.likely_cause || "-", fmtDateShort(a.detected_at),
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: TABLE_HEAD_STYLE,
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
      }
      break;
    }
    case "waterlogging": {
      y = addSectionTitle(doc, y, `Waterlogging Zones (${d.waterlogging.length})`);
      if (d.waterlogging.length === 0) {
        y = addKeyValue(doc, y, "Status", "No waterlogging zones recorded");
      } else {
        autoTable(doc, {
          startY: y,
          head: [["Highway", "Latitude", "Longitude", "Risk Level", "Radius", "Elevation", "Historical Incidents"]],
          body: d.waterlogging.map((z) => [
            z.associated_highway_ref || "-", z.latitude.toFixed(4), z.longitude.toFixed(4),
            z.risk_level, `${z.radius_m}m`, z.elevation_m != null ? `${z.elevation_m}m` : "-",
            String(z.historical_incidents),
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: TABLE_HEAD_STYLE,
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
      }
      break;
    }
    case "contractors": {
      y = addSectionTitle(doc, y, `Contractor Performance (${d.contractors.length})`);
      if (d.contractors.length === 0) {
        y = addKeyValue(doc, y, "Status", "No contractor data available");
      } else {
        autoTable(doc, {
          startY: y,
          head: [["Name", "Reg ID", "District", "Contracts", "Completed", "Avg Days", "Reputation", "Quality", "Flagged"]],
          body: d.contractors.map((c) => [
            c.name, c.registration_id, c.district || "-",
            String(c.total_contracts), String(c.completed_contracts),
            c.avg_repair_days?.toFixed(1) || "-",
            c.reputation_score.toFixed(1), c.road_quality_score.toFixed(1),
            c.flagged ? `Yes: ${c.flag_reason || ""}` : "No",
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: TABLE_HEAD_STYLE,
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
      }
      break;
    }
    case "news": {
      y = addSectionTitle(doc, y, `News & Media Mentions (${d.news.length})`);
      if (d.news.length === 0) {
        y = addKeyValue(doc, y, "Status", "No news mentions available");
      } else {
        autoTable(doc, {
          startY: y,
          head: [["Title", "Source", "Location", "Severity", "Sentiment", "Published"]],
          body: d.news.map((n) => [
            (n.title || "Untitled").slice(0, 60), n.source_name || n.source_type,
            n.extracted_location || "-", n.severity_keyword || "-",
            n.sentiment_score != null ? n.sentiment_score.toFixed(2) : "-",
            fmtDateShort(n.published_at),
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: TABLE_HEAD_STYLE,
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
      }
      break;
    }
    case "detections": {
      y = addSectionTitle(doc, y, `Recent Detections (${d.data.recent_detections.length})`);
      if (d.data.recent_detections.length === 0) {
        y = addKeyValue(doc, y, "Status", "No recent detections");
      } else {
        autoTable(doc, {
          startY: y,
          head: [["#", "Highway", "City", "Severity", "Source", "Status", "Lat", "Lon", "Detected"]],
          body: d.data.recent_detections.map((p, i) => [
            String(i + 1), p.highway_ref || "-", p.nearest_city || "-",
            p.severity, p.source, p.status,
            p.latitude?.toFixed(5) || "-", p.longitude?.toFixed(5) || "-",
            fmtDateShort(p.detected_at),
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: TABLE_HEAD_STYLE,
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
      }
      break;
    }
    case "escalation": {
      y = addSectionTitle(doc, y, "Escalation Summary");
      if (d.escalation?.escalation_breakdown) {
        y = addKeyValue(doc, y, "Total Complaints", String(d.escalation.total_complaints));
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [["Level", "Label", "Count", "Threshold (days)"]],
          body: Object.entries(d.escalation.escalation_breakdown).map(([level, info]) => [
            level, info.label || level, String(info.count),
            info.threshold_days != null ? `${info.threshold_days}` : "-",
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: TABLE_HEAD_STYLE,
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
      } else {
        y = addKeyValue(doc, y, "Status", "No escalation data available");
      }
      break;
    }
  }

  savePDF(doc, `dashboard-${topic}`);
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [traffic, setTraffic] = useState<TrafficAnomaly[]>([]);
  const [waterlogging, setWaterlogging] = useState<WaterloggingZone[]>([]);
  const [news, setNews] = useState<NewsMention[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [escalation, setEscalation] = useState<EscalationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Export menu state
  const [exportOpen, setExportOpen] = useState(false);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [stats, trafficData, waterData, newsData, contractorData, escData] =
        await Promise.all([
          api.getDashboardStats(),
          api.getTrafficAnomalies(),
          api.getWaterloggingZones(),
          api.getNewsMentions(),
          api.getContractors(),
          api.getEscalationSummary(),
        ]);
      setData(stats);
      setTraffic(trafficData);
      setWaterlogging(waterData);
      setNews(newsData);
      setContractors(contractorData);
      setEscalation(escData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => fetchAll(), 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
        setTopicMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getExportData = (): DashboardExportData | null => {
    if (!data) return null;
    return { data, traffic, waterlogging, news, contractors, escalation };
  };

  const handleExportAll = () => {
    const d = getExportData();
    if (!d) return;
    setExportLoading(true);
    setExportOpen(false);
    setTimeout(() => {
      exportDashboardEntirePDF(d);
      setExportLoading(false);
    }, 100);
  };

  const handleExportTopic = (topic: DashboardTopicKey) => {
    const d = getExportData();
    if (!d) return;
    setExportLoading(true);
    setExportOpen(false);
    setTopicMenuOpen(false);
    setTimeout(() => {
      exportDashboardTopicPDF(d, topic);
      setExportLoading(false);
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">{t.common.loading}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">{t.dashboard.noData}</div>
      </div>
    );
  }

  // Derived data
  const resolutionRate =
    data.total_potholes > 0
      ? ((data.resolved / data.total_potholes) * 100).toFixed(1)
      : "0";

  const complaintRate =
    data.total_potholes > 0
      ? ((data.complaints_filed / data.total_potholes) * 100).toFixed(1)
      : "0";

  const severityPieData = Object.entries(data.severity_counts).map(([key, value]) => ({
    name: t.severity[key as keyof typeof t.severity] || key,
    value,
    key,
  }));

  const sourceBarData = Object.entries(data.source_breakdown).map(([key, value]) => ({
    name: t.source[key as keyof typeof t.source] || key,
    count: value,
    key,
  }));

  const complaintPieData = Object.entries(data.complaint_statuses).map(
    ([key, value]) => ({
      name: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value,
      key,
    })
  );

  const totalComplaints = Object.values(data.complaint_statuses).reduce(
    (a, b) => a + b,
    0
  );

  // Chart configs
  const trendConfig: ChartConfig = {
    count: { label: t.dashboard.detections, color: "#1e293b" },
  };

  const severityConfig: ChartConfig = Object.fromEntries(
    Object.entries(severityChartColors).map(([key, color]) => [
      key,
      { label: t.severity[key as keyof typeof t.severity] || key, color },
    ])
  );

  const sourceConfig: ChartConfig = Object.fromEntries(
    Object.entries(sourceChartColors).map(([key, color]) => [
      key,
      { label: t.source[key as keyof typeof t.source] || key, color },
    ])
  );

  const highwayConfig: ChartConfig = {
    count: { label: t.dashboard.potholes, color: "#dc2626" },
  };

  // Stat cards
  const statCards = [
    {
      label: t.dashboard.totalPotholes,
      value: data.total_potholes,
      icon: MapPin,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: t.dashboard.activePotholes,
      value: data.active_potholes,
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      label: t.dashboard.complaintsField,
      value: data.complaints_filed,
      icon: FileWarning,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      label: t.dashboard.resolved,
      value: data.resolved,
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      label: t.dashboard.avgResolutionDays,
      value: `${data.avg_resolution_days} ${t.dashboard.days}`,
      icon: Clock,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: t.dashboard.resolutionRate,
      value: `${resolutionRate}%`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
    },
    {
      label: t.dashboard.complaintRate,
      value: `${complaintRate}%`,
      icon: BarChart3,
      color: "text-violet-600",
      bgColor: "bg-violet-50",
    },
    {
      label: t.dashboard.trafficAnomalies,
      value: traffic.length,
      icon: Car,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
    },
    {
      label: t.dashboard.waterloggingZones,
      value: waterlogging.length,
      icon: Droplets,
      color: "text-sky-600",
      bgColor: "bg-sky-50",
    },
    {
      label: t.dashboard.newsMentions,
      value: news.length,
      icon: Newspaper,
      color: "text-pink-600",
      bgColor: "bg-pink-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{t.dashboard.title}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t.dashboard.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {/* Export PDF dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => { setExportOpen((o) => !o); setTopicMenuOpen(false); }}
              disabled={!data || exportLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-background border shadow-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export PDF
              <ChevronDown className="w-3 h-3" />
            </button>

            {exportOpen && (
              <div className="absolute top-full right-0 mt-1 w-56 rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg overflow-hidden z-50">
                <button
                  onClick={handleExportAll}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs hover:bg-muted transition-colors text-left"
                >
                  <FileDown className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-medium">Export Entire Data</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Full dashboard with all sections
                    </p>
                  </div>
                </button>
                <div className="border-t" />
                <button
                  onClick={() => setTopicMenuOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-xs hover:bg-muted transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <p className="font-medium">Export by Topic</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Choose a specific section
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${topicMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {topicMenuOpen && (
                  <div className="border-t bg-muted/30 max-h-64 overflow-y-auto">
                    {(Object.keys(DASHBOARD_TOPIC_LABELS) as DashboardTopicKey[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => handleExportTopic(key)}
                        className="w-full flex items-center gap-3 px-6 py-2.5 text-xs hover:bg-muted transition-colors text-left"
                      >
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{DASHBOARD_TOPIC_LABELS[key]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAll(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {t.common.refresh}
          </Button>
        </div>
      </div>

      {/* ────────────────────────── Stat Cards ────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((stat, i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                   <p className="text-lg sm:text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ──────────────── Monthly Trend (Area) + Severity (Pie) ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Detection Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                {t.dashboard.detectionTrend}
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {t.dashboard.last6Months}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="h-[220px] w-full">
              <LineChart data={data.monthly_trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#1e293b"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Severity Pie Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t.dashboard.severityDistribution}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ChartContainer config={severityConfig} className="h-[180px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={severityPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  strokeWidth={2}
                >
                  {severityPieData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={severityChartColors[entry.key] || "#999"}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {severityPieData.map((entry) => (
                <div key={entry.key} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: severityChartColors[entry.key] }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {entry.name} ({entry.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ────────── Source Breakdown (Bar) + Complaint Statuses (Pie) ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              {t.dashboard.sourceBreakdown}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={sourceConfig} className="h-[220px] w-full">
              <BarChart
                data={sourceBarData}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  width={90}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {sourceBarData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={sourceChartColors[entry.key] || "#64748b"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Complaint Statuses */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              {t.dashboard.complaintStatus}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <ChartContainer
                config={{}}
                className="h-[180px] w-[180px] shrink-0"
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={complaintPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    strokeWidth={2}
                  >
                    {complaintPieData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={complaintStatusColors[entry.key] || "#94a3b8"}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="flex-1 space-y-2">
                {complaintPieData.map((entry) => {
                  const pct =
                    totalComplaints > 0
                      ? ((entry.value / totalComplaints) * 100).toFixed(0)
                      : 0;
                  return (
                    <div key={entry.key} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            complaintStatusColors[entry.key] || "#94a3b8",
                        }}
                      />
                      <span className="text-xs flex-1">{entry.name}</span>
                      <span className="text-xs font-medium tabular-nums">
                        {entry.value}
                      </span>
                      <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ────────────── Top Highways (Bar) + Escalation Summary ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Affected Highways */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {t.dashboard.topAffectedHighways}
              </CardTitle>
              <Link
                href="/map"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {t.dashboard.viewAll} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={highwayConfig} className="h-[250px] w-full">
              <BarChart
                data={data.top_highways.slice(0, 10)}
                margin={{ top: 0, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="highway" tickLine={false} axisLine={false} fontSize={10} angle={-30} textAnchor="end" height={50} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.top_highways.slice(0, 10).map((hw, i) => (
                    <Cell
                      key={i}
                      fill={hw.highway.startsWith("NH") ? "#dc2626" : "#2563eb"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Escalation Summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Radio className="w-4 h-4 text-muted-foreground" />
                {t.dashboard.escalationSummary}
              </CardTitle>
              <Link
                href="/loop-closure"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {t.dashboard.viewAll} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {escalation && escalation.escalation_breakdown ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-muted">
                  <span className="text-xs text-muted-foreground">
                    {t.dashboard.totalComplaints}
                  </span>
                  <span className="text-lg font-bold">{escalation.total_complaints}</span>
                </div>
                {Object.entries(escalation.escalation_breakdown).map(
                  ([level, info]) => (
                    <div
                      key={level}
                      className="flex items-center justify-between py-1.5 border-b border-muted last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        <span className="text-sm">
                          {info.label || level.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {info.count} {t.dashboard.complaints}
                        </Badge>
                        {info.threshold_days != null && info.threshold_days > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            &ge;{info.threshold_days}d
                          </span>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                {t.dashboard.noEscalationData}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ────────────────── Severity Distribution (Detailed) ────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {t.dashboard.severityDetailed}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {Object.entries(data.severity_counts).map(([sev, count]) => {
              const total = Object.values(data.severity_counts).reduce(
                (a, b) => a + b,
                0
              );
              const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
              const sevLabel =
                t.severity[sev as keyof typeof t.severity] || sev;
              return (
                <div
                  key={sev}
                  className="flex items-center gap-3 p-3 rounded-lg border border-muted"
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${severityColors[sev]}`}
                  >
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{sevLabel}</p>
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-[10px] text-muted-foreground">{pct}% {t.dashboard.pctOfTotal}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─────────────── Traffic Anomalies Table ─────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Car className="w-4 h-4 text-muted-foreground" />
              {t.dashboard.trafficAnomalies}
            </CardTitle>
            <Link
              href="/sources"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {t.dashboard.viewAll} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {traffic.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.dashboard.highway}</TableHead>
                  <TableHead>{t.dashboard.location}</TableHead>
                  <TableHead>{t.dashboard.type}</TableHead>
                  <TableHead>{t.dashboard.severity}</TableHead>
                  <TableHead>{t.dashboard.speed}</TableHead>
                  <TableHead>{t.dashboard.expected}</TableHead>
                  <TableHead>{t.dashboard.delay}</TableHead>
                  <TableHead>{t.dashboard.likelyCause}</TableHead>
                  <TableHead>{t.dashboard.detected}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traffic.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.highway_ref}</TableCell>
                    <TableCell className="text-xs">{a.location}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {a.anomaly_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-[10px] ${severityBadgeVariants[a.severity] || ""}`}
                      >
                        {t.severity[a.severity as keyof typeof t.severity] || a.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {a.avg_speed_kmph != null ? `${a.avg_speed_kmph} ${t.dashboard.kmh}` : "-"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {a.expected_speed_kmph != null ? `${a.expected_speed_kmph} ${t.dashboard.kmh}` : "-"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {a.delay_factor != null ? `${a.delay_factor}x` : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{a.likely_cause || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.detected_at
                        ? new Date(a.detected_at).toLocaleDateString("en-IN")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t.dashboard.noTrafficAnomalies}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─────────────── Waterlogging Zones Table ─────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Droplets className="w-4 h-4 text-muted-foreground" />
              {t.dashboard.waterloggingZones}
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {waterlogging.length} {t.dashboard.zones}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {waterlogging.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.dashboard.highway}</TableHead>
                  <TableHead>{t.dashboard.locationLatLon}</TableHead>
                  <TableHead>{t.dashboard.riskLevel}</TableHead>
                  <TableHead>{t.dashboard.radius}</TableHead>
                  <TableHead>{t.dashboard.elevation}</TableHead>
                  <TableHead>{t.dashboard.historicalIncidents}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waterlogging.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell className="font-medium">
                      {z.associated_highway_ref || "-"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {z.latitude.toFixed(4)}, {z.longitude.toFixed(4)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-[10px] ${riskLevelColors[z.risk_level] || ""}`}
                      >
                        {z.risk_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {z.radius_m}m
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {z.elevation_m != null ? `${z.elevation_m}m` : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-center tabular-nums">
                      {z.historical_incidents}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t.dashboard.noWaterloggingZones}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ──────────── Contractors + News Mentions (side by side) ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contractors */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <HardHat className="w-4 h-4 text-muted-foreground" />
                {t.dashboard.contractorPerformance}
              </CardTitle>
              <Link
                href="/contractors"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {t.dashboard.viewAll} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {contractors.length > 0 ? (
              <div className="space-y-2">
                {contractors.slice(0, 8).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 border-b border-muted last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {c.flagged && (
                          <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">
                            {t.dashboard.flagged}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {c.district || t.dashboard.unknown} &middot; {c.registration_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-medium tabular-nums">
                          {c.completed_contracts}/{c.total_contracts}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t.dashboard.completed}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium tabular-nums">
                          {c.reputation_score.toFixed(1)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t.dashboard.reputation}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium tabular-nums">
                          {c.road_quality_score.toFixed(1)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t.dashboard.quality}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
              {t.dashboard.noContractorData}
              </p>
            )}
          </CardContent>
        </Card>

        {/* News Mentions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-muted-foreground" />
                {t.dashboard.newsMediaMentions}
              </CardTitle>
              <Link
                href="/sources"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {t.dashboard.viewAll} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {news.length > 0 ? (
              <div className="space-y-2">
                {news.slice(0, 8).map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 py-2 border-b border-muted last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {n.title || t.dashboard.untitledMention}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {n.content_snippet || ""}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {n.source_name || n.source_type}
                        </Badge>
                        {n.extracted_location && (
                          <span className="text-[10px] text-muted-foreground">
                            {n.extracted_location}
                          </span>
                        )}
                        {n.severity_keyword && (
                          <Badge
                            className={`text-[10px] ${severityBadgeVariants[n.severity_keyword] || "bg-gray-100 text-gray-700 border-gray-200"}`}
                          >
                            {n.severity_keyword}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {n.sentiment_score != null && (
                        <p className="text-xs tabular-nums">
                          {n.sentiment_score > 0 ? "+" : ""}
                          {n.sentiment_score.toFixed(2)}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {n.published_at
                          ? new Date(n.published_at).toLocaleDateString("en-IN")
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
              {t.dashboard.noNewsMentions}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ────────────── Recent Detections (Full Table) ────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              {t.dashboard.recentDetections}
            </CardTitle>
            <Link
              href="/reports"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {t.dashboard.viewAll} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.dashboard.highway}</TableHead>
                <TableHead>{t.dashboard.city}</TableHead>
                <TableHead>{t.dashboard.severity}</TableHead>
                <TableHead>{t.dashboard.source}</TableHead>
                <TableHead>{t.dashboard.status}</TableHead>
                <TableHead>{t.dashboard.locationLatLon}</TableHead>
                <TableHead>{t.dashboard.detected}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_detections.map((det: Pothole, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">
                    {det.highway_ref || "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {det.nearest_city || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] ${severityBadgeVariants[det.severity] || ""}`}
                    >
                      {t.severity[det.severity as keyof typeof t.severity] ||
                        det.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {t.source[det.source as keyof typeof t.source] ||
                        det.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {t.status[det.status as keyof typeof t.status] ||
                        det.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${det.latitude},${det.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      title={t.common.viewOnGoogleMaps}
                    >
                      {det.latitude?.toFixed(4)}, {det.longitude?.toFixed(4)}
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                    </a>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {det.detected_at
                      ? new Date(det.detected_at).toLocaleDateString("en-IN")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
