"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  HardHat,
  AlertTriangle,
  Search,
  Star,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Download,
  ChevronDown,
  FileDown,
  Layers,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { Contractor } from "@/lib/types";
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

function getReputationColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

interface ContractorFormState {
  name: string;
  registration_id: string;
  district: string;
  contact_phone: string;
  total_contracts: string;
  completed_contracts: string;
  avg_repair_days: string;
  reputation_score: string;
  road_quality_score: string;
  flagged: boolean;
  flag_reason: string;
}

const emptyForm = (): ContractorFormState => ({
  name: "",
  registration_id: "",
  district: "",
  contact_phone: "",
  total_contracts: "0",
  completed_contracts: "0",
  avg_repair_days: "0",
  reputation_score: "50",
  road_quality_score: "50",
  flagged: false,
  flag_reason: "",
});

function contractorToForm(c: Contractor): ContractorFormState {
  return {
    name: c.name,
    registration_id: c.registration_id,
    district: c.district || "",
    contact_phone: c.contact_phone || "",
    total_contracts: String(c.total_contracts),
    completed_contracts: String(c.completed_contracts),
    avg_repair_days: String(c.avg_repair_days ?? 0),
    reputation_score: String(c.reputation_score),
    road_quality_score: String(c.road_quality_score),
    flagged: c.flagged,
    flag_reason: c.flag_reason || "",
  };
}

// ---------------------------------------------------------------------------
// PDF generation helpers
// ---------------------------------------------------------------------------

type ContractorsTopicKey = "overview" | "performance" | "flagged" | "assignments";

const CONTRACTORS_TOPIC_LABELS: Record<ContractorsTopicKey, string> = {
  overview: "Overview Summary",
  performance: "Performance Analysis",
  flagged: "Flagged Contractors",
  assignments: "Assignment Details",
};

