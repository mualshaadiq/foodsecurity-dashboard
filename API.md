# API Reference

Complete API documentation for the GIS Web Application REST API.

**Base URL**: `https://your-domain.com/api`

**Authentication**: Bearer token (JWT) in Authorization header

---

## Authentication Endpoints

### POST /api/auth/login

Authenticate user and receive JWT token.

**Request Body** (form-urlencoded):
```
username: string (required)
password: string (required)
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Example**:
```bash
curl -X POST https://localhost/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=yourpassword"
```

---

### POST /api/auth/register

Register new user (admin only).

**Headers**:
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "user@example.com",
  "username": "newuser",
  "password": "securepassword",
  "full_name": "John Doe",
  "role": "user"
}
```

**Response** (201 Created):
```json
{
  "id": 2,
  "email": "user@example.com",
  "username": "newuser",
  "full_name": "John Doe",
  "role": "user",
  "is_active": true,
  "created_at": "2026-02-17T12:00:00"
}
```

---

### GET /api/auth/me

Get current user information.

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "id": 1,
  "email": "admin@example.com",
  "username": "admin",
  "full_name": "Administrator",
  "role": "admin",
  "is_active": true,
  "created_at": "2026-02-17T10:00:00"
}
```

---

## Feature Endpoints

### GET /api/features

List features with filtering and pagination.

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `bbox` (optional): Bounding box filter as `minx,miny,maxx,maxy`
- `category` (optional): Filter by category
- `geom_type` (optional): Filter by geometry type (ST_Point, ST_LineString, ST_Polygon)
- `limit` (optional, default: 100): Maximum features to return (1-1000)
- `offset` (optional, default: 0): Pagination offset

**Response** (200 OK):
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": 1,
      "geometry": {
        "type": "Point",
        "coordinates": [106.8456, -6.2088]
      },
      "properties": {
        "name": "Jakarta",
        "category": "city",
        "geom_type": "ST_Point",
        "created_at": "2026-02-17T10:00:00",
        "updated_by": null
      }
    }
  ],
  "total_count": 1523
}
```

**Example**:
```bash
# Get features in specific area
curl "https://localhost/api/features?bbox=106.5,−6.5,107.0,−6.0&limit=50" \
  -H "Authorization: Bearer <token>"

# Filter by category
curl "https://localhost/api/features?category=urban&limit=100" \
  -H "Authorization: Bearer <token>"
```

---

### GET /api/features/{id}

Get a single feature by ID.

**Headers**:
```
Authorization: Bearer <token>
```

**Path Parameters**:
- `id`: Feature ID (integer)

**Response** (200 OK):
```json
{
  "type": "Feature",
  "id": 1,
  "geometry": {
    "type": "Polygon",
    "coordinates": [[...]]
  },
  "properties": {
    "name": "Sample Area",
    "category": "urban",
    "geom_type": "ST_Polygon"
  }
}
```

**Error Response** (404 Not Found):
```json
{
  "detail": "Feature not found"
}
```

---

### GET /api/features/search

Search features by name or properties.

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `q` (required): Search query (minimum 2 characters)
- `limit` (optional, default: 50): Maximum results (1-500)

**Response** (200 OK):
```json
{
  "type": "FeatureCollection",
  "features": [...],
  "total_count": 15
}
```

**Example**:
```bash
curl "https://localhost/api/features/search?q=jakarta&limit=10" \
  -H "Authorization: Bearer <token>"
```

---

### GET /api/features/stats

Get aggregate statistics about features.

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "total_features": 15234,
  "by_geometry_type": {
    "ST_Point": 8542,
    "ST_LineString": 3421,
    "ST_Polygon": 3271
  },
  "by_category": {
    "urban": 5234,
    "forest": 3421,
    "water": 2341,
    "agriculture": 4238
  },
  "bbox": [95.0, -11.0, 141.0, 6.0]
}
```

---

## Export Endpoints

### GET /api/export/geojson

Export features as GeoJSON file.

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `bbox` (optional): Bounding box filter
- `category` (optional): Category filter
- `geom_type` (optional): Geometry type filter

**Response**: GeoJSON file download

**Example**:
```bash
# Export all features in bounding box
curl "https://localhost/api/export/geojson?bbox=106.5,−6.5,107.0,−6.0" \
  -H "Authorization: Bearer <token>" \
  -o export.geojson

# Export specific category
curl "https://localhost/api/export/geojson?category=urban" \
  -H "Authorization: Bearer <token>" \
  -o urban.geojson
```

---

### GET /api/export/shapefile

Export features as zipped Shapefile.

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `bbox` (optional): Bounding box filter
- `category` (optional): Category filter
- `geom_type` (optional): Geometry type filter

**Response**: ZIP file containing .shp, .shx, .dbf, .prj, .cpg

**Limitations**:
- Maximum 10,000 features per export
- All geometries must be same type
- Field names truncated to 10 characters (Shapefile limitation)

**Example**:
```bash
curl "https://localhost/api/export/shapefile?bbox=106.5,−6.5,107.0,−6.0" \
  -H "Authorization: Bearer <token>" \
  -o export.zip
