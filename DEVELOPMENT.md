# Development Guide

Guide for developers working on the GIS Web Application.

## Development Environment Setup

### Prerequisites
- Docker Desktop
- Git
- VS Code (recommended)
- Python 3.11+ (for local development)
- Node.js (optional, for frontend tooling)

### VS Code Extensions (Recommended)
- Python
- Docker
- GitLens
- Prettier
- ESLint
- SQLTools PostgreSQL

## Project Structure

```
opengridindo/
├── backend/              # FastAPI Python application
│   ├── app/
│   │   ├── api/         # API route handlers
│   │   ├── auth/        # Authentication logic
│   │   ├── core/        # Core configuration
│   │   ├── db/          # Database connections
│   │   └── models/      # Pydantic models
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/            # MapLibre GL JS application
│   ├── index.html
│   ├── app.js          # Main application logic
│   ├── auth.js         # Authentication management
│   └── styles.css
├── nginx/              # Nginx reverse proxy
│   ├── nginx.conf
│   └── ssl/
├── tegola/             # Tegola tile server
│   └── config.toml
├── scripts/            # Utility scripts
└── docker-compose.yml  # Service orchestration
```

## Local Development Workflow

### 1. Start Services in Development Mode

```bash
# Start all services
docker-compose up -d

# Watch logs
docker-compose logs -f fastapi
```

### 2. Backend Development

The FastAPI service is configured with `--reload` flag for hot reloading.

```bash
# Make changes to backend/app/*.py
# Changes will automatically reload

# View backend logs
docker-compose logs -f fastapi

# Access API docs
# https://localhost/api/docs
```

#### Running Tests

```bash
# Enter backend container
docker-compose exec fastapi bash

# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest tests/ -v
```

#### Adding New API Endpoints

1. Create/edit file in `backend/app/api/`
2. Add router to `backend/app/main.py`
3. Define Pydantic models in `backend/app/models/`
4. Test at https://localhost/api/docs

### 3. Frontend Development

Frontend files are volume-mounted, so changes reflect immediately.

```bash
# Edit frontend/app.js, index.html, or styles.css
# Refresh browser to see changes (Ctrl+F5 for hard refresh)
```

#### Browser Developer Tools

- Open DevTools (F12)
- **Console**: View logs and errors
- **Network**: Inspect API calls and tile requests
- **Application**: View localStorage (auth tokens)

### 4. Database Development

#### Access Database

```bash
# Via psql
docker-compose exec postgis psql -U gisuser -d gisdb

# Common queries
SELECT COUNT(*) FROM spatial_features;
SELECT DISTINCT geom_type FROM spatial_features;
SELECT ST_Extent(geom) FROM spatial_features;
```

#### Database Migrations

For schema changes:

1. Edit `scripts/init_db.sql`
2. Recreate database:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

#### Working with PostGIS

```sql
-- Create spatial index
CREATE INDEX idx_name ON table_name USING GIST(geom);

-- Transform coordinates
SELECT ST_Transform(geom, 4326) FROM table_name;

-- Calculate area
SELECT ST_Area(geom::geography) FROM table_name;

-- Find intersections
SELECT * FROM table_name 
WHERE ST_Intersects(geom, ST_MakeEnvelope(-180, -90, 180, 90, 4326));
```

### 5. Tile Server Development

#### Edit Tegola Configuration

```bash
# Edit tegola/config.toml
nano tegola/config.toml

# Restart Tegola
docker-compose restart tegola

# View Tegola logs
docker-compose logs -f tegola
```

#### Test Tile Endpoints

```bash
# Direct tile access
curl -I https://localhost/tiles/gis_map/0/0/0.pbf

# View tile in browser
# Open: https://localhost/tiles/gis_map/0/0/0.pbf
```

### 6. Nginx Configuration

```bash
# Edit nginx/nginx.conf
nano nginx/nginx.conf

# Test configuration
docker-compose exec nginx nginx -t

# Reload without downtime
docker-compose exec nginx nginx -s reload

# Or restart
docker-compose restart nginx
```

## Code Style Guidelines

### Python (Backend)

- Follow PEP 8
- Use type hints
- Use async/await for I/O operations
- Document functions with docstrings

```python
async def get_features(
    bbox: Optional[str] = None,
    limit: int = 100
) -> FeatureCollection:
    """
    Get features with optional bounding box filter.
    
    Args:
        bbox: Bounding box as minx,miny,maxx,maxy
        limit: Maximum features to return
        
    Returns:
        GeoJSON FeatureCollection
    """
    # Implementation
```

### JavaScript (Frontend)

- Use ES6+ features
- Follow Airbnb style guide
- Use async/await over promises
- Comment complex logic

