"""
Import LBS and LSD shapefiles into PostGIS.
Uses fiona + shapely + psycopg2 directly — avoids geopandas/SQLAlchemy version conflicts.

Run inside the gis_fastapi container:
  python3 /tmp/import_prod.py lbs   -> imports LBS parts 1-4
  python3 /tmp/import_prod.py lsd   -> imports LSD parts 1-4
"""

import sys
import time
import fiona
import psycopg2
from psycopg2.extras import execute_values
from shapely.geometry import shape, MultiPolygon, mapping
from shapely import wkb

DB = "host=postgis port=5432 dbname=gisdb user=gisuser password=gispassword123"
DATA = "/data/shapefiles/Food Monitoring"

CONFIGS = {
    "lbs": {
        "table": "lbs_50k_nasional",
        "parts": [f"{DATA}/LBS_50K_Nasional_part{i}.shp" for i in range(1, 5)],
    },
    "lsd": {
        "table": "lsd_50k_dilindungi",
        "parts": [f"{DATA}/LSD_50K_Dilindungi_part{i}.shp" for i in range(1, 5)],
    },
}


def to_multipolygon_wkb(geom_json):
    g = shape(geom_json)
    if g is None or g.is_empty:
        return None
    if g.geom_type == "Polygon":
        g = MultiPolygon([g])
    elif g.geom_type != "MultiPolygon":
        return None
    return wkb.dumps(g, hex=True, include_srid=False)


def get_non_geom_columns(parts):
    """Read first file to get attribute column names (excluding geometry)."""
    with fiona.open(parts[0]) as src:
        cols = [p for p in src.schema["properties"].keys()]
    return cols


def create_table(cur, table, cols):
    col_defs = ", ".join(f'"{c.lower()[:50]}" TEXT' for c in cols)
    cur.execute(f"""
        DROP TABLE IF EXISTS public."{table}";
        CREATE TABLE public."{table}" (
            id SERIAL PRIMARY KEY,
            {col_defs},
            geom geometry(MultiPolygon, 4326)
        );
    """)
    print(f"  Table {table} created.")


def import_part(cur, table, path, cols, batch_size=2000):
    total = 0
    batch = []
    col_names = ", ".join(f'"{c.lower()[:50]}"' for c in cols) + ", geom"
    placeholders = "(" + ", ".join(["%s"] * (len(cols) + 1)) + ")"

    with fiona.open(path) as src:
        print(f"  {len(src):,} features in {path.split('/')[-1]}")
        for feat in src:
            if feat["geometry"] is None:
                continue
            geom_hex = to_multipolygon_wkb(feat["geometry"])
            if geom_hex is None:
                continue
            props = feat["properties"]
            row = tuple(
                str(props.get(c, ""))[:250] if props.get(c) is not None else None
                for c in cols
            ) + (f"ST_GeomFromWKB(decode('{geom_hex}', 'hex'), 4326)",)

            # Can't use execute_values with SQL function expressions easily,
            # so build rows with geom as literal WKB hex and use mogrify approach
            row_vals = [str(props.get(c, ""))[:250] if props.get(c) is not None else None for c in cols]
            row_vals.append(geom_hex)
            batch.append(row_vals)

            if len(batch) >= batch_size:
                flush_batch(cur, table, cols, batch)
                total += len(batch)
                batch = []
                print(f"    {total:,} rows inserted...", end="\r")

        if batch:
            flush_batch(cur, table, cols, batch)
            total += len(batch)

    print(f"    {total:,} rows inserted from {path.split('/')[-1]}   ")
    return total


def flush_batch(cur, table, cols, batch):
    col_names = ", ".join(f'"{c.lower()[:50]}"' for c in cols)
    # Build values list; last column is geom WKB hex
    values = []
    for row in batch:
        *attr_vals, geom_hex = row
        escaped_attrs = cur.mogrify("(" + ",".join(["%s"] * len(attr_vals)) + ")", attr_vals).decode()
        # Remove closing paren, append geom expression
        escaped_attrs = escaped_attrs[:-1]  # strip trailing )
        values.append(f"{escaped_attrs}, ST_GeomFromWKB(decode('{geom_hex}', 'hex'), 4326))")

    sql = f'INSERT INTO public."{table}" ({col_names}, geom) VALUES ' + ",".join(values)
    cur.execute(sql)


def post_import(conn, table):
    print("  Creating spatial index and VACUUM ANALYZE ...")
    with conn.cursor() as cur:
        cur.execute(f'CREATE INDEX IF NOT EXISTS "idx_{table}_geom" ON public."{table}" USING GIST (geom);')
    conn.commit()
    # VACUUM can't run in transaction
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f'VACUUM ANALYZE public."{table}";')
    conn.autocommit = False
    print("  Done.")


def main():
    kind = sys.argv[1].lower() if len(sys.argv) > 1 else "lbs"
    cfg = CONFIGS[kind]
    table = cfg["table"]
    parts = cfg["parts"]

    print(f"\n=== Importing {kind.upper()} → {table} ===")
    cols = get_non_geom_columns(parts)
    print(f"  Columns: {cols}")

    conn = psycopg2.connect(DB)
    conn.autocommit = False

    with conn.cursor() as cur:
        create_table(cur, table, cols)
    conn.commit()

    total = 0
    for i, path in enumerate(parts, 1):
        print(f"\n[Part {i}/4] {path.split('/')[-1]}")
        t0 = time.time()
        with conn.cursor() as cur:
            n = import_part(cur, table, path, cols)
        conn.commit()
        total += n
        print(f"  Part {i} done in {time.time()-t0:.1f}s")

    print(f"\nTotal rows imported: {total:,}")
    post_import(conn, table)
    conn.close()
    print(f"\n=== {kind.upper()} import complete ===")


if __name__ == "__main__":
    main()
