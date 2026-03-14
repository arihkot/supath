"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api";
import { type Pothole, type Contractor } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  FileDown,
  Filter,
  Layers,
  FileText,
  Loader2,
  MapPin,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  jsPDF,
  autoTable,
  addReportHeader,
  addSectionTitle,
  addKeyValue,
  savePDF,
  getLastTableY,
  fmtDate,
  TABLE_HEAD_STYLE,
  TABLE_ALT_ROW_STYLE,
  TABLE_MARGIN,
  TABLE_BODY_STYLE,
  TABLE_COMPACT_STYLE,
} from "@/lib/pdf-export";

const severityBadgeVariants: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

const statusBadgeVariants: Record<string, string> = {
  detected: "bg-blue-100 text-blue-700 border-blue-200",
  filed: "bg-amber-100 text-amber-700 border-amber-200",
  acknowledged: "bg-purple-100 text-purple-700 border-purple-200",
  in_progress: "bg-cyan-100 text-cyan-700 border-cyan-200",
  resolved: "bg-green-100 text-green-700 border-green-200",
  escalated: "bg-red-100 text-red-700 border-red-200",
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// PDF generation helpers
// ---------------------------------------------------------------------------

type ReportsTopicKey =
  | "overview"
  | "severity"
  | "location"
  | "detection"
  | "status";

const REPORTS_TOPIC_LABELS: Record<ReportsTopicKey, string> = {
  overview: "Overview Summary",
  severity: "Severity Analysis",
  location: "Location Details",
  detection: "Detection & Source",
  status: "Status Breakdown",
};

function exportReportsEntirePDF(potholes: Pothole[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  let y = addReportHeader(
    doc,
    "Reports — Complete Data Export",
    `Total records: ${potholes.length}`
  );

  // Summary stats
  y = addSectionTitle(doc, y, "Summary Statistics");
  const total = potholes.length;
  const sevCounts: Record<string, number> = {};
  const srcCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  potholes.forEach((p) => {
    sevCounts[p.severity] = (sevCounts[p.severity] || 0) + 1;
    srcCounts[p.source] = (srcCounts[p.source] || 0) + 1;
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  });

  y = addKeyValue(doc, y, "Total Potholes", String(total));
  y = addKeyValue(
    doc,
    y,
    "Severity",
    Object.entries(sevCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  |  ")
  );
  y = addKeyValue(
    doc,
    y,
    "Sources",
    Object.entries(srcCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  |  ")
  );
  y = addKeyValue(
    doc,
    y,
    "Statuses",
    Object.entries(statusCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  |  ")
  );
  y += 4;

  // Full data table
  y = addSectionTitle(doc, y, "Complete Pothole Records");
  autoTable(doc, {
    startY: y,
    head: [
      [
        "#",
        "ID",
        "Highway",
        "City",
        "District",
        "Severity",
        "Source",
        "Status",
        "Lat",
        "Lon",
        "Detected At",
      ],
    ],
    body: potholes.map((p, i) => [
      String(i + 1),
      p.id.slice(0, 8),
      p.highway_ref || "N/A",
      p.nearest_city || "N/A",
      p.district || "N/A",
      p.severity,
      p.source,
      p.status,
      p.latitude.toFixed(6),
      p.longitude.toFixed(6),
      fmtDate(p.detected_at),
    ]),
    styles: TABLE_COMPACT_STYLE,
    headStyles: {
      ...TABLE_HEAD_STYLE,
      fontSize: 6.5,
    },
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: { left: 6, right: 6 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 16 },
    },
  });

  savePDF(doc, "reports-complete");
}

function exportReportsTopicPDF(potholes: Pothole[], topic: ReportsTopicKey) {
  const doc = new jsPDF();
  const label = REPORTS_TOPIC_LABELS[topic];
  let y = addReportHeader(doc, `Reports — ${label}`, `Records: ${potholes.length}`);

  switch (topic) {
    case "overview": {
      y = addSectionTitle(doc, y, "Overview Summary");
      const total = potholes.length;
      const resolved = potholes.filter((p) => p.is_resolved).length;
      const active = total - resolved;
      const sevCounts: Record<string, number> = {};
      const srcCounts: Record<string, number> = {};
      const statusCounts: Record<string, number> = {};
      potholes.forEach((p) => {
        sevCounts[p.severity] = (sevCounts[p.severity] || 0) + 1;
        srcCounts[p.source] = (srcCounts[p.source] || 0) + 1;
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      });
      y = addKeyValue(doc, y, "Total Potholes", String(total));
      y = addKeyValue(doc, y, "Active", String(active));
      y = addKeyValue(doc, y, "Resolved", String(resolved));
      y = addKeyValue(doc, y, "Resolution Rate", `${total > 0 ? ((resolved / total) * 100).toFixed(1) : 0}%`);
      y += 4;
      y = addKeyValue(doc, y, "By Severity", Object.entries(sevCounts).map(([k, v]) => `${k}: ${v}`).join("  |  "));
      y = addKeyValue(doc, y, "By Source", Object.entries(srcCounts).map(([k, v]) => `${k}: ${v}`).join("  |  "));
      y = addKeyValue(doc, y, "By Status", Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join("  |  "));
      y += 6;

      y = addSectionTitle(doc, y, "All Potholes — Overview");
      autoTable(doc, {
        startY: y,
        head: [["#", "ID", "Highway", "Severity", "Status", "Source", "City", "Detected"]],
        body: potholes.map((p, i) => [
          String(i + 1),
          p.id.slice(0, 10),
          p.highway_ref || "N/A",
          p.severity,
          p.status,
          p.source,
          p.nearest_city || "N/A",
          fmtDate(p.detected_at),
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }

    case "severity": {
      y = addSectionTitle(doc, y, "Severity Analysis");
      const groups: Record<string, Pothole[]> = {};
      potholes.forEach((p) => {
        if (!groups[p.severity]) groups[p.severity] = [];
        groups[p.severity].push(p);
      });

      for (const sev of ["critical", "high", "medium", "low"]) {
        const items = groups[sev] || [];
        if (items.length === 0) continue;
        y = addSectionTitle(doc, y, `${sev.toUpperCase()} Severity (${items.length} potholes)`);
        const headColor: [number, number, number] =
          sev === "critical" ? [220, 38, 38] :
          sev === "high" ? [234, 88, 12] :
          sev === "medium" ? [217, 119, 6] :
          [22, 163, 74];
        autoTable(doc, {
          startY: y,
          head: [["#", "ID", "Highway", "Score", "Confidence", "Status", "City", "Detected"]],
          body: items.map((p, i) => [
            String(i + 1),
            p.id.slice(0, 10),
            p.highway_ref || "N/A",
            p.severity_score != null ? String(p.severity_score) : "N/A",
            p.confidence_score != null ? `${(p.confidence_score * 100).toFixed(1)}%` : "N/A",
            p.status,
            p.nearest_city || "N/A",
            fmtDate(p.detected_at),
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: { ...TABLE_HEAD_STYLE, fillColor: headColor },
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
        y = getLastTableY(doc) + 8;
      }
      break;
    }

    case "location": {
      y = addSectionTitle(doc, y, "Location Details");
      autoTable(doc, {
        startY: y,
        head: [["#", "ID", "Latitude", "Longitude", "Highway", "Type", "City", "District", "Google Maps"]],
        body: potholes.map((p, i) => [
          String(i + 1),
          p.id.slice(0, 10),
          p.latitude.toFixed(6),
          p.longitude.toFixed(6),
          p.highway_ref || "N/A",
          p.highway_type || "N/A",
          p.nearest_city || "N/A",
          p.district || "N/A",
          `maps.google.com/?q=${p.latitude},${p.longitude}`,
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
        columnStyles: { 8: { textColor: [37, 99, 235], fontSize: 6 } },
      });
      break;
    }

    case "detection": {
      y = addSectionTitle(doc, y, "Detection & Source Data");
      const srcCounts: Record<string, number> = {};
      potholes.forEach((p) => {
        srcCounts[p.source] = (srcCounts[p.source] || 0) + 1;
      });
      y = addKeyValue(doc, y, "Source Breakdown", Object.entries(srcCounts).map(([k, v]) => `${k}: ${v}`).join("  |  "));
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["#", "ID", "Source", "Severity", "Confidence %", "Severity Score", "Detected At", "Resolved At", "Description"]],
        body: potholes.map((p, i) => [
          String(i + 1),
          p.id.slice(0, 10),
          p.source,
          p.severity,
          p.confidence_score != null ? `${(p.confidence_score * 100).toFixed(1)}%` : "N/A",
          p.severity_score != null ? String(p.severity_score) : "N/A",
          fmtDate(p.detected_at),
          fmtDate(p.resolved_at),
          p.description?.slice(0, 50) || "N/A",
        ]),
        styles: { ...TABLE_BODY_STYLE, overflow: "linebreak" as const },
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }

    case "status": {
      y = addSectionTitle(doc, y, "Status Breakdown");
      const statusGroups: Record<string, Pothole[]> = {};
      potholes.forEach((p) => {
        if (!statusGroups[p.status]) statusGroups[p.status] = [];
        statusGroups[p.status].push(p);
      });
      y = addKeyValue(doc, y, "Statuses", Object.entries(statusGroups).map(([k, v]) => `${k}: ${v.length}`).join("  |  "));
      y += 4;

      for (const [st, items] of Object.entries(statusGroups)) {
        y = addSectionTitle(doc, y, `${st.toUpperCase()} (${items.length})`);
        autoTable(doc, {
          startY: y,
          head: [["#", "ID", "Highway", "Severity", "Source", "City", "Detected", "Resolved"]],
          body: items.map((p, i) => [
            String(i + 1),
            p.id.slice(0, 10),
            p.highway_ref || "N/A",
            p.severity,
            p.source,
            p.nearest_city || "N/A",
            fmtDate(p.detected_at),
            fmtDate(p.resolved_at),
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: TABLE_HEAD_STYLE,
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
        y = getLastTableY(doc) + 8;
      }
      break;
    }
  }

  savePDF(doc, `reports-${topic}`);
}

interface EditForm {
  severity: string;
  highway_ref: string;
  nearest_city: string;
  district: string;
  road_segment: string;
  assigned_contractor_id: string;
}

export default function ReportsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Edit dialog state
  const [editPothole, setEditPothole] = useState<Pothole | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    severity: "",
    highway_ref: "",
    nearest_city: "",
    district: "",
    road_segment: "",
    assigned_contractor_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);

  // Export PDF menu state
  const [exportOpen, setExportOpen] = useState(false);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const fetchPotholes = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (severity !== "all") params.severity = severity;
    if (status !== "all") params.status = status;
    try {
      const data = await api.getPotholes(params);
      setPotholes(data.potholes || []);
      setTotal(data.total || (data.potholes || []).length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, severity, status]);

  useEffect(() => {
    fetchPotholes();
    const interval = setInterval(fetchPotholes, 60_000);
    return () => clearInterval(interval);
  }, [fetchPotholes]);

  // Fetch contractors once for admin
  useEffect(() => {
    if (isAdmin) {
      api.getContractors().then(setContractors).catch(console.error);
    }
  }, [isAdmin]);

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

  const filtered = search
    ? potholes.filter(
        (p) =>
          (p.highway_ref || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.nearest_city || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.district || "").toLowerCase().includes(search.toLowerCase())
      )
    : potholes;

  const handleExportCsv = useCallback(() => {
    const headers = ["ID", "Highway", "City", "District", "Severity", "Source", "Status", "Latitude", "Longitude", "Detected At"];
    const rows = potholes.map((p) => [
      p.id,
      p.highway_ref || "",
      p.nearest_city || "",
      p.district || "",
      p.severity,
      p.source,
      p.status,
      String(p.latitude),
      String(p.longitude),
      p.detected_at || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supath-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [potholes]);

  const handleExportAll = () => {
    if (potholes.length === 0) return;
    setExportLoading(true);
    setExportOpen(false);
    setTimeout(() => {
      exportReportsEntirePDF(potholes);
      setExportLoading(false);
    }, 100);
  };

  const handleExportTopic = (topic: ReportsTopicKey) => {
    if (potholes.length === 0) return;
    setExportLoading(true);
    setExportOpen(false);
    setTopicMenuOpen(false);
    setTimeout(() => {
      exportReportsTopicPDF(potholes, topic);
      setExportLoading(false);
    }, 100);
  };

  const openEdit = (p: Pothole) => {
    setEditPothole(p);
    setEditForm({
      severity: p.severity,
      highway_ref: p.highway_ref || "",
      nearest_city: p.nearest_city || "",
      district: p.district || "",
      road_segment: (p as Pothole & { road_segment?: string }).road_segment || "",
      assigned_contractor_id: p.assigned_contractor_id || "",
    });
  };

  const handleDelete = async (p: Pothole) => {
    if (!confirm(`Delete pothole ${p.id.slice(0, 8)}…? This also removes linked complaints and citizen reports.`)) return;
    try {
      await api.deletePothole(p.id);
      toast.success("Pothole deleted");
      fetchPotholes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleSave = async () => {
    if (!editPothole) return;
    setSaving(true);
    try {
      await api.updatePothole(editPothole.id, {
        severity: editForm.severity || undefined,
        highway_ref: editForm.highway_ref || undefined,
        nearest_city: editForm.nearest_city || undefined,
        district: editForm.district || undefined,
        road_segment: editForm.road_segment || undefined,
        assigned_contractor_id: editForm.assigned_contractor_id || null,
      });
      toast.success("Pothole updated");
      setEditPothole(null);
      fetchPotholes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update pothole");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getStatusKey = (s: string) => {
    const map: Record<string, string> = {
      detected: "detected",
      filed: "filed",
      acknowledged: "acknowledged",
      in_progress: "inProgress",
      resolved: "resolved",
      escalated: "escalated",
    };
    return map[s] || s;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{t.reports.title}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t.reports.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start shrink-0">
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => {
                setExportOpen((o) => !o);
                setTopicMenuOpen(false);
              }}
              disabled={potholes.length === 0 || exportLoading}
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
              <div className="absolute top-full right-0 mt-1 w-56 rounded-lg border bg-background shadow-lg overflow-hidden z-50">
                {/* Option 1: Export all */}
                <button
                  onClick={handleExportAll}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs hover:bg-muted transition-colors text-left"
                >
                  <FileDown className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-medium">Export Entire Data</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      All {potholes.length} potholes with full details
                    </p>
                  </div>
                </button>

                <div className="border-t" />

                {/* Option 2: Topic-wise */}
                <button
                  onClick={() => setTopicMenuOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-xs hover:bg-muted transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <p className="font-medium">Export by Topic</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Choose a specific section to export
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-3 h-3 text-muted-foreground transition-transform ${
                      topicMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Topic sub-menu */}
                {topicMenuOpen && (
                  <div className="border-t bg-muted/30">
                    {(Object.keys(REPORTS_TOPIC_LABELS) as ReportsTopicKey[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => handleExportTopic(key)}
                        className="w-full flex items-center gap-3 px-6 py-2.5 text-xs hover:bg-muted transition-colors text-left"
                      >
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{REPORTS_TOPIC_LABELS[key]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="w-4 h-4 mr-1.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <Input
              placeholder={t.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48 h-8 text-sm"
            />
            <Select value={severity} onValueChange={(v) => { if (v) { setSeverity(v); setPage(0); } }}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-36 h-8 text-sm">
                <SelectValue placeholder={t.reports.severity} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.reports.severity}: All</SelectItem>
                <SelectItem value="critical">{t.severity.critical}</SelectItem>
                <SelectItem value="high">{t.severity.high}</SelectItem>
                <SelectItem value="medium">{t.severity.medium}</SelectItem>
                <SelectItem value="low">{t.severity.low}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { if (v) { setStatus(v); setPage(0); } }}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40 h-8 text-sm">
                <SelectValue placeholder={t.reports.status} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.reports.status}: All</SelectItem>
                <SelectItem value="detected">{t.status.detected}</SelectItem>
                <SelectItem value="filed">{t.status.filed}</SelectItem>
                <SelectItem value="in_progress">{t.status.inProgress}</SelectItem>
                <SelectItem value="resolved">{t.status.resolved}</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-xs text-muted-foreground">
              {t.reports.total}: {total}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t.reports.id}</TableHead>
                  <TableHead>{t.reports.highway}</TableHead>
                  <TableHead>{t.reports.location}</TableHead>
                  <TableHead>{t.reports.severity}</TableHead>
                  <TableHead>{t.reports.source}</TableHead>
                  <TableHead>{t.reports.status}</TableHead>
                  <TableHead>{t.reports.detectedOn}</TableHead>
                  <TableHead className="w-20">{t.reports.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t.common.noResults}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <React.Fragment key={p.id}>
                    <TableRow>
                      <TableCell className="font-mono text-xs">
                        {p.id?.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              (p.highway_ref || "").startsWith("NH")
                                ? "bg-red-500"
                                : "bg-blue-500"
                            }`}
                          />
                          <span className="text-sm">{p.highway_ref || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          {p.nearest_city || p.district || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${severityBadgeVariants[p.severity] || ""}`}>
                          {t.severity[p.severity as keyof typeof t.severity] || p.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {t.source[p.source as keyof typeof t.source] || p.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusBadgeVariants[p.status] || ""}`}>
                          {t.status[getStatusKey(p.status) as keyof typeof t.status] || p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.detected_at
                          ? new Date(p.detected_at).toLocaleDateString("en-IN")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                              onClick={() => handleDelete(p)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {selectedId === p.id && (
                      <TableRow key={`${p.id}-detail`}>
                        <TableCell colSpan={8} className="bg-muted/30 text-xs">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-2">
                            <div>
                              <p className="text-muted-foreground">{t.reports.id}</p>
                              <p className="font-mono font-medium">{p.id}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">GPS</p>
                              <p className="font-medium">
                                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                  title={t.common.viewOnGoogleMaps}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                                </a>
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">{t.reports.highway}</p>
                              <p className="font-medium">{p.highway_ref || "\u2014"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">{t.reports.location}</p>
                              <p className="font-medium">{p.nearest_city || "\u2014"}, {p.district || "\u2014"}</p>
                            </div>
                            {p.description && (
                              <div className="col-span-2 md:col-span-4">
                                <p className="text-muted-foreground">Description</p>
                                <p className="font-medium">{p.description}</p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t.common.showing} {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total)} {t.common.of} {total}{" "}
            {t.common.results}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
              {t.common.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              {t.common.next}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editPothole !== null} onOpenChange={(open) => { if (!open) setEditPothole(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Pothole</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Severity</label>
              <Select
                value={editForm.severity}
                onValueChange={(v) => setEditForm((f) => ({ ...f, severity: v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">{t.severity.critical}</SelectItem>
                  <SelectItem value="high">{t.severity.high}</SelectItem>
                  <SelectItem value="medium">{t.severity.medium}</SelectItem>
                  <SelectItem value="low">{t.severity.low}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Highway Ref</label>
              <Input
                value={editForm.highway_ref}
                onChange={(e) => setEditForm((f) => ({ ...f, highway_ref: e.target.value }))}
                placeholder="e.g. NH 30"
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nearest City</label>
                <Input
                  value={editForm.nearest_city}
                  onChange={(e) => setEditForm((f) => ({ ...f, nearest_city: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">District</label>
                <Input
                  value={editForm.district}
                  onChange={(e) => setEditForm((f) => ({ ...f, district: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Road Segment</label>
              <Input
                value={editForm.road_segment}
                onChange={(e) => setEditForm((f) => ({ ...f, road_segment: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Assigned Contractor</label>
              <Select
                value={editForm.assigned_contractor_id || "__none__"}
                onValueChange={(v) => setEditForm((f) => ({ ...f, assigned_contractor_id: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPothole(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
