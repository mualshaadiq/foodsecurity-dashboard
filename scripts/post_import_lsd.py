"""
Run post-import steps on lsd_50k_dilindungi:
- Add SERIAL id PK (if missing)
- Add luas_ha generated column (area in hectares from geometry)
- Create GIST + area indexes
- ANALYZE
"""
import time
from sqlalchemy import create_engine, text

e = create_engine("postgresql://gisuser:gispassword123@localhost:5432/gisdb")

steps = [
    ("Add PK column id", """
        DO $do$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='public'
                  AND table_name='lsd_50k_dilindungi'
                  AND column_name='id'
            ) THEN
                ALTER TABLE public.lsd_50k_dilindungi ADD COLUMN id SERIAL PRIMARY KEY;
            END IF;
        END $do$;
    """),
    ("Add luas_ha", """
        ALTER TABLE public.lsd_50k_dilindungi
        ADD COLUMN IF NOT EXISTS luas_ha double precision
        GENERATED ALWAYS AS (ST_Area(geom::geography) / 10000) STORED;
    """),
    ("GIST index", """
        DO $do$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname='public'
                  AND tablename='lsd_50k_dilindungi'
                  AND indexname='idx_lsd_50k_dilindungi_geom'
            ) THEN
                CREATE INDEX idx_lsd_50k_dilindungi_geom
                ON public.lsd_50k_dilindungi USING GIST(geom);
            END IF;
        END $do$;
    """),
    ("Area index", """
        CREATE INDEX IF NOT EXISTS idx_lsd_50k_dilindungi_luas
        ON public.lsd_50k_dilindungi (luas_ha);
    """),
]

for label, sql in steps:
    t0 = time.time()
    print(f"{label} ...", end=" ", flush=True)
    with e.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    print(f"done ({time.time()-t0:.1f}s)")

print("ANALYZE ...", end=" ", flush=True)
with e.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
    conn.execute(text("ANALYZE public.lsd_50k_dilindungi"))
print("done")

with e.connect() as conn:
    n = conn.execute(text("SELECT COUNT(*) FROM public.lsd_50k_dilindungi")).scalar()
    cols = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='lsd_50k_dilindungi' ORDER BY ordinal_position"
    )).fetchall()
print(f"Total rows: {n:,}")
print(f"Columns: {[r[0] for r in cols]}")
