"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

const riskColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

export default function SourcesPage() {
  const { t } = useI18n();
  const [news, setNews] = useState<NewsMention[]>([]);
  const [traffic, setTraffic] = useState<TrafficAnomaly[]>([]);
  const [waterlogging, setWaterlogging] = useState<WaterloggingZone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getNewsMentions().catch(() => []),
      api.getTrafficAnomalies().catch(() => []),
      api.getWaterloggingZones().catch(() => []),
    ])
      .then(([n, tr, w]) => {
        setNews(Array.isArray(n) ? n : []);
        setTraffic(Array.isArray(tr) ? tr : []);
        setWaterlogging(Array.isArray(w) ? w : []);
      })
      .finally(() => setLoading(false));
  }, []);

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
      <div>
        <h2 className="text-xl font-semibold">{t.sources.title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t.sources.subtitle}
        </p>
      </div>

      {/* Source Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: t.sources.news, count: news.length, icon: Newspaper, color: "text-blue-600", bg: "bg-blue-50" },
          { label: t.sources.socialMedia, count: 0, icon: Radio, color: "text-purple-600", bg: "bg-purple-50" },
          { label: t.sources.traffic, count: traffic.length, icon: Car, color: "text-cyan-600", bg: "bg-cyan-50" },
          { label: t.sources.satellite, count: 0, icon: Satellite, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: t.sources.waterlogging, count: waterlogging.length, icon: Droplets, color: "text-blue-600", bg: "bg-blue-50" },
          { label: t.sources.dashcam, count: 0, icon: Camera, color: "text-amber-600", bg: "bg-amber-50" },
          { label: t.sources.cleaningVehicle, count: 0, icon: Truck, color: "text-gray-600", bg: "bg-gray-50" },
        ].map((source, i) => {
          const Icon = source.icon;
          return (
            <Card key={i} className="py-0">
              <CardContent className="p-3 text-center">
                <div className={`w-8 h-8 rounded-lg ${source.bg} flex items-center justify-center mx-auto mb-1.5`}>
                  <Icon className={`w-4 h-4 ${source.color}`} />
                </div>
                <p className="text-lg font-bold">{source.count}</p>
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
        <TabsList>
          <TabsTrigger value="news" className="gap-1.5">
            <Newspaper className="w-3.5 h-3.5" />
            {t.sources.news}
          </TabsTrigger>
          <TabsTrigger value="traffic" className="gap-1.5">
            <Car className="w-3.5 h-3.5" />
            {t.sources.traffic}
          </TabsTrigger>
          <TabsTrigger value="waterlogging" className="gap-1.5">
            <Droplets className="w-3.5 h-3.5" />
            {t.sources.waterlogging}
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
                              Sentiment: {article.sentiment_score.toFixed(2)}
                            </span>
                          )}
                      </div>
                      <h4 className="text-sm font-medium">
                        {article.title || "Untitled"}
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
                          {anomaly.anomaly_type || "Traffic Anomaly"}
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
                        <p className="text-muted-foreground">Location</p>
                        <p className="font-medium">
                          {zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Radius</p>
                        <p className="font-medium">{zone.radius_m}m</p>
                      </div>
                      {zone.elevation_m && (
                        <div>
                          <p className="text-muted-foreground">Elevation</p>
                          <p className="font-medium">{zone.elevation_m}m</p>
                        </div>
                      )}
                      <div>
                        <p className="text-muted-foreground">
                          Historical Incidents
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
