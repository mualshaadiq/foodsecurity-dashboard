"""
Import LSD_50K_Dilindungi shapefile parts (1-4) into PostGIS.
Creates table lsd_50k_dilindungi with geometry(MultiPolygon,4326).

Run after download_lsd.py has completed all 4 parts.
"""

import os
import sys
import time
import geopandas as gpd
from shapely.geometry import MultiPolygon as ShpMultiPolygon
from sqlalchemy import create_engine, text

DB_URL = "postgresql://gisuser:gispassword123@localhost:5432/gisdb"
TABLE  = "lsd_50k_dilindungi"
SCHEMA = "public"

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "shapefiles", "Food Monitoring")
PARTS = [os.path.join(DATA_DIR, f"LSD_50K_Dilindungi_part{i}.shp") for i in range(1, 5)]


def check_parts():
    existing = [p for p in PARTS if os.path.exists(p)]
    missing  = [p for p in PARTS if not os.path.exists(p)]
    print(f"Found {len(existing)}/4 LSD parts.")
    if missing:
        print("  Skipping (not found):")
        for m in missing:
            print(f"    {m}")
    if not existing:
        print("ERROR: No parts found at all.")
        sys.exit(1)
    return existing


def import_parts(engine, existing_parts):
    imported_first = False
    for i, path in enumerate(PARTS, start=1):
        if path not in existing_parts:
            continue
        print(f"\n[part {i}/4] Reading {os.path.basename(path)} ...")
        t0 = time.time()
        gdf = gpd.read_file(path)
        print(f"  {len(gdf):,} features read in {time.time()-t0:.1f}s")

        if "geometry" in gdf.columns:
            gdf = gdf.rename_geometry("geom")

        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")
        elif gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs("EPSG:4326")

        if "objectid" in gdf.columns:
            gdf = gdf.drop(columns=["objectid"])

        # Normalise to MultiPolygon (required for Tegola WKB decoder)
        gdf["geom"] = gdf["geom"].apply(
            lambda g: ShpMultiPolygon([g]) if g is not None and g.geom_type == "Polygon" else g
        )

        for col in gdf.select_dtypes(include="object").columns:
            gdf[col] = gdf[col].str.slice(0, 250)

        # First part in this run: replace only if table doesn't exist yet
        from sqlalchemy import inspect as sa_inspect
        table_exists = sa_inspect(engine).has_table(TABLE, schema=SCHEMA)
        if not imported_first and not table_exists:
            mode = "replace"
        else:
            mode = "append"
        imported_first = True
        print(f"  Writing to PostGIS ({mode}) ...")
        t0 = time.time()
        gdf.to_postgis(TABLE, engine, schema=SCHEMA, if_exists=mode,
                       index=False, chunksize=5000)
        print(f"  Done in {time.time()-t0:.1f}s")


def post_import(engine):
    print("\nCreating serial PK, spatial index and running ANALYZE ...")
    with engine.connect() as conn:
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
        conn.commit()

    with engine.connect() as conn:
        conn.execute(text(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE schemaname = '{SCHEMA}'
                      AND tablename  = '{TABLE}'
                      AND indexname  = 'idx_{TABLE}_geom'
                ) THEN
                    CREATE INDEX idx_{TABLE}_geom ON {SCHEMA}.{TABLE} USING GIST(geom);
                END IF;
            END$$;
        """))
        conn.commit()

    with engine.connect() as conn:
        conn.execute(text(f"""
            ALTER TABLE {SCHEMA}.{TABLE}
            ADD COLUMN IF NOT EXISTS luas_ha double precision
            GENERATED ALWAYS AS (ST_Area(geom::geography) / 10000) STORED;
        """))
        conn.commit()

    with engine.connect() as conn:
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{TABLE}_luas ON {SCHEMA}.{TABLE} (luas_ha);"))
        conn.commit()

    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT COUNT(*) FROM {SCHEMA}.{TABLE}"))
        count = result.scalar()
    print(f"Total rows imported: {count:,}")

    print("Running ANALYZE ...")
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text(f"ANALYZE {SCHEMA}.{TABLE}"))
    print("Done.")


def main():
    existing = check_parts()
    engine = create_engine(DB_URL)

    t0 = time.time()
    import_parts(engine, existing)
    post_import(engine)
    print(f"\nTotal time: {(time.time()-t0)/60:.1f} min")


if __name__ == "__main__":
    main()
