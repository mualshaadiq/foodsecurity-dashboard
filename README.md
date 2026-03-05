# Food Security Dashboard

An interactive GIS platform for monitoring Indonesia's food security through spatial analysis of national paddy field data (LBS/LSD) and Sentinel-2 satellite imagery. Built as a full-stack containerised application serving large vector datasets (~50 GB shapefiles) alongside on-demand raster analysis.

## Architecture

```
Browser
  └─► Nginx (HTTPS reverse proxy + static frontend)
        ├─► FastAPI        (REST API, JWT auth, analysis pipeline)
        ├─► Tegola         (PostGIS → MVT vector tiles)
        └─► TiTiler        (MinIO COGs → XYZ raster tiles)

FastAPI ──► PostgreSQL/PostGIS   (spatial features, AoIs, analysis results)
FastAPI ──► MinIO                (Sentinel-2 band COGs, NDVI/NDWI GeoTIFFs)
```

### Services (docker-compose)

| Service | Image | Role |
|---|---|---|
| `postgis` | `postgis/postgis:15-3.3` | Spatial database — stores features, AoIs, analysis results |
| `fastapi` | custom Python 3.11 | REST API server (port 8000 internal) |
| `minio` | `minio/minio` | S3-compatible object store for satellite band COGs |
| `tegola` | `gospatial/tegola:v0.18.0` | Vector tile server (port 8080 internal) |
| `titiler` | `ghcr.io/developmentseed/titiler` | COG raster tile server (port 80 internal) |
| `nginx` | `nginx:alpine` | TLS termination, reverse proxy, serves built frontend |

## Nginx routing

| Path prefix | Proxied to | Notes |
|---|---|---|
| `/api/` | `fastapi:8000` | REST API, rate-limited 10 req/s |
| `/tiles/` | `tegola:8080` (remapped → `/maps/`) | MVT vector tiles, cached 24 h |
| `/titiler/` | `titiler:80` | COG raster tiles, cached 1 h |
| `/` | static files in `/usr/share/nginx/html` | Built Vite frontend |

## Backend API

FastAPI app (`backend/app/main.py`) with six router modules:

| Prefix | Module | Purpose |
|---|---|---|
| `/api/auth` | `auth.py` | JWT login/register, current user |
| `/api/features` | `features.py` | Generic spatial features CRUD, bbox/category filtering, stats |
| `/api/export` | `export_routes.py` | Download features as GeoJSON, Shapefile (zip), or CSV |
| `/api/food-security` | `food_security.py` | AoI management; food security summary data |
| `/api/archive` | `archive_routes.py` | Sentinel-2 scene archiving: STAC search → MinIO band download |
| `/api/analysis` | `analysis_routes.py` | NDVI / NDWI computation on archived scenes; COG upload → TiTiler URL |

On startup the backend automatically re-queues any archive downloads that were interrupted by a container restart.

### Archive workflow

1. Frontend searches NASA CMR STAC for Sentinel-2 L2A granules covering a selected AoI.
2. User archives a scene → API stores it in `spatial_features` (`category = 'archived_scene'`) and launches a background task.
3. Background task streams all analytical bands (B02–B12, SCL, visual) from Element84/AWS to MinIO, updating `cog_status` and `bytes_downloaded` after every band so the frontend can show real download progress.

### NDVI/NDWI analysis workflow

1. Load B04 (red) + B08 (NIR) MinIO keys for the chosen scene.
2. Download both bands via `rasterio`/vsicurl from MinIO.
3. Compute pixel-wise NDVI = (B08 − B04) / (B08 + B04) → Float32 raster.
4. Write a tiled, overview-enabled COG to `/tmp`, then copy it to MinIO with `copy_src_overviews=True` for efficient range requests.
5. Store `ndvi_tif_key` + `ndvi_processed_at` in `sentinel_analysis_results`.
6. Return a TiTiler `/titiler/cog/tiles/…` URL with `rdylgn` colormap so the frontend can display the NDVI overlay immediately. NDWI follows the same path using `blues` colormap.

## Database schema

