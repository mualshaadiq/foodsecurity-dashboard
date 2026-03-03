"""
Download LSD_50K_Dilindungi (Layer 59) from BIG ArcGIS MapServer.
Saves 4 separate shapefiles to data/shapefiles/Food Monitoring/.

Usage:
    python download_lsd.py
"""

import math
import time
import os
import requests
import geopandas as gpd
from shapely.geometry import shape

BASE_URL   = "https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer"
LAYER_ID   = 59
LAYER_NAME = "LSD_50K_Dilindungi"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "shapefiles", "Food Monitoring")
NUM_PARTS  = 4
PAGE_SIZE  = 1000

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0"})

# Parts already imported into PostGIS — skip downloading them again
SKIP_PARTS = {1, 2}

os.makedirs(OUTPUT_DIR, exist_ok=True)


def get_oid_range():
    url = f"{BASE_URL}/{LAYER_ID}/query"
    r = SESSION.get(url, params={"where": "1=1", "returnIdsOnly": "true",
                                  "orderByFields": "OBJECTID ASC", "resultRecordCount": 1,
                                  "f": "json"}, timeout=60)
    r.raise_for_status()
    first = r.json()["objectIds"][0]
    r2 = SESSION.get(url, params={"where": "1=1", "returnIdsOnly": "true",
                                   "orderByFields": "OBJECTID DESC", "resultRecordCount": 1,
                                   "f": "json"}, timeout=60)
    r2.raise_for_status()
    last = r2.json()["objectIds"][0]
    return first, last


def fetch_page(where, offset=0):
    url = f"{BASE_URL}/{LAYER_ID}/query"
    r = SESSION.get(url, params={
        "where": where,
        "outFields": "*",
        "geometryPrecision": 7,
        "outSR": 4326,
        "f": "json",
        "resultOffset": offset,
        "resultRecordCount": PAGE_SIZE,
    }, timeout=120)
    r.raise_for_status()
    return r.json()


def features_to_gdf(features):
    rows = []
    for feat in features:
        attrs = feat["attributes"].copy()
        geom_json = feat.get("geometry")
        if geom_json:
            attrs["geometry"] = shape({"type": "Polygon" if "rings" in geom_json else "Point",
                                       "coordinates": geom_json.get("rings", geom_json.get("x"))})
        rows.append(attrs)
    if not rows:
        return gpd.GeoDataFrame()
    gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    return gdf


def download_part(part_idx, oid_start, oid_end):
    where = f"OBJECTID >= {oid_start} AND OBJECTID <= {oid_end}"
    out_path = os.path.join(OUTPUT_DIR, f"{LAYER_NAME}_part{part_idx}.shp")
    if os.path.exists(out_path):
        print(f"  [part {part_idx}] Already exists: {out_path} — skipping")
        return

    print(f"  [part {part_idx}] OIDs {oid_start}–{oid_end}")
    all_features = []
    offset = 0
    while True:
        data = fetch_page(where, offset)
        batch = data.get("features", [])
        if not batch:
            break
        all_features.extend(batch)
        offset += len(batch)
        print(f"    fetched {offset:,} features...", end="\r", flush=True)
        if not data.get("exceededTransferLimit", False):
            break
        time.sleep(0.2)

    print(f"\n    Total: {len(all_features):,} features")
    if not all_features:
        print("    WARNING: no features — skipping save")
        return

    # Use geopandas shape parsing directly
    from shapely.geometry import shape as shp_shape, MultiPolygon
    rows = []
    for feat in all_features:
        attrs = {}
        for k, v in feat["attributes"].items():
            attrs[k.lower()[:10]] = v  # shapefile column name limit
        geom_json = feat.get("geometry")
        if geom_json and "rings" in geom_json:
            try:
                g = shp_shape({"type": "Polygon", "coordinates": geom_json["rings"]})
                if g.geom_type == "Polygon":
                    g = MultiPolygon([g])
            except Exception:
                g = None
        else:
            g = None
        attrs["geometry"] = g
        rows.append(attrs)

    gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    gdf = gdf.rename_geometry("geom") if "geometry" in gdf.columns else gdf

    t0 = time.time()
    gdf.to_file(out_path)
    print(f"    Saved -> {os.path.basename(out_path)}  ({time.time()-t0:.1f}s)")


def main():
    print(f"Fetching OID range for layer {LAYER_ID} ({LAYER_NAME}) ...")
    oid_min, oid_max = get_oid_range()
    print(f"  OID range: {oid_min} – {oid_max}")

    step = math.ceil((oid_max - oid_min + 1) / NUM_PARTS)
    parts = []
    for i in range(NUM_PARTS):
        start = oid_min + i * step
        end   = min(oid_min + (i + 1) * step - 1, oid_max)
        parts.append((start, end))

    t_total = time.time()
    for idx, (s, e) in enumerate(parts, start=1):
        if idx in SKIP_PARTS:
            print(f"  [part {idx}] Skipped (already in PostGIS)")
            continue
        download_part(idx, s, e)

    print(f"\nAll {NUM_PARTS} parts done in {(time.time()-t_total)/60:.1f} min")
    print(f"Files in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
