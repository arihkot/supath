"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type React from "react";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api";
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
  Clock,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  Layers,
  Loader2,
  ArrowUpCircle,
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
  fmtDateShort,
  TABLE_HEAD_STYLE,
  TABLE_ALT_ROW_STYLE,
  TABLE_MARGIN,
  TABLE_BODY_STYLE,
} from "@/lib/pdf-export";

import type { Complaint, Contractor } from "@/lib/types";

const statusBadgeVariants: Record<string, string> = {
  filed: "bg-amber-100 text-amber-700 border-amber-200",
  acknowledged: "bg-purple-100 text-purple-700 border-purple-200",
  in_progress: "bg-cyan-100 text-cyan-700 border-cyan-200",
  resolved: "bg-green-100 text-green-700 border-green-200",
  escalated: "bg-red-100 text-red-700 border-red-200",
};

const statusIcons: Record<string, React.ElementType> = {
  filed: FileText,
  acknowledged: Eye,
  in_progress: Clock,
  resolved: CheckCircle2,
  escalated: ArrowUpCircle,
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// PDF generation helpers
// ---------------------------------------------------------------------------

type ComplaintsTopicKey =
  | "overview"
  | "status_breakdown"
  | "escalation"
  | "portal"
  | "resolution";

const COMPLAINTS_TOPIC_LABELS: Record<ComplaintsTopicKey, string> = {
  overview: "Overview Summary",
  status_breakdown: "Status Breakdown",
  escalation: "Escalation Analysis",
  portal: "Portal Breakdown",
  resolution: "Resolution Analysis",
};

function exportComplaintsEntirePDF(
  complaints: Complaint[],
  statusCounts: Record<string, number>
) {
  const getDays = (filedAt: string, resolvedAt?: string) => {
    const start = new Date(filedAt);
    const end = resolvedAt ? new Date(resolvedAt) : new Date();
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const doc = new jsPDF({ orientation: "landscape" });
  let y = addReportHeader(
    doc,
    "Complaints — Complete Data Export",
    `Total records: ${complaints.length}`
  );

  // Summary stats
  y = addSectionTitle(doc, y, "Summary Statistics");
  y = addKeyValue(doc, y, "Total Complaints", String(complaints.length));
  y = addKeyValue(
    doc,
    y,
    "Statuses",
    Object.entries(statusCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  |  ")
  );
  const avgEscalation =
    complaints.length > 0
      ? (
          complaints.reduce((sum, c) => sum + c.escalation_count, 0) /
          complaints.length
        ).toFixed(2)
      : "0";
  y = addKeyValue(doc, y, "Avg Escalation Count", avgEscalation);
  const portals = [...new Set(complaints.map((c) => c.portal))];
  y = addKeyValue(doc, y, "Portals Used", portals.join("  |  "));
  y += 4;

  // Full data table
  y = addSectionTitle(doc, y, "Complete Complaint Records");
  autoTable(doc, {
    startY: y,
    head: [
      [
        "#",
        "Ref",
        "Pothole ID",
        "Portal",
        "Status",
        "Filed",
        "Acknowledged",
        "Resolved",
        "Days Open",
        "Escalations",
        "Level",
        "Description",
      ],
    ],
    body: complaints.map((c, i) => [
      String(i + 1),
      c.complaint_ref,
      c.pothole_id.slice(0, 8),
      c.portal,
      c.status,
      fmtDateShort(c.filed_at),
      fmtDateShort(c.acknowledged_at),
      fmtDateShort(c.resolved_at),
      String(getDays(c.filed_at, c.resolved_at)),
      String(c.escalation_count),
      c.escalation_level,
      (c.description || "N/A").slice(0, 40),
    ]),
    styles: { fontSize: 6, cellPadding: 1.5, overflow: "linebreak" as const },
    headStyles: {
      ...TABLE_HEAD_STYLE,
      fontSize: 6.5,
    },
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: { left: 6, right: 6 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 20 },
    },
  });

  savePDF(doc, "complaints-complete");
}

function exportComplaintsTopicPDF(
  complaints: Complaint[],
  statusCounts: Record<string, number>,
  topic: ComplaintsTopicKey
) {
  const getDays = (filedAt: string, resolvedAt?: string) => {
    const start = new Date(filedAt);
    const end = resolvedAt ? new Date(resolvedAt) : new Date();
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const doc = new jsPDF();
  const label = COMPLAINTS_TOPIC_LABELS[topic];
  let y = addReportHeader(
    doc,
    `Complaints — ${label}`,
    `Records: ${complaints.length}`
  );

  switch (topic) {
    case "overview": {
      y = addSectionTitle(doc, y, "Overview Summary");
      y = addKeyValue(doc, y, "Total Complaints", String(complaints.length));
      y = addKeyValue(
        doc,
        y,
        "Statuses",
        Object.entries(statusCounts)
          .map(([k, v]) => `${k}: ${v}`)
          .join("  |  ")
      );
      const avgEsc =
        complaints.length > 0
          ? (
              complaints.reduce((sum, c) => sum + c.escalation_count, 0) /
              complaints.length
            ).toFixed(2)
          : "0";
      y = addKeyValue(doc, y, "Avg Escalation Count", avgEsc);
      const portals = [...new Set(complaints.map((c) => c.portal))];
      y = addKeyValue(doc, y, "Portals Used", portals.join("  |  "));
      y += 6;

      y = addSectionTitle(doc, y, "All Complaints — Overview");
      autoTable(doc, {
        startY: y,
        head: [["#", "Ref", "Portal", "Status", "Filed", "Days Open", "Escalations"]],
        body: complaints.map((c, i) => [
          String(i + 1),
          c.complaint_ref,
          c.portal,
          c.status,
          fmtDateShort(c.filed_at),
          String(getDays(c.filed_at, c.resolved_at)),
          String(c.escalation_count),
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }

    case "status_breakdown": {
      y = addSectionTitle(doc, y, "Status Breakdown");
      const statusGroups: Record<string, Complaint[]> = {};
      complaints.forEach((c) => {
        if (!statusGroups[c.status]) statusGroups[c.status] = [];
        statusGroups[c.status].push(c);
      });
      y = addKeyValue(
        doc,
        y,
        "Statuses",
        Object.entries(statusGroups)
          .map(([k, v]) => `${k}: ${v.length}`)
          .join("  |  ")
      );
      y += 4;

      const statusColors: Record<string, [number, number, number]> = {
        filed: [217, 119, 6],
        acknowledged: [124, 58, 237],
        in_progress: [8, 145, 178],
        resolved: [22, 163, 74],
        escalated: [220, 38, 38],
      };

      for (const [st, items] of Object.entries(statusGroups)) {
        y = addSectionTitle(
          doc,
          y,
          `${st.toUpperCase()} (${items.length})`
        );
        const headColor = statusColors[st] || TABLE_HEAD_STYLE.fillColor;
        autoTable(doc, {
          startY: y,
          head: [["#", "Ref", "Portal", "Filed", "Days Open", "Escalations", "Description"]],
          body: items.map((c, i) => [
            String(i + 1),
            c.complaint_ref,
            c.portal,
            fmtDateShort(c.filed_at),
            String(getDays(c.filed_at, c.resolved_at)),
            String(c.escalation_count),
            (c.description || "N/A").slice(0, 40),
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

    case "escalation": {
      y = addSectionTitle(doc, y, "Escalation Analysis");
      const escalated = complaints.filter((c) => c.escalation_count > 0);
      const avgEscCount =
        escalated.length > 0
          ? (
              escalated.reduce((sum, c) => sum + c.escalation_count, 0) /
              escalated.length
            ).toFixed(2)
          : "0";
      y = addKeyValue(doc, y, "Total Escalated", String(escalated.length));
      y = addKeyValue(doc, y, "Avg Escalation Count", avgEscCount);
      y += 4;

      y = addSectionTitle(doc, y, "Escalated Complaints");
      autoTable(doc, {
        startY: y,
        head: [["#", "Ref", "Portal", "Level", "Count", "Filed", "Days Open"]],
        body: escalated.map((c, i) => [
          String(i + 1),
          c.complaint_ref,
          c.portal,
          c.escalation_level,
          String(c.escalation_count),
          fmtDateShort(c.filed_at),
          String(getDays(c.filed_at, c.resolved_at)),
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }

    case "portal": {
      y = addSectionTitle(doc, y, "Portal Breakdown");
      const portalGroups: Record<string, Complaint[]> = {};
      complaints.forEach((c) => {
        if (!portalGroups[c.portal]) portalGroups[c.portal] = [];
        portalGroups[c.portal].push(c);
      });
      y = addKeyValue(
        doc,
        y,
        "Portals",
        Object.entries(portalGroups)
          .map(([k, v]) => `${k}: ${v.length}`)
          .join("  |  ")
      );
      y += 4;

      for (const [portal, items] of Object.entries(portalGroups)) {
        y = addSectionTitle(
          doc,
          y,
          `${portal} (${items.length} complaints)`
        );
        autoTable(doc, {
          startY: y,
          head: [["#", "Ref", "Status", "Filed", "Days Open", "Escalations"]],
          body: items.map((c, i) => [
            String(i + 1),
            c.complaint_ref,
            c.status,
            fmtDateShort(c.filed_at),
            String(getDays(c.filed_at, c.resolved_at)),
            String(c.escalation_count),
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

    case "resolution": {
      y = addSectionTitle(doc, y, "Resolution Analysis");
      const resolved = complaints.filter((c) => c.resolved_at);
      const avgDays =
        resolved.length > 0
          ? (
              resolved.reduce(
                (sum, c) => sum + getDays(c.filed_at, c.resolved_at),
                0
              ) / resolved.length
            ).toFixed(1)
          : "0";
      y = addKeyValue(doc, y, "Total Resolved", String(resolved.length));
      y = addKeyValue(doc, y, "Avg Days to Resolve", avgDays);
      y = addKeyValue(
        doc,
        y,
        "Resolution Rate",
        `${complaints.length > 0 ? ((resolved.length / complaints.length) * 100).toFixed(1) : 0}%`
      );
      y += 4;

      y = addSectionTitle(doc, y, "Resolved Complaints");
      autoTable(doc, {
        startY: y,
        head: [["#", "Ref", "Filed", "Resolved", "Days to Resolve", "Resolution Notes"]],
        body: resolved.map((c, i) => [
          String(i + 1),
          c.complaint_ref,
          fmtDateShort(c.filed_at),
          fmtDateShort(c.resolved_at),
          String(getDays(c.filed_at, c.resolved_at)),
          (c.resolution_notes || "N/A").slice(0, 50),
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }
  }

  savePDF(doc, `complaints-${topic}`);
}

interface EditForm {
  status: string;
  description: string;
  resolution_notes: string;
  assigned_contractor_id: string;
}

export default function ComplaintsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // Edit dialog state
  const [editComplaint, setEditComplaint] = useState<Complaint | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    status: "",
    description: "",
    resolution_notes: "",
    assigned_contractor_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);

  // Export PDF menu state
  const [exportOpen, setExportOpen] = useState(false);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (status !== "all") params.status = status;

    try {
      const data = await api.getComplaints(params);
      const list = data.complaints || [];
      setComplaints(Array.isArray(list) ? list : []);
      setTotal(data.total || list.length);
      if (data.status_counts) setStatusCounts(data.status_counts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    fetchComplaints();
    const interval = setInterval(fetchComplaints, 60_000);
    return () => clearInterval(interval);
  }, [fetchComplaints]);

  // Fetch contractors for admin
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

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  const getStatusKey = (s: string) => {
    const map: Record<string, string> = {
      filed: "filed",
      acknowledged: "acknowledged",
      in_progress: "inProgress",
      resolved: "resolved",
      escalated: "escalated",
    };
    return map[s] || s;
  };

  const getDaysOpen = (filedAt: string, resolvedAt?: string) => {
    const start = new Date(filedAt);
    const end = resolvedAt ? new Date(resolvedAt) : new Date();
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleExportAll = () => {
    if (complaints.length === 0) return;
    setExportLoading(true);
    setExportOpen(false);
    setTimeout(() => {
      exportComplaintsEntirePDF(complaints, statusCounts);
      setExportLoading(false);
    }, 100);
  };

  const handleExportTopic = (topic: ComplaintsTopicKey) => {
    if (complaints.length === 0) return;
    setExportLoading(true);
    setExportOpen(false);
    setTopicMenuOpen(false);
    setTimeout(() => {
      exportComplaintsTopicPDF(complaints, statusCounts, topic);
      setExportLoading(false);
    }, 100);
  };

  const openEdit = (c: Complaint) => {
    setEditComplaint(c);
    setEditForm({
      status: c.status,
      description: c.description || "",
      resolution_notes: c.resolution_notes || "",
      assigned_contractor_id: c.assigned_contractor_id || "",
    });
  };

  const handleDeleteComplaint = async (c: Complaint) => {
    if (!confirm(`Delete complaint ${c.complaint_ref}?`)) return;
    try {
      await api.deleteComplaint(c.id);
      toast.success("Complaint deleted");
      fetchComplaints();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleSave = async () => {
    if (!editComplaint) return;
    setSaving(true);
    try {
      await api.updateComplaint(editComplaint.id, {
        status: editForm.status || undefined,
        description: editForm.description || undefined,
        resolution_notes: editForm.resolution_notes || undefined,
        assigned_contractor_id: editForm.assigned_contractor_id || null,
      });
      toast.success("Complaint updated");
      setEditComplaint(null);
      fetchComplaints();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update complaint");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{t.complaints.title}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t.complaints.subtitle}
          </p>
        </div>
        <div className="relative self-start shrink-0" ref={exportRef}>
          <button
            onClick={() => {
              setExportOpen((o) => !o);
              setTopicMenuOpen(false);
            }}
            disabled={complaints.length === 0 || exportLoading}
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
                    All {complaints.length} complaints with full details
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
                  {(Object.keys(COMPLAINTS_TOPIC_LABELS) as ComplaintsTopicKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => handleExportTopic(key)}
                      className="w-full flex items-center gap-3 px-6 py-2.5 text-xs hover:bg-muted transition-colors text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{COMPLAINTS_TOPIC_LABELS[key]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(
          [
            { key: "filed", icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
            { key: "acknowledged", icon: Eye, color: "text-purple-600", bg: "bg-purple-50" },
            { key: "in_progress", icon: Clock, color: "text-cyan-600", bg: "bg-cyan-50" },
            { key: "escalated", icon: ArrowUpCircle, color: "text-red-600", bg: "bg-red-50" },
            { key: "resolved", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.key} className="py-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${item.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{statusCounts[item.key] || 0}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.complaints[getStatusKey(item.key) as keyof typeof t.complaints] || item.key}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <Select value={status} onValueChange={(v) => { if (v) { setStatus(v); setPage(0); } }}>
          <SelectTrigger className="w-full sm:w-44 h-8 text-sm">
            <SelectValue placeholder={t.complaints.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.complaints.status}: All</SelectItem>
            <SelectItem value="filed">{t.complaints.filed}</SelectItem>
            <SelectItem value="acknowledged">{t.complaints.acknowledged}</SelectItem>
            <SelectItem value="in_progress">{t.complaints.inProgress}</SelectItem>
            <SelectItem value="escalated">{t.complaints.escalated}</SelectItem>
            <SelectItem value="resolved">
              {t.status.resolved}
            </SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {total} {t.common.results}
        </div>
      </div>

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
                  <TableHead>{t.complaints.complaintRef}</TableHead>
                  <TableHead>{t.complaints.portal}</TableHead>
                  <TableHead>{t.complaints.status}</TableHead>
                  <TableHead>{t.complaints.filedOn}</TableHead>
                  <TableHead>{t.complaints.daysOpen}</TableHead>
                  <TableHead>{t.complaints.escalations}</TableHead>
                  <TableHead>{t.complaints.lastUpdate}</TableHead>
                  {isAdmin && <TableHead className="w-16">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaints.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                      {t.common.noResults}
                    </TableCell>
                  </TableRow>
                ) : (
                  complaints.map((c: Complaint) => {
                    const days = getDaysOpen(c.filed_at, c.resolved_at);
                    const StatusIcon = statusIcons[c.status] || FileText;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <span className="font-mono text-xs font-medium">
                            {c.complaint_ref}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {c.portal === "pg_portal" ? "PG Portal (CPGRAMS)" : c.portal}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            <Badge className={`text-[10px] ${statusBadgeVariants[c.status] || ""}`}>
                              {t.status[getStatusKey(c.status) as keyof typeof t.status] || c.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.filed_at
                            ? new Date(c.filed_at).toLocaleDateString("en-IN")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-medium ${
                              days > 30
                                ? "text-red-600"
                                : days > 14
                                  ? "text-amber-600"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {days} {t.dashboard.days}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.escalation_count > 0 ? (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-red-500" />
                              <span className="text-xs font-medium text-red-600">
                                {c.escalation_count}x ({c.escalation_level})
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.acknowledged_at
                            ? new Date(c.acknowledged_at).toLocaleDateString("en-IN")
                            : c.resolved_at
                              ? new Date(c.resolved_at).toLocaleDateString("en-IN")
                              : "—"}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openEdit(c)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                onClick={() => handleDeleteComplaint(c)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
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
      <Dialog open={editComplaint !== null} onOpenChange={(open) => { if (!open) setEditComplaint(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Complaint</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="filed">{t.complaints.filed}</SelectItem>
                  <SelectItem value="acknowledged">{t.complaints.acknowledged}</SelectItem>
                  <SelectItem value="in_progress">{t.complaints.inProgress}</SelectItem>
                  <SelectItem value="escalated">{t.complaints.escalated}</SelectItem>
                  <SelectItem value="resolved">{t.status.resolved}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="h-8 text-sm"
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Resolution Notes</label>
              <Input
                value={editForm.resolution_notes}
                onChange={(e) => setEditForm((f) => ({ ...f, resolution_notes: e.target.value }))}
                className="h-8 text-sm"
                placeholder="Notes on resolution"
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
            <Button variant="outline" onClick={() => setEditComplaint(null)} disabled={saving}>
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
