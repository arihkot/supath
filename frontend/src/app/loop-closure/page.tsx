"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCcw,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type { EscalationSummary, PendingVerification, EscalationResult, EscalationConfig } from "@/lib/types";

const severityColor: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

export default function LoopClosurePage() {
  const { t } = useI18n();
  const lc = t.loopClosure;

  const [summary, setSummary] = useState<EscalationSummary | null>(null);
  const [pending, setPending] = useState<PendingVerification[]>([]);
  const [escalationConfig, setEscalationConfig] = useState<EscalationConfig | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<EscalationResult | null>(null);
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const [sumData, pendData, configData] = await Promise.all([
        api.getEscalationSummary(),
        api.getPendingVerifications(7),
        api.getEscalationConfig(),
      ]);
      setSummary(sumData);
      setPending(pendData.potholes || []);
      setEscalationConfig(configData);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunEscalation = async () => {
    setRunning(true);
    try {
      const result = await api.triggerEscalation();
      setLastResult(result);
      await loadData();
    } finally {
      setRunning(false);
    }
  };

  const handleVerify = async (potholeId: string, stillDetected: boolean) => {
    setVerifying((prev) => ({ ...prev, [potholeId]: true }));
    try {
      await api.verifyResolution(potholeId, stillDetected, stillDetected ? 0.85 : 0);
      setPending((prev) => prev.filter((p) => p.id !== potholeId));
    } finally {
      setVerifying((prev) => ({ ...prev, [potholeId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{lc.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{lc.subtitle}</p>
        </div>
        <Button onClick={handleRunEscalation} disabled={running} className="gap-2 w-full sm:w-auto">
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCcw className="w-4 h-4" />
          )}
          {running ? lc.running : lc.runEscalation}
        </Button>
      </div>

      {/* Last run result banner */}
      {lastResult && (
        <div className="flex items-start gap-3 px-3 py-3 sm:px-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            Checked <strong>{lastResult.checked}</strong> complaints — escalated{" "}
            <strong>{lastResult.escalated}</strong>.
          </span>
          <button
            className="ml-auto text-emerald-600 hover:text-emerald-800"
            onClick={() => setLastResult(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Escalation Ladder */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{lc.escalationLadder}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {(escalationConfig?.ladder ?? []).map((step, i) => {
                const count =
                  summary?.escalation_breakdown?.[step.level]?.count ?? 0;
                return (
                  <div key={step.level} className="flex items-start gap-3 relative">
                    {/* Connector line */}
                    {i < (escalationConfig?.ladder ?? []).length - 1 && (
                      <div className="absolute left-[13px] top-7 w-0.5 h-6 bg-border" />
                    )}
                    {/* Dot */}
                    <div
                      className={`mt-1 w-6 h-6 rounded-full ${step.color} flex items-center justify-center shrink-0 z-10`}
                    >
                      <span className="text-[9px] font-bold text-white">{i + 1}</span>
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">{step.label}</p>
                        {count > 0 && (
                          <Badge className="text-[10px] h-4 px-1.5 bg-slate-100 text-slate-700 border-slate-200">
                            {count}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {step.days === 0 ? "Immediate" : `After ${step.days} ${lc.daysThreshold}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Escalation Summary cards */}
          {!loadingSummary && summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(escalationConfig?.ladder ?? []).map((step) => {
                const data = summary.escalation_breakdown?.[step.level];
                const count = data?.count ?? 0;
                return (
                  <Card key={step.level} className="py-3">
                    <CardContent className="px-4 py-0">
          <p className="text-lg sm:text-xl font-semibold">{count}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                        {step.label}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {loadingSummary && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Pending Verifications */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {lc.pendingVerifications}
                </CardTitle>
                <Badge className="text-[10px] h-5 bg-amber-100 text-amber-700 border-amber-200">
                  {pending.length} pending
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <ShieldCheck className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">{lc.noPending}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <div className="space-y-2 min-w-[560px]">
                  <div className="grid grid-cols-[1fr_80px_80px_90px_160px] gap-2 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border-b">
                    <span>{lc.highway}</span>
                    <span>{lc.severity}</span>
                    <span>{lc.daysSince}</span>
                    <span>{lc.resolvedAt}</span>
                    <span>{lc.actions}</span>
                  </div>
                  {pending.map((p: PendingVerification) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-[1fr_80px_80px_90px_160px] gap-2 items-center px-2 py-2 rounded-md hover:bg-muted/40 text-xs"
                    >
                      <span className="font-medium truncate">
                        {p.highway_ref || "Unknown"}
                      </span>
                      <Badge
                        className={`text-[10px] h-5 px-1.5 ${
                          severityColor[p.severity] || ""
                        }`}
                      >
                        {t.severity[p.severity as keyof typeof t.severity] || p.severity}
                      </Badge>
                      <span className="text-muted-foreground">{p.days_since_resolution}d</span>
                      <span className="text-muted-foreground text-[10px]">
                        {p.resolved_at
                          ? new Date(p.resolved_at).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "—"}
                      </span>
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] text-green-700 border-green-200 hover:bg-green-50 w-full justify-start"
                          disabled={verifying[p.id]}
                          onClick={() => handleVerify(p.id, false)}
                        >
                          {verifying[p.id] ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <ShieldCheck className="w-3 h-3 mr-1" />
                          )}
                          {lc.verifyFixed}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] text-red-700 border-red-200 hover:bg-red-50 w-full justify-start"
                          disabled={verifying[p.id]}
                          onClick={() => handleVerify(p.id, true)}
                        >
                          <ShieldAlert className="w-3 h-3 mr-1" />
                          {lc.markRedetected}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
