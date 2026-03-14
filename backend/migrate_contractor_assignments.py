"""
Migration: Add assigned_contractor_id to potholes & highways, populate assignments.

Strategy:
- Highway → contractor: map start_city to district, assign contractor from that district
- Pothole → contractor: use pothole.highway_ref to find highway's contractor;
  fall back to district matching if no highway match
- Districts with no contractor get the nearest district's contractor

Run: python migrate_contractor_assignments.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "supath.db")

# City → District mapping (from seeder's CG_CITIES)
CITY_TO_DISTRICT = {
    "Raipur": "Raipur",
    "Bilaspur": "Bilaspur",
    "Durg": "Durg",
    "Bhilai": "Durg",
    "Korba": "Korba",
    "Rajnandgaon": "Rajnandgaon",
    "Jagdalpur": "Bastar",
    "Ambikapur": "Surguja",
    "Dhamtari": "Dhamtari",
    "Mahasamund": "Mahasamund",
    "Kanker": "Kanker",
    "Dantewada": "Dantewada",
    "Kondagaon": "Kondagaon",
    "Janjgir": "Janjgir-Champa",
    "Raigarh": "Raigarh",
    "Kawardha": "Kabirdham",
    "Balodabazar": "Balodabazar",
    "Jashpur": "Jashpur",
    "Gariaband": "Gariaband",
    "Surajpur": "Surajpur",
    "Simga": "Raipur",
    "Katghora": "Korba",
    "Champa": "Janjgir-Champa",
    "Bhopalpatnam": "Bijapur",
    "Sarangarh": "Raigarh",
    "Mungeli": "Bilaspur",
    "Pali": "Korba",
    "Saraipali": "Mahasamund",
    "Pandaria": "Kabirdham",
    "Kunkuri": "Jashpur",
}

# Fallback: districts without a contractor → nearest district that has one
DISTRICT_FALLBACK = {
    "Dantewada": "Bastar",
    "Surajpur": "Surguja",
    "Balodabazar": "Raipur",
    "Kanker": "Durg",
    "Kondagaon": "Bastar",
    "Jashpur": "Surguja",
    "Gariaband": "Dhamtari",
    "Raigarh": "Janjgir-Champa",
    "Bijapur": "Bastar",
}


def run():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # --- 1. Add columns if missing ---
    cols_potholes = {
        r[1] for r in cur.execute("PRAGMA table_info(potholes)").fetchall()
    }
    if "assigned_contractor_id" not in cols_potholes:
        cur.execute("ALTER TABLE potholes ADD COLUMN assigned_contractor_id VARCHAR")
        print("Added assigned_contractor_id to potholes")

    cols_highways = {
        r[1] for r in cur.execute("PRAGMA table_info(highways)").fetchall()
    }
    if "assigned_contractor_id" not in cols_highways:
        cur.execute("ALTER TABLE highways ADD COLUMN assigned_contractor_id VARCHAR")
        print("Added assigned_contractor_id to highways")

    # --- 2. Build contractor lookup: district → contractor_id ---
    contractors = cur.execute("SELECT id, name, district FROM contractors").fetchall()
    # district → list of contractor ids (Raipur has 2)
    district_to_contractors = {}
    contractor_names = {}
    for c in contractors:
        contractor_names[c["id"]] = c["name"]
        d = c["district"]
        if d:
            district_to_contractors.setdefault(d, []).append(c["id"])

    def resolve_contractor(district, idx=0):
        """Get a contractor for a district, with fallback."""
        if not district:
            return None
        clist = district_to_contractors.get(district)
        if clist:
            return clist[idx % len(clist)]
        # Try fallback
        fallback = DISTRICT_FALLBACK.get(district)
        if fallback:
            clist = district_to_contractors.get(fallback)
            if clist:
                return clist[idx % len(clist)]
        return None

    # --- 3. Assign contractors to highways ---
    highways = cur.execute(
        "SELECT id, ref, start_city, end_city FROM highways"
    ).fetchall()
    highway_contractor: dict[str, str] = {}  # ref → contractor_id (for pothole lookup)
    for i, hw in enumerate(highways):
        start_district = CITY_TO_DISTRICT.get(hw["start_city"])
        cid = resolve_contractor(start_district, idx=i)
        if not cid:
            # Try end city
            end_district = CITY_TO_DISTRICT.get(hw["end_city"])
            cid = resolve_contractor(end_district, idx=i)
        if cid:
            cur.execute(
                "UPDATE highways SET assigned_contractor_id = ? WHERE id = ?",
                (cid, hw["id"]),
            )
            highway_contractor[hw["ref"]] = cid
            print(
                f"  Highway {hw['ref']} ({hw['start_city']}→{hw['end_city']}) → {contractor_names.get(cid, '?')}"
            )

    # --- 4. Assign contractors to potholes ---
    potholes = cur.execute("SELECT id, highway_ref, district FROM potholes").fetchall()
    assigned = 0
    for i, p in enumerate(potholes):
        cid = None
        # First try: use the highway's assigned contractor
        if p["highway_ref"] and p["highway_ref"] in highway_contractor:
            cid = highway_contractor[p["highway_ref"]]
        # Fallback: use pothole district
        if not cid:
            cid = resolve_contractor(p["district"], idx=i)
        if cid:
            cur.execute(
                "UPDATE potholes SET assigned_contractor_id = ? WHERE id = ?",
                (cid, p["id"]),
            )
            assigned += 1

    print(
        f"\nAssigned contractors to {len(highway_contractor)}/{len(highways)} highways"
    )
    print(f"Assigned contractors to {assigned}/{len(potholes)} potholes")

    conn.commit()
    conn.close()
    print("Migration complete!")


if __name__ == "__main__":
    run()
