#!/bin/bash

# Backup PostGIS Database
# Usage: ./backup_db.sh [backup_directory]
#
# Creates a compressed backup of the PostGIS database

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-gisdb}"
POSTGRES_USER="${POSTGRES_USER:-gisuser}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

# Backup directory
BACKUP_DIR="${1:-./backups}"
mkdir -p "$BACKUP_DIR"

# Backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/${POSTGRES_DB}_backup_${TIMESTAMP}.sql.gz"

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Database Backup Script${NC}"
echo -e "${GREEN}==================================${NC}"
echo -e "${YELLOW}Database: $POSTGRES_DB${NC}"
echo -e "${YELLOW}Backup file: $BACKUP_FILE${NC}"
echo ""

# Perform backup
echo -e "${YELLOW}Creating backup...${NC}"

if PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
    -h $POSTGRES_HOST \
    -p $POSTGRES_PORT \
    -U $POSTGRES_USER \
    -d $POSTGRES_DB \
    --format=plain \
    --no-owner \
    --no-acl \
    --verbose \
    2>&1 | gzip > "$BACKUP_FILE"; then
    
    # Get file size
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    
    echo -e "${GREEN}✓ Backup completed successfully${NC}"
    echo -e "${GREEN}Size: $SIZE${NC}"
else
    echo -e "${RED}✗ Backup failed${NC}"
    exit 1
fi

# Cleanup old backups (keep last 7 days)
echo ""
echo -e "${YELLOW}Cleaning up old backups (keeping last 7 days)...${NC}"
find "$BACKUP_DIR" -name "${POSTGRES_DB}_backup_*.sql.gz" -type f -mtime +7 -delete

REMAINING=$(find "$BACKUP_DIR" -name "${POSTGRES_DB}_backup_*.sql.gz" | wc -l)
echo -e "${GREEN}Remaining backups: $REMAINING${NC}"

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Backup completed${NC}"
echo -e "${GREEN}==================================${NC}"

exit 0
