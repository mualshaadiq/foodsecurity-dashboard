-- Build subdivision tables and bbox_area index for Tegola tile performance.
-- Run after ogr2ogr import of lbs_50k_nasional and lsd_50k_dilindungi.
-- Execute: docker exec -i gis_postgis psql -U gisuser -d gisdb < /tmp/build_subdiv_prod.sql

\echo '=== Building lbs_50k_nasional_subdiv ==='

DROP TABLE IF EXISTS lbs_50k_nasional_subdiv;
CREATE TABLE lbs_50k_nasional_subdiv AS
    SELECT
        src.id            AS src_id,
        src.wadmpr,
        src.wadmkk,
        src.q_name19,
        src.luas_polyg,
        (ST_Dump(ST_Subdivide(
            CASE WHEN ST_IsValid(src.geom) THEN src.geom ELSE ST_MakeValid(src.geom) END,
            64
        ))).geom::geometry(Polygon,4326) AS geom
    FROM lbs_50k_nasional src
    WHERE src.geom IS NOT NULL;

\echo 'Adding PK and indexes for lbs_50k_nasional_subdiv ...'
ALTER TABLE lbs_50k_nasional_subdiv ADD COLUMN id SERIAL PRIMARY KEY;
ALTER TABLE lbs_50k_nasional_subdiv ADD COLUMN bbox_area double precision;
UPDATE lbs_50k_nasional_subdiv SET bbox_area = ST_Area(Box2D(geom)::geometry);
CREATE INDEX idx_lbs_subdiv_geom     ON lbs_50k_nasional_subdiv USING GIST(geom);
CREATE INDEX idx_lbs_subdiv_luas     ON lbs_50k_nasional_subdiv (luas_polyg);
CREATE INDEX idx_lbs_subdiv_bbox_area ON lbs_50k_nasional_subdiv (bbox_area);
VACUUM ANALYZE lbs_50k_nasional_subdiv;
SELECT COUNT(*) AS lbs_subdiv_rows FROM lbs_50k_nasional_subdiv;

\echo '=== Building lsd_50k_dilindungi_subdiv ==='

DROP TABLE IF EXISTS lsd_50k_dilindungi_subdiv;
CREATE TABLE lsd_50k_dilindungi_subdiv AS
    SELECT
        src.id            AS src_id,
        src.luas_ha,
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
CREATE INDEX idx_lsd_subdiv_luas      ON lsd_50k_dilindungi_subdiv (luas_ha);
CREATE INDEX idx_lsd_subdiv_bbox_area ON lsd_50k_dilindungi_subdiv (bbox_area);
VACUUM ANALYZE lsd_50k_dilindungi_subdiv;
SELECT COUNT(*) AS lsd_subdiv_rows FROM lsd_50k_dilindungi_subdiv;

\echo '=== All done ==='