### `spatial_features` (multi-purpose table)

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PK` | |
| `name` | `VARCHAR(254)` | |
| `category` | `VARCHAR(100)` | `aoi`, `archived_scene`, `farm_boundary`, `crop_classification`, etc. |
| `geom_type` | `VARCHAR(20)` | Auto-updated by trigger |
| `geom` | `GEOMETRY(4326)` | GIST-indexed |
| `properties` | `JSONB` | All per-category metadata (e.g. `cog_status`, `minio_band_keys`, `stac_id`) |
| `created_at` | `TIMESTAMP` | |
| `updated_by` | `INTEGER → users(id)` | |

### `sentinel_analysis_results`

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PK` | |
| `scene_id` | `INTEGER → spatial_features(id)` | |
| `aoi_id` | `INTEGER` | |
| `province_code` | `VARCHAR(20)` | |
| `ndvi_mean` | `FLOAT` | |
| `estimated_area_ha` | `FLOAT` | |
| `predicted_yield_ton` | `FLOAT` | |
| `cloud_cover` | `FLOAT` | |
| `analyzed_at` | `TIMESTAMPTZ` | |
| `band_metadata` | `JSONB` | |
| `ndvi_tif_key` | `TEXT` | MinIO object key for NDVI COG |
| `ndvi_processed_at` | `TIMESTAMPTZ` | |
| `ndwi_tif_key` | `TEXT` | MinIO object key for NDWI COG |
| `ndwi_processed_at` | `TIMESTAMPTZ` | |

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PK` | |
| `email` | `VARCHAR UNIQUE` | |
| `username` | `VARCHAR UNIQUE` | |
| `hashed_password` | `VARCHAR` | Argon2 |
| `full_name` | `VARCHAR` | |
| `role` | `VARCHAR(20)` | `admin` / `user` / `viewer` |
| `is_active` | `BOOLEAN` | |
| `created_at` | `TIMESTAMP` | |

## Vector tile maps (Tegola)

Two Tegola maps defined in `tegola/config.toml`:

**`gis_map`** — general spatial features from `spatial_features`:
- `points` — `ST_Point` / `ST_MultiPoint`
- `lines` — `ST_LineString` / `ST_MultiLineString` (zoom-adaptive simplification)
- `polygons` — all polygons except food-security and analysis categories
- `ai_boundaries` — `farm_boundary`, `crop_classification`
- `crop_health`, `disaster_risk`, `yield_zones` — dedicated analysis layers

**`food_monitoring`** — national paddy field data:
- `lbs_50k_nasional_subdiv` — Lahan Baku Sawah (baseline paddy fields, ~1.2 M subdivided rows)
- `lsd_50k_dilindungi_subdiv` — Lahan Sawah Dilindungi (protected paddy land, ~1.45 M rows)

Both food-monitoring tables are pre-subdivided with `ST_Subdivide(geom, 128)` for optimal Tegola GIST query performance. Min/max zoom filtering uses `luas_polyg` / `luas_ha` area thresholds.

Tile bounds are constrained to Indonesia: `[95°E, 11°S, 141°E, 6°N]`.

## Frontend

Vanilla JS application bundled with **Vite** (`frontend/`), using **MapLibre GL JS** for the map and **MapboxGL Draw** for AoI polygon drawing.

### Map sources

| Source id | Type | URL |
|---|---|---|
| `basemap` | raster | Configurable (OpenStreetMap default), centred on Indonesia `[118, -2.5]` zoom 5 |
| `gis-tiles` | vector (MVT) | `/tiles/gis_map/{z}/{x}/{y}.pbf` |
| `food-monitoring-tiles` | vector (MVT) | `/tiles/food_monitoring/{z}/{x}/{y}.pbf` |
| NDVI/NDWI | raster (COG) | `/titiler/cog/tiles/…` dynamic per analysis result |
| Sentinel-2 mosaic | raster (WMTS) | EOX cloudless mosaic |

### Sidebar tabs

| Tab | Purpose |
|---|---|
| Asset Management | Upload / manage generic spatial features |
| Monitoring Settings | Create and configure AoIs (drawn polygons) |
| Summary | Aggregated food-security statistics |
| Imagery | Sentinel-2 cloudless mosaic year/opacity; STAC scene search & archiving; archived scene preview with download progress |
| Crop Health | NDVI layer toggle; run NDVI/NDWI analysis on archived scene; fertilizer zone toggle |
| AI Analysis | AI-generated farm boundary and crop classification layers |
| Disaster Risk | Flood and drought zone layers |
| Yield Prediction | Yield zone and prediction layers |

A global **time slider** drives all date-aware tabs — switching dates updates the map imagery, NDVI overlay, and scene preview simultaneously.

## Data pipeline

Source data is downloaded from BIG (Badan Informasi Geospasial) ArcGIS MapServer and imported into PostGIS:

```
download_arcgis_layers.py   # Fetch LBS (layer 36) + LSD (layer 59) → shapefiles
       ↓
import_lbs_postgis.py       # fiona + psycopg2 → lbs_50k_nasional
import_lsd_postgis.py       # fiona + psycopg2 → lsd_50k_dilindungi
post_import_lsd.py          # Add id PK + luas_ha generated column + indexes
       ↓
build_lbs_subdiv.py         # ST_Subdivide(128) → lbs_subdiv  (UNLOGGED for speed)
build_lsd_subdiv.py         # ST_Subdivide(128) → lsd_50k_dilindungi_subdiv
```

Alternatively `import_shapefiles.sh` uses `ogr2ogr` for generic shapefile import into `spatial_features`.

## Quick start

### Prerequisites

- Docker Desktop, 16 GB RAM recommended
- Windows: WSL2 or Git Bash for shell scripts

### Local development

```bash
git clone <repository-url>
cd opengridindo

