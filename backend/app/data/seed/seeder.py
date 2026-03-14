"""
Seed database with realistic mock data for Chhattisgarh.
Pothole coordinates are sampled from actual GeoJSON highway geometries
so they align precisely on roads.
"""

import json
import math
import os
import random
import uuid as _uuid
from datetime import datetime, timedelta
from pathlib import Path

from app.database import SessionLocal
from app.models import (
    Pothole,
    Complaint,
    Contractor,
    Highway,
    NewsMention,
    WaterloggingZone,
    CitizenReport,
    TrafficAnomaly,
    IncentiveTier,
)


# ── GeoJSON helpers ───────────────────────────────────────────────────────────

GEOJSON_DIR = Path(__file__).resolve().parent.parent / "geojson"


def _load_road_segments():
    """Load all LineString segments from NH + SH GeoJSON files.
    Returns list of dicts: { ref, highway_type, coords: [(lat, lng), ...] }
    """
    segments = []
    files = [
        ("chhattisgarh_nh.geojson", "NH"),
        ("chhattisgarh_sh.geojson", "SH"),
    ]
    for filename, default_type in files:
        path = GEOJSON_DIR / filename
        if not path.exists():
            continue
        with open(path) as f:
            data = json.load(f)
        for feat in data.get("features", []):
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            gtype = geom.get("type")
            ref = props.get("ref", "")
            hw_type = default_type

            # Normalise ref: "NH30" -> "NH 30", keep as-is if has space
            if ref and not ref.startswith("SH") and not ref.startswith("NH"):
                continue  # skip unnamed / non-highway features
            if ref:
                # Ensure space: "NH30" -> "NH 30"
                for prefix in ("NH", "SH"):
                    if ref.startswith(prefix) and len(ref) > 2 and ref[2:3].isdigit():
                        ref = prefix + " " + ref[2:]
                        break
                if ref.startswith("NH"):
                    hw_type = "NH"
                elif ref.startswith("SH"):
                    hw_type = "SH"

            def _extract_lines(geom_obj):
                """Recursively extract lists of coordinate arrays."""
                gt = geom_obj.get("type")
                coords = geom_obj.get("coordinates", [])
                if gt == "LineString":
                    # coords = [[lng, lat], ...]
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


def _segment_length(p1, p2):
    """Approximate distance in degrees between two (lat, lng) points."""
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def _interpolate(p1, p2, t):
    """Linear interpolation between two (lat, lng) points."""
    return (
        p1[0] + t * (p2[0] - p1[0]),
        p1[1] + t * (p2[1] - p1[1]),
    )


def _sample_point_on_segment(seg):
    """Pick a random point along a road segment's LineString, with tiny jitter."""
    coords = seg["coords"]
    # Compute cumulative distances
    lengths = []
    for i in range(len(coords) - 1):
        lengths.append(_segment_length(coords[i], coords[i + 1]))
    total = sum(lengths)
    if total == 0:
        idx = random.randint(0, len(coords) - 1)
        lat, lng = coords[idx]
    else:
        target = random.uniform(0, total)
        cum = 0.0
        for i, l in enumerate(lengths):
            cum += l
            if cum >= target:
                overshoot = cum - target
                t = 1.0 - (overshoot / l) if l > 0 else 0.5
                lat, lng = _interpolate(coords[i], coords[i + 1], t)
                break
        else:
            lat, lng = coords[-1]

    # Add tiny road-width jitter (±0.0005 degrees ≈ 50m)
    lat += random.uniform(-0.0005, 0.0005)
    lng += random.uniform(-0.0005, 0.0005)
    return round(lat, 6), round(lng, 6)


def _find_nearest_city(lat, lng, cities_dict):
    """Return (city_name, city_info) for the nearest city."""
    best_name = "Raipur"
    best_info = cities_dict["Raipur"]
    best_dist = float("inf")
    for name, info in cities_dict.items():
        d = (lat - info["lat"]) ** 2 + (lng - info["lng"]) ** 2
        if d < best_dist:
            best_dist = d
            best_name = name
            best_info = info
    return best_name, best_info


# ── Reference data ────────────────────────────────────────────────────────────

