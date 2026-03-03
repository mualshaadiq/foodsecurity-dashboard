#!/bin/bash
# Import LBS and LSD shapefiles using ogr2ogr inside gis_fastapi container
set -e

PG="PG:host=postgis port=5432 dbname=gisdb user=gisuser password=gispassword123"
FM="/data/shapefiles/Food Monitoring"

echo "=== LBS Part 1 (create/overwrite) ==="
ogr2ogr -f PostgreSQL "$PG" "$FM/LBS_50K_Nasional_part1.shp" \
  -nln lbs_50k_nasional -nlt MULTIPOLYGON -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -lco FID=id -overwrite -progress

echo "=== LBS Part 2 ==="
ogr2ogr -f PostgreSQL "$PG" "$FM/LBS_50K_Nasional_part2.shp" \
  -nln lbs_50k_nasional -nlt MULTIPOLYGON -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -append -progress

echo "=== LBS Part 3 ==="
ogr2ogr -f PostgreSQL "$PG" "$FM/LBS_50K_Nasional_part3.shp" \
  -nln lbs_50k_nasional -nlt MULTIPOLYGON -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -append -progress

echo "=== LBS Part 4 ==="
ogr2ogr -f PostgreSQL "$PG" "$FM/LBS_50K_Nasional_part4.shp" \
  -nln lbs_50k_nasional -nlt MULTIPOLYGON -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -append -progress

echo "=== LSD Part 1 (create/overwrite) ==="
ogr2ogr -f PostgreSQL "$PG" "$FM/LSD_50K_Dilindungi_part1.shp" \
  -nln lsd_50k_dilindungi -nlt MULTIPOLYGON -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -lco FID=id -overwrite -progress

echo "=== LSD Part 2 ==="
ogr2ogr -f PostgreSQL "$PG" "$FM/LSD_50K_Dilindungi_part2.shp" \
  -nln lsd_50k_dilindungi -nlt MULTIPOLYGON -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -append -progress

echo "=== LSD Part 3 ==="
ogr2ogr -f PostgreSQL "$PG" "$FM/LSD_50K_Dilindungi_part3.shp" \
  -nln lsd_50k_dilindungi -nlt MULTIPOLYGON -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -append -progress

echo "=== LSD Part 4 ==="
ogr2ogr -f PostgreSQL "$PG" "$FM/LSD_50K_Dilindungi_part4.shp" \
  -nln lsd_50k_dilindungi -nlt MULTIPOLYGON -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -append -progress

echo ""
echo "=== IMPORT COMPLETE ==="
