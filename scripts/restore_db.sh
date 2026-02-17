#!/bin/bash

# Restore PostGIS Database from Backup
# Usage: ./restore_db.sh <backup_file>
#
# Restores the PostGIS database from a compressed backup file

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-gisdb}"
POSTGRES_USER="${POSTGRES_USER:-gisuser}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Backup file not specified${NC}"
    echo "Usage: $0 <backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file $BACKUP_FILE does not exist${NC}"
    exit 1
fi

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Database Restore Script${NC}"
echo -e "${GREEN}==================================${NC}"
echo -e "${YELLOW}Database: $POSTGRES_DB${NC}"
echo -e "${YELLOW}Backup file: $BACKUP_FILE${NC}"
echo ""

echo -e "${RED}WARNING: This will drop and recreate the database!${NC}"
read -p "Are you sure you want to continue? (yes/N): " -r
if [[ ! $REPLY == "yes" ]]; then
    echo -e "${YELLOW}Restore cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Restoring database...${NC}"

# Drop and recreate database
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d postgres << EOF
DROP DATABASE IF EXISTS $POSTGRES_DB;
CREATE DATABASE $POSTGRES_DB;
EOF

# Restore from backup
gunzip -c "$BACKUP_FILE" | PGPASSWORD=$POSTGRES_PASSWORD psql \
    -h $POSTGRES_HOST \
    -p $POSTGRES_PORT \
    -U $POSTGRES_USER \
    -d $POSTGRES_DB

echo ""
echo -e "${GREEN}✓ Database restored successfully${NC}"
echo -e "${GREEN}==================================${NC}"

exit 0
