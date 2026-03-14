"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { type NewsMention, type TrafficAnomaly, type WaterloggingZone } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Newspaper,
  Radio,
  Car,
  Satellite,
  Droplets,
  Camera,
  Truck,
  MapPin,
  TrendingUp,
  Clock,
  Download,
  ChevronDown,
  FileDown,
  Layers,
  FileText,
  Loader2,
} from "lucide-react";
import {
  jsPDF,
  autoTable,
  addReportHeader,
  addSectionTitle,
  addKeyValue,
  savePDF,
  getLastTableY,
  fmtDateShort,
  TABLE_HEAD_STYLE,
  TABLE_ALT_ROW_STYLE,
  TABLE_MARGIN,
  TABLE_BODY_STYLE,
  TABLE_COMPACT_STYLE,
} from "@/lib/pdf-export";

const riskColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

// ---------------------------------------------------------------------------
// PDF Export – Data Sources
// ---------------------------------------------------------------------------

type SourcesTopicKey = "source_summary" | "news" | "traffic" | "waterlogging";

const SOURCES_TOPIC_LABELS: Record<SourcesTopicKey, string> = {
  source_summary: "Source Summary",
  news: "News Mentions",
  traffic: "Traffic Anomalies",
  waterlogging: "Waterlogging Zones",
};

interface SourcesExportData {
  news: NewsMention[];
  traffic: TrafficAnomaly[];
  waterlogging: WaterloggingZone[];
  sourceBreakdown: Record<string, number>;
}

function buildSourceSummarySection(
  doc: jsPDF,
  y: number,
  data: SourcesExportData
): number {
  y = addSectionTitle(doc, y, "Source Summary");
  const totalDetections =
    Object.values(data.sourceBreakdown).reduce((a, b) => a + b, 0) +
    data.news.length +
    data.traffic.length +
    data.waterlogging.length;
  y = addKeyValue(doc, y, "Total Detections", String(totalDetections));
  y = addKeyValue(doc, y, "News Mentions", String(data.news.length));
  y = addKeyValue(doc, y, "Traffic Anomalies", String(data.traffic.length));
  y = addKeyValue(doc, y, "Waterlogging Zones", String(data.waterlogging.length));
  y += 2;

  // Source breakdown table
  const rows: string[][] = [
    ["News", String((data.sourceBreakdown["news"] || 0) + data.news.length)],
    ["Citizen Reports", String(data.sourceBreakdown["citizen_report"] || 0)],
    [
      "Traffic Anomalies",
      String(
        (data.sourceBreakdown["traffic_anomaly"] || 0) + data.traffic.length
      ),
    ],
    ["CV Detection / Satellite", String(data.sourceBreakdown["cv_detection"] || 0)],
    ["Waterlogging Zones", String(data.waterlogging.length)],
    ["Dashcam", String(data.sourceBreakdown["dashcam"] || 0)],
    ["Cleaning Vehicle", String(data.sourceBreakdown["cleaning_vehicle"] || 0)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Source", "Count"]],
    body: rows,
    styles: TABLE_BODY_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    margin: TABLE_MARGIN,
  });
  y = getLastTableY(doc) + 10;
  return y;
}

function buildNewsSection(
  doc: jsPDF,
  y: number,
  news: NewsMention[]
): number {
  y = addSectionTitle(doc, y, "News Mentions");
  y = addKeyValue(doc, y, "Total Articles", String(news.length));

  // Severity keyword breakdown
  const sevMap: Record<string, number> = {};
  for (const n of news) {
    const k = n.severity_keyword || "unknown";
    sevMap[k] = (sevMap[k] || 0) + 1;
  }
  for (const [sev, count] of Object.entries(sevMap)) {
    y = addKeyValue(doc, y, `  ${sev}`, String(count));
  }
  y += 4;

  if (news.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Title", "Source", "Severity", "Sentiment", "Location", "Published"]],
      body: news.map((n) => [
        n.title || "Untitled",
        n.source_name || n.source_type,
        n.severity_keyword || "—",
        n.sentiment_score != null ? n.sentiment_score.toFixed(2) : "—",
        n.extracted_location || "—",
        fmtDateShort(n.published_at),
      ]),
      styles: TABLE_COMPACT_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      margin: TABLE_MARGIN,
    });
    y = getLastTableY(doc) + 10;
  }
  return y;
}

