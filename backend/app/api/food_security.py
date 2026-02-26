"""
food_security.py — /api/food-security/* endpoints

AoIs are persisted in the existing spatial_features table using
category = 'aoi'.  All monitoring metadata is stored in the JSONB
properties column so no schema migration is required.

Other endpoints return mock / placeholder data until the relevant
PostGIS layers are populated.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import json

from app.db.connection import get_pool

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────

def _row_to_feature(row) -> dict:
    """Convert a spatial_features asyncpg Row to a GeoJSON-like dict."""
    raw = row["properties"] or {}
    # asyncpg may return jsonb as a string or as a dict depending on version/driver
    if isinstance(raw, str):
        raw = json.loads(raw)
    props = dict(raw)
    props.update({
        "id":       row["id"],
        "name":     row["name"],
        "category": row["category"],
    })
    geom = json.loads(row["geom_json"]) if row["geom_json"] else None
    return {
        "id":         row["id"],
        "type":       "Feature",
        "geometry":   geom,
        "properties": props,
    }


# ── AOI endpoints ─────────────────────────────────────────────────────────

@router.get("/aoi")
async def list_aois():
    """Return all AoI features from spatial_features."""
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                id,
                name,
                category,
                properties,
                ST_AsGeoJSON(geom)::text AS geom_json
            FROM spatial_features
            WHERE category = 'aoi'
            ORDER BY id DESC
            """
        )
    return [_row_to_feature(r) for r in rows]


@router.post("/aoi", status_code=201)
async def create_aoi(body: dict):
    """
    Accept a GeoJSON Feature with geometry + properties.
    Inserts into spatial_features and returns the saved feature.
    """
    # Validate minimal structure
    if body.get("type") != "Feature":
        raise HTTPException(status_code=422, detail="Body must be a GeoJSON Feature")

    geometry = body.get("geometry")
    if not geometry:
        raise HTTPException(status_code=422, detail="Feature must have a geometry")

    props = dict(body.get("properties") or {})
    name  = props.pop("name", "Unnamed AOI")

    # Remove 'category' from properties — it's a column
    props.pop("category", None)

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO spatial_features
                (name, category, geom_type, geom, properties)
            VALUES (
                $1,
                'aoi',
                ST_GeometryType(ST_GeomFromGeoJSON($2)),
                ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
                $3::jsonb
            )
            RETURNING
                id,
                name,
                category,
                properties,
                ST_AsGeoJSON(geom)::text AS geom_json
            """,
            name,
            json.dumps(geometry),
            json.dumps(props),
        )
    return _row_to_feature(row)


@router.delete("/aoi/{aoi_id}", status_code=204)
async def delete_aoi(aoi_id: int):
    """Delete an AoI by id."""
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM spatial_features WHERE id = $1 AND category = 'aoi'",
            aoi_id,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="AOI not found")


# ── Archived Scenes endpoints ─────────────────────────────────────────────

@router.get("/archived-scenes")
async def list_archived_scenes(aoi_id: Optional[int] = Query(None)):
    """
    Return all archived scenes, optionally filtered by aoi_id.
    Each item is a GeoJSON Feature with scene metadata in properties.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        if aoi_id is not None:
            rows = await conn.fetch(
                """
                SELECT
                    id, name, category, properties,
                    ST_AsGeoJSON(geom)::text AS geom_json
                FROM spatial_features
                WHERE category = 'archived_scene'
                  AND (properties->>'aoi_id')::int = $1
                ORDER BY id DESC
                """,
                aoi_id,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT
                    id, name, category, properties,
                    ST_AsGeoJSON(geom)::text AS geom_json
                FROM spatial_features
                WHERE category = 'archived_scene'
                ORDER BY id DESC
                """
            )
    return [_row_to_feature(r) for r in rows]


@router.post("/archived-scenes", status_code=201)
async def archive_scene(body: dict):
    """
    Archive a STAC scene for a given AOI and timeframe.

    Expected body:
    {
        "aoi_id":    <int>,
        "aoi_name":  <str>,
        "date_start": "YYYY-MM-DD",
        "date_end":   "YYYY-MM-DD",
        "stac_item":  { ...GeoJSON Feature from Element84 STAC... }
    }
    """
    aoi_id     = body.get("aoi_id")
    aoi_name   = body.get("aoi_name", f"AOI {aoi_id}")
    date_start = body.get("date_start")
    date_end   = body.get("date_end")
    stac_item  = body.get("stac_item")

    if not stac_item or not stac_item.get("geometry"):
        raise HTTPException(status_code=422, detail="stac_item with geometry is required")

    stac_props   = stac_item.get("properties", {})
    cloud_cover  = stac_props.get("eo:cloud_cover")
    platform     = stac_props.get("platform", "sentinel-2")
    acq_date     = (stac_props.get("datetime") or "")[:10]
    stac_id      = stac_item.get("id", "")
    thumbnail    = (stac_item.get("assets") or {}).get("thumbnail", {}).get("href") or ""

    props = {
        "aoi_id":       aoi_id,
        "aoi_name":     aoi_name,
        "date_start":   date_start,
        "date_end":     date_end,
        "stac_id":      stac_id,
        "cloud_cover":  cloud_cover,
        "platform":     platform,
        "acq_date":     acq_date,
        "thumbnail":    thumbnail,
    }

    scene_name = f"{acq_date} · {aoi_name}"
    geometry   = stac_item["geometry"]

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO spatial_features
                (name, category, geom_type, geom, properties)
            VALUES (
                $1,
                'archived_scene',
                ST_GeometryType(ST_GeomFromGeoJSON($2)),
                ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
                $3::jsonb
            )
            RETURNING
                id, name, category, properties,
                ST_AsGeoJSON(geom)::text AS geom_json
            """,
            scene_name,
            json.dumps(geometry),
            json.dumps(props),
        )
    return _row_to_feature(row)


