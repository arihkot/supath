"""Detection API - Image and video pothole detection using YOLO."""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.models import Pothole
from app.config import settings
from app.services.detector import detect_potholes_in_image, extract_exif_gps
from app.services.severity import calculate_severity
from app.services.geocoding import enrich_pothole_location

router = APIRouter()

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_BYTES = 20 * 1024 * 1024  # 20 MB hard limit for images


@router.post("/image")
async def detect_image(
    file: UploadFile = File(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    db: Session = Depends(get_db),
):
    """Detect potholes in an uploaded image."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    ext = Path(file.filename or "image.jpg").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format '{ext}'. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}",
        )

    # Read content with size guard
    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large ({len(content) // (1024 * 1024)} MB). Maximum is 20 MB.",
        )

    # Save uploaded file
    file_id = str(uuid.uuid4())[:8]
    filename = f"{file_id}{ext}"
    filepath = Path(settings.UPLOAD_DIR) / "images" / filename
    filepath.parent.mkdir(parents=True, exist_ok=True)

    with open(filepath, "wb") as f:
        f.write(content)

    # Run detection — returns (detections, (img_w, img_h))
    detection_result = detect_potholes_in_image(str(filepath))
    detections: List[dict] = detection_result[0]
    img_w: int = detection_result[1][0]
    img_h: int = detection_result[1][1]

    # EXIF GPS fallback: if caller didn't supply coords, try the image's metadata
    if latitude is None or longitude is None:
        exif_lat, exif_lng = extract_exif_gps(str(filepath))
        if latitude is None:
            latitude = exif_lat
        if longitude is None:
            longitude = exif_lng

    # Create pothole records
    created_potholes = []
    for det in detections:
        severity, score = calculate_severity(det)

        pot_lat = latitude or settings.CG_CENTER_LAT + (hash(file_id) % 100) / 1000
        pot_lng = longitude or settings.CG_CENTER_LNG + (hash(file_id) % 100) / 1000
        loc = enrich_pothole_location(pot_lat, pot_lng)

        pothole = Pothole(
            latitude=pot_lat,
            longitude=pot_lng,
            severity=severity,
            severity_score=score,
            confidence_score=det.get("confidence", 0.0),
            source="cv_detection",
            image_url=f"/uploads/images/{filename}",
            detection_metadata=det,
            status="detected",
            highway_ref=loc["highway_ref"],
            highway_type=loc["highway_type"],
            nearest_city=loc["nearest_city"],
            district=loc["district"],
        )
        db.add(pothole)
        created_potholes.append(pothole)

    db.commit()

    severity_counts: dict = {}
    for p in created_potholes:
        severity_counts[p.severity] = severity_counts.get(p.severity, 0) + 1

    # Enrich detections with severity so frontend can colour bboxes
    enriched = []
    for det, pothole in zip(detections, created_potholes):
        enriched.append(
            {
                **det,
                "severity": pothole.severity,
                "severity_score": pothole.severity_score,
            }
        )

    return {
        "potholes_detected": len(detections),
        "detections": enriched,
        "image_url": f"/uploads/images/{filename}",
        "image_width": img_w,
        "image_height": img_h,
        "severity_summary": severity_counts,
        "pothole_ids": [p.id for p in created_potholes],
    }


@router.post("/video")
async def detect_video(
    file: UploadFile = File(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    db: Session = Depends(get_db),
):
    """Detect potholes in an uploaded video (frame sampling)."""
    if not file.content_type or "video" not in file.content_type:
        raise HTTPException(status_code=400, detail="File must be a video")

    file_id = str(uuid.uuid4())[:8]
    ext = Path(file.filename or "video.mp4").suffix
    filename = f"{file_id}{ext}"
    filepath = Path(settings.UPLOAD_DIR) / "videos" / filename
    filepath.parent.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # For video: sample frames and detect (simplified)
    from app.services.detector import detect_potholes_in_video

    results = detect_potholes_in_video(str(filepath))

    # Create pothole records from video detections
    created_ids = []
    all_detections = results.get("detections_by_frame", [])

    # Resolve location once (same coords for all frames in one video)
    pot_lat = latitude or settings.CG_CENTER_LAT + (hash(file_id) % 100) / 1000
    pot_lng = longitude or settings.CG_CENTER_LNG + (hash(file_id) % 100) / 1000
    loc = enrich_pothole_location(pot_lat, pot_lng)

    for frame_data in all_detections:
        for det in frame_data.get("detections", []):
            severity, score = calculate_severity(det)
            pothole = Pothole(
                latitude=pot_lat,
                longitude=pot_lng,
                severity=severity,
                severity_score=score,
                confidence_score=det.get("confidence", 0.0),
                source="cv_detection",
                image_url=f"/uploads/videos/{filename}",
                detection_metadata=det,
                status="detected",
                highway_ref=loc["highway_ref"],
                highway_type=loc["highway_type"],
                nearest_city=loc["nearest_city"],
                district=loc["district"],
            )
            db.add(pothole)
            db.flush()
            created_ids.append(pothole.id)

    db.commit()

    return {
        "frames_processed": results.get("frames_processed", 0),
        "total_detections": results.get("total_detections", 0),
        "detections_by_frame": all_detections,
        "video_url": f"/uploads/videos/{filename}",
        "pothole_ids": created_ids,
    }
