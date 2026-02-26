from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List
import json

from app.models.features import FeatureCollection, Feature, Geometry, FeatureStats
from app.auth.models import User
from app.auth.dependencies import require_authenticated
from app.db.connection import get_pool

router = APIRouter()


@router.get("/", response_model=FeatureCollection)
async def list_features(
    bbox: Optional[str] = Query(None, description="Bounding box: minx,miny,maxx,maxy"),
    category: Optional[str] = Query(None, description="Filter by category"),
    geom_type: Optional[str] = Query(None, description="Filter by geometry type"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of features"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    current_user: User = Depends(require_authenticated)
):
    """
    List features with filtering and pagination
    
    - **bbox**: Bounding box filter (minx,miny,maxx,maxy in EPSG:4326)
    - **category**: Filter by feature category
    - **geom_type**: Filter by geometry type (ST_Point, ST_LineString, ST_Polygon)
    - **limit**: Maximum features to return (1-1000)
    - **offset**: Pagination offset
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
            raise HTTPException(status_code=400, detail="Invalid bbox format. Use: minx,miny,maxx,maxy")
    
    if category:
        where_clauses.append(f"category = ${param_idx}")
        params.append(category)
        param_idx += 1
    
    if geom_type:
        where_clauses.append(f"geom_type = ${param_idx}")
        params.append(geom_type)
        param_idx += 1
    
    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
    
    async with pool.acquire() as conn:
        # Get total count
        count_query = f"SELECT COUNT(*) FROM spatial_features {where_sql}"
        total_count = await conn.fetchval(count_query, *params)
        
        # Get features
        query = f"""
            SELECT 
                id,
                name,
                category,
                geom_type,
                ST_AsGeoJSON(geom)::json as geom_json,
                properties,
                created_at,
                updated_by
            FROM spatial_features
            {where_sql}
            ORDER BY id
            LIMIT ${param_idx} OFFSET ${param_idx+1}
        """
        params.extend([limit, offset])
        
        rows = await conn.fetch(query, *params)
    
    # Build GeoJSON features
    features = []
    for row in rows:
        geometry = Geometry(**row['geom_json'])
        
        properties = {
            "name": row['name'],
            "category": row['category'],
            "geom_type": row['geom_type'],
            "created_at": row['created_at'].isoformat() if row['created_at'] else None,
            "updated_by": row['updated_by']
        }
        
        # Merge additional properties from JSONB
        if row['properties']:
            properties.update(row['properties'])
        
        feature = Feature(
            id=row['id'],
            geometry=geometry,
            properties=properties
        )
        features.append(feature)
    
    return FeatureCollection(
        features=features,
        total_count=total_count
    )


@router.get("/{feature_id:int}", response_model=Feature)
async def get_feature(
    feature_id: int,
    current_user: User = Depends(require_authenticated)
):
    """
    Get a single feature by ID
    """
    pool = get_pool()
    
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT 
                id,
                name,
                category,
                geom_type,
                ST_AsGeoJSON(geom)::json as geom_json,
                properties,
                created_at,
                updated_by
            FROM spatial_features
            WHERE id = $1
            """,
            feature_id
        )
    
    if not row:
        raise HTTPException(status_code=404, detail="Feature not found")
    
    geometry = Geometry(**row['geom_json'])
    
    properties = {
        "name": row['name'],
        "category": row['category'],
        "geom_type": row['geom_type'],
        "created_at": row['created_at'].isoformat() if row['created_at'] else None,
        "updated_by": row['updated_by']
    }
    
    if row['properties']:
        properties.update(row['properties'])
    
    return Feature(
        id=row['id'],
        geometry=geometry,
        properties=properties
    )


@router.get("/search", response_model=FeatureCollection)
async def search_features(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_authenticated)
):
    """
    Search features by name or properties
    
    Performs case-insensitive search on name field and JSONB properties.
    """
    pool = get_pool()
    
    async with pool.acquire() as conn:
        query = """
            SELECT 
                id,
                name,
                category,
                geom_type,
                ST_AsGeoJSON(geom)::json as geom_json,
                properties,
                created_at,
                updated_by
            FROM spatial_features
            WHERE name ILIKE $1 
                OR properties::text ILIKE $1
            ORDER BY 
                CASE WHEN name ILIKE $1 THEN 1 ELSE 2 END,
                id
            LIMIT $2
        """
        
        search_pattern = f"%{q}%"
        rows = await conn.fetch(query, search_pattern, limit)
    
    features = []
    for row in rows:
        geometry = Geometry(**row['geom_json'])
        
        properties = {
            "name": row['name'],
            "category": row['category'],
            "geom_type": row['geom_type'],
            "created_at": row['created_at'].isoformat() if row['created_at'] else None,
            "updated_by": row['updated_by']
        }
        
        if row['properties']:
            properties.update(row['properties'])
        
        feature = Feature(
            id=row['id'],
            geometry=geometry,
            properties=properties
        )
        features.append(feature)
    
    return FeatureCollection(
        features=features,
        total_count=len(features)
    )


@router.get("/stats", response_model=FeatureStats)
async def get_feature_stats(
    current_user: User = Depends(require_authenticated)
):
    """
    Get aggregate statistics about features
    
    Returns counts by geometry type, category, and overall bounding box.
    """
    pool = get_pool()
    
    async with pool.acquire() as conn:
        # Total count
        total = await conn.fetchval("SELECT COUNT(*) FROM spatial_features")
        
        # By geometry type
        geom_type_rows = await conn.fetch(
            "SELECT geom_type, COUNT(*) as count FROM spatial_features GROUP BY geom_type"
        )
        by_geometry_type = {row['geom_type']: row['count'] for row in geom_type_rows}
        
        # By category
        category_rows = await conn.fetch(
            "SELECT category, COUNT(*) as count FROM spatial_features WHERE category IS NOT NULL GROUP BY category"
        )
        by_category = {row['category']: row['count'] for row in category_rows}
        
        # Overall bounding box
        bbox_row = await conn.fetchrow(
            """
            SELECT 
                ST_XMin(extent) as minx,
                ST_YMin(extent) as miny,
                ST_XMax(extent) as maxx,
                ST_YMax(extent) as maxy
            FROM (SELECT ST_Extent(geom) as extent FROM spatial_features) as subquery
            """
        )
        
        bbox = None
        if bbox_row and bbox_row['minx'] is not None:
            bbox = [bbox_row['minx'], bbox_row['miny'], bbox_row['maxx'], bbox_row['maxy']]
    
    return FeatureStats(
        total_features=total,
        by_geometry_type=by_geometry_type,
        by_category=by_category,
        bbox=bbox
    )