function exportContractorsEntirePDF(contractors: Contractor[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  let y = addReportHeader(
    doc,
    "Contractors — Complete Data Export",
    `Total records: ${contractors.length}`
  );

  // Summary stats
  y = addSectionTitle(doc, y, "Summary Statistics");
  const total = contractors.length;
  const avgReputation =
    total > 0
      ? (contractors.reduce((sum, c) => sum + (c.reputation_score || 0), 0) / total).toFixed(1)
      : "0";
  const flaggedCount = contractors.filter((c) => c.flagged).length;
  const highPerformers = contractors.filter((c) => (c.reputation_score || 0) >= 80).length;

  y = addKeyValue(doc, y, "Total Contractors", String(total));
  y = addKeyValue(doc, y, "Avg Reputation", avgReputation);
  y = addKeyValue(doc, y, "Flagged", String(flaggedCount));
  y = addKeyValue(doc, y, "High Performers (≥80)", String(highPerformers));
  y += 4;

  // Full data table
  y = addSectionTitle(doc, y, "Complete Contractor Records");
  autoTable(doc, {
    startY: y,
    head: [
      [
        "#",
        "Name",
        "Reg ID",
        "District",
        "Phone",
        "Contracts",
        "Completed",
        "Completion %",
        "Avg Days",
        "Reputation",
        "Quality",
        "Highways",
        "Potholes",
        "Flagged",
        "Flag Reason",
      ],
    ],
    body: contractors.map((c, i) => [
      String(i + 1),
      c.name,
      c.registration_id,
      c.district || "N/A",
      c.contact_phone || "N/A",
      String(c.total_contracts),
      String(c.completed_contracts),
      c.total_contracts > 0
        ? `${((c.completed_contracts / c.total_contracts) * 100).toFixed(1)}%`
        : "N/A",
      c.avg_repair_days != null ? c.avg_repair_days.toFixed(1) : "N/A",
      c.reputation_score?.toFixed(1) ?? "N/A",
      c.road_quality_score?.toFixed(1) ?? "N/A",
      String(c.assigned_highways ?? 0),
      String(c.assigned_potholes ?? 0),
      c.flagged ? "Yes" : "No",
      c.flag_reason || "—",
    ]),
    styles: { fontSize: 6, cellPadding: 1.5, overflow: "linebreak" as const },
    headStyles: { ...TABLE_HEAD_STYLE, fontSize: 6.5 },
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: { left: 6, right: 6 },
    columnStyles: {
      0: { cellWidth: 8 },
    },
  });

  savePDF(doc, "contractors-complete");
}

function exportContractorsTopicPDF(contractors: Contractor[], topic: ContractorsTopicKey) {
  const doc = new jsPDF();
  const label = CONTRACTORS_TOPIC_LABELS[topic];
  let y = addReportHeader(doc, `Contractors — ${label}`, `Records: ${contractors.length}`);

  switch (topic) {
    case "overview": {
      y = addSectionTitle(doc, y, "Overview Summary");
      const total = contractors.length;
      const avgReputation =
        total > 0
          ? (contractors.reduce((sum, c) => sum + (c.reputation_score || 0), 0) / total).toFixed(1)
          : "0";
      const avgQuality =
        total > 0
          ? (contractors.reduce((sum, c) => sum + (c.road_quality_score || 0), 0) / total).toFixed(1)
          : "0";
      const flaggedCount = contractors.filter((c) => c.flagged).length;
      const highPerformers = contractors.filter((c) => (c.reputation_score || 0) >= 80).length;

      y = addKeyValue(doc, y, "Total Contractors", String(total));
      y = addKeyValue(doc, y, "Avg Reputation", avgReputation);
      y = addKeyValue(doc, y, "Avg Quality", avgQuality);
      y = addKeyValue(doc, y, "Flagged", String(flaggedCount));
      y = addKeyValue(doc, y, "High Performers (≥80)", String(highPerformers));
      y += 6;

      y = addSectionTitle(doc, y, "All Contractors — Overview");
      autoTable(doc, {
        startY: y,
        head: [["Name", "Reg ID", "District", "Contracts", "Completed", "Reputation", "Quality"]],
        body: contractors.map((c) => [
          c.name,
          c.registration_id,
          c.district || "N/A",
          String(c.total_contracts),
          String(c.completed_contracts),
          c.reputation_score?.toFixed(1) ?? "N/A",
          c.road_quality_score?.toFixed(1) ?? "N/A",
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }

    case "performance": {
      const sorted = [...contractors].sort(
        (a, b) => (b.reputation_score || 0) - (a.reputation_score || 0)
      );
      y = addSectionTitle(doc, y, "Performance Analysis");

      const topPerformers = sorted.filter((c) => (c.reputation_score || 0) >= 80).length;
      const bottomPerformers = sorted.filter((c) => (c.reputation_score || 0) < 60).length;

      y = addKeyValue(doc, y, "Top Performers (≥80)", String(topPerformers));
      y = addKeyValue(doc, y, "Bottom Performers (<60)", String(bottomPerformers));
      y += 6;

      y = addSectionTitle(doc, y, "Contractors Ranked by Reputation");
      autoTable(doc, {
        startY: y,
        head: [["Name", "Reputation", "Quality", "Contracts", "Completed", "Completion %", "Avg Days"]],
        body: sorted.map((c) => [
          c.name,
          c.reputation_score?.toFixed(1) ?? "N/A",
          c.road_quality_score?.toFixed(1) ?? "N/A",
          String(c.total_contracts),
          String(c.completed_contracts),
          c.total_contracts > 0
            ? `${((c.completed_contracts / c.total_contracts) * 100).toFixed(1)}%`
            : "N/A",
          c.avg_repair_days != null ? c.avg_repair_days.toFixed(1) : "N/A",
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }

    case "flagged": {
      const flagged = contractors.filter((c) => c.flagged);
      y = addSectionTitle(doc, y, `Flagged Contractors (${flagged.length})`);

      if (flagged.length === 0) {
        y = addKeyValue(doc, y, "Status", "No flagged contractors found");
      } else {
        autoTable(doc, {
          startY: y,
          head: [["Name", "Reg ID", "District", "Reputation", "Quality", "Flag Reason"]],
          body: flagged.map((c) => [
            c.name,
            c.registration_id,
            c.district || "N/A",
            c.reputation_score?.toFixed(1) ?? "N/A",
            c.road_quality_score?.toFixed(1) ?? "N/A",
            c.flag_reason || "Flagged",
          ]),
          styles: TABLE_BODY_STYLE,
          headStyles: { ...TABLE_HEAD_STYLE, fillColor: [220, 38, 38] as [number, number, number] },
          alternateRowStyles: TABLE_ALT_ROW_STYLE,
          margin: TABLE_MARGIN,
        });
      }
      break;
    }

    case "assignments": {
      const sorted = [...contractors].sort(
        (a, b) => (b.assigned_potholes ?? 0) - (a.assigned_potholes ?? 0)
      );
      y = addSectionTitle(doc, y, "Assignment Details");
      autoTable(doc, {
        startY: y,
        head: [["Name", "District", "Assigned Highways", "Assigned Potholes", "Reputation", "Quality"]],
        body: sorted.map((c) => [
          c.name,
          c.district || "N/A",
          String(c.assigned_highways ?? 0),
          String(c.assigned_potholes ?? 0),
          c.reputation_score?.toFixed(1) ?? "N/A",
          c.road_quality_score?.toFixed(1) ?? "N/A",
        ]),
        styles: TABLE_BODY_STYLE,
        headStyles: TABLE_HEAD_STYLE,
        alternateRowStyles: TABLE_ALT_ROW_STYLE,
        margin: TABLE_MARGIN,
      });
      break;
    }
  }

  savePDF(doc, `contractors-${topic}`);
}

export default function ContractorsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ContractorFormState>(emptyForm());
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editContractor, setEditContractor] = useState<Contractor | null>(null);
  const [editForm, setEditForm] = useState<ContractorFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Export PDF menu state
  const [exportOpen, setExportOpen] = useState(false);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const fetchContractors = useCallback(() => {
    setLoading(true);
    api
      .getContractors()
      .then((data: Contractor[] | { contractors: Contractor[] }) => {
        setContractors(Array.isArray(data) ? data : data.contractors || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchContractors();
  }, [fetchContractors]);

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
    ? contractors.filter(
        (c: Contractor) =>
          (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
          (c.district || "").toLowerCase().includes(search.toLowerCase()) ||
          (c.registration_id || "").toLowerCase().includes(search.toLowerCase())
      )
    : contractors;

  const flaggedCount = contractors.filter((c: Contractor) => c.flagged).length;
  const avgReputation =
    contractors.length > 0
      ? (
          contractors.reduce((sum: number, c: Contractor) => sum + (c.reputation_score || 0), 0) /
          contractors.length
        ).toFixed(1)
      : "0";

  const handleExportAll = () => {
    if (contractors.length === 0) return;
    setExportLoading(true);
    setExportOpen(false);
    setTimeout(() => {
      exportContractorsEntirePDF(contractors);
      setExportLoading(false);
    }, 100);
  };

  const handleExportTopic = (topic: ContractorsTopicKey) => {
    if (contractors.length === 0) return;
    setExportLoading(true);
    setExportOpen(false);
    setTopicMenuOpen(false);
    setTimeout(() => {
      exportContractorsTopicPDF(contractors, topic);
      setExportLoading(false);
    }, 100);
  };

  const openEdit = (c: Contractor) => {
    setEditContractor(c);
    setEditForm(contractorToForm(c));
  };

  const handleDeleteContractor = async (c: Contractor) => {
    if (!confirm(`Delete contractor "${c.name}"? Assigned potholes, complaints, and highways will be unlinked.`)) return;
    try {
      await api.deleteContractor(c.id);
      toast.success("Contractor deleted");
      fetchContractors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.registration_id.trim()) {
      toast.error("Name and Registration ID are required");
      return;
    }
    setCreating(true);
    try {
      await api.createContractor({
        name: createForm.name.trim(),
        registration_id: createForm.registration_id.trim(),
        district: createForm.district || undefined,
        contact_phone: createForm.contact_phone || undefined,
        total_contracts: parseInt(createForm.total_contracts) || 0,
        completed_contracts: parseInt(createForm.completed_contracts) || 0,
        avg_repair_days: parseFloat(createForm.avg_repair_days) || 0,
        reputation_score: parseFloat(createForm.reputation_score) || 50,
        road_quality_score: parseFloat(createForm.road_quality_score) || 50,
        flagged: createForm.flagged,
        flag_reason: createForm.flag_reason || undefined,
      });
      toast.success("Contractor created");
      setCreateOpen(false);
      setCreateForm(emptyForm());
      fetchContractors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create contractor");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!editContractor) return;
    setSaving(true);
    try {
      await api.updateContractor(editContractor.id, {
        name: editForm.name || undefined,
        district: editForm.district || undefined,
        contact_phone: editForm.contact_phone || undefined,
        total_contracts: parseInt(editForm.total_contracts) || undefined,
        completed_contracts: parseInt(editForm.completed_contracts) || undefined,
        avg_repair_days: parseFloat(editForm.avg_repair_days) || undefined,
        reputation_score: parseFloat(editForm.reputation_score) || undefined,
        road_quality_score: parseFloat(editForm.road_quality_score) || undefined,
        flagged: editForm.flagged,
        flag_reason: editForm.flag_reason || undefined,
      });
      toast.success("Contractor updated");
      setEditContractor(null);
      fetchContractors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update contractor");
    } finally {
      setSaving(false);
    }
  };

  // Shared form fields render
  const renderFormFields = (
    form: ContractorFormState,
    setForm: React.Dispatch<React.SetStateAction<ContractorFormState>>,
    hideRegId = false
  ) => (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Name *</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        {!hideRegId && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Registration ID *</label>
            <Input
              value={form.registration_id}
              onChange={(e) => setForm((f) => ({ ...f, registration_id: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">District</label>
          <Input
            value={form.district}
            onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Contact Phone</label>
          <Input
            value={form.contact_phone}
            onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Total Contracts</label>
          <Input
            type="number"
            value={form.total_contracts}
            onChange={(e) => setForm((f) => ({ ...f, total_contracts: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Completed</label>
          <Input
            type="number"
            value={form.completed_contracts}
            onChange={(e) => setForm((f) => ({ ...f, completed_contracts: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Avg Days</label>
          <Input
            type="number"
            value={form.avg_repair_days}
            onChange={(e) => setForm((f) => ({ ...f, avg_repair_days: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Reputation (0–100)</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.reputation_score}
            onChange={(e) => setForm((f) => ({ ...f, reputation_score: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Road Quality (0–100)</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.road_quality_score}
            onChange={(e) => setForm((f) => ({ ...f, road_quality_score: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="flagged-check"
          checked={form.flagged}
          onChange={(e) => setForm((f) => ({ ...f, flagged: e.target.checked }))}
          className="h-3.5 w-3.5"
        />
        <label htmlFor="flagged-check" className="text-xs font-medium text-muted-foreground">
          Flagged
        </label>
      </div>
      {form.flagged && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Flag Reason</label>
          <Input
            value={form.flag_reason}
            onChange={(e) => setForm((f) => ({ ...f, flag_reason: e.target.value }))}
            className="h-8 text-sm"
            placeholder="Reason for flagging"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{t.contractors.title}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t.contractors.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start shrink-0">
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => {
                setExportOpen((o) => !o);
                setTopicMenuOpen(false);
              }}
              disabled={contractors.length === 0 || exportLoading}
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
                      All {contractors.length} contractors with full details
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
                    {(Object.keys(CONTRACTORS_TOPIC_LABELS) as ContractorsTopicKey[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => handleExportTopic(key)}
                        className="w-full flex items-center gap-3 px-6 py-2.5 text-xs hover:bg-muted transition-colors text-left"
                      >
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{CONTRACTORS_TOPIC_LABELS[key]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => { setCreateForm(emptyForm()); setCreateOpen(true); }} className="shrink-0">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Contractor
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="py-0">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Total Contractors
                </p>
                <p className="text-2xl font-bold">{contractors.length}</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <HardHat className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Avg {t.contractors.reputation}
                </p>
                <p className="text-2xl font-bold">{avgReputation}</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-50">
                <Star className="w-4 h-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t.contractors.flagged}
                </p>
                <p className="text-2xl font-bold">{flaggedCount}</p>
              </div>
              <div className="p-2 rounded-lg bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  High Performers
                </p>
                <p className="text-2xl font-bold">
                  {contractors.filter((c: Contractor) => (c.reputation_score || 0) >= 80).length}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-green-50">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
          <Input
            placeholder={t.common.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} {t.common.results}
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
                  <TableHead>{t.contractors.name}</TableHead>
                  <TableHead>{t.contractors.regId}</TableHead>
                  <TableHead>{t.contractors.district}</TableHead>
                  <TableHead className="text-center">{t.contractors.contracts}</TableHead>
                  <TableHead className="text-center">{t.contractors.completed}</TableHead>
                  <TableHead className="text-center">{t.contractors.avgDays}</TableHead>
                  <TableHead>{t.contractors.reputation}</TableHead>
                  <TableHead>{t.contractors.roadQuality}</TableHead>
                  <TableHead className="text-center">{t.contractors.assignedHighways}</TableHead>
                  <TableHead className="text-center">{t.contractors.assignedPotholes}</TableHead>
                  <TableHead className="text-center">{t.contractors.flagged}</TableHead>
                  {isAdmin && <TableHead className="w-16">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 12 : 11} className="text-center py-8 text-muted-foreground">
                      {t.common.noResults}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c: Contractor) => (
                    <TableRow key={c.id} className={c.flagged ? "bg-red-50/50" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <HardHat className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.registration_id}
                      </TableCell>
                      <TableCell className="text-sm">{c.district || "—"}</TableCell>
                      <TableCell className="text-center text-sm">
                        {c.total_contracts}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {c.completed_contracts}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {c.avg_repair_days?.toFixed(1)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress
                            value={c.reputation_score}
                            className="h-1.5 flex-1"
                          />
                          <span
                            className={`text-xs font-medium ${getReputationColor(c.reputation_score)}`}
                          >
                            {c.reputation_score?.toFixed(1)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress
                            value={c.road_quality_score}
                            className="h-1.5 flex-1"
                          />
                          <span className="text-xs font-medium">
                            {c.road_quality_score?.toFixed(1)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {c.assigned_highways ?? 0}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {c.assigned_potholes ?? 0}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.flagged ? (
                          <div className="flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-[10px] text-red-600 font-medium">
                              {c.flag_reason || "Flagged"}
                            </span>
                          </div>
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" />
                        )}
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
                              onClick={() => handleDeleteContractor(c)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Contractor</DialogTitle>
          </DialogHeader>
          {renderFormFields(createForm, setCreateForm)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editContractor !== null} onOpenChange={(open) => { if (!open) setEditContractor(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Contractor</DialogTitle>
          </DialogHeader>
          {renderFormFields(editForm, setEditForm, true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditContractor(null)} disabled={saving}>
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