function buildTrafficSection(
  doc: jsPDF,
  y: number,
  traffic: TrafficAnomaly[]
): number {
  y = addSectionTitle(doc, y, "Traffic Anomalies");
  y = addKeyValue(doc, y, "Total Anomalies", String(traffic.length));

  // Severity breakdown
  const sevMap: Record<string, number> = {};
  for (const t of traffic) {
    const k = t.severity || "unknown";
    sevMap[k] = (sevMap[k] || 0) + 1;
  }
  for (const [sev, count] of Object.entries(sevMap)) {
    y = addKeyValue(doc, y, `  ${sev}`, String(count));
  }
  y += 4;

  if (traffic.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Type", "Highway", "Location", "Severity", "Avg Speed", "Expected Speed", "Delay", "Detected"]],
      body: traffic.map((a) => [
        a.anomaly_type || "—",
        a.highway_ref || "—",
        a.location || "—",
        a.severity || "—",
        a.avg_speed_kmph != null ? `${a.avg_speed_kmph} km/h` : "—",
        a.expected_speed_kmph != null ? `${a.expected_speed_kmph} km/h` : "—",
        a.delay_factor != null ? `${a.delay_factor}x` : "—",
        fmtDateShort(a.detected_at),
      ]),
      styles: TABLE_COMPACT_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      margin: TABLE_MARGIN,
    });
    y = getLastTableY(doc) + 10;
  }
  return y;
}

function buildWaterloggingSection(
  doc: jsPDF,
  y: number,
  waterlogging: WaterloggingZone[]
): number {
  y = addSectionTitle(doc, y, "Waterlogging Zones");
  y = addKeyValue(doc, y, "Total Zones", String(waterlogging.length));

  // Risk level breakdown
  const riskMap: Record<string, number> = {};
  for (const z of waterlogging) {
    const k = z.risk_level || "unknown";
    riskMap[k] = (riskMap[k] || 0) + 1;
  }
  for (const [risk, count] of Object.entries(riskMap)) {
    y = addKeyValue(doc, y, `  ${risk}`, String(count));
  }
  y += 4;

  if (waterlogging.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Latitude", "Longitude", "Radius (m)", "Risk Level", "Elevation (m)", "Historical Incidents", "Highway"]],
      body: waterlogging.map((z) => [
        z.latitude.toFixed(4),
        z.longitude.toFixed(4),
        String(z.radius_m),
        z.risk_level,
        z.elevation_m != null ? String(z.elevation_m) : "—",
        String(z.historical_incidents),
        z.associated_highway_ref || "—",
      ]),
      styles: TABLE_COMPACT_STYLE,
      headStyles: TABLE_HEAD_STYLE,
      alternateRowStyles: TABLE_ALT_ROW_STYLE,
      margin: TABLE_MARGIN,
    });
    y = getLastTableY(doc) + 10;
  }
  return y;
}

function exportSourcesEntirePDF(data: SourcesExportData) {
  const doc = new jsPDF();
  const total =
    data.news.length + data.traffic.length + data.waterlogging.length;
  let y = addReportHeader(
    doc,
    "Data Sources Report",
    `${total} data source entries across ${Object.keys(data.sourceBreakdown).length + 3} sources`
  );

  y = buildSourceSummarySection(doc, y, data);
  y = buildNewsSection(doc, y, data.news);
  y = buildTrafficSection(doc, y, data.traffic);
  buildWaterloggingSection(doc, y, data.waterlogging);

  savePDF(doc, "data-sources-complete");
}

