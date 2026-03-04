-- Migration: add sentinel_analysis_results table
-- Run once on production: psql -U gisuser -d gisdb -f migrate_add_analysis_table.sql

CREATE TABLE IF NOT EXISTS sentinel_analysis_results (
    id                  SERIAL PRIMARY KEY,
    scene_id            INTEGER REFERENCES spatial_features(id) ON DELETE CASCADE,
    aoi_id              INTEGER,
    province_code       VARCHAR(20),
    ndvi_mean           FLOAT,
    estimated_area_ha   FLOAT    DEFAULT 0,
    predicted_yield_ton FLOAT    DEFAULT 0,
    cloud_cover         FLOAT,
    analyzed_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    band_metadata       JSONB
);

CREATE INDEX IF NOT EXISTS idx_sar_scene_id    ON sentinel_analysis_results(scene_id);
CREATE INDEX IF NOT EXISTS idx_sar_aoi_id      ON sentinel_analysis_results(aoi_id);
CREATE INDEX IF NOT EXISTS idx_sar_analyzed_at ON sentinel_analysis_results(analyzed_at);
