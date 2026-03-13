"""
Pothole severity scoring — resolution-independent, mask-aware.

Scoring uses `area_ratio` (pothole area / total image area) so that the same
physical pothole scores identically regardless of the camera resolution.
"""

from __future__ import annotations

from typing import Optional

# Area ratio thresholds (pothole area as a fraction of the total image area).
# Roughly correspond to: tiny (<0.3%), small (0.3–1%), medium (1–3%), large (>3%).
_AREA_RATIO_TINY = 0.003
_AREA_RATIO_SMALL = 0.01
_AREA_RATIO_MEDIUM = 0.03


def calculate_severity(detection: dict) -> tuple[str, float]:
    """
    Calculate a severity label and numeric score (0–100) for one detection.

    Inputs (from detection dict):
        confidence  float   — YOLO confidence 0–1
        area_ratio  float   — mask/bbox area ÷ image area  (preferred)
        area_pixels float   — raw pixel area (legacy fallback)
        img_width   int     — image width  (used for legacy normalisation)
        img_height  int     — image height (used for legacy normalisation)
        class_name  str     — detected class label

    Returns:
        (severity_label, severity_score)
        severity_label : "low" | "medium" | "high" | "critical"
        severity_score : 0.0 – 100.0
    """
    confidence = float(detection.get("confidence", 0.5))
    class_name = str(detection.get("class_name", "pothole")).lower()

    # ---- area ratio -------------------------------------------------------- #
    area_ratio: Optional[float] = detection.get("area_ratio")
    if area_ratio is None:
        # Legacy path: normalise raw pixel area by image dimensions
        area_pixels = float(detection.get("area_pixels", 5000))
        img_w = int(detection.get("img_width", 640))
        img_h = int(detection.get("img_height", 480))
        area_ratio = area_pixels / max(img_w * img_h, 1)

    # ---- confidence component (0–40 pts) ---------------------------------- #
    confidence_score = confidence * 40.0

    # ---- area component (0–40 pts) ---------------------------------------- #
    if area_ratio < _AREA_RATIO_TINY:
        area_score = 5.0  # tiny crack / spall
    elif area_ratio < _AREA_RATIO_SMALL:
        area_score = 15.0  # small pothole
    elif area_ratio < _AREA_RATIO_MEDIUM:
        area_score = 28.0  # medium pothole
    else:
        area_score = 40.0  # large / severe damage

    # ---- class component (0–20 pts) --------------------------------------- #
    if "crack" in class_name:
        class_score = 5.0
    elif "pothole" in class_name:
        class_score = 15.0
    elif any(
        kw in class_name for kw in ("alligator", "severe", "deep", "large", "damage")
    ):
        class_score = 20.0
    else:
        class_score = 10.0

    total = min(100.0, confidence_score + area_score + class_score)

    if total >= 75:
        label = "critical"
    elif total >= 50:
        label = "high"
    elif total >= 25:
        label = "medium"
    else:
        label = "low"

    return label, round(total, 1)
