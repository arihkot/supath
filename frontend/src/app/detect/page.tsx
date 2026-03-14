"use client";

import { useState, useRef, useCallback } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Image as ImageIcon,
  Video,
  Camera,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  X,
  FilePlus,
  MapPin,
} from "lucide-react";

const severityBadgeVariants: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

const severityBoxColors: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#16a34a",
};

interface Detection {
  class_name: string;
  confidence: number;
  severity: string;
  bbox: number[];
}

interface DetectionResult {
  potholes_detected: number;
  detections: Detection[];
  severity_summary: Record<string, number>;
  image_url?: string;
  image_width?: number;
  image_height?: number;
  pothole_ids?: string[];
}

interface GpsCoords {
  lat: number;
  lng: number;
}

export default function DetectPage() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [filingComplaint, setFilingComplaint] = useState(false);
  const [complaintRef, setComplaintRef] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<GpsCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "acquiring" | "ok" | "denied">("idle");


  const handleFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    setNaturalSize(null);
    setComplaintRef(null);

    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);

      // Try to acquire GPS when user selects an image
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        setGpsStatus("acquiring");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setGpsStatus("ok");
          },
          () => {
            setGpsStatus("denied");
          },
          { timeout: 8000, maximumAge: 60000 }
        );
      }
    } else {
      setPreview(null);
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleDetect = async () => {
    if (!file) return;
    setDetecting(true);
    setError(null);
    setComplaintRef(null);

    try {
      const isVideo = file.type.startsWith("video/");
      const data = isVideo
        ? await api.detectVideo(file)
        : await api.detectImage(file, gpsCoords?.lat, gpsCoords?.lng);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setDetecting(false);
    }
  };

  const handleAutoFile = async () => {
    if (!result?.pothole_ids?.length) return;
    setFilingComplaint(true);
    try {
      const data = await api.createComplaint(result.pothole_ids[0]);
      setComplaintRef(data.complaint_ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setFilingComplaint(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setNaturalSize(null);
    setComplaintRef(null);
    setGpsCoords(null);
    setGpsStatus("idle");
  };

  /**
   * Compute percentage-based bbox positions so the overlay stays correct at
   * any display size (no dependency on clientWidth/clientHeight at render time).
   * Uses the natural image dimensions captured in the onLoad handler.
   */
  const percentBboxes = (() => {
    if (!result?.detections || !naturalSize) return [];
    const { w, h } = naturalSize;
    return result.detections.map((det) => ({
      ...det,
      pct: {
        left: (det.bbox[0] / w) * 100,
        top: (det.bbox[1] / h) * 100,
        width: ((det.bbox[2] - det.bbox[0]) / w) * 100,
        height: ((det.bbox[3] - det.bbox[1]) / h) * 100,
      },
    }));
  })();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-lg sm:text-xl font-semibold">{t.detect.title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t.detect.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="space-y-4">
          <Tabs defaultValue="image">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="image" className="gap-1.5 flex-1 sm:flex-initial">
                <ImageIcon className="w-3.5 h-3.5" />
                {t.detect.uploadImage}
              </TabsTrigger>
              <TabsTrigger value="video" className="gap-1.5 flex-1 sm:flex-initial">
                <Video className="w-3.5 h-3.5" />
                {t.detect.uploadVideo}
              </TabsTrigger>
              <TabsTrigger value="dashcam" className="gap-1.5 flex-1 sm:flex-initial">
                <Camera className="w-3.5 h-3.5" />
                {t.detect.dashcamUpload}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="image">
              <UploadZone
                accept="image/jpeg,image/png,image/webp"
                dragActive={dragActive}
                onDrag={handleDrag}
                onDrop={handleDrop}
                onSelect={handleFile}
                label={t.detect.dragDrop}
                formats={t.detect.supportedFormats}
              />
            </TabsContent>
            <TabsContent value="video">
              <UploadZone
                accept="video/mp4,video/avi,video/mov"
                dragActive={dragActive}
                onDrag={handleDrag}
                onDrop={handleDrop}
                onSelect={handleFile}
                label={t.detect.dragDrop}
                formats="Supported: MP4, AVI, MOV"
              />
            </TabsContent>
            <TabsContent value="dashcam">
              <UploadZone
                accept="video/mp4,video/avi"
                dragActive={dragActive}
                onDrag={handleDrag}
                onDrop={handleDrop}
                onSelect={handleFile}
                label={t.detect.dragDrop}
                formats="Supported: MP4, AVI (Dashcam footage)"
              />
            </TabsContent>
          </Tabs>

          {/* Selected File */}
          {file && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Video className="w-4 h-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearFile}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* GPS status indicator */}
                {file.type.startsWith("image/") && gpsStatus !== "idle" && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {gpsStatus === "acquiring" && "Acquiring GPS…"}
                    {gpsStatus === "ok" && gpsCoords && (
                      <span className="text-green-700">
                        GPS: {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
                      </span>
                    )}
                    {gpsStatus === "denied" && (
                      <span className="text-amber-600">GPS unavailable — will use EXIF or default coords</span>
                    )}
                  </div>
                )}

                {/* Image preview with percentage-based bbox overlay */}
                {preview && (
                  <div className="mt-3 rounded-lg overflow-hidden border">
                    {/*
                      Use a wrapper whose aspect ratio matches the natural image so that
                      the image fills 100% of the wrapper with no letterbox bars.
                      Bboxes are then percentage-positioned against the same area.
                    */}
                    <div
                      className="relative w-full"
                      style={
                        naturalSize
                          ? { aspectRatio: `${naturalSize.w} / ${naturalSize.h}` }
                          : {}
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt="Preview"
                        className="w-full h-full object-fill"
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                        }}
                      />
                      {/* Percentage-positioned bounding box overlays */}
                      {result && naturalSize && percentBboxes.map((det, i) => (
                        <div
                          key={i}
                          className="absolute pointer-events-none"
                          style={{
                            left: `${det.pct.left}%`,
                            top: `${det.pct.top}%`,
                            width: `${det.pct.width}%`,
                            height: `${det.pct.height}%`,
                            border: `2px solid ${severityBoxColors[det.severity] || "#6b7280"}`,
                          }}
                        >
                          {/* Label */}
                          <div
                            className="absolute -top-5 left-0 px-1 py-0.5 text-[10px] font-semibold text-white leading-none whitespace-nowrap"
                            style={{
                              backgroundColor: severityBoxColors[det.severity] || "#6b7280",
                            }}
                          >
                            #{i + 1} {det.severity} {(det.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  className="w-full mt-3"
                  onClick={handleDetect}
                  disabled={detecting}
                >
                  {detecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t.detect.detecting}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {t.detect.title}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          <Card className="min-h-[300px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t.detect.results}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {!result && !error && !detecting && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Upload className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">{t.detect.dragDrop}</p>
                </div>
              )}

              {detecting && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {t.detect.detecting}
                  </p>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    {result.potholes_detected > 0 ? (
                      <FileWarning className="w-5 h-5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {result.potholes_detected > 0
                          ? `${result.potholes_detected} ${t.detect.detected}`
                          : t.detect.noDetections}
                      </p>
                      {result.severity_summary &&
                        Object.keys(result.severity_summary).length > 0 && (
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {Object.entries(result.severity_summary).map(
                              ([sev, count]) => (
                                <Badge
                                  key={sev}
                                  className={`text-[10px] ${severityBadgeVariants[sev] || ""}`}
                                >
                                  {t.severity[
                                    sev as keyof typeof t.severity
                                  ] || sev}
                                  : {count}
                                </Badge>
                              )
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Individual Detections */}
                  {result.detections.map((det, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2.5 px-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center text-xs font-mono text-white font-semibold"
                          style={{ backgroundColor: severityBoxColors[det.severity] || "#6b7280" }}
                        >
                          #{i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {det.class_name || "Pothole"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t.detect.confidence}:{" "}
                            {(det.confidence * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={`${severityBadgeVariants[det.severity] || ""}`}
                      >
                        {t.severity[
                          det.severity as keyof typeof t.severity
                        ] || det.severity}
                      </Badge>
                    </div>
                  ))}

                  {/* Auto-file Complaint */}
                  {result.potholes_detected > 0 && !complaintRef && (
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={handleAutoFile}
                      disabled={filingComplaint || !result.pothole_ids?.length}
                    >
                      {filingComplaint ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Filing complaint...
                        </>
                      ) : (
                        <>
                          <FilePlus className="w-4 h-4 mr-2" />
                          {t.detect.autoFile}
                        </>
                      )}
                    </Button>
                  )}

                  {/* Complaint filed confirmation */}
                  {complaintRef && (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-emerald-800">
                          Complaint filed successfully
                        </p>
                        <p className="text-xs text-emerald-700 font-mono mt-0.5">
                          Ref: {complaintRef}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function UploadZone({
  accept,
  dragActive,
  onDrag,
  onDrop,
  onSelect,
  label,
  formats,
}: {
  accept: string;
  dragActive: boolean;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onSelect: (f: File) => void;
  label: string;
  formats: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`mt-3 border-2 border-dashed rounded-lg p-5 sm:p-8 text-center cursor-pointer transition-colors ${
        dragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/20 hover:border-primary/50"
      }`}
      onDragEnter={onDrag}
      onDragLeave={onDrag}
      onDragOver={onDrag}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onSelect(e.target.files[0]);
        }}
      />
      <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">{formats}</p>
    </div>
  );
}