```javascript
/**
 * Load features from API
 * @param {string} bbox - Bounding box filter
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
async function loadFeatures(bbox) {
    // Implementation
}
```

### SQL

- Use uppercase for keywords
- Indent subqueries
- Use meaningful aliases

```sql
SELECT 
    sf.id,
    sf.name,
    ST_AsGeoJSON(sf.geom) AS geometry
FROM spatial_features sf
WHERE sf.geom && ST_MakeEnvelope(-180, -90, 180, 90, 4326)
ORDER BY sf.id
LIMIT 100;
```

## Debugging

### Backend Debugging

```python
# Add to code
import logging
logger = logging.getLogger(__name__)

# Use logger
logger.info(f"Processing {len(features)} features")
logger.error(f"Failed to fetch data: {error}")

# View logs
docker-compose logs -f fastapi
```

### Frontend Debugging

```javascript
// Console logging
console.log('Features loaded:', features);
console.error('Failed to load:', error);

// Breakpoints in DevTools
debugger; // Browser will pause here
```

### Database Debugging

```sql
-- Enable query logging (in PostgreSQL config)
ALTER SYSTEM SET log_statement = 'all';
SELECT pg_reload_conf();

-- View slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Explain query plan
EXPLAIN ANALYZE
SELECT * FROM spatial_features WHERE geom && ST_MakeEnvelope(...);
```

## Common Tasks

### Add a New API Endpoint

1. **Create route handler**:
   ```python
   # backend/app/api/my_feature.py
   from fastapi import APIRouter
   
   router = APIRouter()
   
   @router.get("/")
   async def my_endpoint():
       return {"message": "Hello"}
   ```

2. **Register router**:
   ```python
   # backend/app/main.py
   from app.api import my_feature
   
   app.include_router(my_feature.router, prefix="/api/my-feature", tags=["My Feature"])
   ```

3. **Test**: Visit https://localhost/api/docs

### Add a New Map Layer

1. **Update Tegola config**:
   ```toml
   # tegola/config.toml
   [[providers.layers]]
   name = "my_layer"
   sql = "SELECT id, geom FROM my_table WHERE geom && !BBOX!"
   ```

2. **Add to MapLibre**:
   ```javascript
   // frontend/app.js
   map.addLayer({
       id: 'my-layer',
       type: 'fill',
       source: 'gis-tiles',
       'source-layer': 'my_layer',
       paint: {
           'fill-color': '#ff0000'
       }
   });
   ```

### Add Authentication to Endpoint

```python
from app.auth.dependencies import require_authenticated

@router.get("/protected")
async def protected_endpoint(current_user: User = Depends(require_authenticated)):
    return {"user": current_user.username}
```

## Testing

### Backend Tests

```bash
# Structure
backend/tests/
├── __init__.py
├── test_auth.py
├── test_features.py
└── test_export.py

# Run tests
docker-compose exec fastapi pytest tests/ -v

# Run with coverage
docker-compose exec fastapi pytest tests/ --cov=app
```

### Frontend Tests

```bash
# Install testing tools
npm install --save-dev jest @testing-library/dom

# Create tests
frontend/tests/
├── auth.test.js
└── map.test.js

# Run tests
npm test
```

## Performance Profiling

### Backend Profiling

```python
import time

start = time.time()
# Your code
elapsed = time.time() - start
logger.info(f"Operation took {elapsed:.2f} seconds")
```

### Database Profiling

```sql
-- Enable timing
\timing

-- Profile query
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM spatial_features WHERE geom && ST_MakeEnvelope(...);
```

### Frontend Profiling

- Use Chrome DevTools Performance tab
- Record interaction
- Analyze frame rate and memory

## Git Workflow

### Branch Strategy

```
main              # Production-ready code
├── develop       # Development branch
    ├── feature/* # Feature branches
    ├── bugfix/*  # Bug fix branches
    └── hotfix/*  # Urgent fixes
```

### Commit Messages

```
feat: Add user search functionality
fix: Resolve tile loading timeout
docs: Update deployment guide
refactor: Optimize database queries
test: Add unit tests for auth
```

## Helpful Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [MapLibre GL JS Docs](https://maplibre.org/maplibre-gl-js-docs/)
- [PostGIS Manual](https://postgis.net/documentation/)
- [Tegola Documentation](https://tegola.io/documentation/)
- [Docker Compose Reference](https://docs.docker.com/compose/)

## Getting Help

1. Check logs: `docker-compose logs -f [service]`
2. Review API docs: https://localhost/api/docs
3. Test database: `docker-compose exec postgis psql -U gisuser -d gisdb`
4. Inspect containers: `docker-compose ps`

---

Happy coding! 🚀
