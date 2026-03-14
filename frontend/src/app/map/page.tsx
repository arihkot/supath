"use client";

import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useCallback, useRef, useEffect } from "react";
import { type Pothole } from "@/lib/types";
import { api } from "@/lib/api";
import {
  X,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  ArrowUpCircle,
  ExternalLink,
  Shield,
  Radio,
  Calendar,
  User,
  Info,
  Loader2,
  Navigation,
  Hash,
  ImageIcon,
  FileText,
  CircleDot,
  Download,
  ChevronDown,
  FileDown,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Dynamically import map to avoid SSR issues with Leaflet
const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-muted/30">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
});

// ---------------------------------------------------------------------------
// PDF generation helpers
// ---------------------------------------------------------------------------

type TopicKey =
  | "overview"
  | "severity"
  | "location"
  | "detection"
  | "contractor"
  | "status";

const TOPIC_LABELS: Record<TopicKey, string> = {
  overview: "Overview Summary",
  severity: "Severity Analysis",
  location: "Location Details",
  detection: "Detection & Source",
  contractor: "Contractor Assignments",
  status: "Status Breakdown",
};

function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleString() : "N/A";
}

function addReportHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageW = doc.internal.pageSize.getWidth();

  // Brand bar
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("SuPath — Pothole Intelligence", 14, 15);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 24);

  // Subtitle + date
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.text(subtitle, 14, 40);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 14, 40, {
    align: "right",
  });

  return 48; // Y cursor after header
}

function addSectionTitle(doc: jsPDF, y: number, label: string): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + 16 > pageH - 20) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 58, 95);
  doc.text(label, 14, y);
  doc.setDrawColor(30, 58, 95);
  doc.setLineWidth(0.5);
  doc.line(14, y + 2, doc.internal.pageSize.getWidth() - 14, y + 2);
  return y + 10;
}

function addKeyValue(
  doc: jsPDF,
  y: number,
  key: string,
  value: string
): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + 8 > pageH - 20) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text(`${key}:`, 18, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(value, 70, y);
  return y + 6;
}

function addPageFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Page ${i} of ${pages}`, pageW / 2, pageH - 8, {
      align: "center",
    });
    doc.text("SuPath — Confidential", 14, pageH - 8);
  }
}

// ---- Export entire data as PDF ----
function exportEntirePDF(potholes: Pothole[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  let y = addReportHeader(
    doc,
    "Complete Pothole Data Export",
    `Total records: ${potholes.length}`
  );

  // Summary stats
  y = addSectionTitle(doc, y, "Summary Statistics");
  const total = potholes.length;
  const resolved = potholes.filter((p) => p.is_resolved).length;
  const active = total - resolved;
  const sevCounts: Record<string, number> = {};
  const srcCounts: Record<string, number> = {};
  const districtCounts: Record<string, number> = {};
  const highwayCounts: Record<string, number> = {};
  potholes.forEach((p) => {
    sevCounts[p.severity] = (sevCounts[p.severity] || 0) + 1;
    srcCounts[p.source] = (srcCounts[p.source] || 0) + 1;
    if (p.district) districtCounts[p.district] = (districtCounts[p.district] || 0) + 1;
    if (p.highway_ref) highwayCounts[p.highway_ref] = (highwayCounts[p.highway_ref] || 0) + 1;
  });

  y = addKeyValue(doc, y, "Total Potholes", String(total));
  y = addKeyValue(doc, y, "Active", String(active));
  y = addKeyValue(doc, y, "Resolved", String(resolved));
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
  y += 4;

  // Top highways table
  y = addSectionTitle(doc, y, "Top Affected Highways");
  const topHw = Object.entries(highwayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  autoTable(doc, {
    startY: y,
    head: [["Highway Ref", "Pothole Count"]],
    body: topHw.map(([ref, cnt]) => [ref, String(cnt)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Top districts table
  if (Object.keys(districtCounts).length > 0) {
    y = addSectionTitle(doc, y, "Top Affected Districts");
    const topDist = Object.entries(districtCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    autoTable(doc, {
      startY: y,
      head: [["District", "Pothole Count"]],
      body: topDist.map(([d, cnt]) => [d, String(cnt)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Full data table
  doc.addPage();
  y = 20;
  y = addSectionTitle(doc, y, "Complete Pothole Records");
  autoTable(doc, {
    startY: y,
    head: [
      [
        "#",
        "ID",
        "Highway",
        "Type",
        "Severity",
        "Score",
        "Confidence",
        "Status",
        "Source",
        "Nearest City",
        "District",
        "Latitude",
        "Longitude",
        "Detected",
        "Resolved",
        "Contractor",
        "Description",
      ],
    ],
    body: potholes.map((p, i) => [
      String(i + 1),
      p.id.slice(0, 8),
      p.highway_ref || "N/A",
      p.highway_type || "N/A",
      p.severity,
      p.severity_score != null ? String(p.severity_score) : "N/A",
      p.confidence_score != null
        ? `${(p.confidence_score * 100).toFixed(1)}%`
        : "N/A",
      p.status,
      p.source,
      p.nearest_city || "N/A",
      p.district || "N/A",
      p.latitude.toFixed(6),
      p.longitude.toFixed(6),
      fmtDate(p.detected_at),
      fmtDate(p.resolved_at),
      p.assigned_contractor_name || "Unassigned",
      p.description?.slice(0, 40) || "N/A",
    ]),
    styles: { fontSize: 6, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 6.5,
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 6, right: 6 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 16 },
      16: { cellWidth: 30 },
    },
  });

  addPageFooter(doc);
  doc.save(`supath-complete-export-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---- Export topic-wise PDF ----
