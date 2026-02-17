#!/bin/bash

# Import Shapefiles to PostGIS Database
# Usage: ./import_shapefiles.sh [path_to_shapefiles_directory]
#
# This script imports all shapefiles from the specified directory into PostGIS
# with optimizations for large datasets.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration from environment or defaults
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-gisdb}"
POSTGRES_USER="${POSTGRES_USER:-gisuser}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

# Data directory (default to /data/shapefiles if not specified)
DATA_DIR="${1:-/data/shapefiles}"

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Shapefile Import Script${NC}"
echo -e "${GREEN}==================================${NC}"

# Check if data directory exists
if [ ! -d "$DATA_DIR" ]; then
    echo -e "${RED}Error: Directory $DATA_DIR does not exist${NC}"
    exit 1
fi

# Count shapefiles
SHAPEFILE_COUNT=$(find "$DATA_DIR" -name "*.shp" | wc -l)

if [ "$SHAPEFILE_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}Warning: No shapefiles found in $DATA_DIR${NC}"
    exit 0
fi

echo -e "${GREEN}Found $SHAPEFILE_COUNT shapefile(s) to import${NC}"
echo ""

# PostgreSQL connection string
PG_CONNECTION="PG:host=$POSTGRES_HOST port=$POSTGRES_PORT dbname=$POSTGRES_DB user=$POSTGRES_USER password=$POSTGRES_PASSWORD"

# Optimize PostgreSQL for bulk loading
echo -e "${YELLOW}Optimizing database for bulk loading...${NC}"
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB << EOF
-- Disable autovacuum temporarily
ALTER TABLE spatial_features SET (autovacuum_enabled = false);

-- Optimize settings for bulk loading
SET maintenance_work_mem = '2GB';
SET work_mem = '1GB';
SET synchronous_commit = off;
EOF

echo -e "${GREEN}Database optimized${NC}"
echo ""

# Import each shapefile
IMPORTED=0
FAILED=0

for shapefile in "$DATA_DIR"/*.shp; do
    filename=$(basename "$shapefile")
    echo -e "${YELLOW}Importing: $filename${NC}"
    
    if ogr2ogr \
        -f "PostgreSQL" \
        "$PG_CONNECTION" \
        "$shapefile" \
        -nln spatial_features \
        -append \
        -lco GEOMETRY_NAME=geom \
        -lco SPATIAL_INDEX=NO \
        -gt 65536 \
        --config PG_USE_COPY YES \
        --config PGCLIENTENCODING UTF8 \
        -t_srs EPSG:4326 \
        -skipfailures \
        -progress; then
        
        echo -e "${GREEN}✓ Successfully imported: $filename${NC}"
        ((IMPORTED++))
    else
        echo -e "${RED}✗ Failed to import: $filename${NC}"
        ((FAILED++))
    fi
    echo ""
done

# Post-import optimization
echo -e "${YELLOW}Post-import optimization...${NC}"

PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB << EOF
-- Update geometry types
UPDATE spatial_features 
SET geom_type = ST_GeometryType(geom) 
WHERE geom_type IS NULL;

-- Create/rebuild spatial index if not exists
DROP INDEX IF EXISTS idx_spatial_features_geom;
CREATE INDEX idx_spatial_features_geom ON spatial_features USING GIST(geom);

-- Cluster for better I/O performance
CLUSTER spatial_features USING idx_spatial_features_geom;

-- Re-enable autovacuum
ALTER TABLE spatial_features SET (autovacuum_enabled = true);

-- Analyze table
VACUUM ANALYZE spatial_features;

-- Show statistics
SELECT 
    COUNT(*) as total_features,
    COUNT(DISTINCT geom_type) as geometry_types,
    ST_Extent(geom) as bbox
FROM spatial_features;
EOF

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Import Summary${NC}"
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Imported: $IMPORTED${NC}"
if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
fi
echo -e "${GREEN}==================================${NC}"

exit 0
