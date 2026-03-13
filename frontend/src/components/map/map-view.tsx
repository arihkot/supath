"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection, Feature } from "geojson";
import { api } from "@/lib/api";
import { type Pothole, type WaterloggingZone, type TrafficAnomaly } from "@/lib/types";

// Chhattisgarh center coordinates
const CG_CENTER: [number, number] = [21.27, 81.87];
const CG_ZOOM = 7;

interface MapViewProps {
  layers: {
    nh: boolean;
    sh: boolean;
    potholes: boolean;
    heatmap: boolean;
    satellite: boolean;
    waterlogging: boolean;
    traffic: boolean;
  };
}

// Satellite tile layer toggle
function SatelliteLayer({ enabled }: { enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;

    const satLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 18,
      }
    );

    satLayer.addTo(map);
    return () => {
      map.removeLayer(satLayer);
    };
  }, [enabled, map]);

  return null;
}

export default function MapView({ layers }: MapViewProps) {
  const [highwayData, setHighwayData] = useState<FeatureCollection | null>(null);
  const [boundaryData, setBoundaryData] = useState<FeatureCollection | null>(null);
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [waterlogging, setWaterlogging] = useState<WaterloggingZone[]>([]);
  const [traffic, setTraffic] = useState<TrafficAnomaly[]>([]);

  useEffect(() => {
    Promise.all([
      api.getHighwayGeoJSON().catch(() => ({ type: "FeatureCollection" as const, features: [] })),
      api.getCGBoundary().catch(() => ({ type: "FeatureCollection" as const, features: [] })),
      api.getPotholes({ limit: 200 }).catch(() => ({ potholes: [], total: 0 })),
      api.getWaterloggingZones().catch(() => []),
      api.getTrafficAnomalies().catch(() => []),
    ]).then(([hwData, bdData, phData, wlData, taData]) => {
      setHighwayData(hwData as FeatureCollection);
      setBoundaryData(bdData as FeatureCollection);
      setPotholes(phData.potholes || []);
      setWaterlogging(Array.isArray(wlData) ? wlData : []);
      setTraffic(Array.isArray(taData) ? taData : []);
    });
  }, []);

  const nhFeatures = highwayData?.features?.filter(
    (f: Feature) => f.properties?.highway === "trunk" || f.properties?.ref?.startsWith("NH")
  ) || [];

  const shFeatures = highwayData?.features?.filter(
    (f: Feature) => f.properties?.highway === "primary" || f.properties?.ref?.startsWith("SH")
  ) || [];

  const nhCollection = { type: "FeatureCollection" as const, features: nhFeatures };
  const shCollection = { type: "FeatureCollection" as const, features: shFeatures };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "#dc2626";
      case "high": return "#ea580c";
      case "medium": return "#d97706";
      case "low": return "#16a34a";
      default: return "#6b7280";
    }
  };

  const heatmapColor = (count: number) => {
    if (count >= 11) return "#7f1d1d";
    if (count >= 6) return "#dc2626";
    if (count >= 3) return "#ea580c";
    return "#f59e0b";
  };

  const heatmapCells = useMemo(() => {
    const cells: Record<string, { lat: number; lng: number; count: number; hasCritical: boolean }> = {};
    potholes.forEach((p) => {
      const cellLat = Math.round(p.latitude * 10) / 10;
      const cellLng = Math.round(p.longitude * 10) / 10;
      const key = `${cellLat},${cellLng}`;
      if (!cells[key]) {
        cells[key] = { lat: cellLat, lng: cellLng, count: 0, hasCritical: false };
      }
      cells[key].count++;
      if (p.severity === "critical" || p.severity === "high") {
        cells[key].hasCritical = true;
      }
    });
    return Object.values(cells);
  }, [potholes]);

  const onEachHighway = useCallback((feature: Feature, layer: L.Layer) => {
    const props = feature.properties || {};
    const ref = props.ref || "Unknown";
    const name = props.name || "";
    const surface = props.surface || "unknown";

    layer.bindPopup(
      `<div>
        <strong>${ref}</strong>
        ${name ? `<br/><span style="color:#666">${name}</span>` : ""}
        <br/><span style="font-size:11px">Surface: ${surface}</span>
      </div>`
    );
  }, []);

  return (
    <MapContainer
      center={CG_CENTER}
      zoom={CG_ZOOM}
      className="w-full h-full"
      zoomControl={true}
    >
      {/* Base tile layer */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Satellite overlay */}
      <SatelliteLayer enabled={layers.satellite} />

      {/* Chhattisgarh state boundary */}
      {boundaryData && (boundaryData.features?.length ?? 0) > 0 && (
        <GeoJSON
          key="boundary"
          data={boundaryData}
          style={() => ({
            color: "#1e3a5f",
            weight: 2.5,
            opacity: 0.6,
            fillColor: "#1e3a5f",
            fillOpacity: 0.03,
            dashArray: "8 4",
          })}
        />
      )}

      {/* National Highways */}
      {layers.nh && nhFeatures.length > 0 && (
        <GeoJSON
          key="nh"
          data={nhCollection}
          style={() => ({
            color: "#dc2626",
            weight: 3,
            opacity: 0.8,
          })}
          onEachFeature={onEachHighway}
        />
      )}

      {/* State Highways */}
      {layers.sh && shFeatures.length > 0 && (
        <GeoJSON
          key="sh"
          data={shCollection}
          style={() => ({
            color: "#2563eb",
            weight: 2.5,
            opacity: 0.7,
          })}
          onEachFeature={onEachHighway}
        />
      )}

      {/* Risk Heatmap */}
      {layers.heatmap &&
        heatmapCells.map((cell) => (
          <CircleMarker
            key={`hm-${cell.lat}-${cell.lng}`}
            center={[cell.lat, cell.lng]}
            radius={Math.min(10 + cell.count * 4, 45)}
            pathOptions={{
              color: heatmapColor(cell.count),
              fillColor: heatmapColor(cell.count),
              fillOpacity: 0.35,
              weight: 0,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <strong>Risk Cluster</strong>
                <br />
                Potholes: <b>{cell.count}</b>
                <br />
                {cell.hasCritical && (
                  <span style={{ color: "#dc2626" }}>Contains Critical / High</span>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* Pothole markers */}
      {layers.potholes &&
        potholes.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.latitude, p.longitude]}
            radius={6}
            pathOptions={{
              color: severityColor(p.severity),
              fillColor: severityColor(p.severity),
              fillOpacity: 0.7,
              weight: 1.5,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <strong>{p.highway_ref || "Unknown Highway"}</strong>
                <br />
                Severity: <span style={{ color: severityColor(p.severity) }}>{p.severity}</span>
                <br />
                Near: {p.nearest_city || "N/A"}
                <br />
                Source: {p.source}
                <br />
                Status: {p.status}
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* Waterlogging zones */}
      {layers.waterlogging &&
        waterlogging.map((z) => (
          <CircleMarker
            key={z.id}
            center={[z.latitude, z.longitude]}
            radius={z.radius_m ? Math.min(z.radius_m / 50, 15) : 8}
            pathOptions={{
              color: "#06b6d4",
              fillColor: "#06b6d4",
              fillOpacity: 0.25,
              weight: 1.5,
              dashArray: "4 4",
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <strong>Waterlogging Zone</strong>
                <br />
                Risk: {z.risk_level}
                <br />
                Highway: {z.associated_highway_ref || "N/A"}
                <br />
                Incidents: {z.historical_incidents}
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* Traffic anomalies */}
      {layers.traffic &&
        traffic.filter((ta) => ta.latitude != null && ta.longitude != null).map((ta) => (
          <CircleMarker
            key={ta.id}
            center={[ta.latitude!, ta.longitude!]}
            radius={8}
            pathOptions={{
              color: "#7c3aed",
              fillColor: "#7c3aed",
              fillOpacity: 0.35,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <strong>Traffic Anomaly</strong>
                <br />
                {ta.highway_ref} - {ta.location}
                <br />
                Avg Speed: {ta.avg_speed_kmph} km/h (expected: {ta.expected_speed_kmph})
                <br />
                Delay: {ta.delay_factor}x
                <br />
                Cause: {ta.likely_cause}
              </div>
            </Popup>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
