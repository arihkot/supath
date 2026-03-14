"""Pothole detection service.

Detection pipeline:
  1. YOLO inference at multiple scales (640, 1280) with a permissive
     confidence floor to maximise recall.
  2. Each candidate is scored through a lightweight CV stage that
     evaluates contrast, texture, edge density, and shape.  The CV
     score is combined with the YOLO confidence to decide acceptance.
     The gate is designed to handle diverse road conditions including
     wet surfaces, water-filled potholes, snow, and shadows.
  3. An adaptive road mask built from colour segmentation with wide
     tolerances replaces the old strict asphalt-only prior.
  4. Final confidence equals the YOLO model confidence; the CV stage
     only rejects obvious false positives.

If required dependencies are unavailable, the service returns no
detections instead of synthetic/mock detections.
"""

from __future__ import annotations

import os
from collections import defaultdict

from app.config import settings

# ---------------------------------------------------------------------------
# Model lifecycle
# ---------------------------------------------------------------------------

_model = None


def get_model():
    """Return cached YOLO model instance."""
    global _model
    if _model is None:
        _model = _load_model()
    return _model


def _load_model():
    model_path = settings.YOLO_MODEL_PATH
    if not os.path.exists(model_path):
        print(f"[detector] Model weights not found at {model_path}.")
        return None

    try:
        from ultralytics import YOLO

        model = YOLO(model_path)
        print(f"[detector] YOLO model loaded: {model_path}")
        return model
    except Exception as exc:
        print(f"[detector] Failed to load YOLO model: {exc}")
        return None


def warmup_model():
    """Warm up model and execution backend once at startup."""
    model = get_model()
    if model is None:
        return
    try:
        import numpy as np

        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        model(dummy, conf=0.25, iou=0.4, imgsz=640, verbose=False)
        print("[detector] Model warmed up.")
    except Exception as exc:
        print(f"[detector] Warmup failed (non-fatal): {exc}")


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------


def get_image_dimensions(image_path: str) -> tuple[int, int]:
    """Return image width and height, with safe fallback."""
    try:
        from PIL import Image

        with Image.open(image_path) as img:
            return img.width, img.height
    except Exception:
        return 640, 640


def extract_exif_gps(image_path: str) -> tuple[float | None, float | None]:
    """Extract GPS lat/lng from image EXIF if present."""
    try:
        from PIL import ExifTags, Image

        with Image.open(image_path) as img:
            raw_exif = img._getexif()  # type: ignore[attr-defined]

        if not raw_exif:
            return None, None

        exif = {ExifTags.TAGS.get(k, k): v for k, v in raw_exif.items()}
        gps_info = exif.get("GPSInfo")
        if not gps_info:
            return None, None

        gps = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps_info.items()}

        def dms_to_decimal(dms, ref: str) -> float:
            d, m, s = float(dms[0]), float(dms[1]), float(dms[2])
            value = d + m / 60.0 + s / 3600.0
            return -value if ref in ("S", "W") else value

        lat = dms_to_decimal(gps["GPSLatitude"], gps.get("GPSLatitudeRef", "N"))
        lng = dms_to_decimal(gps["GPSLongitude"], gps.get("GPSLongitudeRef", "E"))
        return lat, lng
    except Exception:
        return None, None


def auto_orient_image(image_path: str) -> None:
    """Apply EXIF orientation before inference."""
    try:
        from PIL import Image, ImageOps
        from PIL.Image import Image as PILImage

        with Image.open(image_path) as img:
            result_img: PILImage = ImageOps.exif_transpose(img) or img
            result_img.save(image_path)
    except Exception:
        return


# ---------------------------------------------------------------------------
# Main entry: image detection
# ---------------------------------------------------------------------------


