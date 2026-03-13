"""Highway data API."""

import json
from pathlib import Path
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Highway
from app.schemas import HighwayResponse

router = APIRouter()


@router.get("")
def get_highways(db: Session = Depends(get_db)):
    """Get all highway records."""
    highways = db.query(Highway).order_by(Highway.highway_type, Highway.ref).all()
    return {
        "total": len(highways),
        "highways": [HighwayResponse.model_validate(h) for h in highways],
    }


@router.get("/geojson")
def get_highway_geojson():
    """Get combined highway GeoJSON for map rendering."""
    geojson_dir = Path(__file__).resolve().parent.parent.parent / "data" / "geojson"

    features = []

    # Load NH GeoJSON
    nh_path = geojson_dir / "chhattisgarh_nh.geojson"
    if nh_path.exists():
        with open(nh_path, "r") as f:
            data = json.load(f)
            if "features" in data:
                features.extend(data["features"])

    # Load SH GeoJSON
    sh_path = geojson_dir / "chhattisgarh_sh.geojson"
    if sh_path.exists():
        with open(sh_path, "r") as f:
            data = json.load(f)
            if "features" in data:
                features.extend(data["features"])

    return {
        "type": "FeatureCollection",
        "features": features,
    }


@router.get("/boundary")
def get_cg_boundary():
    """Get Chhattisgarh state boundary GeoJSON."""
    geojson_dir = Path(__file__).resolve().parent.parent.parent / "data" / "geojson"
    boundary_path = geojson_dir / "chhattisgarh_boundary.geojson"

    if boundary_path.exists():
        with open(boundary_path, "r") as f:
            return json.load(f)

    return {"type": "FeatureCollection", "features": []}
