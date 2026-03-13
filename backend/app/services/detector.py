"""YOLO-based pothole detection service with segmentation support."""

from __future__ import annotations

import os
import hashlib
from app.config import settings

# --- Model singleton ------------------------------------------------------- #

_model = None


def get_model():
    """Return the cached YOLO model, loading it on first call."""
    global _model
    if _model is None:
        _model = _load_model()
    return _model


def _load_model():
    model_path = settings.YOLO_MODEL_PATH
    if not os.path.exists(model_path):
        print(
            f"[detector] Model weights not found at {model_path}. Using mock detections."
        )
        return None
    try:
        from ultralytics import YOLO

        model = YOLO(model_path)
        print(f"[detector] YOLO model loaded: {model_path}")
        return model
    except Exception as e:
        print(f"[detector] Failed to load YOLO model: {e}")
        return None


def warmup_model():
    """Pre-load the model and run one dummy inference to warm up CUDA/CPU."""
    import numpy as np

    model = get_model()
    if model is None:
        return
    try:
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        model(dummy, verbose=False, imgsz=640)
        print("[detector] Model warmed up.")
    except Exception as e:
        print(f"[detector] Warmup failed (non-fatal): {e}")


# --- Image helpers ---------------------------------------------------------- #


def get_image_dimensions(image_path: str) -> tuple[int, int]:
    """Return (width, height) of image, or (640, 640) on failure."""
    try:
        from PIL import Image

        with Image.open(image_path) as img:
            return img.width, img.height
    except Exception:
        return 640, 640


def extract_exif_gps(image_path: str) -> tuple[float | None, float | None]:
    """
    Extract GPS latitude/longitude from JPEG EXIF metadata.
    Returns (lat, lng) or (None, None) if not available.
    """
    try:
        from PIL import Image, ExifTags

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
            val = d + m / 60.0 + s / 3600.0
            return -val if ref in ("S", "W") else val

        lat = dms_to_decimal(gps["GPSLatitude"], gps.get("GPSLatitudeRef", "N"))
        lng = dms_to_decimal(gps["GPSLongitude"], gps.get("GPSLongitudeRef", "E"))
        return lat, lng
    except Exception:
        return None, None


def auto_orient_image(image_path: str) -> None:
    """
    Re-save the image with EXIF orientation applied so YOLO sees the
    correctly-rotated frame.  Overwrites in-place; no-op on failure.
    """
    try:
        from PIL import Image, ImageOps
        from PIL.Image import Image as PILImage

        with Image.open(image_path) as img:
            result_img: PILImage = ImageOps.exif_transpose(img) or img
            result_img.save(image_path)
    except Exception:
        pass


# --- Main detection entry point --------------------------------------------- #


def detect_potholes_in_image(
    image_path: str,
) -> tuple[list[dict], tuple[int, int]]:
    """
    Detect potholes in an image.

    Returns:
        (detections, (img_width, img_height))

    Each detection dict contains:
        bbox          [x1, y1, x2, y2]  — absolute pixels in original image
        confidence    float 0–1
        class_id      int
        class_name    str
        area_pixels   float  — mask area (preferred) or bbox area
        area_ratio    float  — area_pixels / (img_w * img_h)
        has_mask      bool
        img_width     int
        img_height    int
    """
    # Auto-orient before measuring dimensions
    auto_orient_image(image_path)
    img_w, img_h = get_image_dimensions(image_path)

    model = get_model()
    if model is not None:
        try:
            results = model(
                image_path,
                conf=settings.DETECTION_CONFIDENCE,
                iou=settings.DETECTION_IOU,
                imgsz=640,
                augment=True,  # test-time augmentation → better recall
                verbose=False,
            )
            detections = []
            for result in results:
                masks = result.masks  # None for detection-only models
                for i, box in enumerate(result.boxes):
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    bbox_area = float((x2 - x1) * (y2 - y1))

                    # Prefer mask pixel count for accurate area
                    if masks is not None and i < len(masks.data):
                        mask_tensor = masks.data[i]
                        mask_pixels = float(mask_tensor.sum().item())
                        # masks are at model output resolution; scale to original
                        mh, mw = mask_tensor.shape
                        scale = (img_w * img_h) / max(mw * mh, 1)
                        area_pixels = mask_pixels * scale
                        has_mask = True
                    else:
                        area_pixels = bbox_area
                        has_mask = False

                    detections.append(
                        {
                            "bbox": [x1, y1, x2, y2],
                            "confidence": float(box.conf[0]),
                            "class_id": int(box.cls[0]),
                            "class_name": result.names[int(box.cls[0])],
                            "area_pixels": area_pixels,
                            "area_ratio": area_pixels / max(img_w * img_h, 1),
                            "has_mask": has_mask,
                            "img_width": img_w,
                            "img_height": img_h,
                        }
                    )
            return detections, (img_w, img_h)
        except Exception as e:
            print(f"[detector] Inference failed: {e}")

    # Improved mock fallback
    return _mock_detection(image_path, img_w, img_h), (img_w, img_h)


