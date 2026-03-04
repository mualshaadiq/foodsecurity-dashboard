-- Migration: add NDWI COG storage columns to sentinel_analysis_results
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE sentinel_analysis_results
    ADD COLUMN IF NOT EXISTS ndwi_tif_key       TEXT,
    ADD COLUMN IF NOT EXISTS ndwi_processed_at  TIMESTAMPTZ;

COMMENT ON COLUMN sentinel_analysis_results.ndwi_tif_key
    IS 'MinIO object key for the per-scene NDWI GeoTIFF, e.g. 3/sentinel-2a/2026/02/26/scene-7-ndwi.tif';

COMMENT ON COLUMN sentinel_analysis_results.ndwi_processed_at
    IS 'UTC timestamp when the NDWI GeoTIFF was computed and stored.';
