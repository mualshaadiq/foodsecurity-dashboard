"""
Builds lbs_subdiv: a pre-subdivided version of the LBS table
where every polygon is split into ≤128-vertex sub-polygons.

Improves Tegola tile performance via tighter GIST bbox per geometry.
Run once after import_lbs_postgis.py. Safe to re-run.

Uses row_number() as id (Tegola requirement), avoids SERIAL to save
disk: no second heap scan during ADD COLUMN.
"""
import shutil
import time
import psycopg2

DB = dict(host="localhost", port=5432, dbname="gisdb",
          user="gisuser", password="gispassword123")


def free_gb():
    total, used, free = shutil.disk_usage("C:\\")
    return round(free / (1024**3), 1)


def run(conn, sql, label=""):
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute(sql)
    print(f"  {label or sql[:60]}  [{time.time()-t0:.1f}s]")
    return time.time() - t0


def main():
    conn = psycopg2.connect(**DB)
    conn.set_session(autocommit=True)

    print(f"Disk free before: {free_gb()} GB")

    print("Dropping table if exists ...")
    run(conn, "DROP TABLE IF EXISTS lbs_subdiv CASCADE", "DROP TABLE")

    # Use 128 max-vertices instead of 64 → fewer sub-cells, smaller table
    print("Building subdivided table (ST_Subdivide, max 128 vertices per cell) ...")
    print("  This takes ~5-10 min for 1.24M features — please wait.")
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE UNLOGGED TABLE lbs_subdiv AS
                SELECT
                    ROW_NUMBER() OVER ()::integer     AS id,
                    src.id                            AS src_id,
                    src.wadmpr,
                    src.wadmkk,
                    src.q_name19,
                    src.luas_polyg,
                    (ST_Dump(ST_Subdivide(src.geom, 128))).geom
                        ::geometry(Polygon,4326)       AS geom
                FROM lbs_50k_nasional src
                WHERE src.geom IS NOT NULL
        """)
    elapsed = time.time() - t0
    print(f"  Table created in {elapsed:.0f}s")

    # Check table size and available disk before adding index
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*),
                   pg_size_pretty(pg_relation_size('lbs_subdiv')),
                   pg_relation_size('lbs_subdiv')
            FROM lbs_subdiv
        """)
        rows, size_pretty, size_bytes = cur.fetchone()
    disk_free = free_gb()
    print(f"  Rows: {rows:,}  Table: {size_pretty}  Disk free: {disk_free} GB")

    # Add primary key constraint (cheap — just catalog change since id col exists)
    run(conn, "ALTER TABLE lbs_subdiv ADD PRIMARY KEY (id)", "Add PK")

    # Only build GIST if we have ≥ 2 GB headroom
    gist_estimate_gb = round(size_bytes / (1024**3) * 0.3, 1)
    if disk_free - gist_estimate_gb >= 2.0:
        print(f"  Building GIST index (est. {gist_estimate_gb} GB, {disk_free} GB free) ...")
        run(conn, "CREATE INDEX idx_lbs_subdiv_geom ON lbs_subdiv USING GIST(geom)", "GIST index")
        run(conn, "CREATE INDEX idx_lbs_subdiv_luas ON lbs_subdiv (luas_polyg)", "Area index")
        run(conn, "ANALYZE lbs_subdiv", "ANALYZE")
    else:
        print(f"  WARNING: Skipping GIST index — only {disk_free} GB free, need {gist_estimate_gb + 2} GB")
        print("  Table exists but will be slow without GIST. Free more disk then run:")
        print("    CREATE INDEX idx_lbs_subdiv_geom ON lbs_subdiv USING GIST(geom);")

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), pg_size_pretty(pg_total_relation_size('lbs_subdiv')) FROM lbs_subdiv")
        rows, total_size = cur.fetchone()
    print(f"\nDone. lbs_subdiv: {rows:,} rows, total {total_size}  Disk free: {free_gb()} GB")
    conn.close()


if __name__ == "__main__":
    main()
