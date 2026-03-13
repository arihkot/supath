"use client";

import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

// Dynamically import map to avoid SSR issues with Leaflet
const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-muted/30">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
});

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

  const toggleLayer = (key: string) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };

  return (
    <div className="relative h-[calc(100vh-3.5rem)] -m-4 md:-m-6">
      {/* Full-bleed map */}
      <MapView layers={layers} />

      {/* Overlay: page title */}
      <div className="absolute top-4 left-4 z-[1000] pointer-events-none">
        <div className="bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border">
          <h2 className="text-sm font-semibold leading-tight">{t.map.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t.map.subtitle}</p>
        </div>
      </div>

      {/* Overlay: layer controls + legend */}
      <div className="absolute top-4 right-4 z-[1000] w-52 space-y-2">
        {/* Layer Controls */}
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
  );
}