@router.delete("/archived-scenes/{scene_id}", status_code=204)
async def delete_archived_scene(scene_id: int):
    """Remove an archived scene."""
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM spatial_features WHERE id = $1 AND category = 'archived_scene'",
            scene_id,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Archived scene not found")


# ── Stub / placeholder endpoints ──────────────────────────────────────────
# These return empty-but-valid payloads so the frontend doesn't crash.
# Replace with real queries once the food-security layers are in PostGIS.

@router.get("/asset-stats")
async def asset_stats():
    """
    Returns a list of province-level asset summary rows.
    Shape: [{ province_code, province_name, farm_area_ha, paddy_area_ha }]
    Returns empty list until real data is loaded.
    """
    return []


@router.get("/crop-stats")
async def crop_stats():
    """
    Returns a list of crop type distribution rows.
    Shape: [{ crop_type, count }]
    Returns empty list until real data is loaded.
    """
    return []


@router.get("/ndvi")
async def ndvi(
    farm_id: Optional[int] = Query(None),
    start: Optional[str]   = Query(None),
    end: Optional[str]     = Query(None),
):
    return {"farm_id": farm_id, "start": start, "end": end, "values": []}


@router.get("/weather")
async def weather(province_code: Optional[str] = Query(None)):
    return {
        "province_code": province_code,
        "temperature":   None,
        "humidity":      None,
        "rainfall":      None,
        "message":       "Weather integration not yet configured",
    }


@router.get("/yield-prediction")
async def yield_prediction(province_code: Optional[str] = Query(None)):
    return {
        "province_code": province_code,
        "predictions":   [],
        "message":       "Yield model not yet configured",
    }


@router.get("/monthly-report")
async def monthly_report(
    month: Optional[int] = Query(None),
    year:  Optional[int] = Query(None),
):
    return {
        "month":   month,
        "year":    year,
        "rows":    [],
        "message": "Report data not yet available",
    }


@router.get("/available-dates")
async def available_dates(layer: Optional[str] = Query(None)):
    """Placeholder — returns empty list until temporal tile backend is ready."""
    return {"layer": layer, "dates": []}
