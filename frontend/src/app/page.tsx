"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { type DashboardStats, type Pothole } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  MapPin,
  Clock,
  ArrowRight,
} from "lucide-react";

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

export default function DashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDashboardStats()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-semibold">{t.dashboard.title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t.dashboard.subtitle}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((stat, i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Severity Distribution + Top Highways */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Severity Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t.dashboard.severityDistribution}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.severity_counts).map(([sev, count]) => {
                const total = Object.values(data.severity_counts).reduce(
                  (a, b) => a + b,
                  0
                );
                const pct = total > 0 ? (count / total) * 100 : 0;
                const sevLabel = t.severity[sev as keyof typeof t.severity] || sev;

                return (
                  <div key={sev} className="flex items-center gap-3">
                    <div className="w-16 text-xs text-muted-foreground">
                      {sevLabel}
                    </div>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${severityColors[sev] || "bg-gray-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-10 text-xs text-right font-medium">
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

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
            <div className="space-y-2">
              {data.top_highways.slice(0, 8).map((hw, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-muted last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${hw.highway.startsWith("NH") ? "bg-red-500" : "bg-blue-500"}`}
                    />
                    <span className="text-sm">{hw.highway}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {hw.count}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Detections */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
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
          <div className="space-y-2">
            {data.recent_detections.slice(0, 8).map((det: Pothole, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-muted last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    className={`text-[10px] ${severityBadgeVariants[det.severity] || ""}`}
                  >
                    {t.severity[det.severity as keyof typeof t.severity] || det.severity}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">
                      {det.highway_ref || "Unknown Highway"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {det.nearest_city || ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-[10px]">
                    {t.source[det.source as keyof typeof t.source] || det.source}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {det.detected_at
                      ? new Date(det.detected_at).toLocaleDateString("en-IN")
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
