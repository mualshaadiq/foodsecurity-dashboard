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

## ✨ Features

- 🗺️ Interactive vector map with pan/zoom/click interactions
- 🔐 User authentication with JWT tokens and role-based access control
- 🔍 Spatial queries with bounding box filtering and pagination
- 📊 Data aggregation and statistics
- 📤 Export data in multiple formats (GeoJSON, Shapefile, CSV)
- ⚡ Optimized for large datasets with spatial indexing
- 🎨 Support for mixed geometry types (points, lines, polygons)
- 📱 Responsive design for desktop and mobile

## 🚀 Quick Start

### Prerequisites

- **Local Development**: Docker Desktop, 16GB RAM recommended
- **Production**: VPS with Ubuntu 22.04, 4GB RAM, 2 CPU cores, 100GB storage

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd opengridindo
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```

3. **Generate JWT secret**
   ```bash
   # On Linux/Mac/WSL
   openssl rand -hex 32
   
   # On Windows PowerShell
   -join ((48..57) + (97..102) | Get-Random -Count 32 | % {[char]$_})
   ```
   
   Update `JWT_SECRET` in `.env` with the generated value.

4. **Generate self-signed SSL certificates** (for local development)
   ```bash
   # Run the SSL generation script
   bash scripts/generate_ssl.sh
   
   # Or manually with OpenSSL
   cd nginx/ssl
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout nginx.key -out nginx.crt \
     -subj "/C=US/ST=State/L=City/O=Org/CN=localhost"
   ```

5. **Start all services**
   ```bash
   docker-compose up -d
   ```

6. **Check service status**
   ```bash
   docker-compose ps
   ```

7. **Import your shapefiles** (optional)
   ```bash
   # Place shapefiles in ./data/ directory
   # Then run import script
   docker-compose exec postgis bash /docker-entrypoint-initdb.d/import_shapefiles.sh
   ```

8. **Create admin user**
   
   Admin user is automatically created on first startup using credentials from `.env`:
   - Email: `ADMIN_EMAIL`
   - Username: `ADMIN_USERNAME`
   - Password: `ADMIN_PASSWORD`

9. **Access the application**
   - Frontend: https://localhost (accept self-signed certificate warning)
   - API Documentation: https://localhost/api/docs
   - Direct API: https://localhost/api/
   - Tiles: https://localhost/tiles/

### Import Shapefiles

```bash
# Place your shapefiles in the ./data directory
mkdir -p data/shapefiles
# Copy your .shp, .shx, .dbf, .prj files