def detect_potholes_in_image(image_path: str) -> tuple[list[dict], tuple[int, int]]:
    """Detect potholes in one image.

    Pipeline:
      1. Try YOLO inference (primary detector)
      2. If YOLO produces candidates, verify with CV gate
      3. If YOLO produces nothing, fall back to pure OpenCV detection

    Returns (detections, (img_width, img_height)).
    """
    auto_orient_image(image_path)
    img_w, img_h = get_image_dimensions(image_path)

    try:
        import cv2
    except Exception:
        print("[detector] OpenCV unavailable; returning zero detections.")
        return [], (img_w, img_h)

    image = cv2.imread(image_path)
    if image is None:
        print("[detector] Unable to read image; returning zero detections.")
        return [], (img_w, img_h)

    # Stage 1: YOLO inference — multi-scale, permissive threshold
    min_conf = max(float(settings.DETECTION_CONFIDENCE), 0.25)
    candidates = _yolo_detect(image_path, img_w, img_h, min_conf)

    if candidates:
        print(f"[detector] YOLO produced {len(candidates)} candidates")
        # Stage 2: CV verification gate
        verified = _cv_verify(image, candidates, img_w, img_h)
    else:
        # Stage 2 fallback: pure OpenCV detection when YOLO fails
        print("[detector] No YOLO candidates; running OpenCV fallback detector")
        verified = _cv_fallback_detect(image, img_w, img_h)

    # Stage 3: NMS + cap
    verified = _nms(verified, iou_threshold=0.30, containment_threshold=0.55)
    verified.sort(key=lambda d: d["confidence"], reverse=True)
    verified = verified[:8]

    # Strip internal keys
    for det in verified:
        for k in ("_x1", "_y1", "_x2", "_y2"):
            det.pop(k, None)

    print(f"[detector] final: {len(verified)} detections")
    return verified, (img_w, img_h)


# ---------------------------------------------------------------------------
# Stage 1: YOLO inference (multi-scale)
# ---------------------------------------------------------------------------


def _yolo_detect(
    image_path: str,
    img_w: int,
    img_h: int,
    min_confidence: float,
) -> list[dict]:
    """Run YOLO at multiple scales and merge candidates."""
    model = get_model()
    if model is None:
        print("[detector] YOLO model is None — not loaded or missing")
        return []

    image_area = max(img_w * img_h, 1)
    all_detections: list[dict] = []

    # Run inference at two scales for better recall at different distances
    scales = [1280, 640]
    for scale in scales:
        try:
            results = model(
                image_path,
                conf=min_confidence,
                iou=float(settings.DETECTION_IOU),
                imgsz=scale,
                verbose=False,
            )
        except Exception as exc:
            print(f"[detector] YOLO inference failed at scale {scale}: {exc}")
            continue

        for result in results:
            # Log model class names on first result for debugging
            if scale == scales[0]:
                print(f"[detector] Model classes: {result.names}")
                print(f"[detector] Boxes at scale {scale}: {len(result.boxes)}")

            masks = result.masks
            for idx, box in enumerate(result.boxes):
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                bw = max(1.0, x2 - x1)
                bh = max(1.0, y2 - y1)
                area_bbox = bw * bh
                area_ratio = area_bbox / image_area

                # Permissive area filter: reject only extreme outliers
                if area_ratio < 0.001 or area_ratio > 0.40:
                    continue

                conf = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = str(result.names.get(class_id, "pothole")).lower()

                print(
                    f"[detector]   box {idx}: class={class_name} conf={conf:.3f} "
                    f"area_ratio={area_ratio:.4f}"
                )

                # Accept any detection from a pothole-specific model
                # (the model is trained for pothole detection, so all
                # classes are relevant road damage types)

                # Use segmentation mask area when available
                area_pixels = area_bbox
                has_mask = False
                if masks is not None and idx < len(masks.data):
                    try:
                        mask_tensor = masks.data[idx]
                        mask_pixels = float(mask_tensor.sum().item())
                        mh, mw = mask_tensor.shape
                        scale_factor = image_area / max(mw * mh, 1)
                        area_pixels = max(area_bbox * 0.40, mask_pixels * scale_factor)
                        has_mask = True
                    except Exception:
                        pass

                # Reject boxes whose centre is in the top 15% (sky)
                cy = (y1 + y2) * 0.5
                if cy < img_h * 0.15:
                    continue

                all_detections.append(
                    {
                        "bbox": [float(x1), float(y1), float(x2), float(y2)],
                        "confidence": round(conf, 3),
                        "class_id": class_id,
                        "class_name": class_name,
                        "area_pixels": float(area_pixels),
                        "area_ratio": float(area_pixels) / image_area,
                        "has_mask": has_mask,
                        "img_width": img_w,
                        "img_height": img_h,
                        "_x1": float(x1),
                        "_y1": float(y1),
                        "_x2": float(x2),
                        "_y2": float(y2),
                    }
                )

    # De-duplicate across scales and multi-class outputs
    all_detections = _nms(
        all_detections, iou_threshold=0.35, containment_threshold=0.60
    )
    all_detections.sort(key=lambda d: d["confidence"], reverse=True)
    return all_detections


