"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  HardHat,
  AlertTriangle,
  Search,
  Star,
  CheckCircle2,
} from "lucide-react";
import type { Contractor } from "@/lib/types";

function getReputationColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

export default function ContractorsPage() {
  const { t } = useI18n();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .getContractors()
      .then((data: Contractor[] | { contractors: Contractor[] }) => {
        setContractors(Array.isArray(data) ? data : data.contractors || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-semibold">{t.contractors.title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t.contractors.subtitle}
        </p>
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
      <div className="flex items-center gap-3">
        <div className="relative w-64">
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
                  <TableHead className="text-center">{t.contractors.flagged}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
