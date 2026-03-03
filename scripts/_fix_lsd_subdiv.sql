-- Fix LBS missing GIST index (shared memory error during first build)
-- and build LSD subdiv with correct column name 'luasha'

\echo '=== Fixing LBS GIST index ==='
DROP INDEX IF EXISTS idx_lbs_subdiv_geom;
SET work_mem = '64MB';
CREATE INDEX idx_lbs_subdiv_geom ON lbs_50k_nasional_subdiv USING GIST(geom);
\echo 'LBS GIST index done.'

\echo '=== Building lsd_50k_dilindungi_subdiv ==='
DROP TABLE IF EXISTS lsd_50k_dilindungi_subdiv;
CREATE TABLE lsd_50k_dilindungi_subdiv AS
    SELECT
        src.id            AS src_id,
        src.luasha,
        (ST_Dump(ST_Subdivide(
            CASE WHEN ST_IsValid(src.geom) THEN src.geom ELSE ST_MakeValid(src.geom) END,
            64
        ))).geom::geometry(Polygon,4326) AS geom
    FROM lsd_50k_dilindungi src
    WHERE src.geom IS NOT NULL;

\echo 'Adding PK and indexes for lsd_50k_dilindungi_subdiv ...'
ALTER TABLE lsd_50k_dilindungi_subdiv ADD COLUMN id SERIAL PRIMARY KEY;
ALTER TABLE lsd_50k_dilindungi_subdiv ADD COLUMN bbox_area double precision;
UPDATE lsd_50k_dilindungi_subdiv SET bbox_area = ST_Area(Box2D(geom)::geometry);
CREATE INDEX idx_lsd_subdiv_geom      ON lsd_50k_dilindungi_subdiv USING GIST(geom);
CREATE INDEX idx_lsd_subdiv_luas      ON lsd_50k_dilindungi_subdiv (luasha);
CREATE INDEX idx_lsd_subdiv_bbox_area ON lsd_50k_dilindungi_subdiv (bbox_area);
VACUUM ANALYZE lsd_50k_dilindungi_subdiv;
SELECT COUNT(*) AS lsd_subdiv_rows FROM lsd_50k_dilindungi_subdiv;

\echo '=== Verifying all tables ==='
SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS total_size
FROM pg_class
WHERE relname IN ('lbs_50k_nasional_subdiv','lsd_50k_dilindungi_subdiv')
ORDER BY relname;

\echo '=== Done ==='
