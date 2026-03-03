"""
Builds lsd_50k_dilindungi_subdiv: pre-subdivided version of the LSD table.
Each polygon is split into ≤128-vertex sub-polygons.

Improves Tegola tile performance via tighter GIST bbox per geometry.
Run once after import_lsd_postgis.py. Safe to re-run.
"""
import time
import psycopg2

DB = dict(host="localhost", port=5432, dbname="gisdb",
          user="gisuser", password="gispassword123")


def run(conn, sql, label=""):
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute(sql)
    print(f"  {label or sql[:60]}  [{time.time()-t0:.1f}s]")


def main():
    conn = psycopg2.connect(**DB)
    conn.set_session(autocommit=True)

    print("Dropping table if exists ...")
    run(conn, "DROP TABLE IF EXISTS lsd_50k_dilindungi_subdiv CASCADE", "DROP TABLE")

    print("Building subdivided table (ST_Subdivide, max 128 vertices per cell) ...")
    print("  This may take several minutes — please wait.")
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE lsd_50k_dilindungi_subdiv AS
                SELECT
                    ROW_NUMBER() OVER ()::integer         AS id,
                    src.id                                AS src_id,
                    src.luas_ha,
                    sub.geom::geometry(Polygon,4326)       AS geom
                FROM lsd_50k_dilindungi src
                CROSS JOIN LATERAL (
                    SELECT (ST_Dump(ST_Subdivide(
                        CASE WHEN ST_IsValid(src.geom) THEN src.geom
                             ELSE ST_MakeValid(src.geom)
                        END, 128))).geom AS geom
                ) sub
                WHERE src.geom IS NOT NULL
                  AND ST_GeometryType(sub.geom) IN ('ST_Polygon','ST_MultiPolygon')
        """)
    print(f"  Table created in {time.time()-t0:.0f}s")

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), pg_size_pretty(pg_relation_size('lsd_50k_dilindungi_subdiv')) FROM lsd_50k_dilindungi_subdiv")
        rows, sz = cur.fetchone()
    print(f"  Rows: {rows:,}  Heap size: {sz}")

    run(conn, "ALTER TABLE lsd_50k_dilindungi_subdiv ADD PRIMARY KEY (id)", "Add PK")
    run(conn, "CREATE INDEX idx_lsd_subdiv_geom ON lsd_50k_dilindungi_subdiv USING GIST(geom)", "GIST index")
    run(conn, "CREATE INDEX idx_lsd_subdiv_luas ON lsd_50k_dilindungi_subdiv (luas_ha)", "Area index")
    run(conn, "ANALYZE lsd_50k_dilindungi_subdiv", "ANALYZE")

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), pg_size_pretty(pg_total_relation_size('lsd_50k_dilindungi_subdiv')) FROM lsd_50k_dilindungi_subdiv")
        rows, total = cur.fetchone()
    print(f"\nDone. lsd_50k_dilindungi_subdiv: {rows:,} rows, total {total}")
    conn.close()


if __name__ == "__main__":
    main()