```

---

### GET /api/export/csv

Export features as CSV with centroid coordinates.

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `bbox` (optional): Bounding box filter
- `category` (optional): Category filter
- `geom_type` (optional): Geometry type filter

**Response**: CSV file with columns: id, name, category, geom_type, longitude, latitude

**Example**:
```bash
curl "https://localhost/api/export/csv?category=city" \
  -H "Authorization: Bearer <token>" \
  -o cities.csv
```

---

## Tile Endpoints

Served by Tegola, not FastAPI.

### GET /tiles/gis_map/{z}/{x}/{y}.pbf

Get vector tile in Mapbox Vector Tile format.

**Path Parameters**:
- `z`: Zoom level (0-16)
- `x`: Tile X coordinate
- `y`: Tile Y coordinate

**Response**: Protobuf binary (application/x-protobuf)

**Layers**:
- `points`: Point geometries
- `lines`: LineString geometries
- `polygons`: Polygon geometries

**Example**:
```bash
# Get tile for zoom 8, x=200, y=120
curl https://localhost/tiles/gis_map/8/200/120.pbf -o tile.pbf
```

**MapLibre Integration**:
```javascript
map.addSource('gis-tiles', {
    type: 'vector',
    tiles: ['https://your-domain.com/tiles/gis_map/{z}/{x}/{y}.pbf']
});
```

---

## Error Responses

### 400 Bad Request
```json
{
  "detail": "Invalid bbox format. Use: minx,miny,maxx,maxy"
}
```

### 401 Unauthorized
```json
{
  "detail": "Could not validate credentials"
}
```

### 403 Forbidden
```json
{
  "detail": "Required role: admin"
}
```

### 404 Not Found
```json
{
  "detail": "Feature not found"
}
```

### 422 Validation Error
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error"
}
```

---

## Rate Limiting

**API Endpoints**: 10 requests/second per IP, burst 20  
**Tile Endpoints**: 100 requests/second per IP, burst 200

Exceeded limits return:
```
HTTP 429 Too Many Requests
Retry-After: 1
```

---

## Data Models

### User
```typescript
{
  id: number
  email: string
  username: string
  full_name: string | null
  role: "admin" | "user" | "viewer"
  is_active: boolean
  created_at: string (ISO 8601)
}
```

### Feature (GeoJSON)
```typescript
{
  type: "Feature"
  id: number
  geometry: {
    type: "Point" | "LineString" | "Polygon" | "MultiPoint" | "MultiLineString" | "MultiPolygon"
    coordinates: number[] | number[][] | number[][][]
  }
  properties: {
    name: string | null
    category: string | null
    geom_type: string
    created_at: string | null
    updated_by: number | null
    [key: string]: any  // Additional properties from JSONB
  }
}
```

### FeatureCollection
```typescript
{
  type: "FeatureCollection"
  features: Feature[]
  total_count: number | null
}
```

---

## Authentication Flow

1. **Login**: POST /api/auth/login with credentials
2. **Receive Token**: Store `access_token` from response
3. **Authenticated Requests**: Include in Authorization header:
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. **Token Expiry**: Default 30 minutes, re-authenticate when expired

**JavaScript Example**:
```javascript
// Login
const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'username=admin&password=secret'
});
const {access_token} = await response.json();
localStorage.setItem('token', access_token);

// Authenticated request
const features = await fetch('/api/features', {
    headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
});
```

---

## Coordinate Reference Systems

- **API**: Always returns EPSG:4326 (WGS84) coordinates
- **Database**: Stores in EPSG:4326
- **Tiles**: Uses Web Mercator projection (EPSG:3857) internally
- **Import**: Automatically transforms to EPSG:4326

**Coordinate Order**: [longitude, latitude] (GeoJSON standard)

---

## Pagination

Use `limit` and `offset` parameters:

```bash
# Page 1 (first 100 features)
curl "/api/features?limit=100&offset=0"

# Page 2 (next 100 features)
curl "/api/features?limit=100&offset=100"

# Page 3
curl "/api/features?limit=100&offset=200"
```

**Response includes**:
```json
{
  "total_count": 1523,  // Use for calculating total pages
  "features": [...]      // Current page features
}
```

---

## Interactive API Documentation

Visit **https://your-domain.com/api/docs** for:
- Interactive API testing (Swagger UI)
- Request/response examples
- Schema definitions
- Try endpoints directly in browser

Alternative: **https://your-domain.com/api/redoc** (ReDoc UI)

---

## Client Libraries

### Python
```python
import requests

# Login
response = requests.post('https://localhost/api/auth/login', 
    data={'username': 'admin', 'password': 'secret'},
    verify=False)
token = response.json()['access_token']

# Get features
headers = {'Authorization': f'Bearer {token}'}
features = requests.get('https://localhost/api/features', 
    headers=headers, verify=False).json()
```

### JavaScript/Node.js
```javascript
const axios = require('axios');

// Login
const {data} = await axios.post('/api/auth/login', 
    new URLSearchParams({username: 'admin', password: 'secret'}));
const token = data.access_token;

// Get features
const features = await axios.get('/api/features', {
    headers: {Authorization: `Bearer ${token}`}
});
```

---

For more examples and tutorials, see [DEVELOPMENT.md](DEVELOPMENT.md).
