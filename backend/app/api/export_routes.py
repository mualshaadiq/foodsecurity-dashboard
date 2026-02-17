from fastapi import APIRouter, Depends, Query, HTTPException, Response
from fastapi.responses import StreamingResponse
from typing import Optional, AsyncGenerator
import json
import tempfile
import zipfile
from pathlib import Path
import csv
from io import StringIO

from app.auth.models import User
from app.auth.dependencies import require_authenticated
from app.db.connection import get_pool

router = APIRouter()


async def stream_geojson(
    pool,
    where_sql: str,
    params: list
) -> AsyncGenerator[str, None]:
    """Stream GeoJSON features"""
    yield '{"type":"FeatureCollection","features":['
    
    query = f"""
        SELECT 
            id,
            name,
            category,
            geom_type,
            ST_AsGeoJSON(geom)::json as geom_json,
            properties
        FROM spatial_features
        {where_sql}
        ORDER BY id
    """
    
    first = True
    async with pool.acquire() as conn:
        async for row in conn.cursor(query, *params):
            if not first:
                yield ","
            first = False
            
            feature = {
                "type": "Feature",
                "id": row['id'],
                "geometry": row['geom_json'],
                "properties": {
                    "name": row['name'],
                    "category": row['category'],
                    "geom_type": row['geom_type']
                }
            }
            
            # Merge additional properties
            if row['properties']:
                feature['properties'].update(row['properties'])
            
            yield json.dumps(feature)
    
    yield ']}'


@router.get("/geojson")
async def export_geojson(
    bbox: Optional[str] = Query(None, description="Bounding box: minx,miny,maxx,maxy"),
    category: Optional[str] = Query(None, description="Filter by category"),
    geom_type: Optional[str] = Query(None, description="Filter by geometry type"),
    current_user: User = Depends(require_authenticated)
):
    """
    Export features as GeoJSON
    
    Streams GeoJSON output for efficient memory usage with large datasets.
    """
    pool = get_pool()
    
    # Build WHERE clause
    where_clauses = []
    params = []
    param_idx = 1
    
    if bbox:
        try:
            minx, miny, maxx, maxy = map(float, bbox.split(','))
            where_clauses.append(
                f"geom && ST_MakeEnvelope(${param_idx}, ${param_idx+1}, ${param_idx+2}, ${param_idx+3}, 4326)"
            )
            params.extend([minx, miny, maxx, maxy])
            param_idx += 4
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    if category:
        where_clauses.append(f"category = ${param_idx}")
        params.append(category)
        param_idx += 1
    
    if geom_type:
        where_clauses.append(f"geom_type = ${param_idx}")
        params.append(geom_type)
        param_idx += 1
    
    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
    
    return StreamingResponse(
        stream_geojson(pool, where_sql, params),
        media_type="application/geo+json",
        headers={
            "Content-Disposition": "attachment; filename=features.geojson"
        }
    )


