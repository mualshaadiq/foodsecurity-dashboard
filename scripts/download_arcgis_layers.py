"""
Download ArcGIS MapServer layers and save as shapefiles.
Each layer is split into NUM_PARTS parts to stay under the 2 GB shapefile limit.

Layers:
  36 - Peta Lahan baku Sawah Nasional skala minimal 1:50.000
  59 - Peta Lahan Sawah yang Dilindungi minimal skala 1:50.000

Set TEST_MODE = True to do a quick flow-check with only a few features per part.
"""

import math
import time
import json
import os
import requests
import geopandas as gpd
from shapely.geometry import shape

BASE_URL = "https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer"
LAYERS = {
    36: "LBS_50K_Nasional",
    59: "LSD_50K_Dilindungi",
}
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "shapefiles", "Food Monitoring")
NUM_PARTS = 4

# ── Quick flow-check mode ──────────────────────────────────────────────────
# Set to True to download only TEST_FEATURES_PER_PART features per part.
# This lets you verify the whole pipeline (fetch → GDF → shapefile) fast
# without waiting for millions of features.
TEST_MODE = False
TEST_FEATURES_PER_PART = 50  # one small page is plenty for a smoke-test
# ──────────────────────────────────────────────────────────────────────────

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0"})


def get_feature_count(layer_id: int) -> int:
    url = f"{BASE_URL}/{layer_id}/query"
    params = {
        "where": "1=1",
        "returnCountOnly": "true",
        "f": "json",
    }
    r = SESSION.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    count = data.get("count", 0)
    print(f"  Layer {layer_id}: {count} total features")
    return count


def get_oid_range(layer_id: int):
    """Return (min_oid, max_oid) for the layer."""
    url = f"{BASE_URL}/{layer_id}/query"
    params = {
        "where": "1=1",
        "returnIdsOnly": "true",
        "f": "json",
    }
    r = SESSION.get(url, params=params, timeout=120)
    r.raise_for_status()
    data = r.json()
    oids = data.get("objectIds") or []
    if not oids:
        return None, None
    return min(oids), max(oids)


def download_part(layer_id: int, where_clause: str, part_num: int, total_parts: int, retries: int = 3) -> list:
    """Download features for a WHERE clause, handles pagination if count > maxRecordCount."""
    url = f"{BASE_URL}/{layer_id}/query"
    all_features = []
    offset = 0
    page_size = 1000

    # In test mode fetch only a tiny slice to verify the pipeline quickly
    if TEST_MODE:
        page_size = TEST_FEATURES_PER_PART

    while True:
        params = {
            "where": where_clause,
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": "4326",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "f": "geojson",
        }
        for attempt in range(1, retries + 1):
            try:
                r = SESSION.get(url, params=params, timeout=120)
                r.raise_for_status()
                geojson = r.json()
                break
            except Exception as e:
                print(f"    Attempt {attempt}/{retries} failed: {e}")
                if attempt == retries:
                    raise
                time.sleep(5 * attempt)

        features = geojson.get("features", [])
        all_features.extend(features)
        print(f"    Part {part_num}/{total_parts} — offset {offset}: got {len(features)} features (total so far: {len(all_features)})")

        # In test mode stop after the first page
        if TEST_MODE:
            break

        # If fewer than page_size returned, we're done with this chunk
        if len(features) < page_size:
            break
        offset += page_size
        time.sleep(0.5)

    return all_features


def save_part(features: list, output_name: str, part_num: int) -> int:
    """Convert features list to GeoDataFrame and save as shapefile part. Returns feature count."""
    if not features:
        print(f"    WARNING: No features for part {part_num}. Skipping.")
        return 0

    print(f"    Converting {len(features)} features to GeoDataFrame ...")
    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")

    # Remove duplicates within this part
    if "objectid" in gdf.columns:
        before = len(gdf)
        gdf = gdf.drop_duplicates(subset=["objectid"])
        if before != len(gdf):
            print(f"    Removed {before - len(gdf)} duplicate features.")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, f"{output_name}_part{part_num}.shp")
    print(f"    Saving to: {out_path}")
    gdf.to_file(out_path, driver="ESRI Shapefile", encoding="utf-8")
    print(f"    Saved {len(gdf)} features -> {out_path}")
    return len(gdf)


def download_layer(layer_id: int, output_name: str):
    print(f"\n{'='*60}")
    print(f"Downloading layer {layer_id}: {output_name}")
    print(f"{'='*60}")

    # Get OID range for splitting
    print("  Fetching OID range ...")
    min_oid, max_oid = get_oid_range(layer_id)
    if min_oid is None:
        print("  ERROR: Could not retrieve OID list. Aborting.")
        return

    print(f"  OID range: {min_oid} – {max_oid}")
    oid_step = math.ceil((max_oid - min_oid + 1) / NUM_PARTS)

    total_saved = 0
    for i in range(NUM_PARTS):
        low = min_oid + i * oid_step
        high = low + oid_step - 1
        if i == NUM_PARTS - 1:
            high = max_oid  # ensure last part catches everything
        where = f"objectid >= {low} AND objectid <= {high}"
        print(f"\n  --- Part {i+1}/{NUM_PARTS} — WHERE: {where} ---")
        features = download_part(layer_id, where, i + 1, NUM_PARTS)
        # Save each part immediately to a separate shapefile to avoid 2 GB limit
        count = save_part(features, output_name, i + 1)
        total_saved += count
        time.sleep(1)

    parts_list = ", ".join(f"{output_name}_part{p}.shp" for p in range(1, NUM_PARTS + 1))
    print(f"\n  All parts done. Total features saved: {total_saved}")
    print(f"  Files: {parts_list}")
    if TEST_MODE:
        print("  [TEST MODE] Re-run with TEST_MODE = False for the full download.")


def main():
    if TEST_MODE:
        print("*** TEST MODE — only fetching ~{} features per part ***\n".format(TEST_FEATURES_PER_PART))
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for layer_id, output_name in LAYERS.items():
        try:
            download_layer(layer_id, output_name)
        except Exception as e:
            print(f"\nERROR downloading layer {layer_id}: {e}")
            import traceback
            traceback.print_exc()

    print("\n\nAll downloads complete.")


if __name__ == "__main__":
    main()