CG_HIGHWAYS = [
    {
        "ref": "NH 30",
        "type": "NH",
        "name": "Raipur-Jagdalpur Highway",
        "start": "Raipur",
        "end": "Jagdalpur",
        "km": 300,
    },
    {
        "ref": "NH 53",
        "type": "NH",
        "name": "Hajira-Kolkata Highway",
        "start": "Rajnandgaon",
        "end": "Raigarh",
        "km": 322,
    },
    {
        "ref": "NH 130",
        "type": "NH",
        "name": "Simga-Ambikapur Highway",
        "start": "Simga",
        "end": "Ambikapur",
        "km": 390,
    },
    {
        "ref": "NH 43",
        "type": "NH",
        "name": "Varanasi-Vizag Highway",
        "start": "Ambikapur",
        "end": "Raigarh",
        "km": 280,
    },
    {
        "ref": "NH 45",
        "type": "NH",
        "name": "Raipur-Bilaspur Highway",
        "start": "Raipur",
        "end": "Bilaspur",
        "km": 120,
    },
    {
        "ref": "NH 130A",
        "type": "NH",
        "name": "Bilaspur-Katghora Road",
        "start": "Bilaspur",
        "end": "Katghora",
        "km": 85,
    },
    {
        "ref": "NH 130B",
        "type": "NH",
        "name": "Korba-Champa Road",
        "start": "Korba",
        "end": "Champa",
        "km": 72,
    },
    {
        "ref": "NH 63",
        "type": "NH",
        "name": "Jagdalpur-Bhopalpatnam Highway",
        "start": "Jagdalpur",
        "end": "Bhopalpatnam",
        "km": 210,
    },
    {
        "ref": "NH 49",
        "type": "NH",
        "name": "Durg-Kanker Highway",
        "start": "Durg",
        "end": "Kanker",
        "km": 180,
    },
    {
        "ref": "NH 163",
        "type": "NH",
        "name": "Raipur-Sarangarh Road",
        "start": "Raipur",
        "end": "Sarangarh",
        "km": 155,
    },
    {
        "ref": "SH 1",
        "type": "SH",
        "name": "Raipur-Balodabazar Road",
        "start": "Raipur",
        "end": "Balodabazar",
        "km": 65,
    },
    {
        "ref": "SH 2",
        "type": "SH",
        "name": "Durg-Rajnandgaon Road",
        "start": "Durg",
        "end": "Rajnandgaon",
        "km": 78,
    },
    {
        "ref": "SH 3",
        "type": "SH",
        "name": "Bilaspur-Mungeli Road",
        "start": "Bilaspur",
        "end": "Mungeli",
        "km": 60,
    },
    {
        "ref": "SH 5",
        "type": "SH",
        "name": "Jagdalpur-Dantewada Road",
        "start": "Jagdalpur",
        "end": "Dantewada",
        "km": 90,
    },
    {
        "ref": "SH 6",
        "type": "SH",
        "name": "Korba-Pali Road",
        "start": "Korba",
        "end": "Pali",
        "km": 55,
    },
    {
        "ref": "SH 7",
        "type": "SH",
        "name": "Dhamtari-Gariaband Road",
        "start": "Dhamtari",
        "end": "Gariaband",
        "km": 72,
    },
    {
        "ref": "SH 8",
        "type": "SH",
        "name": "Mahasamund-Saraipali Road",
        "start": "Mahasamund",
        "end": "Saraipali",
        "km": 68,
    },
    {
        "ref": "SH 9",
        "type": "SH",
        "name": "Kawardha-Pandaria Road",
        "start": "Kawardha",
        "end": "Pandaria",
        "km": 45,
    },
    {
        "ref": "SH 10",
        "type": "SH",
        "name": "Jashpur-Kunkuri Road",
        "start": "Jashpur",
        "end": "Kunkuri",
        "km": 42,
    },
]

