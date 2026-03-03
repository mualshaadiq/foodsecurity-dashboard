DROP TABLE IF EXISTS lbs_50k_nasional_subdiv;
CREATE TABLE lbs_50k_nasional_subdiv AS
    SELECT
        src.id            AS src_id,
        src.wadmpr,
        src.wadmkk,
        src.q_name19,
        src.luas_polyg,
        (ST_Dump(ST_Subdivide(src.geom, 64))).geom::geometry(Polygon,4326) AS geom
    FROM lbs_50k_nasional src
    WHERE src.geom IS NOT NULL;
ALTER TABLE lbs_50k_nasional_subdiv ADD COLUMN id SERIAL PRIMARY KEY;
CREATE INDEX idx_lbs_subdiv_geom ON lbs_50k_nasional_subdiv USING GIST(geom);
CREATE INDEX idx_lbs_subdiv_luas ON lbs_50k_nasional_subdiv (luas_polyg);
VACUUM ANALYZE lbs_50k_nasional_subdiv;
SELECT COUNT(*) AS subdiv_rows FROM lbs_50k_nasional_subdiv;
