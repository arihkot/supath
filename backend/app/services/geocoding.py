"""
Geocoding service — resolves (lat, lng) to nearest highway and city.

Extracts the logic from the seeder into a reusable service so that
detection endpoints and citizen reports can auto-populate highway_ref,
highway_type, nearest_city, and district on newly created potholes.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Optional

# ── GeoJSON directory ─────────────────────────────────────────────────────────

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_GEOJSON_DIR = _DATA_DIR / "geojson"

# ── Chhattisgarh cities with district info ────────────────────────────────────

CG_CITIES: dict[str, dict] = {
    "Raipur": {"lat": 21.2514, "lng": 81.6296, "district": "Raipur"},
    "Bilaspur": {"lat": 22.0797, "lng": 82.1409, "district": "Bilaspur"},
    "Durg": {"lat": 21.1904, "lng": 81.2849, "district": "Durg"},
    "Bhilai": {"lat": 21.2167, "lng": 81.3833, "district": "Durg"},
    "Korba": {"lat": 22.3595, "lng": 82.7501, "district": "Korba"},
    "Rajnandgaon": {"lat": 21.0977, "lng": 81.0280, "district": "Rajnandgaon"},
    "Jagdalpur": {"lat": 19.0690, "lng": 82.0215, "district": "Bastar"},
    "Ambikapur": {"lat": 23.1187, "lng": 83.1990, "district": "Surguja"},
    "Dhamtari": {"lat": 20.7071, "lng": 81.5498, "district": "Dhamtari"},
    "Mahasamund": {"lat": 21.1084, "lng": 82.0993, "district": "Mahasamund"},
    "Kanker": {"lat": 20.2720, "lng": 81.4913, "district": "Kanker"},
    "Dantewada": {"lat": 18.8977, "lng": 81.3477, "district": "Dantewada"},
    "Kondagaon": {"lat": 19.5904, "lng": 81.6637, "district": "Kondagaon"},
    "Janjgir": {"lat": 22.0094, "lng": 82.5752, "district": "Janjgir-Champa"},
    "Raigarh": {"lat": 21.8974, "lng": 83.3950, "district": "Raigarh"},
    "Kawardha": {"lat": 22.0247, "lng": 81.2332, "district": "Kabirdham"},
    "Balodabazar": {"lat": 21.6566, "lng": 82.1604, "district": "Balodabazar"},
    "Jashpur": {"lat": 22.8856, "lng": 84.1389, "district": "Jashpur"},
    "Gariaband": {"lat": 20.6333, "lng": 82.0667, "district": "Gariaband"},
    "Surajpur": {"lat": 23.2148, "lng": 82.8692, "district": "Surajpur"},
}

# ── Road segment cache (loaded once) ─────────────────────────────────────────

_road_segments: list[dict] | None = None

# Maximum distance (in degrees, approx) to consider a highway match.
# ~0.05 deg ≈ 5.5 km — if the pothole is farther than this from any road
# segment, we won't assign a highway.
_MAX_HIGHWAY_DIST_DEG = 0.05


def _load_road_segments() -> list[dict]:
    """Load all LineString segments from NH + SH GeoJSON files.
    Returns list of dicts: { ref, highway_type, coords: [(lat, lng), ...] }
    """
    segments: list[dict] = []
    files = [
        ("chhattisgarh_nh.geojson", "NH"),
        ("chhattisgarh_sh.geojson", "SH"),
    ]
    for filename, default_type in files:
        path = _GEOJSON_DIR / filename
        if not path.exists():
            continue
        with open(path) as f:
            data = json.load(f)
        for feat in data.get("features", []):
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            ref = props.get("ref", "")
            hw_type = default_type

            if ref and not ref.startswith("SH") and not ref.startswith("NH"):
                continue
            if ref:
                for prefix in ("NH", "SH"):
                    if ref.startswith(prefix) and len(ref) > 2 and ref[2:3].isdigit():
                        ref = prefix + " " + ref[2:]
                        break
                if ref.startswith("NH"):
                    hw_type = "NH"
                elif ref.startswith("SH"):
                    hw_type = "SH"

            def _extract_lines(geom_obj: dict) -> list[list[tuple[float, float]]]:
                gt = geom_obj.get("type")
                coords = geom_obj.get("coordinates", [])
                if gt == "LineString":
                    return [[(c[1], c[0]) for c in coords]]
                elif gt == "MultiLineString":
                    return [[(c[1], c[0]) for c in line] for line in coords]
                return []

            for line_coords in _extract_lines(geom):
                if len(line_coords) >= 2:
                    segments.append(
                        {
                            "ref": ref or f"Unknown {hw_type}",
                            "highway_type": hw_type,
                            "coords": line_coords,
                        }
                    )
    return segments


def _get_road_segments() -> list[dict]:
    """Return cached road segments, loading on first call."""
    global _road_segments
    if _road_segments is None:
        _road_segments = _load_road_segments()
    return _road_segments


# ── Geometry helpers ──────────────────────────────────────────────────────────


def _point_to_segment_dist_sq(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> float:
    """Squared distance from point (px,py) to line segment (ax,ay)-(bx,by)."""
    dx, dy = bx - ax, by - ay
    len_sq = dx * dx + dy * dy
    if len_sq == 0:
        # Degenerate segment
        return (px - ax) ** 2 + (py - ay) ** 2
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len_sq))
    proj_x = ax + t * dx
    proj_y = ay + t * dy
    return (px - proj_x) ** 2 + (py - proj_y) ** 2


def _min_dist_to_linestring(
    lat: float, lng: float, coords: list[tuple[float, float]]
) -> float:
    """Minimum distance (degrees) from a point to a polyline."""
    best = float("inf")
    for i in range(len(coords) - 1):
        d_sq = _point_to_segment_dist_sq(
            lat, lng, coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]
        )
        if d_sq < best:
            best = d_sq
    return math.sqrt(best) if best < float("inf") else float("inf")


# ── Public API ────────────────────────────────────────────────────────────────


def find_nearest_city(lat: float, lng: float) -> tuple[str, str]:
    """Return (city_name, district) for the nearest Chhattisgarh city."""
    best_name = "Raipur"
    best_district = "Raipur"
    best_dist = float("inf")
    for name, info in CG_CITIES.items():
        d = (lat - info["lat"]) ** 2 + (lng - info["lng"]) ** 2
        if d < best_dist:
            best_dist = d
            best_name = name
            best_district = info["district"]
    return best_name, best_district


def find_nearest_highway(lat: float, lng: float) -> Optional[tuple[str, str]]:
    """Return (highway_ref, highway_type) for the nearest highway, or None
    if no highway is within ~5.5 km."""
    segments = _get_road_segments()
    if not segments:
        return None

    best_ref = ""
    best_type = ""
    best_dist = float("inf")

    for seg in segments:
        d = _min_dist_to_linestring(lat, lng, seg["coords"])
        if d < best_dist:
            best_dist = d
            best_ref = seg["ref"]
            best_type = seg["highway_type"]

    if best_dist > _MAX_HIGHWAY_DIST_DEG:
        return None

    return best_ref, best_type


def enrich_pothole_location(lat: float, lng: float) -> dict[str, Optional[str]]:
    """One-call convenience: return a dict with highway_ref, highway_type,
    nearest_city, and district for a given coordinate pair.

    Usage::

        loc = enrich_pothole_location(21.25, 81.63)
        pothole.highway_ref = loc["highway_ref"]
        pothole.highway_type = loc["highway_type"]
        pothole.nearest_city = loc["nearest_city"]
        pothole.district = loc["district"]
    """
    city, district = find_nearest_city(lat, lng)
    hw = find_nearest_highway(lat, lng)

    result: dict[str, Optional[str]] = {
        "nearest_city": city,
        "district": district,
        "highway_ref": None,
        "highway_type": None,
    }

    if hw:
        result["highway_ref"] = hw[0]
        result["highway_type"] = hw[1]

    return result
