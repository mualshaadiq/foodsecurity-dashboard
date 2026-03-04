-- Initialize PostGIS database with spatial extensions and optimized settings

-- Enable PostGIS extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Performance tuning for spatial operations
ALTER SYSTEM SET shared_buffers = '1GB';
ALTER SYSTEM SET work_mem = '50MB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET effective_cache_size = '3GB';
ALTER SYSTEM SET random_page_cost = 1.1;  -- For SSD storage
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET max_worker_processes = 4;
ALTER SYSTEM SET max_parallel_workers_per_gather = 2;
ALTER SYSTEM SET max_parallel_workers = 4;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create spatial_features table
CREATE TABLE IF NOT EXISTS spatial_features (
    id SERIAL PRIMARY KEY,
    name VARCHAR(254),
    category VARCHAR(100),
    geom_type VARCHAR(20),
    geom GEOMETRY(GEOMETRY, 4326),
    properties JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Spatial indexes (GIST)
CREATE INDEX IF NOT EXISTS idx_spatial_features_geom ON spatial_features USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_spatial_features_geom_type ON spatial_features(geom_type);
CREATE INDEX IF NOT EXISTS idx_spatial_features_category ON spatial_features(category);
CREATE INDEX IF NOT EXISTS idx_spatial_features_name ON spatial_features(name);

-- JSONB index for properties
CREATE INDEX IF NOT EXISTS idx_spatial_features_properties ON spatial_features USING GIN(properties);

-- Partial indexes for specific geometry types (optional, for better performance)
CREATE INDEX IF NOT EXISTS idx_spatial_features_points ON spatial_features USING GIST(geom) 
    WHERE geom_type = 'ST_Point';

CREATE INDEX IF NOT EXISTS idx_spatial_features_lines ON spatial_features USING GIST(geom) 
    WHERE geom_type = 'ST_LineString' OR geom_type = 'ST_MultiLineString';

CREATE INDEX IF NOT EXISTS idx_spatial_features_polygons ON spatial_features USING GIST(geom) 
    WHERE geom_type = 'ST_Polygon' OR geom_type = 'ST_MultiPolygon';

-- Add constraint to ensure valid geometries (PostgreSQL 15 compatible)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enforce_valid_geom'
  ) THEN
    ALTER TABLE spatial_features ADD CONSTRAINT enforce_valid_geom
      CHECK (ST_IsValid(geom));
  END IF;
END;
$$;

-- Trigger to automatically update geom_type when geometry is inserted/updated
CREATE OR REPLACE FUNCTION update_geom_type()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.geom IS NOT NULL THEN
        NEW.geom_type := ST_GeometryType(NEW.geom);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_geom_type ON spatial_features;
CREATE TRIGGER trigger_update_geom_type
    BEFORE INSERT OR UPDATE OF geom ON spatial_features
    FOR EACH ROW
    EXECUTE FUNCTION update_geom_type();

-- Create view for quick statistics
CREATE OR REPLACE VIEW spatial_features_stats AS
SELECT 
    COUNT(*) as total_features,
    COUNT(DISTINCT geom_type) as geometry_types,
    COUNT(DISTINCT category) as categories,
    ST_Extent(geom) as bbox
FROM spatial_features;

-- ── Sentinel Analysis Results ─────────────────────────────────────────────
-- Stores per-scene NDVI / yield statistics computed by the analysis pipeline.
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

-- Grant permissions (for connection from FastAPI)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ${POSTGRES_USER};

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'Database initialization completed successfully';
    RAISE NOTICE 'PostGIS version: %', PostGIS_Full_Version();
END $$;