@router.get("/shapefile")
async def export_shapefile(
    bbox: Optional[str] = Query(None, description="Bounding box: minx,miny,maxx,maxy"),
    category: Optional[str] = Query(None, description="Filter by category"),
    geom_type: Optional[str] = Query(None, description="Filter by geometry type"),
    current_user: User = Depends(require_authenticated)
):
    """
    Export features as zipped Shapefile
    
    Creates a ZIP file containing .shp, .shx, .dbf, .prj, and .cpg files.
    """
    try:
        import fiona
        from fiona.crs import from_epsg
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Shapefile export requires fiona library"
        )
    
    pool = get_pool()
    
    # Build WHERE clause
    where_clauses = ["ST_IsValid(geom)"]
    params = []
    param_idx = 1
    
    if bbox:
        try:
            minx, miny, maxx, maxy = map(float, bbox.split(','))
            where_clauses.append(
                f"geom && ST_MakeEnvelope(${param_idx}, ${param_idx+1}, ${param_idx+2}, ${param_idx+3}, 4326)"
            )
            params.extend([minx, miny, maxx, maxy])
            param_idx += 4
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    if category:
        where_clauses.append(f"category = ${param_idx}")
        params.append(category)
        param_idx += 1
    
    if geom_type:
        where_clauses.append(f"geom_type = ${param_idx}")
        params.append(geom_type)
        param_idx += 1
    
    where_sql = "WHERE " + " AND ".join(where_clauses)
    
    # Fetch data
    query = f"""
        SELECT 
            id,
            name,
            category,
            geom_type,
            ST_AsGeoJSON(geom)::json as geom_json
        FROM spatial_features
        {where_sql}
        LIMIT 10000
    """
    
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
    
    if not rows:
        raise HTTPException(status_code=404, detail="No features found")
    
    # Determine geometry type for schema
    first_geom_type = rows[0]['geom_json']['type']
    schema_geom_type = {
        'Point': 'Point',
        'LineString': 'LineString',
        'Polygon': 'Polygon',
        'MultiPoint': 'MultiPoint',
        'MultiLineString': 'MultiLineString',
        'MultiPolygon': 'MultiPolygon'
    }.get(first_geom_type, 'Unknown')
    
    # Create temporary directory
    with tempfile.TemporaryDirectory() as tmpdir:
        shapefile_path = Path(tmpdir) / "features.shp"
        zip_path = Path(tmpdir) / "features.zip"
        
        # Define schema
        schema = {
            'geometry': schema_geom_type,
            'properties': {
                'id': 'int',
                'name': 'str:254',
                'category': 'str:100',
                'geom_type': 'str:50'
            }
        }
        
        # Write shapefile
        with fiona.open(
            str(shapefile_path),
            'w',
            driver='ESRI Shapefile',
            crs=from_epsg(4326),
            schema=schema
        ) as dst:
            for row in rows:
                feature = {
                    'geometry': row['geom_json'],
                    'properties': {
                        'id': row['id'],
                        'name': row['name'] or '',
                        'category': row['category'] or '',
                        'geom_type': row['geom_type'] or ''
                    }
                }
                try:
                    dst.write(feature)
                except Exception as e:
                    # Skip invalid geometries
                    continue
        
        # Create ZIP with all shapefile components
        with zipfile.ZipFile(str(zip_path), 'w', zipfile.ZIP_DEFLATED) as zipf:
            for ext in ['.shp', '.shx', '.dbf', '.prj', '.cpg']:
                file_path = shapefile_path.with_suffix(ext)
                if file_path.exists():
                    zipf.write(file_path, f"features{ext}")
        
        # Read ZIP file
        zip_bytes = zip_path.read_bytes()
    
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=features.zip"
        }
    )


async def stream_csv(
    pool,
    where_sql: str,
    params: list
) -> AsyncGenerator[str, None]:
    """Stream CSV with coordinates"""
    output = StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(['id', 'name', 'category', 'geom_type', 'longitude', 'latitude'])
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)
    
    # Data
    query = f"""
        SELECT 
            id,
            name,
            category,
            geom_type,
            ST_X(ST_Centroid(geom)) as lon,
            ST_Y(ST_Centroid(geom)) as lat
        FROM spatial_features
        {where_sql}
        ORDER BY id
    """
    
    async with pool.acquire() as conn:
        async for row in conn.cursor(query, *params):
            writer.writerow([
                row['id'],
                row['name'] or '',
                row['category'] or '',
                row['geom_type'] or '',
                round(row['lon'], 6) if row['lon'] else '',
                round(row['lat'], 6) if row['lat'] else ''
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)


@router.get("/csv")
async def export_csv(
    bbox: Optional[str] = Query(None, description="Bounding box: minx,miny,maxx,maxy"),
    category: Optional[str] = Query(None, description="Filter by category"),
    geom_type: Optional[str] = Query(None, description="Filter by geometry type"),
    current_user: User = Depends(require_authenticated)
):
    """
    Export features as CSV with centroid coordinates
    
    Streams CSV output with longitude/latitude from feature centroids.
    """
    pool = get_pool()
    
    # Build WHERE clause
    where_clauses = []
    params = []
    param_idx = 1
    
    if bbox:
        try:
            minx, miny, maxx, maxy = map(float, bbox.split(','))
            where_clauses.append(
                f"geom && ST_MakeEnvelope(${param_idx}, ${param_idx+1}, ${param_idx+2}, ${param_idx+3}, 4326)"
            )
            params.extend([minx, miny, maxx, maxy])
            param_idx += 4
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid bbox format")
    
    if category:
        where_clauses.append(f"category = ${param_idx}")
        params.append(category)
        param_idx += 1
    
    if geom_type:
        where_clauses.append(f"geom_type = ${param_idx}")
        params.append(geom_type)
        param_idx += 1
    
    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
    
    return StreamingResponse(
        stream_csv(pool, where_sql, params),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=features.csv"
        }
    )
