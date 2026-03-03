"""
Import LBS_50K_Nasional shapefile parts (1-4) into PostGIS.
Connects directly to PostGIS on localhost:5432.

Run after the download_arcgis_layers.py script has completed all 4 LBS parts.
"""

import os
import sys
import time
import geopandas as gpd
from sqlalchemy import create_engine, text

# ── Connection ────────────────────────────────────────────────────────────────
DB_URL = "postgresql://gisuser:gispassword123@localhost:5432/gisdb"
TABLE   = "lbs_50k_nasional"
SCHEMA  = "public"

# ── Source files ──────────────────────────────────────────────────────────────
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "shapefiles", "Food Monitoring")
PARTS = [
    os.path.join(DATA_DIR, f"LBS_50K_Nasional_part{i}.shp") for i in range(1, 5)
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def check_parts():
    missing = [p for p in PARTS if not os.path.exists(p)]
    if missing:
        print("ERROR: Missing files:")
        for m in missing:
            print(f"  {m}")
        sys.exit(1)
    print("All 4 LBS parts found.")


def import_parts(engine):
    for i, path in enumerate(PARTS, start=1):
        part_label = f"part {i}/4"
        print(f"\n[{part_label}] Reading {os.path.basename(path)} ...")
        t0 = time.time()
        gdf = gpd.read_file(path)
        print(f"  {len(gdf):,} features read in {time.time()-t0:.1f}s")

        # Normalise geometry column name to 'geom'
        if "geometry" in gdf.columns:
            gdf = gdf.rename_geometry("geom")

        # Ensure CRS
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")
        elif gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs("EPSG:4326")

        # Drop objectid — PostGIS will auto-assign its own serial pk
        if "objectid" in gdf.columns:
            gdf = gdf.drop(columns=["objectid"])

        # Ensure all geometries are MultiPolygon so the PostGIS column type is
        # geometry(MultiPolygon,4326) — required for Tegola's WKB decoder.
        from shapely.geometry import MultiPolygon as ShpMultiPolygon
        gdf["geom"] = gdf["geom"].apply(
            lambda g: ShpMultiPolygon([g]) if g is not None and g.geom_type == "Polygon" else g
        )

        # Truncate string columns to fit VARCHAR constraints if needed
        for col in gdf.select_dtypes(include="object").columns:
            gdf[col] = gdf[col].str.slice(0, 250)

        mode = "replace" if i == 1 else "append"
        print(f"  Writing to PostGIS ({mode}) ...")
        t0 = time.time()
        gdf.to_postgis(
            TABLE,
            engine,
            schema=SCHEMA,
            if_exists=mode,
            index=False,
            chunksize=5000,
        )
        print(f"  Done in {time.time()-t0:.1f}s")


def post_import(engine):
    print("\nCreating serial PK, spatial index and running VACUUM ANALYZE ...")
    with engine.connect() as conn:
        # Add serial primary key if not already present
        conn.execute(text(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = '{SCHEMA}'
                      AND table_name   = '{TABLE}'
                      AND column_name  = 'id'
                ) THEN
                    ALTER TABLE {SCHEMA}.{TABLE} ADD COLUMN id SERIAL PRIMARY KEY;
                END IF;
            END$$;
        """))
        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS idx_{TABLE}_geom
                ON {SCHEMA}.{TABLE} USING GIST (geom);
        """))
        conn.execute(text(f"COMMENT ON TABLE {SCHEMA}.{TABLE} IS 'Peta Lahan Baku Sawah Nasional 1:50.000 (Layer 36)';"))
        conn.commit()

    # VACUUM ANALYZE must run outside a transaction
    import psycopg2
    raw = psycopg2.connect(
        host="localhost", port=5432,
        dbname="gisdb", user="gisuser", password="gispassword123"
    )
    raw.set_session(autocommit=True)
    with raw.cursor() as cur:
        print(f"  VACUUM ANALYZE {SCHEMA}.{TABLE} ...")
        cur.execute(f"VACUUM ANALYZE {SCHEMA}.{TABLE};")
    raw.close()
    print("  Done.")


def row_count(engine):
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT COUNT(*) FROM {SCHEMA}.{TABLE}"))
        return result.scalar()


def main():
    check_parts()

    print(f"\nConnecting to {DB_URL} ...")
    engine = create_engine(DB_URL, pool_pre_ping=True)

    import_parts(engine)
    post_import(engine)

    total = row_count(engine)
    print(f"\nImport complete. Total rows in {TABLE}: {total:,}")
    engine.dispose()


if __name__ == "__main__":
    main()
