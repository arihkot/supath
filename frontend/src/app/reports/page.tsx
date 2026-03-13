"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { type Pothole } from "@/lib/types";
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
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  MapPin,
  Eye,
} from "lucide-react";

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

export default function ReportsPage() {
  const { t } = useI18n();
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchPotholes() {
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
    }
    fetchPotholes();
  }, [page, severity, status]);

  const filtered = search
    ? potholes.filter(
        (p) =>
          (p.highway_ref || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.nearest_city || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.district || "").toLowerCase().includes(search.toLowerCase())
      )
    : potholes;

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
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t.reports.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t.reports.subtitle}
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-1.5" />
          {t.reports.export}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 h-8 text-sm"
            />
            <Select value={severity} onValueChange={(v) => { if (v) { setSeverity(v); setPage(0); } }}>
              <SelectTrigger className="w-36 h-8 text-sm">
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
              <SelectTrigger className="w-40 h-8 text-sm">
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
                  <TableHead className="w-16">{t.reports.actions}</TableHead>
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
                    <TableRow key={p.id}>
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
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
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
    </div>
  );
}