# ---------------------------------------------------------------------------
# Stage 2: CV verification gate
# ---------------------------------------------------------------------------


def _cv_verify(image, candidates: list[dict], img_w: int, img_h: int) -> list[dict]:
    """Verify YOLO candidates using CV checks as a soft gate.

    Each candidate is evaluated through 5 independent checks designed
    to work across diverse road conditions (dry, wet, snowy, shadowed):
      1. Contrast: inner region differs in brightness from surroundings
         (darker OR lighter — handles water-filled potholes that reflect)
      2. Texture:  inner region has distinct texture variation
      3. Edge density: inner region has notable edge activity
      4. Shape:    a coherent defect contour exists inside the bbox
      5. Road membership: the bbox overlaps with detected road surface

    Required check count scales with YOLO confidence:
      >= 0.60  ->  0 checks  (trusted model output — auto-accept)
      >= 0.40  ->  1 check   (light sanity check)
      <  0.40  ->  2 checks  (low confidence — need some CV evidence)
    """
    import cv2
    import numpy as np

    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    road_mask = _build_adaptive_road_mask(image, gray, hsv)

    verified: list[dict] = []

    for det in candidates:
        x1 = int(max(0, min(det["_x1"], w - 2)))
        y1 = int(max(0, min(det["_y1"], h - 2)))
        x2 = int(max(x1 + 2, min(det["_x2"], w - 1)))
        y2 = int(max(y1 + 2, min(det["_y2"], h - 1)))

        bw = x2 - x1
        bh = y2 - y1
        area = float(bw * bh)
        area_ratio = area / max(w * h, 1)

        if area_ratio < 0.001 or area_ratio > 0.40:
            continue

        # Build inner (candidate) and outer (ring) regions
        inner_mask = np.zeros((h, w), dtype=np.uint8)
        inner_mask[y1:y2, x1:x2] = 255
        inner_area = cv2.countNonZero(inner_mask)

        pad = max(10, int(0.20 * max(bw, bh)))
        rx1 = max(0, x1 - pad)
        ry1 = max(0, y1 - pad)
        rx2 = min(w, x2 + pad)
        ry2 = min(h, y2 + pad)

        ring_mask = np.zeros((h, w), dtype=np.uint8)
        ring_mask[ry1:ry2, rx1:rx2] = 255
        ring_mask = cv2.bitwise_and(ring_mask, cv2.bitwise_not(inner_mask))
        ring_area = cv2.countNonZero(ring_mask)

        if ring_area < 30:
            continue

        # ------ Check 1: Contrast (bidirectional brightness difference) ------
        inner_mean = float(cv2.mean(gray, mask=inner_mask)[0])
        ring_mean = float(cv2.mean(gray, mask=ring_mask)[0])
        brightness_diff = abs(ring_mean - inner_mean)

        # Also check HSV channels for water-filled / shadowed potholes
        inner_sat = float(cv2.mean(hsv[:, :, 1], mask=inner_mask)[0])
        ring_sat = float(cv2.mean(hsv[:, :, 1], mask=ring_mask)[0])
        inner_hue = float(cv2.mean(hsv[:, :, 0], mask=inner_mask)[0])
        ring_hue = float(cv2.mean(hsv[:, :, 0], mask=ring_mask)[0])

        pass_contrast = (
            brightness_diff >= 4.0  # any brightness difference (dark or bright)
            or abs(inner_sat - ring_sat) > 8.0  # saturation shift (water, mud)
            or abs(inner_hue - ring_hue) > 6.0  # hue shift (different surface)
        )

        # ------ Check 2: Texture distinctness ------
        bbox_patch = gray[y1:y2, x1:x2]
        if bbox_patch.size == 0:
            continue
        local_patch = gray[ry1:ry2, rx1:rx2]
        if local_patch.size == 0:
            continue

        inner_lap = float(cv2.Laplacian(bbox_patch, cv2.CV_64F).var())
        local_lap = float(cv2.Laplacian(local_patch, cv2.CV_64F).var())
        texture_ratio = inner_lap / max(local_lap, 1.0)

        # Accept any notable texture difference (rougher or smoother)
        pass_texture = texture_ratio < 0.65 or texture_ratio > 1.35

        # ------ Check 3: Edge density ------
        edges = cv2.Canny(bbox_patch, 30, 100)
        edge_density = float(cv2.countNonZero(edges)) / max(bbox_patch.size, 1)
        pass_edges = edge_density > 0.03

        # ------ Check 4: Shape coherence ------
        shape_score = _shape_consistency(gray, x1, y1, x2, y2)
        pass_shape = shape_score >= 0.15

        # ------ Check 5: Road membership ------
        road_overlap = cv2.countNonZero(cv2.bitwise_and(inner_mask, road_mask)) / max(
            inner_area, 1
        )
        pass_road = road_overlap >= 0.25

        # ------ Gate decision ------
        checks_passed = sum(
            [pass_contrast, pass_texture, pass_edges, pass_shape, pass_road]
        )
        yolo_conf = float(det["confidence"])

        # High-confidence YOLO detections (>= 0.60) are auto-accepted
        # Medium-confidence (0.40-0.60) need 1 CV check
        # Lower-confidence (< 0.40) need 2 CV checks
        if yolo_conf >= 0.60:
            required_checks = 0
        elif yolo_conf >= 0.40:
            required_checks = 1
        else:
            required_checks = 2

        if checks_passed < required_checks:
            continue

        verified.append(
            {
                "bbox": [float(x1), float(y1), float(x2), float(y2)],
                "confidence": round(yolo_conf, 3),
                "class_id": det.get("class_id", 0),
                "class_name": "pothole",
                "area_pixels": float(area),
                "area_ratio": float(area_ratio),
                "has_mask": det.get("has_mask", False),
                "img_width": img_w,
                "img_height": img_h,
                "cv_checks_passed": checks_passed,
                "cv_details": {
                    "contrast": pass_contrast,
                    "texture": pass_texture,
                    "edges": pass_edges,
                    "shape": pass_shape,
                    "road": pass_road,
                },
                "yolo_confidence": round(yolo_conf, 3),
                "_x1": float(x1),
                "_y1": float(y1),
                "_x2": float(x2),
                "_y2": float(y2),
            }
        )

    return verified