function exportSourcesTopicPDF(data: SourcesExportData, topic: SourcesTopicKey) {
  const doc = new jsPDF();
  const label = SOURCES_TOPIC_LABELS[topic];
  const total =
    data.news.length + data.traffic.length + data.waterlogging.length;
  let y = addReportHeader(
    doc,
    `Topic Export \u2014 ${label}`,
    `${total} data source entries`
  );

  switch (topic) {
    case "source_summary":
      buildSourceSummarySection(doc, y, data);
      break;
    case "news":
      buildNewsSection(doc, y, data.news);
      break;
    case "traffic":
      buildTrafficSection(doc, y, data.traffic);
      break;
    case "waterlogging":
      buildWaterloggingSection(doc, y, data.waterlogging);
      break;
  }

  savePDF(doc, `data-sources-${topic}`);
}

export default function SourcesPage() {
  const { t } = useI18n();
  const [news, setNews] = useState<NewsMention[]>([]);
  const [traffic, setTraffic] = useState<TrafficAnomaly[]>([]);
  const [waterlogging, setWaterlogging] = useState<WaterloggingZone[]>([]);
  const [sourceBreakdown, setSourceBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // PDF export state
  const [exportOpen, setExportOpen] = useState(false);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getNewsMentions().catch(() => []),
      api.getTrafficAnomalies().catch(() => []),
      api.getWaterloggingZones().catch(() => []),
      api.getDashboardStats().catch(() => null),
    ])
      .then(([n, tr, w, stats]) => {
        setNews(Array.isArray(n) ? n : []);
        setTraffic(Array.isArray(tr) ? tr : []);
        setWaterlogging(Array.isArray(w) ? w : []);
        if (stats?.source_breakdown) setSourceBreakdown(stats.source_breakdown);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

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

  const exportData: SourcesExportData = { news, traffic, waterlogging, sourceBreakdown };

  const handleExportAll = () => {
    setExportLoading(true);
    setExportOpen(false);
    setTimeout(() => {
      exportSourcesEntirePDF(exportData);
      setExportLoading(false);
    }, 100);
  };

  const handleExportTopic = (topic: SourcesTopicKey) => {
    setExportLoading(true);
    setExportOpen(false);
    setTopicMenuOpen(false);
    setTimeout(() => {
      exportSourcesTopicPDF(exportData, topic);
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{t.sources.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t.sources.subtitle}
          </p>
        </div>
        <div className="relative self-start shrink-0" ref={exportRef}>
          <button
            onClick={() => { setExportOpen((o) => !o); setTopicMenuOpen(false); }}
            disabled={exportLoading}
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
                    All sources with full details
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
                  {(Object.keys(SOURCES_TOPIC_LABELS) as SourcesTopicKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => handleExportTopic(key)}
                      className="w-full flex items-center gap-3 px-6 py-2.5 text-xs hover:bg-muted transition-colors text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{SOURCES_TOPIC_LABELS[key]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Source Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: t.sources.news, count: (sourceBreakdown["news"] || 0) + news.length, icon: Newspaper, color: "text-blue-600", bg: "bg-blue-50" },
          { label: t.sources.socialMedia, count: sourceBreakdown["citizen_report"] || 0, icon: Radio, color: "text-purple-600", bg: "bg-purple-50" },
          { label: t.sources.traffic, count: (sourceBreakdown["traffic_anomaly"] || 0) + traffic.length, icon: Car, color: "text-cyan-600", bg: "bg-cyan-50" },
          { label: t.sources.satellite, count: sourceBreakdown["cv_detection"] || 0, icon: Satellite, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: t.sources.waterlogging, count: waterlogging.length, icon: Droplets, color: "text-blue-600", bg: "bg-blue-50" },
          { label: t.sources.dashcam, count: sourceBreakdown["dashcam"] || 0, icon: Camera, color: "text-amber-600", bg: "bg-amber-50" },
          { label: t.sources.cleaningVehicle, count: sourceBreakdown["cleaning_vehicle"] || 0, icon: Truck, color: "text-gray-600", bg: "bg-gray-50" },
        ].map((source, i) => {
          const Icon = source.icon;
          return (
            <Card key={i} className="py-0">
              <CardContent className="p-3 text-center">
                <div className={`w-8 h-8 rounded-lg ${source.bg} flex items-center justify-center mx-auto mb-1.5`}>
                  <Icon className={`w-4 h-4 ${source.color}`} />
                </div>
                <p className="text-base sm:text-lg font-bold">{source.count}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {source.label}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="news">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="news" className="gap-1.5 flex-1 sm:flex-initial">
            <Newspaper className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.sources.news}</span>
            <span className="sm:hidden text-xs">{t.sources.news}</span>
          </TabsTrigger>
          <TabsTrigger value="traffic" className="gap-1.5 flex-1 sm:flex-initial">
            <Car className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.sources.traffic}</span>
            <span className="sm:hidden text-xs">{t.sources.traffic}</span>
          </TabsTrigger>
          <TabsTrigger value="waterlogging" className="gap-1.5 flex-1 sm:flex-initial">
            <Droplets className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.sources.waterlogging}</span>
            <span className="sm:hidden text-xs">{t.sources.waterlogging}</span>
          </TabsTrigger>
        </TabsList>

        {/* News Tab */}
        <TabsContent value="news" className="space-y-3 mt-4">
          {news.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t.common.noResults}
              </CardContent>
            </Card>
          ) : (
            news.map((article) => (
              <Card key={article.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          {article.source_name || article.source_type}
                        </Badge>
                        {article.severity_keyword && (
                          <Badge
                            className={`text-[10px] ${riskColors[article.severity_keyword] || ""}`}
                          >
                            {article.severity_keyword}
                          </Badge>
                        )}
                        {article.sentiment_score !== undefined &&
                          article.sentiment_score !== null && (
                            <span className="text-[10px] text-muted-foreground">
                              {t.common.sentiment}: {article.sentiment_score.toFixed(2)}
                            </span>
                          )}
                      </div>
                      <h4 className="text-sm font-medium">
                        {article.title || t.common.untitled}
                      </h4>
                      {article.content_snippet && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {article.content_snippet}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {article.extracted_location && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {article.extracted_location}
                          </span>
                        )}
                        {article.published_at && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {new Date(article.published_at).toLocaleDateString(
                              "en-IN"
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Traffic Tab */}
        <TabsContent value="traffic" className="space-y-3 mt-4">
          {traffic.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t.common.noResults}
              </CardContent>
            </Card>
          ) : (
            traffic.map((anomaly) => (
              <Card key={anomaly.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-cyan-50 rounded-lg">
                        <TrendingUp className="w-4 h-4 text-cyan-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {anomaly.anomaly_type || t.common.trafficAnomaly}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {anomaly.highway_ref}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {anomaly.location}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        className={`text-[10px] ${riskColors[anomaly.severity] || ""}`}
                      >
                        {anomaly.severity}
                      </Badge>
                      {anomaly.detected_at && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(anomaly.detected_at).toLocaleDateString(
                            "en-IN"
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Waterlogging Tab */}
        <TabsContent value="waterlogging" className="space-y-3 mt-4">
          {waterlogging.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t.common.noResults}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {waterlogging.map((zone) => (
                <Card key={zone.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-blue-600" />
                        <Badge
                          className={`text-[10px] ${riskColors[zone.risk_level] || ""}`}
                        >
                          {zone.risk_level}
                        </Badge>
                      </div>
                      {zone.associated_highway_ref && (
                        <Badge variant="outline" className="text-[10px]">
                          {zone.associated_highway_ref}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">{t.dashboard.location}</p>
                        <p className="font-medium">
                          {zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t.dashboard.radius}</p>
                        <p className="font-medium">{zone.radius_m}m</p>
                      </div>
                      {zone.elevation_m && (
                        <div>
                          <p className="text-muted-foreground">{t.dashboard.elevation}</p>
                          <p className="font-medium">{zone.elevation_m}m</p>
                        </div>
                      )}
                      <div>
                        <p className="text-muted-foreground">
                          {t.dashboard.historicalIncidents}
                        </p>
                        <p className="font-medium">
                          {zone.historical_incidents}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
