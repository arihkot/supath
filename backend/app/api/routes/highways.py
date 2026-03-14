"""Highway data API."""

import json
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Highway, Contractor
from app.schemas import HighwayResponse

router = APIRouter()


class HighwayUpdate(BaseModel):
    assigned_contractor_id: Optional[str] = None


def _enrich_highway(highway, contractor_map: dict) -> HighwayResponse:
    """Convert a Highway ORM object to HighwayResponse with contractor name."""
    resp = HighwayResponse.model_validate(highway)
    cid = highway.assigned_contractor_id
    if cid and cid in contractor_map:
        resp.assigned_contractor_name = contractor_map[cid]
    return resp


@router.get("")
def get_highways(db: Session = Depends(get_db)):
    """Get all highway records."""
    highways = db.query(Highway).order_by(Highway.highway_type, Highway.ref).all()

    # Batch-resolve contractor names
    cids = {h.assigned_contractor_id for h in highways if h.assigned_contractor_id}
    cmap = {}
    if cids:
        rows = (
            db.query(Contractor.id, Contractor.name)
            .filter(Contractor.id.in_(cids))
            .all()
        )
        cmap = {r[0]: r[1] for r in rows}

    return {
        "total": len(highways),
        "highways": [_enrich_highway(h, cmap) for h in highways],
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


@router.patch("/{highway_id}")
def update_highway(highway_id: str, body: HighwayUpdate, db: Session = Depends(get_db)):
    """Update a highway's assigned contractor."""
    highway = db.query(Highway).filter(Highway.id == highway_id).first()
    if not highway:
        raise HTTPException(status_code=404, detail="Highway not found")

    if body.assigned_contractor_id is not None:
        if body.assigned_contractor_id == "":
            # Empty string means unassign
            highway.assigned_contractor_id = None
        else:
            contractor = (
                db.query(Contractor)
                .filter(Contractor.id == body.assigned_contractor_id)
                .first()
            )
            if not contractor:
                raise HTTPException(status_code=404, detail="Contractor not found")
            highway.assigned_contractor_id = body.assigned_contractor_id

    db.commit()
    db.refresh(highway)

    # Resolve contractor name for response
    cname = None
    if highway.assigned_contractor_id:
        c = (
            db.query(Contractor)
            .filter(Contractor.id == highway.assigned_contractor_id)
            .first()
        )
        if c:
            cname = c.name

    resp = HighwayResponse.model_validate(highway)
    resp.assigned_contractor_name = cname
    return resp
