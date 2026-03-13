#!/usr/bin/env python3
"""
Fetch Chhattisgarh National Highways and State Highways from Overpass API
and save as GeoJSON files for the SUPATH map.
"""

import json
import sys
import urllib.request
import urllib.parse
import time

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
GEOJSON_DIR = "../app/data/geojson"

# Overpass QL query for National Highways (trunk roads) in Chhattisgarh
NH_QUERY = """
[out:json][timeout:120];
area["name"="Chhattisgarh"]["admin_level"="4"]->.cg;
(
  way["highway"="trunk"](area.cg);
  way["highway"="trunk_link"](area.cg);
  relation["highway"="trunk"](area.cg);
);
out body;
>;
out skel qt;
"""

# Overpass QL query for State Highways (primary roads) in Chhattisgarh
SH_QUERY = """
[out:json][timeout:120];
area["name"="Chhattisgarh"]["admin_level"="4"]->.cg;
(
  way["highway"="primary"](area.cg);
  way["highway"="primary_link"](area.cg);
  relation["highway"="primary"](area.cg);
);
out body;
>;
out skel qt;
"""


def overpass_to_geojson(data):
    """Convert Overpass JSON to GeoJSON."""
    # Build a node lookup
    nodes = {}
    for elem in data.get("elements", []):
        if elem["type"] == "node":
            nodes[elem["id"]] = (elem["lon"], elem["lat"])

    features = []

    for elem in data.get("elements", []):
        if elem["type"] == "way":
            coords = []
            for nd in elem.get("nodes", []):
                if nd in nodes:
                    coords.append(list(nodes[nd]))
            if len(coords) >= 2:
                feature = {
                    "type": "Feature",
                    "properties": elem.get("tags", {}),
                    "geometry": {
                        "type": "LineString",
                        "coordinates": coords,
                    },
                }
                # Add OSM ID for reference
                feature["properties"]["osm_id"] = elem["id"]
                features.append(feature)

        elif elem["type"] == "relation":
            # For relations, we'd need to combine member ways
            # For now, capture the relation properties — ways are already included
            pass

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def fetch_overpass(query, label):
    """Send a query to Overpass API and return JSON response."""
    print(f"Fetching {label} from Overpass API...")
    encoded = urllib.parse.urlencode({"data": query}).encode("utf-8")

    req = urllib.request.Request(
        OVERPASS_URL,
        data=encoded,
        headers={"User-Agent": "SUPATH/1.0 (Hackathon Project)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            elements = data.get("elements", [])
            print(f"  Received {len(elements)} elements for {label}")
            return data
    except Exception as e:
        print(f"  ERROR fetching {label}: {e}")
        return None


def main():
    import os

    os.makedirs(GEOJSON_DIR, exist_ok=True)

    # Fetch National Highways
    nh_data = fetch_overpass(NH_QUERY, "National Highways")
    if nh_data:
        geojson = overpass_to_geojson(nh_data)
        nh_path = os.path.join(GEOJSON_DIR, "chhattisgarh_nh.geojson")
        with open(nh_path, "w") as f:
            json.dump(geojson, f)
        print(f"  Saved {len(geojson['features'])} NH features to {nh_path}")
    else:
        print("  Failed to fetch NH data")

    # Brief pause to be polite to the API
    print("Waiting 5 seconds before next query...")
    time.sleep(5)

    # Fetch State Highways
    sh_data = fetch_overpass(SH_QUERY, "State Highways")
    if sh_data:
        geojson = overpass_to_geojson(sh_data)
        sh_path = os.path.join(GEOJSON_DIR, "chhattisgarh_sh.geojson")
        with open(sh_path, "w") as f:
            json.dump(geojson, f)
        print(f"  Saved {len(geojson['features'])} SH features to {sh_path}")
    else:
        print("  Failed to fetch SH data")

    print("\nDone!")


if __name__ == "__main__":
    main()