cp .env.example .env
# Edit .env — set JWT_SECRET, passwords, ADMIN_* credentials

# Generate self-signed SSL cert for local HTTPS
bash scripts/generate_ssl.sh

# Start all services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Tail logs
docker-compose logs -f fastapi
```

Access:
- Frontend: `https://localhost` (accept self-signed cert warning)
- API docs: `https://localhost/api/docs`
- MinIO console: `http://localhost:9001`

Admin user is created automatically on first startup from `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`.

### Production deployment

```bash
# Set ENVIRONMENT=production and real secrets in .env
# Mount real Let's Encrypt certs in nginx service (docker-compose.prod.yml)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Automated DB backup (crontab)
0 2 * * * /opt/gis-app/scripts/backup_db.sh

# Automated SSL renewal
0 3 * * * certbot renew --quiet && docker-compose restart nginx
```

## Project structure

```
opengridindo/
├── backend/
│   ├── app/
│   │   ├── main.py                   # FastAPI app, lifespan, router registration
│   │   ├── api/
│   │   │   ├── auth.py               # /api/auth/*
│   │   │   ├── features.py           # /api/features/*
│   │   │   ├── export_routes.py      # /api/export/*
│   │   │   ├── food_security.py      # /api/food-security/* (AoIs, summaries)
│   │   │   ├── archive_routes.py     # /api/archive/* (scene archiving → MinIO)
│   │   │   └── analysis_routes.py   # /api/analysis/* (NDVI/NDWI pipeline)
│   │   ├── auth/                     # JWT helpers, Argon2 password hashing
│   │   ├── core/
│   │   │   ├── config.py             # Settings (pydantic-settings)
│   │   │   └── storage.py            # MinIO client helpers
│   │   └── db/                       # asyncpg connection pool, admin user init
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.js                   # Bootstrap — map init, tab wiring
│   │   ├── api/                      # fetch wrappers (cmr, export, features, food-security, scene-archive)
│   │   ├── auth/                     # Auth manager, login modal
│   │   ├── components/               # Shared UI (layer panel, search, time slider, notifications, stats)
│   │   ├── map/
│   │   │   ├── map-init.js           # MapLibre GL map factory
│   │   │   ├── basemap.js            # Basemap catalogue
│   │   │   ├── draw-control.js       # MapboxGL Draw (AoI drawing)
│   │   │   ├── interactions.js       # Click popups, hover cursor
│   │   │   └── layers/               # One file per layer type (base, asset, AI, NDVI, NDWI, archived scenes, …)
│   │   └── tabs/                     # One file per sidebar tab
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── nginx/
│   ├── nginx.conf                    # Main config (dev)
│   └── nginx.prod.conf               # Production overrides
├── tegola/
│   └── config.toml                   # PostGIS provider + gis_map / food_monitoring maps
├── scripts/
│   ├── init_db.sql                   # PostGIS extensions, tables, indexes (mounted at DB init)
│   ├── create_users.sql              # Role setup (mounted at DB init)
│   ├── migrate_add_analysis_table.sql
│   ├── migrate_add_ndvi_tif.sql
│   ├── migrate_add_ndwi_tif.sql
│   ├── download_arcgis_layers.py     # Fetch LBS/LSD shapefiles from BIG ArcGIS MapServer
│   ├── download_lsd.py               # Alternative LSD downloader
│   ├── import_lbs_postgis.py         # Import LBS shapefiles → PostGIS
│   ├── import_lsd_postgis.py         # Import LSD shapefiles → PostGIS
│   ├── post_import_lsd.py            # Add PK + luas_ha + indexes to LSD table
│   ├── import_shapefiles.sh          # Generic ogr2ogr import → spatial_features
│   ├── build_lbs_subdiv.py           # Build ST_Subdivide table for LBS
│   ├── build_lsd_subdiv.py           # Build ST_Subdivide table for LSD
│   ├── build_subdiv.sql              # SQL version of subdiv build
│   ├── backup_db.sh                  # pg_dump automated backup
│   ├── restore_db.sh                 # pg_restore helper
│   └── generate_ssl.sh               # Self-signed cert generation
├── data/                             # Shapefiles (gitignored)
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.prod.yml
└── .env.example
```

## Environment variables

See `.env.example`. Key variables:

| Variable | Description |
|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | PostGIS credentials |
| `DATABASE_URL` | asyncpg DSN (`postgresql+asyncpg://…`) |
| `JWT_SECRET` | Random hex-32 string for JWT signing |
| `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Auto-created admin user |
| `MINIO_ENDPOINT` | MinIO host:port (default `minio:9000`) |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO credentials |
| `MINIO_BUCKET` | Bucket name for satellite data (default `satellite-data`) |
| `MINIO_PUBLIC_URL` | Browser-accessible MinIO URL for presigned asset links |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `ENVIRONMENT` | `development` or `production` |