# --- Mock ------------------------------------------------------------------- #


def _mock_detection(image_path: str, img_w: int, img_h: int) -> list[dict]:
    """
    Deterministic mock seeded on image *content* (first 4 KB),
    with bboxes scaled to actual image dimensions.
    """
    import random

    try:
        with open(image_path, "rb") as fh:
            content = fh.read(4096)
        seed = int(hashlib.md5(content).hexdigest()[:8], 16)
    except Exception:
        seed = int(hashlib.md5(image_path.encode()).hexdigest()[:8], 16)

    random.seed(seed)
    num_detections = random.randint(1, 4)

    margin_x = max(int(img_w * 0.05), 10)
    margin_y = max(int(img_h * 0.05), 10)
    min_w = max(int(img_w * 0.04), 20)
    min_h = max(int(img_h * 0.04), 20)
    max_w = max(int(img_w * 0.30), min_w + 1)
    max_h = max(int(img_h * 0.30), min_h + 1)

    detections = []
    for _ in range(num_detections):
        x1 = random.randint(margin_x, max(margin_x + 1, img_w - margin_x - min_w))
        y1 = random.randint(margin_y, max(margin_y + 1, img_h - margin_y - min_h))
        w = random.randint(min_w, min(max_w, img_w - x1 - margin_x))
        h = random.randint(min_h, min(max_h, img_h - y1 - margin_y))
        area_pixels = float(w * h)
        detections.append(
            {
                "bbox": [float(x1), float(y1), float(x1 + w), float(y1 + h)],
                "confidence": round(random.uniform(0.45, 0.92), 3),
                "class_id": 0,
                "class_name": "pothole",
                "area_pixels": area_pixels,
                "area_ratio": area_pixels / max(img_w * img_h, 1),
                "has_mask": False,
                "img_width": img_w,
                "img_height": img_h,
            }
        )
    return detections


# --- Video detection -------------------------------------------------------- #


def detect_potholes_in_video(video_path: str, sample_rate: int = 30) -> dict:
    """
    Detect potholes by sampling every `sample_rate` frames from a video.
    Returns aggregated per-frame results.
    """
    model = get_model()

    if model is not None:
        try:
            import cv2

            cap = cv2.VideoCapture(video_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30

            frames_processed = 0
            all_detections: list[dict] = []
            frame_idx = 0

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_idx % sample_rate == 0:
                    results = model(
                        frame,
                        conf=settings.DETECTION_CONFIDENCE,
                        iou=settings.DETECTION_IOU,
                        imgsz=640,
                        verbose=False,
                    )
                    frame_dets = []
                    for result in results:
                        for box in result.boxes:
                            x1, y1, x2, y2 = box.xyxy[0].tolist()
                            frame_dets.append(
                                {
                                    "bbox": [x1, y1, x2, y2],
                                    "confidence": float(box.conf[0]),
                                    "class_name": result.names[int(box.cls[0])],
                                    "frame_number": frame_idx,
                                    "timestamp_sec": round(frame_idx / fps, 2),
                                    "area_pixels": float((x2 - x1) * (y2 - y1)),
                                    "area_ratio": float((x2 - x1) * (y2 - y1))
                                    / max(frame.shape[0] * frame.shape[1], 1),
                                }
                            )
                    if frame_dets:
                        all_detections.append(
                            {
                                "frame": frame_idx,
                                "timestamp": round(frame_idx / fps, 2),
                                "detections": frame_dets,
                            }
                        )
                    frames_processed += 1
                frame_idx += 1

            cap.release()
            return {
                "frames_processed": frames_processed,
                "total_frames": total_frames,
                "total_detections": sum(len(d["detections"]) for d in all_detections),
                "detections_by_frame": all_detections,
            }
        except Exception as e:
            print(f"[detector] Video detection failed: {e}")

    # Mock video fallback (seeded so results are reproducible per file)
    import random

    try:
        with open(video_path, "rb") as fh:
            seed_content = fh.read(4096)
        seed = int(hashlib.md5(seed_content).hexdigest()[:8], 16)
    except Exception:
        seed = int(hashlib.md5(video_path.encode()).hexdigest()[:8], 16)
    random.seed(seed)

    frames = random.randint(5, 15)
    return {
        "frames_processed": frames,
        "total_frames": frames * sample_rate,
        "total_detections": random.randint(3, 12),
        "detections_by_frame": [
            {
                "frame": i * sample_rate,
                "timestamp": round(i * sample_rate / 30, 2),
                "detections": [
                    {
                        "confidence": round(random.uniform(0.5, 0.92), 3),
                        "class_name": "pothole",
                    }
                ],
            }
            for i in range(min(frames, 5))
        ],
    }