# Run the import script
docker-compose exec -T postgis bash << 'EOF'
for shapefile in /data/shapefiles/*.shp; do
  ogr2ogr -f "PostgreSQL" \
    PG:"host=localhost dbname=${POSTGRES_DB} user=${POSTGRES_USER} password=${POSTGRES_PASSWORD}" \
    "$shapefile" \
    -nln spatial_features \
    -append \
    -lco GEOMETRY_NAME=geom \
    -lco SPATIAL_INDEX=GIST \
    -gt 65536 \
    --config PG_USE_COPY YES \
    -t_srs EPSG:4326 \
    -skipfailures \
    -progress
done

# Update geometry types
psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "UPDATE spatial_features SET geom_type = ST_GeometryType(geom) WHERE geom_type IS NULL;"
psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "VACUUM ANALYZE spatial_features;"
EOF
```

## 🏭 Production Deployment

### VPS Requirements

**Recommended Hostinger Plans**:
- **VPS Cloud 2**: 2 vCPU, 4GB RAM, 100GB NVMe (minimum)
- **Business VPS 2**: 4 vCPU, 8GB RAM, 200GB NVMe (recommended for 50GB+ datasets)

### Deployment Steps

1. **Provision VPS with Ubuntu 22.04**

2. **Install Docker**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. **Install Docker Compose**
   ```bash
   sudo apt update
   sudo apt install docker-compose-plugin -y
   ```

4. **Configure firewall**
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

5. **Clone repository**
   ```bash
   cd /opt
   sudo git clone <repository-url> gis-app
   sudo chown -R $USER:$USER gis-app
   cd gis-app
   ```

6. **Configure environment**
   ```bash
   cp .env.example .env
   nano .env
   # Update all passwords and secrets
   # Set CORS_ORIGINS to your domain
   # Change ENVIRONMENT=production
   ```

7. **Set up SSL with Let's Encrypt**
   ```bash
   sudo apt install certbot -y
   sudo certbot certonly --standalone -d yourdomain.com
   
   # Update nginx/nginx.conf to point to certificates:
   # ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
   # ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
   ```

8. **Update docker-compose.yml for production**
   
   Add Let's Encrypt volume to nginx service:
   ```yaml
   nginx:
     volumes:
       - /etc/letsencrypt:/etc/letsencrypt:ro
   ```

9. **Start services**
   ```bash
   docker-compose up -d --build
   ```

10. **Set up automatic SSL renewal**
    ```bash
    sudo crontab -e
    # Add this line:
    0 3 * * * certbot renew --quiet && docker-compose -f /opt/gis-app/docker-compose.yml restart nginx
    ```

11. **Set up database backups**
    ```bash
    sudo crontab -e
    # Add this line:
    0 2 * * * /opt/gis-app/scripts/backup_db.sh
    ```

## 📊 Database Schema

### spatial_features table

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Unique feature identifier |
| name | VARCHAR(254) | Feature name |
| category | VARCHAR(100) | Feature category/type |
| geom_type | VARCHAR(20) | Geometry type (ST_Point, ST_LineString, ST_Polygon) |
| geom | GEOMETRY | Spatial geometry (EPSG:4326) |
| properties | JSONB | Additional feature attributes |
| created_at | TIMESTAMP | Creation timestamp |
| updated_by | INTEGER | User ID who last modified |

### users table

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | User ID |
| email | VARCHAR UNIQUE | User email |
| username | VARCHAR UNIQUE | Username |
| hashed_password | VARCHAR | Hashed password (Argon2) |
| full_name | VARCHAR | Full name |
| role | VARCHAR(20) | User role (admin/user/viewer) |
| is_active | BOOLEAN | Account active status |
| created_at | TIMESTAMP | Registration timestamp |

## 🔌 API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info

### Features

- `GET /api/features` - List features with pagination & filtering
  - Query params: `bbox`, `category`, `geom_type`, `limit`, `offset`
- `GET /api/features/{id}` - Get single feature
- `GET /api/features/search?q=query` - Search features
- `GET /api/features/stats` - Get aggregated statistics

### Exports

- `GET /api/export/geojson` - Export as GeoJSON
- `GET /api/export/shapefile` - Export as zipped Shapefile
- `GET /api/export/csv` - Export as CSV with coordinates

### Tiles

- `GET /tiles/gis_map/{z}/{x}/{y}.pbf` - Vector tiles (served by Tegola)

## 🛠️ Development

### Project Structure

```
opengridindo/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── api/            # API route handlers
│   │   ├── auth/           # Authentication logic
│   │   ├── core/           # Configuration
│   │   ├── db/             # Database connections
│   │   └── models/         # Pydantic models
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/               # MapLibre GL JS frontend
│   ├── index.html
│   ├── app.js
│   ├── auth.js
│   └── styles.css
├── nginx/                  # Nginx configuration
│   ├── nginx.conf
│   └── ssl/
├── tegola/                 # Tegola tile server config
│   └── config.toml
├── scripts/                # Utility scripts
│   ├── init_db.sql
│   ├── create_users.sql
│   ├── import_shapefiles.sh
│   ├── backup_db.sh
│   └── generate_ssl.sh
├── data/                   # Data directory (gitignored)
├── docker-compose.yml
├── .env.example
└── README.md
```

### Running Tests

```bash
# Install dev dependencies
cd backend
pip install pytest pytest-asyncio httpx

# Run tests
pytest tests/ -v
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f fastapi
docker-compose logs -f postgis
docker-compose logs -f tegola
docker-compose logs -f nginx
```

### Database Access

```bash
# Connect to PostgreSQL
docker-compose exec postgis psql -U gisuser -d gisdb

# Example queries
SELECT COUNT(*), geom_type FROM spatial_features GROUP BY geom_type;
SELECT ST_Extent(geom) FROM spatial_features;
```

## 🎯 Performance Optimization

### Database Tuning

Adjust PostgreSQL settings in `scripts/init_db.sql`:

```sql
ALTER SYSTEM SET shared_buffers = '1GB';
ALTER SYSTEM SET work_mem = '50MB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET effective_cache_size = '3GB';
ALTER SYSTEM SET random_page_cost = 1.1;
```

### Connection Pooling

Configured in FastAPI with asyncpg:
- Pool size: 20 connections
- Max overflow: 10

### Spatial Indexing

All geometry columns automatically indexed with GIST:
```sql
CREATE INDEX idx_spatial_features_geom ON spatial_features USING GIST(geom);
```

### Tile Caching

Tegola caches frequently accessed tiles to disk:
- Cache location: `/tmp/tegola-cache`
- Cache type: File-based
- Invalidation: Manual or via API

## 🔒 Security

- JWT tokens with Argon2 password hashing
- HTTPS with SSL/TLS
- CORS configuration for trusted origins
- Rate limiting in Nginx
- SQL injection prevention via parameterized queries
- XSS protection headers
- Role-based access control