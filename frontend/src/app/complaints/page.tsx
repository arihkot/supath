"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ArrowUpCircle,
  Eye,
} from "lucide-react";

import type { Complaint } from "@/lib/types";

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

export default function ComplaintsPage() {
  const { t } = useI18n();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchComplaints() {
      setLoading(true);
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (status !== "all") params.status = status;

      try {
        const data = await api.getComplaints(params);
        const list = data.complaints || [];
        setComplaints(Array.isArray(list) ? list : []);
        setTotal(data.total || list.length);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchComplaints();
  }, [page, status]);

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

  // Summary counts
  const statusCounts = complaints.reduce(
    (acc: Record<string, number>, c: Complaint) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-semibold">{t.complaints.title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t.complaints.subtitle}
        </p>
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
      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={(v) => { if (v) { setStatus(v); setPage(0); } }}>
          <SelectTrigger className="w-44 h-8 text-sm">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaints.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                      </TableRow>
                    );
                  })
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
