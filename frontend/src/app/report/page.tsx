"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  MapPin,
  Upload,
  Loader2,
  CheckCircle2,
  Star,
  X,
} from "lucide-react";
import type { IncentiveTier } from "@/lib/types";

export default function CitizenReportPage() {
  const { t } = useI18n();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [tiers, setTiers] = useState<IncentiveTier[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api.getIncentiveTiers(), api.getTotalPoints()]).then(
      ([tiersData, pointsData]) => {
        setTiers(tiersData.tiers || []);
        setTotalPoints(pointsData.total_points || 0);
      }
    );
  }, []);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const fileArr = Array.from(newFiles);
    setFiles((prev) => [...prev, ...fileArr]);

    fileArr.forEach((f) => {
      if (f.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) =>
          setPreviews((prev) => [...prev, e.target?.result as string]);
        reader.readAsDataURL(f);
      }
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const getLocation = () => {
    if (!navigator.geolocation) return;
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setGettingLocation(false);
      },
      () => {
        // Default to Raipur if geolocation denied
        setLatitude(21.2514);
        setLongitude(81.6296);
        setGettingLocation(false);
      }
    );
  };

  const handleSubmit = async () => {
    if (!latitude || !longitude) {
      setError("Please pin your location first");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("latitude", String(latitude));
      formData.append("longitude", String(longitude));
      if (description) formData.append("description", description);
      if (name) formData.append("reporter_name", name);
      if (phone) formData.append("phone", phone);
      files.forEach((f) => formData.append("files", f));

      const result = await api.submitCitizenReport(formData);
      setSubmitted(true);
      setPointsEarned(result.incentive_points || 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">{t.citizenReport.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t.citizenReport.subtitle}
          </p>
        </div>

        <Card className="max-w-lg mx-auto">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {t.citizenReport.thankYou}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Your report has been submitted and will be verified by our AI system.
            </p>
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <Star className="w-5 h-5 text-amber-500" />
              <div className="text-left">
                <p className="text-xs text-amber-700">
                  {t.citizenReport.incentivePoints}
                </p>
                <p className="text-lg font-bold text-amber-700">
                  +{pointsEarned}{" "}
                  <span className="text-xs font-normal">
                    {t.citizenReport.pointsEarned}
                  </span>
                </p>
              </div>
            </div>
            <Button
              className="mt-6 w-full"
              onClick={() => {
                setSubmitted(false);
                setFiles([]);
                setPreviews([]);
                setDescription("");
                setLatitude(null);
                setLongitude(null);
              }}
            >
              Submit Another Report
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-semibold">{t.citizenReport.title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t.citizenReport.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Photo Upload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t.citizenReport.uploadEvidence}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {t.citizenReport.addPhotos}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  JPG, PNG, MP4
                </p>
              </div>

              {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {previews.map((prev, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={prev}
                        alt={`Upload ${i + 1}`}
                        className="w-full h-24 object-cover"
                      />
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t.citizenReport.pinLocation}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latitude && longitude ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  <MapPin className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-700">
                      Location pinned
                    </p>
                    <p className="text-xs text-green-600">
                      {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => {
                      setLatitude(null);
                      setLongitude(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={getLocation}
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4 mr-2" />
                  )}
                  {t.citizenReport.pinLocation}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Description */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t.citizenReport.description}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={t.citizenReport.descriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  {t.citizenReport.yourName}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-8"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {t.citizenReport.phone}
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 h-8"
                  type="tel"
                />
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={submitting || (!latitude && !longitude)}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t.citizenReport.submitting}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {t.citizenReport.submit}
              </>
            )}
          </Button>
        </div>

        {/* Incentive Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                {t.citizenReport.incentivePoints}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tiers.map((tier, i) => {
                  const colorMap: Record<string, string> = {
                    amber: "bg-amber-100 text-amber-700 border-amber-200",
                    green: "bg-green-100 text-green-700 border-green-200",
                    red: "bg-red-100 text-red-700 border-red-200",
                  };
                  const badgeClass = colorMap[tier.badge_color] ?? "bg-slate-100 text-slate-700 border-slate-200";
                  return (
                    <div
                      key={tier.id}
                      className={`flex items-center justify-between py-2 ${i < tiers.length - 1 ? "border-b" : ""}`}
                    >
                      <span className="text-sm">{tier.label}</span>
                      <Badge className={badgeClass}>+{tier.points}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {t.citizenReport.yourPoints}
                </p>
                <p className="text-3xl font-bold text-amber-600">{totalPoints}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Submit reports to earn points
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