# ---------------------------------------------------------------------------
# OpenCV fallback detector (when YOLO produces nothing)
# ---------------------------------------------------------------------------


def _cv_fallback_detect(image, img_w: int, img_h: int) -> list[dict]:
    """Detect pothole-like regions using pure OpenCV when YOLO fails.

    Uses a multi-strategy approach:
      1. Dark region detection — potholes are typically darker depressions
      2. Water puddle detection — bright reflective regions on dark road
      3. Contour-based candidate extraction from combined masks

    Each candidate is scored based on shape, contrast, and location.
    """
    import cv2
    import numpy as np

    h, w = image.shape[:2]
    image_area = max(h * w, 1)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    blur = cv2.GaussianBlur(gray, (7, 7), 0)

    # Focus on the road region (lower 80% of image)
    road_top = int(h * 0.20)

    # --- Strategy 1: Dark region detection ---
    # Potholes are typically darker than surrounding road
    # Use adaptive thresholding to find locally dark regions
    adaptive = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 8
    )
    adaptive[:road_top, :] = 0

    # Also use Otsu to find globally dark regions
    road_gray = blur[road_top:, :]
    if road_gray.size > 0:
        otsu_thresh, otsu_mask_road = cv2.threshold(
            road_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )
        otsu_mask = np.zeros((h, w), dtype=np.uint8)
        otsu_mask[road_top:, :] = otsu_mask_road
    else:
        otsu_mask = np.zeros((h, w), dtype=np.uint8)

    # --- Strategy 2: Water puddle detection ---
    # Water-filled potholes can appear as bright reflective patches
    # surrounded by darker road, or as regions with distinct color
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]

    # Detect very bright regions on road (water reflecting sky)
    road_val = val[road_top:, :]
    mean_val = 128.0
    std_val = 40.0
    if road_val.size > 0:
        mean_val = float(np.mean(road_val))
        std_val = float(np.std(road_val))
        bright_thresh = min(mean_val + std_val * 0.8, 220)
        water_bright = np.zeros((h, w), dtype=np.uint8)
        water_bright[road_top:, :] = np.where(
            (val[road_top:, :] > bright_thresh) & (sat[road_top:, :] < 80), 255, 0
        ).astype(np.uint8)
    else:
        water_bright = np.zeros((h, w), dtype=np.uint8)

    # Detect low-saturation dark regions (wet/dirty potholes)
    water_dark = np.zeros((h, w), dtype=np.uint8)
    if road_val.size > 0 and mean_val is not None:
        dark_thresh = max(mean_val - std_val * 0.8, 30)
        water_dark[road_top:, :] = np.where(
            (val[road_top:, :] < dark_thresh) & (sat[road_top:, :] < 90), 255, 0
        ).astype(np.uint8)

    # --- Combine all masks ---
    combined = cv2.bitwise_or(adaptive, otsu_mask)
    combined = cv2.bitwise_or(combined, water_bright)
    combined = cv2.bitwise_or(combined, water_dark)

    # Morphological cleanup
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel_close)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel_open)

    # --- Edge-based refinement ---
    # Use edges to refine pothole boundaries
    edges = cv2.Canny(blur, 30, 100)
    edges[:road_top, :] = 0
    dilated_edges = cv2.dilate(edges, np.ones((5, 5), np.uint8))

    # Combine edges with region mask
    enhanced = cv2.bitwise_or(combined, dilated_edges)
    enhanced = cv2.morphologyEx(enhanced, cv2.MORPH_CLOSE, kernel_close)

    # --- Find contours and score candidates ---
    contours, _ = cv2.findContours(enhanced, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates: list[dict] = []

    for contour in contours:
        area = cv2.contourArea(contour)
        area_ratio = area / image_area

        # Filter by size: not too small, not too large
        if area_ratio < 0.005 or area_ratio > 0.35:
            continue

        # Get bounding box
        x, y, bw, bh = cv2.boundingRect(contour)
        x1, y1, x2, y2 = x, y, x + bw, y + bh

        # Skip if center is in sky region
        cy = (y1 + y2) * 0.5
        if cy < h * 0.20:
            continue

        # --- Score the candidate ---
        score = 0.0
        score_components = {}

        # 1. Shape score: solidity and circularity
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        solidity = area / max(hull_area, 1.0)
        perimeter = cv2.arcLength(contour, True)
        circularity = (4.0 * 3.14159 * area) / max(perimeter * perimeter, 1.0)
        circularity = min(1.0, circularity)

        shape_score = 0.5 * solidity + 0.5 * circularity
        score += shape_score * 0.25
        score_components["shape"] = round(shape_score, 3)

        # 2. Contrast score: how different is the region from surroundings
        inner_mask = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(inner_mask, [contour], -1, (255,), -1)
        inner_pixels = cv2.countNonZero(inner_mask)

        if inner_pixels > 10:
            pad = max(15, int(0.25 * max(bw, bh)))
            rx1, ry1 = max(0, x1 - pad), max(0, y1 - pad)
            rx2, ry2 = min(w, x2 + pad), min(h, y2 + pad)

            ring_mask = np.zeros((h, w), dtype=np.uint8)
            ring_mask[ry1:ry2, rx1:rx2] = 255
            ring_mask = cv2.bitwise_and(ring_mask, cv2.bitwise_not(inner_mask))

            inner_mean = float(cv2.mean(gray, mask=inner_mask)[0])
            ring_mean = float(cv2.mean(gray, mask=ring_mask)[0])
            contrast = abs(ring_mean - inner_mean)
            contrast_score = min(1.0, contrast / 30.0)

            # Also check saturation difference
            inner_sat = float(cv2.mean(sat, mask=inner_mask)[0])
            ring_sat = float(cv2.mean(sat, mask=ring_mask)[0])
            sat_diff = abs(inner_sat - ring_sat)
            sat_score = min(1.0, sat_diff / 25.0)

            combined_contrast = max(contrast_score, sat_score)
            score += combined_contrast * 0.30
            score_components["contrast"] = round(combined_contrast, 3)

        # 3. Texture score: edge density inside the region
        inner_edges = cv2.countNonZero(cv2.bitwise_and(edges, inner_mask))
        edge_density = inner_edges / max(inner_pixels, 1)
        texture_score = min(1.0, edge_density / 0.15)
        score += texture_score * 0.20
        score_components["texture"] = round(texture_score, 3)

        # 4. Aspect ratio: potholes tend to be wider than tall (from above)
        aspect = bw / max(bh, 1)
        if 0.3 <= aspect <= 4.0:
            aspect_score = 1.0 - abs(aspect - 1.5) / 3.0
            aspect_score = max(0.0, aspect_score)
        else:
            aspect_score = 0.0
        score += aspect_score * 0.10
        score_components["aspect"] = round(aspect_score, 3)

        # 5. Position: potholes are more likely in the center-bottom of image
        rel_y = cy / h
        position_score = min(1.0, (rel_y - 0.2) / 0.6) if rel_y > 0.2 else 0.0
        score += position_score * 0.15
        score_components["position"] = round(position_score, 3)

        # Minimum score threshold
        if score < 0.25:
            continue

        # Map score to confidence (0.30 - 0.75 range for CV-only detections)
        confidence = 0.30 + score * 0.45

        candidates.append(
            {
                "bbox": [float(x1), float(y1), float(x2), float(y2)],
                "confidence": round(confidence, 3),
                "class_id": 0,
                "class_name": "pothole",
                "area_pixels": float(area),
                "area_ratio": float(area_ratio),
                "has_mask": False,
                "img_width": img_w,
                "img_height": img_h,
                "detection_method": "cv_fallback",
                "cv_score_components": score_components,
                "_x1": float(x1),
                "_y1": float(y1),
                "_x2": float(x2),
                "_y2": float(y2),
            }
        )

    # NMS to remove overlapping candidates
    candidates = _nms(candidates, iou_threshold=0.30, containment_threshold=0.50)
    candidates.sort(key=lambda d: d["confidence"], reverse=True)

    print(f"[detector] CV fallback found {len(candidates)} candidates")
    return candidates


# ---------------------------------------------------------------------------
# Shape analysis
# ---------------------------------------------------------------------------


def _shape_consistency(gray, x1: int, y1: int, x2: int, y2: int) -> float:
    """Estimate whether the candidate bbox contains a coherent defect region.

    Returns a score in [0, 1].  Higher = more likely a real defect.
    Uses adaptive thresholding alongside Otsu for better results on
    low-contrast surfaces (wet roads, water-filled potholes).
    """
    import cv2
    import numpy as np

    patch = gray[y1:y2, x1:x2]
    if patch.size == 0:
        return 0.0

    pw, ph = patch.shape[1], patch.shape[0]
    if pw < 8 or ph < 8:
        return 0.0

    blur = cv2.GaussianBlur(patch, (5, 5), 0)

    # Try Otsu thresholding
    _, otsu_mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Also try adaptive thresholding (better for low-contrast wet surfaces)
    block_size = max(11, (min(pw, ph) // 4) | 1)  # ensure odd
    adaptive_mask = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block_size, 4
    )

    # Use whichever method produces a more coherent contour
    best_score = 0.0
    for mask in [otsu_mask, adaptive_mask]:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        clean = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        clean = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(
            clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not contours:
            continue

        best = max(contours, key=cv2.contourArea)
        area = float(cv2.contourArea(best))
        patch_area = float((x2 - x1) * (y2 - y1))
        if patch_area <= 0:
            continue

        fill_ratio = area / patch_area
        if fill_ratio < 0.04 or fill_ratio > 0.95:
            continue

        perimeter = float(cv2.arcLength(best, True))
        if perimeter <= 1.0:
            continue

        circularity = float(
            max(0.0, min(1.0, (4.0 * 3.14159 * area) / (perimeter * perimeter)))
        )

        hull = cv2.convexHull(best)
        hull_area = float(cv2.contourArea(hull))
        if hull_area <= 1.0:
            continue
        solidity = area / hull_area

        score = float(max(0.0, min(1.0, 0.55 * solidity + 0.45 * circularity)))
        best_score = max(best_score, score)

    return best_score


# ---------------------------------------------------------------------------
# Adaptive road mask
# ---------------------------------------------------------------------------


def _build_adaptive_road_mask(image, gray, hsv):
    """Build a road mask combining colour segmentation with a geometric prior.

    Uses wide tolerances to handle wet, snowy, and shadowed road surfaces
    in addition to typical dry asphalt.
    """
    import cv2
    import numpy as np

    h, w = image.shape[:2]

    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]

    # Primary: low-saturation, mid-brightness (typical asphalt)
    road_dry = np.zeros((h, w), dtype=np.uint8)
    road_dry[(sat < 70) & (val > 30) & (val < 230)] = 255

    # Secondary: wet road can have higher saturation and reflections
    road_wet = np.zeros((h, w), dtype=np.uint8)
    road_wet[(sat < 100) & (val > 20) & (val < 245)] = 255

    # Combine both
    road_colour = cv2.bitwise_or(road_dry, road_wet)

    # Mask out top 20% (sky region)
    road_colour[: int(h * 0.20), :] = 0

    # Clean up noise
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    road_colour = cv2.morphologyEx(road_colour, cv2.MORPH_CLOSE, kernel)
    road_colour = cv2.morphologyEx(road_colour, cv2.MORPH_OPEN, kernel)

    road_area_ratio = cv2.countNonZero(road_colour) / max(h * w, 1)

    # If colour segmentation found reasonable road area, use it
    if road_area_ratio > 0.10:
        return road_colour

    # Fallback: generous geometric prior (lower 75% of image)
    fallback = np.zeros((h, w), dtype=np.uint8)
    fallback[int(h * 0.25) :, :] = 255
    return fallback


# ---------------------------------------------------------------------------
# NMS
# ---------------------------------------------------------------------------


def _nms(
    detections: list[dict],
    iou_threshold: float = 0.4,
    containment_threshold: float = 0.6,
) -> list[dict]:
    """Non-maximum suppression with containment check."""
    if len(detections) <= 1:
        return detections

    detections = sorted(detections, key=lambda d: d["confidence"], reverse=True)
    kept: list[dict] = []

    for det in detections:
        suppress = False
        for prev in kept:
            if _box_iou(det, prev) > iou_threshold:
                suppress = True
                break
            if _containment_ratio(det, prev) > containment_threshold:
                suppress = True
                break
        if not suppress:
            kept.append(det)

    return kept


def _box_iou(a: dict, b: dict) -> float:
    ab = [
        a.get("_x1", a["bbox"][0]),
        a.get("_y1", a["bbox"][1]),
        a.get("_x2", a["bbox"][2]),
        a.get("_y2", a["bbox"][3]),
    ]
    bb = [
        b.get("_x1", b["bbox"][0]),
        b.get("_y1", b["bbox"][1]),
        b.get("_x2", b["bbox"][2]),
        b.get("_y2", b["bbox"][3]),
    ]

    ix1 = max(ab[0], bb[0])
    iy1 = max(ab[1], bb[1])
    ix2 = min(ab[2], bb[2])
    iy2 = min(ab[3], bb[3])

    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0.0:
        return 0.0

    area_a = max(0.0, (ab[2] - ab[0]) * (ab[3] - ab[1]))
    area_b = max(0.0, (bb[2] - bb[0]) * (bb[3] - bb[1]))
    union = area_a + area_b - inter
    return inter / max(union, 1.0)


def _containment_ratio(a: dict, b: dict) -> float:
    ab = [
        a.get("_x1", a["bbox"][0]),
        a.get("_y1", a["bbox"][1]),
        a.get("_x2", a["bbox"][2]),
        a.get("_y2", a["bbox"][3]),
    ]
    bb = [
        b.get("_x1", b["bbox"][0]),
        b.get("_y1", b["bbox"][1]),
        b.get("_x2", b["bbox"][2]),
        b.get("_y2", b["bbox"][3]),
    ]

    ix1 = max(ab[0], bb[0])
    iy1 = max(ab[1], bb[1])
    ix2 = min(ab[2], bb[2])
    iy2 = min(ab[3], bb[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0.0:
        return 0.0

    area_a = max(1.0, (ab[2] - ab[0]) * (ab[3] - ab[1]))
    area_b = max(1.0, (bb[2] - bb[0]) * (bb[3] - bb[1]))
    smaller = min(area_a, area_b)
    return max(inter / area_a, inter / smaller)


# ---------------------------------------------------------------------------
# Video detection
# ---------------------------------------------------------------------------


def detect_potholes_in_video(video_path: str, sample_rate: int = 24) -> dict:
    """Detect potholes from sampled video frames with temporal consensus."""
    try:
        import cv2
        import tempfile
    except Exception as exc:
        print(f"[detector] Video dependencies unavailable: {exc}")
        return {
            "frames_processed": 0,
            "total_frames": 0,
            "total_detections": 0,
            "detections_by_frame": [],
        }

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {
            "frames_processed": 0,
            "total_frames": 0,
            "total_detections": 0,
            "detections_by_frame": [],
        }

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30

    if sample_rate <= 0:
        sample_rate = max(1, fps // 2)

    frames_processed = 0
    frame_idx = 0
    all_events: list[dict] = []

    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break

            if frame_idx % sample_rate == 0:
                frame_path = os.path.join(tmpdir, f"frame_{frame_idx}.jpg")
                cv2.imwrite(frame_path, frame)
                detections, _ = detect_potholes_in_image(frame_path)

                timestamp = round(frame_idx / max(fps, 1), 2)
                for det in detections:
                    event = {
                        **det,
                        "frame_number": frame_idx,
                        "timestamp_sec": timestamp,
                    }
                    all_events.append(event)

                frames_processed += 1

            frame_idx += 1

    cap.release()

    if not all_events:
        return {
            "frames_processed": frames_processed,
            "total_frames": total_frames,
            "total_detections": 0,
            "detections_by_frame": [],
        }

    accepted = _temporal_consensus(all_events)
    by_frame: dict[int, list[dict]] = defaultdict(list)
    for det in accepted:
        by_frame[int(det["frame_number"])].append(det)

    detections_by_frame: list[dict] = []
    for fidx in sorted(by_frame.keys()):
        detections_by_frame.append(
            {
                "frame": fidx,
                "timestamp": round(fidx / max(fps, 1), 2),
                "detections": by_frame[fidx],
            }
        )

    total_detections = sum(len(x["detections"]) for x in detections_by_frame)
    return {
        "frames_processed": frames_processed,
        "total_frames": total_frames,
        "total_detections": total_detections,
        "detections_by_frame": detections_by_frame,
    }


def _temporal_consensus(events: list[dict]) -> list[dict]:
    """Keep detections that appear consistently across multiple frames.

    A detection cluster must span >= 2 distinct frames and have a peak
    confidence >= 0.50 to be accepted.
    """
    if len(events) <= 1:
        return []

    clusters: list[dict] = []

    for idx, det in enumerate(events):
        x1, y1, x2, y2 = det["bbox"]
        cx = (x1 + x2) * 0.5 / max(det.get("img_width", 1), 1)
        cy = (y1 + y2) * 0.5 / max(det.get("img_height", 1), 1)
        ar = float(det.get("area_ratio", 0.0))

        best_cluster = None
        best_dist = 1e9

        for ci, c in enumerate(clusters):
            dx = cx - c["cx"]
            dy = cy - c["cy"]
            dist = (dx * dx + dy * dy) ** 0.5
            ar_ref = max(c["area_ratio"], 1e-4)
            ar_scale = ar / ar_ref
            if dist < 0.12 and 0.35 <= ar_scale <= 2.8 and dist < best_dist:
                best_cluster = ci
                best_dist = dist

        if best_cluster is None:
            clusters.append(
                {
                    "cx": cx,
                    "cy": cy,
                    "area_ratio": max(ar, 1e-4),
                    "members": [idx],
                    "frames": {int(det["frame_number"])},
                    "max_conf": float(det.get("confidence", 0.0)),
                }
            )
        else:
            c = clusters[best_cluster]
            c["members"].append(idx)
            c["frames"].add(int(det["frame_number"]))
            c["max_conf"] = max(c["max_conf"], float(det.get("confidence", 0.0)))
            n = len(c["members"])
            c["cx"] = (c["cx"] * (n - 1) + cx) / n
            c["cy"] = (c["cy"] * (n - 1) + cy) / n
            c["area_ratio"] = (c["area_ratio"] * (n - 1) + max(ar, 1e-4)) / n

    accepted_indices: set[int] = set()
    for c in clusters:
        if len(c["frames"]) >= 2 and c["max_conf"] >= 0.50:
            accepted_indices.update(c["members"])

    return [det for idx, det in enumerate(events) if idx in accepted_indices]
