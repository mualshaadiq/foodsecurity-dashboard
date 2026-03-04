-- Migration: add NDVI COG storage columns to sentinel_analysis_results
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE sentinel_analysis_results
    ADD COLUMN IF NOT EXISTS ndvi_tif_key       TEXT,
    ADD COLUMN IF NOT EXISTS ndvi_processed_at  TIMESTAMPTZ;

COMMENT ON COLUMN sentinel_analysis_results.ndvi_tif_key
    IS 'MinIO object key for the per-scene NDVI GeoTIFF, e.g. 3/sentinel-2a/2026/02/26/scene-7-ndvi.tif';

COMMENT ON COLUMN sentinel_analysis_results.ndvi_processed_at
    IS 'UTC timestamp when the NDVI GeoTIFF was computed and stored.';
