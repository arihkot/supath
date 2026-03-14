"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  ChevronDown,
  FileDown,
  Layers,
  FileText,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import type { DashboardStats } from "@/lib/types";
import {
  jsPDF,
  autoTable,
  addReportHeader,
  addSectionTitle,
  addKeyValue,
  savePDF,
  getLastTableY,
  TABLE_HEAD_STYLE,
  TABLE_ALT_ROW_STYLE,
  TABLE_MARGIN,
  TABLE_BODY_STYLE,
} from "@/lib/pdf-export";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#22c55e",
};

const SOURCE_COLORS = [
  "#1e40af",
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#dc2626",
  "#6366f1",
];

type DashboardData = DashboardStats;

// ---------------------------------------------------------------------------
// PDF Export – Analytics
// ---------------------------------------------------------------------------

type AnalyticsTopicKey = "kpi" | "severity" | "source" | "highway" | "monthly";

const ANALYTICS_TOPIC_LABELS: Record<AnalyticsTopicKey, string> = {
  kpi: "KPI Summary",
  severity: "Severity Breakdown",
  source: "Source Breakdown",
  highway: "Top Highways",
  monthly: "Monthly Trend",
};

function exportAnalyticsEntirePDF(data: DashboardStats) {
  const doc = new jsPDF();
  const totalPotholes = data.total_potholes || 1;
  let y = addReportHeader(doc, "Analytics Report", `Total potholes: ${data.total_potholes}`);

  // KPI Summary
  y = addSectionTitle(doc, y, "KPI Summary");
  const detectionRate = ((data.active_potholes / totalPotholes) * 100).toFixed(1);
  const resolutionRate = ((data.resolved / totalPotholes) * 100).toFixed(1);
  const riskScore = data.severity_counts?.critical
    ? (((data.severity_counts.critical + (data.severity_counts.high || 0)) / totalPotholes) * 100).toFixed(0)
    : "0";
  y = addKeyValue(doc, y, "Detection Rate", `${detectionRate}%`);
  y = addKeyValue(doc, y, "Resolution Rate", `${resolutionRate}%`);
  y = addKeyValue(doc, y, "Avg Repair Days", `${data.avg_resolution_days} days`);
  y = addKeyValue(doc, y, "Risk Score", `${riskScore}%`);
  y += 4;

  // Severity table
  y = addSectionTitle(doc, y, "Severity Distribution");
  const sevTotal = Object.values(data.severity_counts || {}).reduce((a, b) => a + b, 0);
  autoTable(doc, {
    startY: y,
    head: [["Severity", "Count", "Percentage"]],
    body: Object.entries(data.severity_counts || {}).map(([k, v]) => [
      k.charAt(0).toUpperCase() + k.slice(1),
      String(v),
      sevTotal > 0 ? `${((v / sevTotal) * 100).toFixed(1)}%` : "0%",
    ]),
    styles: TABLE_BODY_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: TABLE_MARGIN,
  });
  y = getLastTableY(doc) + 10;

  // Source breakdown table
  y = addSectionTitle(doc, y, "Source Breakdown");
  const srcTotal = Object.values(data.source_breakdown || {}).reduce((a, b) => a + b, 0);
  autoTable(doc, {
    startY: y,
    head: [["Source", "Count", "Percentage"]],
    body: Object.entries(data.source_breakdown || {}).map(([k, v]) => [
      k,
      String(v),
      srcTotal > 0 ? `${((v / srcTotal) * 100).toFixed(1)}%` : "0%",
    ]),
    styles: TABLE_BODY_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: TABLE_MARGIN,
  });
  y = getLastTableY(doc) + 10;

  // Top highways table
  y = addSectionTitle(doc, y, "Top Affected Highways");
  autoTable(doc, {
    startY: y,
    head: [["#", "Highway", "Count"]],
    body: (data.top_highways || []).map((h, i) => [String(i + 1), h.highway, String(h.count)]),
    styles: TABLE_BODY_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: TABLE_MARGIN,
  });
  y = getLastTableY(doc) + 10;

  // Monthly trend table
  y = addSectionTitle(doc, y, "Monthly Detection Trend");
  autoTable(doc, {
    startY: y,
    head: [["Month", "Detections"]],
    body: (data.monthly_trend || []).map((m) => [m.month, String(m.count)]),
    styles: TABLE_BODY_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: TABLE_MARGIN,
  });

  savePDF(doc, "analytics-complete");
}