CG_CITIES = {
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

CG_DISTRICTS = list(set(c["district"] for c in CG_CITIES.values()))

CONTRACTORS = [
    {
        "name": "Chhattisgarh Road Construction Corporation",
        "reg": "CRCC/2019/001",
        "district": "Raipur",
    },
    {
        "name": "Raipur Infrastructure Pvt Ltd",
        "reg": "RIPL/2020/042",
        "district": "Raipur",
    },
    {
        "name": "Bhilai Highway Maintenance Corp",
        "reg": "BHMC/2018/015",
        "district": "Durg",
    },
    {"name": "Bilaspur Road Builders", "reg": "BRB/2021/033", "district": "Bilaspur"},
    {
        "name": "Shri Ganesh Construction Co",
        "reg": "SGCC/2019/078",
        "district": "Rajnandgaon",
    },
    {
        "name": "Bastar Road Development Agency",
        "reg": "BRDA/2020/011",
        "district": "Bastar",
    },
    {"name": "Mahalaxmi Infracon Ltd", "reg": "MIL/2017/056", "district": "Korba"},
    {"name": "Sahu & Sons Road Works", "reg": "SSRW/2022/019", "district": "Dhamtari"},
    {
        "name": "Narmada Construction Company",
        "reg": "NCC/2018/088",
        "district": "Kabirdham",
    },
    {"name": "Surguja Highway Solutions", "reg": "SHS/2021/027", "district": "Surguja"},
    {
        "name": "Patel Road Engineering Pvt Ltd",
        "reg": "PREPL/2020/045",
        "district": "Mahasamund",
    },
    {
        "name": "Jain Infrastructure Services",
        "reg": "JIS/2019/062",
        "district": "Janjgir-Champa",
    },
]

NEWS_ARTICLES = [
    {
        "source": "newspaper",
        "name": "Dainik Bhaskar",
        "title": "NH-30 पर बड़ा गड्ढा, दो बाइक सवार घायल",
        "snippet": "रायपुर-जगदलपुर राजमार्ग पर महासमुंद के पास एक विशाल गड्ढे में गिरकर दो मोटरसाइकिल सवार गंभीर रूप से घायल हो गए। स्थानीय निवासियों ने बताया कि यह गड्ढा पिछले तीन महीने से है।",
        "location": "Mahasamund",
        "severity": "critical",
    },
    {
        "source": "newspaper",
        "name": "Patrika",
        "title": "दुर्ग-भिलाई मार्ग पर सड़कें बदहाल, जनता परेशान",
        "snippet": "दुर्ग से भिलाई जाने वाले मुख्य मार्ग की सड़कें बेहद खराब स्थिति में हैं। कई जगह बड़े-बड़े गड्ढे हैं जिनसे वाहन चालकों को भारी कठिनाई हो रही है।",
        "location": "Durg",
        "severity": "high",
    },
    {
        "source": "newspaper",
        "name": "Nai Duniya",
        "title": "बिलासपुर-कोरबा मार्ग पर ट्रक पलटा, गड्ढे बने कारण",
        "snippet": "NH-130A पर बिलासपुर और कोरबा के बीच एक लोडेड ट्रक सड़क के बड़े गड्ढे से टकराकर पलट गया। चालक को मामूली चोटें आईं। यह इस महीने की तीसरी ऐसी घटना है।",
        "location": "Bilaspur",
        "severity": "critical",
    },
    {
        "source": "twitter",
        "name": "Twitter/X",
        "title": "@RaipurUpdates: रायपुर VIP रोड पर गड्ढों का अंबार",
        "snippet": "रायपुर के VIP रोड पर चलना मुश्किल हो गया है। हर 100 मीटर पर गड्ढे। @CMaborning @CollectorRaipur कब होगी मरम्मत? #RaipurRoads #PotholeRaipur",
        "location": "Raipur",
        "severity": "high",
    },
    {
        "source": "twitter",
        "name": "Twitter/X",
        "title": "@JagdalpurNews: जगदलपुर-दंतेवाड़ा मार्ग पर बारिश के बाद हालत और बिगड़ी",
        "snippet": "बारिश के बाद जगदलपुर-दंतेवाड़ा SH-5 की हालत और बिगड़ गई है। कई जगह सड़क टूट गई है। ग्रामीणों का कहना है कि पिछले साल की मरम्मत एक सीजन भी नहीं टिकी। #BastrRoads",
        "location": "Jagdalpur",
        "severity": "high",
    },
    {
        "source": "newspaper",
        "name": "Dainik Bhaskar",
        "title": "अंबिकापुर-रायगढ़ NH-43 पर दो किमी लंबा गड्ढों का सिलसिला",
        "snippet": "NH-43 पर अंबिकापुर से रायगढ़ जाते समय वडराफनगर के पास लगभग 2 किलोमीटर तक सड़क पूरी तरह टूट चुकी है। भारी वाहनों के कारण स्थिति और भी बदतर हो गई है।",
        "location": "Ambikapur",
        "severity": "critical",
    },
    {
        "source": "newspaper",
        "name": "Patrika",
        "title": "कोरबा शहर में जलभराव से सड़कें धंसी",
        "snippet": "मानसून की भारी बारिश के बाद कोरबा शहर की कई सड़कों पर जलभराव हो गया। पानी उतरने के बाद कई सड़कों पर बड़े-बड़े गड्ढे बन गए। नगर निगम ने मरम्मत का आश्वासन दिया।",
        "location": "Korba",
        "severity": "high",
    },
    {
        "source": "twitter",
        "name": "Twitter/X",
        "title": "@CGRoadSafety: धमतरी-गरियाबंद SH-7 पर अंधेरे में गड्ढा दुर्घटना का कारण",
        "snippet": "कल रात धमतरी-गरियाबंद मार्ग पर एक कार गड्ढे में गिर गई। कोई स्ट्रीटलाइट नहीं, कोई वार्निंग साइन नहीं। @PWaborning_CG जिम्मेदारी लें। #RoadSafety #Chhattisgarh",
        "location": "Dhamtari",
        "severity": "critical",
    },
]

TRAFFIC_ANOMALIES = [
    {
        "highway_ref": "NH 30",
        "location": "Raipur-Dhamtari stretch, km 42",
        "latitude": 21.12,
        "longitude": 81.65,
        "anomaly_type": "persistent_slowdown",
        "severity": "critical",
        "avg_speed_kmph": 18.0,
        "expected_speed_kmph": 65.0,
        "delay_factor": 3.6,
        "days_ago": 27,
        "occurrences": 45,
        "likely_cause": "road_damage",
    },
    {
        "highway_ref": "NH 53",
        "location": "Durg bypass near Bhilai Steel Plant",
        "latitude": 21.19,
        "longitude": 81.38,
        "anomaly_type": "recurring_congestion",
        "severity": "high",
        "avg_speed_kmph": 22.0,
        "expected_speed_kmph": 55.0,
        "delay_factor": 2.5,
        "days_ago": 50,
        "occurrences": 38,
        "likely_cause": "road_damage",
    },
    {
        "highway_ref": "NH 130",
        "location": "Bilaspur-Korba road, km 28",
        "latitude": 22.12,
        "longitude": 82.18,
        "anomaly_type": "persistent_slowdown",
        "severity": "critical",
        "avg_speed_kmph": 15.0,
        "expected_speed_kmph": 60.0,
        "delay_factor": 4.0,
        "days_ago": 12,
        "occurrences": 12,
        "likely_cause": "waterlogging_damage",
    },
    {
        "highway_ref": "SH 5",
        "location": "Jagdalpur city approach road",
        "latitude": 19.08,
        "longitude": 82.02,
        "anomaly_type": "stop_and_go",
        "severity": "critical",
        "avg_speed_kmph": 12.0,
        "expected_speed_kmph": 45.0,
        "delay_factor": 3.75,
        "days_ago": 14,
        "occurrences": 22,
        "likely_cause": "road_damage",
    },
    {
        "highway_ref": "NH 43",
        "location": "Ambikapur-Wadrafnagar stretch",
        "latitude": 23.12,
        "longitude": 83.20,
        "anomaly_type": "persistent_slowdown",
        "severity": "high",
        "avg_speed_kmph": 20.0,
        "expected_speed_kmph": 70.0,
        "delay_factor": 3.5,
        "days_ago": 63,
        "occurrences": 55,
        "likely_cause": "road_damage",
    },
    {
        "highway_ref": "NH 45",
        "location": "Raipur-Bilaspur corridor, km 55",
        "latitude": 21.65,
        "longitude": 81.88,
        "anomaly_type": "recurring_congestion",
        "severity": "medium",
        "avg_speed_kmph": 30.0,
        "expected_speed_kmph": 70.0,
        "delay_factor": 2.3,
        "days_ago": 18,
        "occurrences": 29,
        "likely_cause": "road_damage",
    },
    {
        "highway_ref": "SH 7",
        "location": "Dhamtari-Gariaband road, km 15",
        "latitude": 20.64,
        "longitude": 81.72,
        "anomaly_type": "stop_and_go",
        "severity": "high",
        "avg_speed_kmph": 10.0,
        "expected_speed_kmph": 40.0,
        "delay_factor": 4.0,
        "days_ago": 8,
        "occurrences": 17,
        "likely_cause": "waterlogging_damage",
    },
]

INCENTIVE_TIERS = [
    {
        "label": "Photo with location",
        "points": 10,
        "condition_key": "photo_with_location",
        "badge_color": "amber",
        "description": "Report includes at least one photo and a GPS location",
        "sort_order": 1,
    },
    {
        "label": "Verified report",
        "points": 25,
        "condition_key": "verified_report",
        "badge_color": "amber",
        "description": "Report has been verified by AI or an administrator",
        "sort_order": 2,
    },
    {
        "label": "First report in area",
        "points": 50,
        "condition_key": "first_in_area",
        "badge_color": "green",
        "description": "No other pothole reported within 500 m of this location",
        "sort_order": 3,
    },
    {
        "label": "Critical severity",
        "points": 15,
        "condition_key": "critical_severity",
        "badge_color": "red",
        "description": "Pothole confirmed as critical severity after AI analysis",
        "sort_order": 4,
    },
]


# ── Seeder ────────────────────────────────────────────────────────────────────


def seed_if_empty():
    """Seed database tables that are empty. Each table is checked independently
    so new tables added after the initial seed still get populated."""
    db = SessionLocal()
    try:
        now = datetime.now()
        random.seed(42)

        # ── 1. Main seed block (potholes drive the rest) ──────────────────────
        if db.query(Pothole).count() == 0:
            print("Seeding database with Chhattisgarh mock data...")

            # Load road geometry for road-aligned coordinates
            road_segments = _load_road_segments()
            if not road_segments:
                print(
                    "WARNING: No GeoJSON road segments found, falling back to city jitter"
                )

            # Seed Highways (pothole_count and risk_score updated after potholes)
            for hw in CG_HIGHWAYS:
                highway = Highway(
                    ref=hw["ref"],
                    highway_type=hw["type"],
                    name=hw["name"],
                    start_city=hw["start"],
                    end_city=hw["end"],
                    length_km=hw["km"],
                    risk_score=0.0,  # computed below
                    pothole_count=0,  # computed below
                )
                db.add(highway)

            # Seed Contractors
            contractor_ids = []
            flag_reasons = [
                "Repeated delays and substandard work",
                "Failed quality inspection on 3 consecutive projects",
                "Complaint escalated to state level — contractor non-responsive",
            ]
            for c in CONTRACTORS:
                total_c = random.randint(10, 50)
                completed_c = random.randint(
                    max(2, total_c - 15), total_c
                )  # always <= total
                is_flagged = random.random() < 0.25
                # Flagged contractors get lower scores
                if is_flagged:
                    rep = round(random.uniform(25, 55), 1)
                    quality = round(random.uniform(30, 50), 1)
                    avg_days = round(random.uniform(25, 45), 1)
                else:
                    rep = round(random.uniform(55, 92), 1)
                    quality = round(random.uniform(55, 88), 1)
                    avg_days = round(random.uniform(5, 25), 1)
                contractor = Contractor(
                    name=c["name"],
                    registration_id=c["reg"],
                    district=c["district"],
                    total_contracts=total_c,
                    completed_contracts=completed_c,
                    avg_repair_days=avg_days,
                    reputation_score=rep,
                    road_quality_score=quality,
                    flagged=is_flagged,
                    flag_reason=random.choice(flag_reasons) if is_flagged else None,
                )
                db.add(contractor)
                db.flush()
                contractor_ids.append(contractor.id)

            # ── Seed Potholes (250 across CG highways, ON road geometry) ──────
            pothole_ids = []
            sources = [
                "cv_detection",
                "citizen_report",
                "dashcam",
                "news",
                "traffic_anomaly",
                "cleaning_vehicle",
            ]
            source_weights = [0.35, 0.25, 0.15, 0.1, 0.1, 0.05]
            severities = ["low", "medium", "high", "critical"]
            severity_weights = [0.2, 0.35, 0.3, 0.15]
            statuses = [
                "detected",
                "complaint_filed",
                "acknowledged",
                "in_progress",
                "resolved",
                "escalated",
            ]
            status_weights = [0.15, 0.2, 0.15, 0.2, 0.2, 0.1]

            for i in range(250):
                # Pick a random road segment and sample a point on it
                seg = random.choice(road_segments)
                lat, lng = _sample_point_on_segment(seg)
                hw_ref = seg["ref"]
                hw_type = seg["highway_type"]

                # Find nearest city for metadata
                city_name, city_info = _find_nearest_city(lat, lng, CG_CITIES)

                severity = random.choices(severities, weights=severity_weights, k=1)[0]
                source = random.choices(sources, weights=source_weights, k=1)[0]
                status = random.choices(statuses, weights=status_weights, k=1)[0]
                is_resolved = status == "resolved"

                days_ago = random.randint(1, 180)
                detected_at = now - timedelta(
                    days=days_ago, hours=random.randint(0, 23)
                )
                if is_resolved:
                    # Resolution 3-35 days after detection, but capped at now
                    resolution_offset = random.randint(3, 35)
                    candidate_resolved = detected_at + timedelta(days=resolution_offset)
                    resolved_at = min(candidate_resolved, now - timedelta(hours=1))
                else:
                    resolved_at = None

                # Severity score boundaries aligned with severity service (severity.py):
                # low: <25, medium: 25-49, high: 50-74, critical: 75-100
                sev_score = {
                    "low": random.uniform(5, 24.9),
                    "medium": random.uniform(25, 49.9),
                    "high": random.uniform(50, 74.9),
                    "critical": random.uniform(75, 100),
                }

                # Match to one of our known highway refs if possible
                matched_hw = None
                for hw in CG_HIGHWAYS:
                    if hw["ref"] == hw_ref:
                        matched_hw = hw
                        break
                if not matched_hw:
                    matched_hw = random.choice(CG_HIGHWAYS)

                pothole = Pothole(
                    latitude=lat,
                    longitude=lng,
                    highway_ref=matched_hw["ref"],
                    highway_type=matched_hw["type"],
                    severity=severity,
                    severity_score=round(sev_score[severity], 1),
                    confidence_score=round(random.uniform(0.4, 0.96), 3),
                    source=source,
                    nearest_city=city_name,
                    district=city_info["district"],
                    road_segment=f"{matched_hw['ref']} near {city_name}, km {random.randint(1, matched_hw['km'])}",
                    status=status,
                    is_resolved=is_resolved,
                    detected_at=detected_at,
                    resolved_at=resolved_at,
                )
                db.add(pothole)
                db.flush()
                pothole_ids.append(pothole.id)

            # ── Update Highway pothole_count and risk_score from actual data ──
            severity_weight = {"low": 1, "medium": 2, "high": 3, "critical": 5}
            all_highways = db.query(Highway).all()
            for hw_obj in all_highways:
                hw_potholes = (
                    db.query(Pothole).filter(Pothole.highway_ref == hw_obj.ref).all()
                )
                count = len(hw_potholes)
                hw_obj.pothole_count = count
                if count > 0 and hw_obj.length_km and hw_obj.length_km > 0:
                    # Risk = weighted severity density per km, scaled to 0-100
                    total_weight = sum(
                        severity_weight.get(p.severity, 1) for p in hw_potholes
                    )
                    density = total_weight / hw_obj.length_km
                    # Typical range: 0–2 weighted potholes/km -> scale to 0-100
                    hw_obj.risk_score = round(min(100, density * 50), 1)
                else:
                    hw_obj.risk_score = 0.0

            # Seed Complaints
            complaint_potholes = (
                db.query(Pothole)
                .filter(
                    Pothole.status.in_(
                        [
                            "complaint_filed",
                            "acknowledged",
                            "in_progress",
                            "resolved",
                            "escalated",
                        ]
                    )
                )
                .all()
            )

            for p in complaint_potholes:
                days_after = random.randint(0, 3)
                filed_at = (
                    p.detected_at + timedelta(days=days_after) if p.detected_at else now
                )
                ack_at = (
                    filed_at + timedelta(days=random.randint(1, 7))
                    if p.status in ["acknowledged", "in_progress", "resolved"]
                    else None
                )
                prog_at = (
                    ack_at + timedelta(days=random.randint(1, 10))
                    if p.status in ["in_progress", "resolved"] and ack_at
                    else None
                )
                res_at = (
                    prog_at + timedelta(days=random.randint(2, 20))
                    if p.status == "resolved" and prog_at
                    else None
                )
                # Cap complaint resolved_at to now
                if res_at and res_at > now:
                    res_at = now - timedelta(hours=random.randint(1, 48))

                complaint_status = p.status
                if complaint_status == "complaint_filed":
                    complaint_status = "filed"

                # Use full 6-level escalation ladder
                escalation_levels = [
                    "department",
                    "reminder",
                    "district",
                    "state",
                    "media_alert",
                    "final",
                ]
                escalation_count = (
                    random.randint(1, 5) if p.status == "escalated" else 0
                )
                esc_level = escalation_levels[
                    min(escalation_count, len(escalation_levels) - 1)
                ]
                # Set last_escalated_at for escalated complaints
                last_esc_at = None
                if escalation_count > 0 and filed_at:
                    last_esc_at = filed_at + timedelta(days=random.randint(3, 30))
                    if last_esc_at > now:
                        last_esc_at = now - timedelta(hours=random.randint(1, 24))

                uid = _uuid.uuid4().hex[:5].upper()
                complaint = Complaint(
                    pothole_id=p.id,
                    complaint_ref=f"CG/PG/2026/{uid}",
                    portal=random.choice(["pg_portal", "state_portal"]),
                    status=complaint_status,
                    description=f"Pothole detected on {p.highway_ref} near {p.nearest_city}. "
                    f"Severity: {p.severity}. GPS: {p.latitude}, {p.longitude}. "
                    f"Detected via {p.source}. Immediate attention required for road safety.",
                    filed_at=filed_at,
                    acknowledged_at=ack_at,
                    in_progress_at=prog_at,
                    resolved_at=res_at,
                    escalation_count=escalation_count,
                    escalation_level=esc_level,
                    last_escalated_at=last_esc_at,
                    assigned_contractor_id=random.choice(contractor_ids)
                    if p.status in ["in_progress", "resolved"]
                    else None,
                )
                db.add(complaint)

            # Seed News Mentions (on road coordinates)
            for i, article in enumerate(NEWS_ARTICLES):
                city = CG_CITIES.get(article["location"], CG_CITIES["Raipur"])
                # Try to find a road segment near this city
                if road_segments:
                    near_segs = [
                        s
                        for s in road_segments
                        if any(
                            abs(c[0] - city["lat"]) < 0.3
                            and abs(c[1] - city["lng"]) < 0.3
                            for c in s["coords"][:5]
                        )
                    ]
                    if near_segs:
                        seg = random.choice(near_segs)
                        nlat, nlng = _sample_point_on_segment(seg)
                    else:
                        nlat = city["lat"] + random.uniform(-0.05, 0.05)
                        nlng = city["lng"] + random.uniform(-0.05, 0.05)
                else:
                    nlat = city["lat"] + random.uniform(-0.05, 0.05)
                    nlng = city["lng"] + random.uniform(-0.05, 0.05)

                mention = NewsMention(
                    source_type=article["source"],
                    source_name=article["name"],
                    title=article["title"],
                    content_snippet=article["snippet"],
                    extracted_location=article["location"],
                    latitude=nlat,
                    longitude=nlng,
                    severity_keyword=article["severity"],
                    # Vary sentiment: critical = very negative, high = negative,
                    # some articles about repairs could be neutral/positive
                    sentiment_score=round(
                        random.uniform(-0.9, -0.4)
                        if article["severity"] == "critical"
                        else random.uniform(-0.7, -0.1)
                        if article["severity"] == "high"
                        else random.uniform(-0.3, 0.2),
                        2,
                    ),
                    published_at=now - timedelta(days=random.randint(1, 60)),
                )
                db.add(mention)

            # Seed Waterlogging Zones (on road coordinates)
            waterlogging_spots = [
                {"city": "Raipur", "hw": "NH 30", "risk": "high", "incidents": 12},
                {"city": "Bilaspur", "hw": "NH 45", "risk": "high", "incidents": 8},
                {"city": "Korba", "hw": "NH 130B", "risk": "high", "incidents": 15},
                {"city": "Durg", "hw": "NH 53", "risk": "medium", "incidents": 6},
                {"city": "Jagdalpur", "hw": "SH 5", "risk": "high", "incidents": 18},
                {"city": "Ambikapur", "hw": "NH 43", "risk": "medium", "incidents": 5},
                {"city": "Dhamtari", "hw": "SH 7", "risk": "high", "incidents": 10},
                {"city": "Raigarh", "hw": "NH 53", "risk": "medium", "incidents": 7},
                {"city": "Mahasamund", "hw": "NH 30", "risk": "low", "incidents": 3},
                {"city": "Kawardha", "hw": "SH 9", "risk": "medium", "incidents": 4},
                {"city": "Janjgir", "hw": "NH 130B", "risk": "high", "incidents": 9},
                {"city": "Gariaband", "hw": "SH 7", "risk": "high", "incidents": 11},
            ]

            # City-specific realistic elevation ranges (meters above sea level)
            city_elevations = {
                "Raipur": (280, 320),
                "Bilaspur": (260, 300),
                "Korba": (280, 320),
                "Durg": (290, 330),
                "Jagdalpur": (530, 570),
                "Ambikapur": (590, 630),
                "Dhamtari": (310, 360),
                "Raigarh": (215, 250),
                "Mahasamund": (290, 320),
                "Kawardha": (360, 400),
                "Janjgir": (240, 280),
                "Gariaband": (300, 350),
            }

            for wz in waterlogging_spots:
                city = CG_CITIES.get(wz["city"], CG_CITIES["Raipur"])
                elev_range = city_elevations.get(wz["city"], (280, 350))
                if road_segments:
                    near_segs = [
                        s
                        for s in road_segments
                        if any(
                            abs(c[0] - city["lat"]) < 0.3
                            and abs(c[1] - city["lng"]) < 0.3
                            for c in s["coords"][:5]
                        )
                    ]
                    if near_segs:
                        seg = random.choice(near_segs)
                        wlat, wlng = _sample_point_on_segment(seg)
                    else:
                        wlat = city["lat"] + random.uniform(-0.08, 0.08)
                        wlng = city["lng"] + random.uniform(-0.08, 0.08)
                else:
                    wlat = city["lat"] + random.uniform(-0.08, 0.08)
                    wlng = city["lng"] + random.uniform(-0.08, 0.08)

                zone = WaterloggingZone(
                    latitude=wlat,
                    longitude=wlng,
                    radius_m=random.uniform(100, 500),
                    risk_level=wz["risk"],
                    elevation_m=round(random.uniform(*elev_range), 1),
                    historical_incidents=wz["incidents"],
                    associated_highway_ref=wz["hw"],
                )
                db.add(zone)

            db.commit()
            print(
                f"Seeded: 250 potholes (road-aligned), {len(complaint_potholes)} complaints, "
                f"{len(CONTRACTORS)} contractors, {len(CG_HIGHWAYS)} highways, "
                f"{len(NEWS_ARTICLES)} news mentions, {len(waterlogging_spots)} waterlogging zones"
            )

        # ── 2. Traffic anomalies (independent check) ──────────────────────────
        if db.query(TrafficAnomaly).count() == 0:
            print("Seeding traffic anomalies...")
            road_segments = _load_road_segments()
            for ta in TRAFFIC_ANOMALIES:
                # Snap traffic anomaly to nearest road segment
                snap_lat, snap_lng = ta["latitude"], ta["longitude"]
                if road_segments:
                    near_segs = [
                        s
                        for s in road_segments
                        if any(
                            abs(c[0] - ta["latitude"]) < 0.2
                            and abs(c[1] - ta["longitude"]) < 0.2
                            for c in s["coords"][:10]
                        )
                    ]
                    if near_segs:
                        seg = random.choice(near_segs)
                        snap_lat, snap_lng = _sample_point_on_segment(seg)

                anomaly = TrafficAnomaly(
                    highway_ref=ta["highway_ref"],
                    location=ta["location"],
                    latitude=snap_lat,
                    longitude=snap_lng,
                    anomaly_type=ta["anomaly_type"],
                    severity=ta["severity"],
                    avg_speed_kmph=ta["avg_speed_kmph"],
                    expected_speed_kmph=ta["expected_speed_kmph"],
                    delay_factor=ta["delay_factor"],
                    detected_at=datetime.now() - timedelta(days=ta["days_ago"]),
                    occurrences=ta["occurrences"],
                    likely_cause=ta["likely_cause"],
                )
                db.add(anomaly)
            db.commit()
            print(f"Seeded: {len(TRAFFIC_ANOMALIES)} traffic anomalies (road-aligned)")

        # ── 3. Incentive tiers (independent check) ────────────────────────────
        if db.query(IncentiveTier).count() == 0:
            print("Seeding incentive tiers...")
            for tier in INCENTIVE_TIERS:
                db.add(
                    IncentiveTier(
                        label=tier["label"],
                        points=tier["points"],
                        condition_key=tier["condition_key"],
                        badge_color=tier["badge_color"],
                        description=tier["description"],
                        sort_order=tier["sort_order"],
                    )
                )
            db.commit()
            print(f"Seeded: {len(INCENTIVE_TIERS)} incentive tiers")

    except Exception as e:
        print(f"Seeding failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()