function exportTopicPDF(potholes: Pothole[], topic: TopicKey) {
  const doc = new jsPDF();
  const label = TOPIC_LABELS[topic];
  let y = addReportHeader(doc, `Topic Export — ${label}`, `Records: ${potholes.length}`);

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
        head: [["#", "ID", "Highway", "Severity", "Status", "Source", "Nearest City", "Detected"]],
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
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
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
        autoTable(doc, {
          startY: y,
          head: [["#", "ID", "Highway", "Score", "Confidence", "Status", "City", "District", "Detected"]],
          body: items.map((p, i) => [
            String(i + 1),
            p.id.slice(0, 10),
            p.highway_ref || "N/A",
            p.severity_score != null ? String(p.severity_score) : "N/A",
            p.confidence_score != null ? `${(p.confidence_score * 100).toFixed(1)}%` : "N/A",
            p.status,
            p.nearest_city || "N/A",
            p.district || "N/A",
            fmtDate(p.detected_at),
          ]),
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: sev === "critical" ? [220, 38, 38] : sev === "high" ? [234, 88, 12] : sev === "medium" ? [217, 119, 6] : [22, 163, 74], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }
      break;
    }

    case "location": {
      y = addSectionTitle(doc, y, "Location Details");
      autoTable(doc, {
        startY: y,
        head: [["#", "ID", "Latitude", "Longitude", "Highway", "Type", "Nearest City", "District", "Google Maps"]],
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
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
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
        styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
      });
      break;
    }

    case "contractor": {
      y = addSectionTitle(doc, y, "Contractor Assignments");
      const assigned = potholes.filter((p) => p.assigned_contractor_name || p.assigned_contractor_id);
      const unassigned = potholes.length - assigned.length;
      y = addKeyValue(doc, y, "Assigned", String(assigned.length));
      y = addKeyValue(doc, y, "Unassigned", String(unassigned));
      y += 4;

      // Group by contractor
      const byContractor: Record<string, Pothole[]> = {};
      assigned.forEach((p) => {
        const name = p.assigned_contractor_name || p.assigned_contractor_id || "Unknown";
        if (!byContractor[name]) byContractor[name] = [];
        byContractor[name].push(p);
      });

      for (const [name, items] of Object.entries(byContractor).sort((a, b) => b[1].length - a[1].length)) {
        y = addSectionTitle(doc, y, `${name} (${items.length} potholes)`);
        autoTable(doc, {
          startY: y,
          head: [["#", "ID", "Highway", "Severity", "Status", "City", "District"]],
          body: items.map((p, i) => [
            String(i + 1),
            p.id.slice(0, 10),
            p.highway_ref || "N/A",
            p.severity,
            p.status,
            p.nearest_city || "N/A",
            p.district || "N/A",
          ]),
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      if (unassigned > 0) {
        y = addSectionTitle(doc, y, `Unassigned Potholes (${unassigned})`);
        const unItems = potholes.filter((p) => !p.assigned_contractor_name && !p.assigned_contractor_id);
        autoTable(doc, {
          startY: y,
          head: [["#", "ID", "Highway", "Severity", "Status", "City"]],
          body: unItems.map((p, i) => [
            String(i + 1),
            p.id.slice(0, 10),
            p.highway_ref || "N/A",
            p.severity,
            p.status,
            p.nearest_city || "N/A",
          ]),
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [120, 120, 120], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 14, right: 14 },
        });
      }
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

      for (const [status, items] of Object.entries(statusGroups)) {
        y = addSectionTitle(doc, y, `${status.toUpperCase()} (${items.length})`);
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
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }
      break;
    }
  }

  addPageFooter(doc);
  doc.save(`supath-${topic}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function MapPage() {
  const { t } = useI18n();
  const [layers, setLayers] = useState({
    nh: true,
    sh: true,
    potholes: true,
    heatmap: false,
    satellite: false,
    waterlogging: false,
    traffic: false,
  });

  const [selectedPothole, setSelectedPothole] = useState<Pothole | null>(null);
  const [allPotholes, setAllPotholes] = useState<Pothole[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Export menu
  const [exportOpen, setExportOpen] = useState(false);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Mobile layer controls toggle
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);

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

  const toggleLayer = (key: string) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };

  const handleSelectPothole = useCallback((pothole: Pothole | null) => {
    setSelectedPothole(pothole);
    setActionFeedback(null);
  }, []);

  const handlePotholesLoaded = useCallback((potholes: Pothole[]) => {
    setAllPotholes(potholes);
  }, []);

  const showFeedback = (type: "success" | "error", message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleMarkResolved = async () => {
    if (!selectedPothole) return;
    setActionLoading("resolve");
    try {
      const res = await api.updatePotholeStatus(selectedPothole.id, "resolved");
      setSelectedPothole((prev) =>
        prev ? { ...prev, status: res.new_status, is_resolved: res.is_resolved } : null
      );
      // @ts-expect-error exposed for parent interop
      window.__supathUpdatePothole?.({
        id: selectedPothole.id,
        status: res.new_status,
        is_resolved: res.is_resolved,
      });
      showFeedback("success", t.map.resolvedSuccess);
    } catch {
      showFeedback("error", "Failed to mark as resolved");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReopen = async () => {
    if (!selectedPothole) return;
    setActionLoading("reopen");
    try {
      const res = await api.updatePotholeStatus(selectedPothole.id, "detected");
      setSelectedPothole((prev) =>
        prev ? { ...prev, status: res.new_status, is_resolved: res.is_resolved } : null
      );
      // @ts-expect-error exposed for parent interop
      window.__supathUpdatePothole?.({
        id: selectedPothole.id,
        status: res.new_status,
        is_resolved: res.is_resolved,
      });
      showFeedback("success", t.map.reopened);
    } catch {
      showFeedback("error", "Failed to reopen pothole");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEscalate = async () => {
    if (!selectedPothole) return;
    setActionLoading("escalate");
    try {
      const res = await api.escalatePothole(selectedPothole.id);
      if (res.already_max) {
        showFeedback("error", t.map.alreadyMaxEscalation);
      } else {
        showFeedback(
          "success",
          `${t.map.escalatedSuccess} — ${res.escalation_label}`
        );
      }
    } catch {
      showFeedback("error", "Failed to escalate pothole");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportAll = () => {
    if (allPotholes.length === 0) return;
    setExportLoading(true);
    setExportOpen(false);
    setTimeout(() => {
      exportEntirePDF(allPotholes);
      setExportLoading(false);
    }, 100);
  };

  const handleExportTopic = (topic: TopicKey) => {
    if (allPotholes.length === 0) return;
    setExportLoading(true);
    setExportOpen(false);
    setTopicMenuOpen(false);
    setTimeout(() => {
      exportTopicPDF(allPotholes, topic);
      setExportLoading(false);
    }, 100);
  };

  const severityBg = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-700 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "medium":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "low":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="relative h-[calc(100vh-3.5rem)] -m-3 sm:-m-4 md:-m-6">
      {/* Full-bleed map */}
      <MapView
        layers={layers}
        selectedPotholeId={selectedPothole?.id}
        onSelectPothole={handleSelectPothole}
        onPotholesLoaded={handlePotholesLoaded}
      />

      {/* Export PDF dropdown — top-left, below zoom controls on mobile */}
      <div className="absolute top-4 left-12 sm:left-4 z-[1000]" ref={exportRef}>
        <button
          onClick={() => {
            setExportOpen((o) => !o);
            setTopicMenuOpen(false);
          }}
          disabled={allPotholes.length === 0 || exportLoading}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg text-xs font-medium bg-background/90 backdrop-blur-sm border shadow-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exportLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Export PDF</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        {exportOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg overflow-hidden">
            {/* Option 1: Export all */}
            <button
              onClick={handleExportAll}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs hover:bg-muted transition-colors text-left"
            >
              <FileDown className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <p className="font-medium">Export Entire Data</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  All {allPotholes.length} potholes with full details
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
                {(Object.keys(TOPIC_LABELS) as TopicKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => handleExportTopic(key)}
                    className="w-full flex items-center gap-3 px-6 py-2.5 text-xs hover:bg-muted transition-colors text-left"
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{TOPIC_LABELS[key]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overlay: layer controls + legend */}
      <div className="absolute top-4 right-4 z-[1000] w-44 sm:w-52 space-y-2">
        {/* Mobile toggle button — visible only on small screens when panel is closed */}
        <button
          onClick={() => setLayerPanelOpen((o) => !o)}
          className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-background/90 backdrop-blur-sm border shadow-md hover:bg-muted transition-colors ml-auto"
          aria-label="Toggle layer controls"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>{t.map.layers}</span>
          <ChevronDown
            className={`w-3 h-3 transition-transform ${layerPanelOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Layer Controls — always visible on md+, toggleable on mobile */}
        <div className={`space-y-2 ${layerPanelOpen ? "block" : "hidden"} md:block`}>
          <Card className="shadow-md border bg-background/90 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t.map.layers}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1.5">
              {[
                { key: "nh", label: t.map.nationalHighways, color: "bg-red-500" },
                { key: "sh", label: t.map.stateHighways, color: "bg-blue-500" },
                { key: "potholes", label: t.map.potholes, color: "bg-amber-500" },
                { key: "heatmap", label: t.map.heatmap, color: "bg-orange-400" },
                { key: "satellite", label: t.map.satellite, color: "bg-emerald-500" },
                { key: "waterlogging", label: t.map.waterlogging, color: "bg-cyan-500" },
                { key: "traffic", label: t.map.trafficAnomalies, color: "bg-purple-500" },
              ].map((layer) => (
                <label
                  key={layer.key}
                  className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={layers[layer.key as keyof typeof layers]}
                    onChange={() => toggleLayer(layer.key)}
                    className="rounded border-muted-foreground/30"
                  />
                  <span className={`w-2 h-2 rounded-full ${layer.color}`} />
                  <span className="text-xs">{layer.label}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card className="shadow-md border bg-background/90 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t.map.legend}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-red-500 rounded" />
                <span className="text-xs">{t.map.nationalHighways}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-blue-500 rounded" />
                <span className="text-xs">{t.map.stateHighways}</span>
              </div>
              <div className="space-y-1 pt-1">
                {[
                  { sev: "critical", color: "bg-red-600" },
                  { sev: "high", color: "bg-orange-500" },
                  { sev: "medium", color: "bg-amber-500" },
                  { sev: "low", color: "bg-green-500" },
                ].map((s) => (
                  <div key={s.sev} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                    <span className="text-xs">
                      {t.severity[s.sev as keyof typeof t.severity]}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pothole detail panel — full-width bottom sheet on mobile, side panel on md+ */}
      {selectedPothole && (
        <div className="absolute bottom-0 left-0 right-0 md:bottom-4 md:left-4 md:right-auto z-[1000] md:w-[22rem] max-h-[60vh] md:max-h-[calc(100vh-6rem)] overflow-y-auto rounded-t-xl md:rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Card className="shadow-lg border bg-background/95 backdrop-blur-sm rounded-b-none md:rounded-b-xl">
            {/* Header */}
            <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between gap-3 border-b">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-1.5 rounded-lg border shrink-0 ${severityBg(selectedPothole.severity)}`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold leading-tight truncate">
                    {selectedPothole.highway_ref || "Pothole"}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">
                    {selectedPothole.id.slice(0, 12)}...
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPothole(null)}
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1 transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </CardHeader>

            <CardContent className="px-4 py-3 space-y-3 text-xs">
              {/* Feedback toast */}
              {actionFeedback && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                    actionFeedback.type === "success"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {actionFeedback.type === "success" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  {actionFeedback.message}
                </div>
              )}

              {/* Severity + Status row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize border ${severityBg(
                    selectedPothole.severity
                  )}`}
                >
                  <Shield className="w-3 h-3" />
                  {selectedPothole.severity}
                  {selectedPothole.severity_score != null && (
                    <span className="opacity-70 ml-0.5">
                      ({selectedPothole.severity_score})
                    </span>
                  )}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize border ${
                    selectedPothole.is_resolved
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  <CircleDot className="w-3 h-3" />
                  {selectedPothole.status}
                </span>
              </div>

              {/* Admin Actions */}
              <div className="border-t pt-3">
                <p className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-2">
                  <Info className="w-3 h-3" />
                  {t.map.actions}
                </p>
                <div className="flex gap-2">
                  {selectedPothole.is_resolved ? (
                    <button
                      onClick={handleReopen}
                      disabled={actionLoading !== null}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {actionLoading === "reopen" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Radio className="w-3.5 h-3.5" />
                      )}
                      {t.map.reopen}
                    </button>
                  ) : (
                    <button
                      onClick={handleMarkResolved}
                      disabled={actionLoading !== null}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {actionLoading === "resolve" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      {t.map.markResolved}
                    </button>
                  )}
                  <button
                    onClick={handleEscalate}
                    disabled={actionLoading !== null}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {actionLoading === "escalate" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                    )}
                    {t.map.escalate}
                  </button>
                </div>
              </div>

              {/* Location */}
              <div className="border-t pt-3 space-y-1.5">
                <p className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1">
                  <MapPin className="w-3 h-3" />
                  Location
                </p>
                <div className="flex items-start gap-2">
                  <Navigation className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                  <span>
                    {selectedPothole.latitude.toFixed(6)}, {selectedPothole.longitude.toFixed(6)}
                  </span>
                </div>
                {selectedPothole.highway_ref && (
                  <div className="flex items-start gap-2">
                    <Hash className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                    <span>
                      {selectedPothole.highway_ref}
                      {selectedPothole.highway_type && (
                        <span className="text-muted-foreground"> ({selectedPothole.highway_type})</span>
                      )}
                    </span>
                  </div>
                )}
                {selectedPothole.nearest_city && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                    <span>{selectedPothole.nearest_city}</span>
                  </div>
                )}
                {selectedPothole.district && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                    <span>{selectedPothole.district}</span>
                  </div>
                )}
              </div>

              {/* Detection info */}
              <div className="border-t pt-3 space-y-1.5">
                <p className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1">
                  <Radio className="w-3 h-3" />
                  Detection
                </p>
                <div className="flex items-start gap-2">
                  <Info className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                  <span>
                    Source: <span className="font-medium">{selectedPothole.source}</span>
                  </span>
                </div>
                {selectedPothole.confidence_score != null && (
                  <div className="flex items-start gap-2">
                    <Shield className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                    <span>
                      Confidence:{" "}
                      <span className="font-medium">
                        {(selectedPothole.confidence_score * 100).toFixed(1)}%
                      </span>
                    </span>
                  </div>
                )}
                {selectedPothole.detected_at && (
                  <div className="flex items-start gap-2">
                    <Calendar className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                    <span>
                      Detected:{" "}
                      <span className="font-medium">
                        {new Date(selectedPothole.detected_at).toLocaleString()}
                      </span>
                    </span>
                  </div>
                )}
                {selectedPothole.resolved_at && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span>
                      Resolved:{" "}
                      <span className="font-medium">
                        {new Date(selectedPothole.resolved_at).toLocaleString()}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedPothole.description && (
                <div className="border-t pt-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1">
                    <FileText className="w-3 h-3" />
                    Description
                  </p>
                  <p className="text-foreground leading-relaxed pl-[18px]">
                    {selectedPothole.description}
                  </p>
                </div>
              )}

              {/* Contractor */}
              {(selectedPothole.assigned_contractor_id ||
                selectedPothole.assigned_contractor_name) && (
                <div className="border-t pt-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1">
                    <User className="w-3 h-3" />
                    Assigned Contractor
                  </p>
                  {selectedPothole.assigned_contractor_name && (
                    <div className="flex items-start gap-2">
                      <User className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">
                        {selectedPothole.assigned_contractor_name}
                      </span>
                    </div>
                  )}
                  {selectedPothole.assigned_contractor_id && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <Hash className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="font-mono text-[10px]">
                        {selectedPothole.assigned_contractor_id}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Image */}
              {selectedPothole.image_url && (
                <div className="border-t pt-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1">
                    <ImageIcon className="w-3 h-3" />
                    Image
                  </p>
                  <img
                    src={selectedPothole.image_url}
                    alt="Pothole"
                    className="w-full rounded-lg border object-cover max-h-40"
                  />
                </div>
              )}

              {/* Detection metadata */}
              {selectedPothole.detection_metadata &&
                Object.keys(selectedPothole.detection_metadata).length > 0 && (
                  <div className="border-t pt-3 space-y-1.5">
                    <p className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1">
                      <Info className="w-3 h-3" />
                      Detection Metadata
                    </p>
                    {Object.entries(selectedPothole.detection_metadata).map(
                      ([key, value]) => (
                        <div key={key} className="flex items-start gap-2 pl-[18px]">
                          <span className="text-muted-foreground">{key}:</span>{" "}
                          <span className="font-medium">{String(value)}</span>
                        </div>
                      )
                    )}
                  </div>
                )}

              {/* Google Maps link */}
              <div className="border-t pt-3 pb-1">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPothole.latitude},${selectedPothole.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View in Google Maps
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