function exportAnalyticsTopicPDF(data: DashboardStats, topic: AnalyticsTopicKey) {
  const doc = new jsPDF();
  const label = ANALYTICS_TOPIC_LABELS[topic];
  const totalPotholes = data.total_potholes || 1;
  let y = addReportHeader(doc, `Topic Export \u2014 ${label}`, `Total potholes: ${data.total_potholes}`);

  switch (topic) {
    case "kpi": {
      y = addSectionTitle(doc, y, "KPI Summary");
      const detectionRate = ((data.active_potholes / totalPotholes) * 100).toFixed(1);
      const resolutionRate = ((data.resolved / totalPotholes) * 100).toFixed(1);
      const riskScore = data.severity_counts?.critical
        ? (((data.severity_counts.critical + (data.severity_counts.high || 0)) / totalPotholes) * 100).toFixed(0)
        : "0";
      y = addKeyValue(doc, y, "Detection Rate", `${detectionRate}%`);
      y = addKeyValue(doc, y, "Resolution Rate", `${resolutionRate}%`);
      y = addKeyValue(doc, y, "Avg Repair Time", `${data.avg_resolution_days} days`);
      y = addKeyValue(doc, y, "Risk Score", `${riskScore}%`);
      y += 4;
      y = addKeyValue(doc, y, "Total Potholes", String(data.total_potholes));
      y = addKeyValue(doc, y, "Active Potholes", String(data.active_potholes));
      y = addKeyValue(doc, y, "Resolved", String(data.resolved));
      break;
    }
    case "severity": {
      y = addSectionTitle(doc, y, "Severity Breakdown");
      const total = Object.values(data.severity_counts || {}).reduce((a, b) => a + b, 0);
      autoTable(doc, {
        startY: y,
        head: [["Severity", "Count", "Percentage"]],
        body: Object.entries(data.severity_counts || {}).map(([k, v]) => [
          k.charAt(0).toUpperCase() + k.slice(1),
          String(v),
          total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%",
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      y = getLastTableY(doc) + 10;
      for (const [sev, count] of Object.entries(data.severity_counts || {})) {
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
        y = addKeyValue(doc, y, sev.toUpperCase(), `${count} (${pct}%)`);
      }
      break;
    }
    case "source": {
      y = addSectionTitle(doc, y, "Source Breakdown");
      const total = Object.values(data.source_breakdown || {}).reduce((a, b) => a + b, 0);
      autoTable(doc, {
        startY: y,
        head: [["Source", "Count", "Percentage"]],
        body: Object.entries(data.source_breakdown || {}).map(([k, v]) => [
          k,
          String(v),
          total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%",
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
        head: [["#", "Highway", "Count"]],
        body: (data.top_highways || []).map((h, i) => [String(i + 1), h.highway, String(h.count)]),
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
        body: (data.monthly_trend || []).map((m) => [m.month, String(m.count)]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }
  }

  savePDF(doc, `analytics-${topic}`);
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getDashboardStats()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

  const handleExportAll = () => {
    if (!data) return;
    setExportLoading(true);
    setExportOpen(false);
    setTimeout(() => {
      exportAnalyticsEntirePDF(data);
      setExportLoading(false);
    }, 100);
  };

  const handleExportTopic = (topic: AnalyticsTopicKey) => {
    if (!data) return;
    setExportLoading(true);
    setExportOpen(false);
    setTopicMenuOpen(false);
    setTimeout(() => {
      exportAnalyticsTopicPDF(data, topic);
      setExportLoading(false);
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">{t.dashboard.noData}</p>
      </div>
    );
  }

  const totalPotholes = data.total_potholes || 1;
  const detectionRate = ((data.active_potholes / totalPotholes) * 100).toFixed(1);
  const resolutionRate = ((data.resolved / totalPotholes) * 100).toFixed(1);

  // Prepare chart data
  const severityData = Object.entries(data.severity_counts || {}).map(([key, value]) => ({
    name: t.severity[key as keyof typeof t.severity] || key,
    value,
    key,
  }));

  const sourceData = Object.entries(data.source_breakdown || {}).map(([key, value]) => ({
    name: t.source[key as keyof typeof t.source] || key,
    value,
  }));

  const highwayData = (data.top_highways || []).slice(0, 10).map((h) => ({
    name: h.highway,
    count: h.count,
  }));

  const monthlyData = (data.monthly_trend || []).map((m) => ({
    name: m.month,
    detections: m.count,
  }));

  const statCards = [
    {
      label: t.analytics.detectionRate,
      value: `${detectionRate}%`,
      icon: TrendingUp,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: t.analytics.resolutionRate,
      value: `${resolutionRate}%`,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: t.analytics.avgRepairTime,
      value: `${data.avg_resolution_days} ${t.dashboard.days}`,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: t.analytics.riskScore,
      value: data.severity_counts?.critical
        ? `${(((data.severity_counts.critical + (data.severity_counts.high || 0)) / totalPotholes) * 100).toFixed(0)}%`
        : "0%",
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{t.analytics.title}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t.analytics.subtitle}
          </p>
        </div>
        <div className="relative self-start shrink-0" ref={exportRef}>
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
                    Full analytics with all sections
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
                  {(Object.keys(ANALYTICS_TOPIC_LABELS) as AnalyticsTopicKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => handleExportTopic(key)}
                      className="w-full flex items-center gap-3 px-6 py-2.5 text-xs hover:bg-muted transition-colors text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{ANALYTICS_TOPIC_LABELS[key]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((stat, i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                   <p className="text-lg sm:text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly Trend + Severity Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t.analytics.monthlyTrend}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="detections"
                    stroke="#1e40af"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Severity Breakdown Pie */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t.analytics.severityBreakdown}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {severityData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={SEVERITY_COLORS[entry.key] || "#94a3b8"}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {severityData.map((entry) => (
                <div key={entry.key} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLORS[entry.key] }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {entry.name} ({entry.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source Breakdown + Highway Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t.analytics.sourceBreakdown}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {sourceData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={SOURCE_COLORS[i % SOURCE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Highway Comparison */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t.analytics.highwayComparison}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={highwayData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={60}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1e40af" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
