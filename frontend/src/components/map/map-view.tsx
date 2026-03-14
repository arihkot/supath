"use client";

import { useEffect, useState, useCallback } from "react";
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
  selectedPotholeId?: string | null;
  onSelectPothole?: (pothole: Pothole | null) => void;
  onPotholesLoaded?: (potholes: Pothole[]) => void;
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

// Heatmap layer using leaflet.heat plugin
function HeatmapLayer({ potholes, enabled }: { potholes: Pothole[]; enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || potholes.length === 0) return;

    let layerRef: L.Layer | null = null;
    let cancelled = false;

    import("leaflet.heat").then(() => {
      if (cancelled) return;

      const severityWeight: Record<string, number> = {
        critical: 1.0,
        high: 0.75,
        medium: 0.5,
        low: 0.3,
      };

      const heatData: [number, number, number][] = potholes.map((p) => [
        p.latitude,
        p.longitude,
        severityWeight[p.severity] || 0.4,
      ]);

      // @ts-expect-error leaflet.heat extends L with heatLayer
      layerRef = L.heatLayer(heatData, {
        radius: 30,
        blur: 25,
        maxZoom: 12,
        max: 1.0,
        minOpacity: 0.35,
        gradient: {
          0.0: "#ffffb2",
          0.25: "#fecc5c",
          0.5: "#fd8d3c",
          0.75: "#f03b20",
          1.0: "#bd0026",
        },
      });

      if (layerRef) {
        layerRef.addTo(map);
      }
    });

    return () => {
      cancelled = true;
      if (layerRef) {
        map.removeLayer(layerRef);
      }
    };
  }, [enabled, potholes, map]);

  return null;
}

// Fly-to component: when selectedPotholeId changes, fly to that pothole
function FlyToSelected({
  potholes,
  selectedId,
}: {
  potholes: Pothole[];
  selectedId: string | null | undefined;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const p = potholes.find((ph) => ph.id === selectedId);
    if (p) {
      map.flyTo([p.latitude, p.longitude], 18, {
        duration: 0.8,
      });
    }
  }, [selectedId, potholes, map]);

  return null;
}

// Zoom control positioned at bottom-right to avoid overlapping mobile controls
function ZoomControlBottomRight() {
  const map = useMap();

  useEffect(() => {
    const zoomControl = L.control.zoom({ position: "bottomright" });
    zoomControl.addTo(map);
    return () => {
      map.removeControl(zoomControl);
    };
  }, [map]);

  return null;
}

export default function MapView({
  layers,
  selectedPotholeId,
  onSelectPothole,
  onPotholesLoaded,
}: MapViewProps) {
  const [highwayData, setHighwayData] = useState<FeatureCollection | null>(null);
  const [boundaryData, setBoundaryData] = useState<FeatureCollection | null>(null);
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [waterlogging, setWaterlogging] = useState<WaterloggingZone[]>([]);
  const [traffic, setTraffic] = useState<TrafficAnomaly[]>([]);

  useEffect(() => {
    Promise.all([
      api.getHighwayGeoJSON().catch(() => ({ type: "FeatureCollection" as const, features: [] })),
      api.getCGBoundary().catch(() => ({ type: "FeatureCollection" as const, features: [] })),
      api.getPotholes({ limit: 500 }).catch(() => ({ potholes: [], total: 0 })),
      api.getWaterloggingZones().catch(() => []),
      api.getTrafficAnomalies().catch(() => []),
    ]).then(([hwData, bdData, phData, wlData, taData]) => {
      setHighwayData(hwData as FeatureCollection);
      setBoundaryData(bdData as FeatureCollection);
      const loadedPotholes = phData.potholes || [];
      setPotholes(loadedPotholes);
      onPotholesLoaded?.(loadedPotholes);
      setWaterlogging(Array.isArray(wlData) ? wlData : []);
      setTraffic(Array.isArray(taData) ? taData : []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Allow parent to update local pothole data after actions
  const updatePotholeLocally = useCallback(
    (updatedPothole: Partial<Pothole> & { id: string }) => {
      setPotholes((prev) =>
        prev.map((p) => (p.id === updatedPothole.id ? { ...p, ...updatedPothole } : p))
      );
    },
    []
  );

  // Expose updater via parent callback if needed (parent manages this via ref or state)
  useEffect(() => {
    if (typeof window !== "undefined") {
      // @ts-expect-error exposing for parent interop
      window.__supathUpdatePothole = updatePotholeLocally;
    }
    return () => {
      if (typeof window !== "undefined") {
        // @ts-expect-error cleanup
        delete window.__supathUpdatePothole;
      }
    };
  }, [updatePotholeLocally]);

  const nhFeatures =
    highwayData?.features?.filter(
      (f: Feature) => f.properties?.highway === "trunk" || f.properties?.ref?.startsWith("NH")
    ) || [];

  const shFeatures =
    highwayData?.features?.filter(
      (f: Feature) => f.properties?.highway === "primary" || f.properties?.ref?.startsWith("SH")
    ) || [];

  const nhCollection = { type: "FeatureCollection" as const, features: nhFeatures };
  const shCollection = { type: "FeatureCollection" as const, features: shFeatures };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "#dc2626";
      case "high":
        return "#ea580c";
      case "medium":
        return "#d97706";
      case "low":
        return "#16a34a";
      default:
        return "#6b7280";
    }
  };

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
      zoomControl={false}
      doubleClickZoom={false}
    >
      {/* Base tile layer */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Zoom control in bottom-right to avoid overlapping mobile UI */}
      <ZoomControlBottomRight />

      {/* Satellite overlay */}
      <SatelliteLayer enabled={layers.satellite} />

      {/* Fly to selected pothole */}
      <FlyToSelected potholes={potholes} selectedId={selectedPotholeId} />

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

      {/* Gradient Heatmap layer */}
      <HeatmapLayer potholes={potholes} enabled={layers.heatmap} />

      {/* Pothole markers — interactive */}
      {layers.potholes &&
        potholes.map((p) => {
          const isSelected = selectedPotholeId === p.id;
          return (
            <CircleMarker
              key={p.id}
              center={[p.latitude, p.longitude]}
              radius={isSelected ? 10 : 6}
              pathOptions={{
                color: isSelected ? "#ffffff" : severityColor(p.severity),
                fillColor: severityColor(p.severity),
                fillOpacity: isSelected ? 1 : 0.7,
                weight: isSelected ? 3 : 1.5,
              }}
              eventHandlers={{
                click: () => {
                  onSelectPothole?.(p);
                },
                dblclick: (e) => {
                  // Double-click to zoom to max on this hotspot
                  const map = e.target._map;
                  if (map) {
                    map.flyTo([p.latitude, p.longitude], 18, { duration: 0.8 });
                  }
                  onSelectPothole?.(p);
                },
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
          );
        })}

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
        traffic
          .filter((ta) => ta.latitude != null && ta.longitude != null)
          .map((ta) => (
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
