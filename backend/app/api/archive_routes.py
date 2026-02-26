"""
archive_routes.py — /api/archive/* endpoints

Archive workflow per scene:
  1. Download the thumbnail/preview JPEG from the STAC asset URL
  2. Serialise the full STAC item as JSON
  3. Upload both to MinIO under:
       {provider}/{YYYY}/{MM}/{DD}/{scene-id}-preview.jpg
       {provider}/{YYYY}/{MM}/{DD}/{scene-id}-metadata.json
  4. Save scene footprint + metadata to PostGIS (category='archived_scene')
  5. Return the saved feature + presigned preview URL

The full-resolution visual COG is NOT auto-downloaded (Sentinel-2 visual
assets are ~200 MB per tile). Band URLs from the STAC item are stored in
the metadata JSON for use by downstream processing pipelines.
"""

import json
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.core.storage import build_object_key, upload_bytes, presigned_get_url, delete_object
from app.db.connection import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────

def _row_to_feature(row) -> dict:
    raw = row["properties"] or {}
    if isinstance(raw, str):
        raw = json.loads(raw)
    props = dict(raw)
    props.update({"id": row["id"], "name": row["name"], "category": row["category"]})
    geom = json.loads(row["geom_json"]) if row["geom_json"] else None
    return {"id": row["id"], "type": "Feature", "geometry": geom, "properties": props}


async def _fetch_bytes(url: str) -> tuple[bytes, str]:
    """Download url; returns (content_bytes, content_type)."""
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    return resp.content, resp.headers.get("content-type", "application/octet-stream")


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/scenes", status_code=201)
async def archive_scene(body: dict):
    """
    Archive a Sentinel-2 STAC scene.

    Expected body:
    {
        "aoi_id":     <int>,
        "aoi_name":   <str>,
        "date_start": "YYYY-MM-DD",
        "date_end":   "YYYY-MM-DD",
        "stac_item":  { ...full STAC GeoJSON Feature... }
    }

    Returns the saved GeoJSON Feature with extra keys:
        preview_url   — presigned MinIO URL for the thumbnail
        metadata_key  — MinIO object key for the raw STAC JSON
        object_key    — MinIO object key for the preview image
    """
    aoi_id     = body.get("aoi_id")
    aoi_name   = body.get("aoi_name", f"AOI {aoi_id}")
    date_start = body.get("date_start", "")
    date_end   = body.get("date_end", "")
    stac_item  = body.get("stac_item")

    if not stac_item or not stac_item.get("geometry"):
        raise HTTPException(422, "stac_item with geometry is required")

    stac_props  = stac_item.get("properties", {})
    stac_id     = stac_item.get("id", "unknown")
    acq_dt      = stac_props.get("datetime", "")
    acq_date    = acq_dt[:10] if acq_dt else date_start
    cloud_cover = stac_props.get("eo:cloud_cover")
    platform    = stac_props.get("platform", "sentinel-2")  # e.g. 'sentinel-2a'
    assets      = stac_item.get("assets", {})

    # ── 1. Find the best preview asset ──────────────────────────────────
    preview_url_src = None
    for candidate in ("thumbnail", "overview", "visual"):
        href = (assets.get(candidate) or {}).get("href")
        if href:
            preview_url_src = href
            preview_asset_name = candidate
            break

    if not preview_url_src:
        raise HTTPException(422, "No preview asset found in stac_item.assets")

    # ── 2. Download preview ──────────────────────────────────────────────
    try:
        preview_bytes, preview_ct = await _fetch_bytes(preview_url_src)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Failed to download preview asset: {exc}")

    # Determine extension from content-type
    ext = "tif" if "tiff" in preview_ct else "jpg"

    # ── 3. Build MinIO keys ──────────────────────────────────────────────
    provider_folder = platform  # e.g. 'sentinel-2a'
    preview_key  = build_object_key(aoi_id, provider_folder, acq_date, stac_id, f"preview.{ext}")
    metadata_key = build_object_key(aoi_id, provider_folder, acq_date, stac_id, "metadata.json")

    # ── 4. Upload to MinIO ───────────────────────────────────────────────
    try:
        s3_preview  = upload_bytes(preview_key,  preview_bytes,  preview_ct)
        s3_metadata = upload_bytes(metadata_key, json.dumps(stac_item).encode(), "application/json")
    except Exception as exc:
        logger.error("MinIO upload error: %s", exc)
        raise HTTPException(500, f"Storage upload failed: {exc}")

    presigned = presigned_get_url(preview_key)

    # Collect all band/asset download URLs for future processing
    stac_asset_urls = {
        k: v.get("href") for k, v in assets.items() if v.get("href")
    }

    # ── 5. Save to PostGIS ───────────────────────────────────────────────
    props = {
        "aoi_id":          aoi_id,
        "aoi_name":        aoi_name,
        "date_start":      date_start,
        "date_end":        date_end,
        "stac_id":         stac_id,
        "cloud_cover":     cloud_cover,
        "platform":        platform,
        "acq_date":        acq_date,
        # MinIO references
        "object_key":      preview_key,
        "metadata_key":    metadata_key,
        "s3_preview":      s3_preview,
        "s3_metadata":     s3_metadata,
        "preview_asset":   preview_asset_name,
        # Original thumbnail URL (for quick display without presign)
        "thumbnail":       preview_url_src,
        # All STAC asset URLs for downstream processing
        "stac_asset_urls": stac_asset_urls,
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
                $1, 'archived_scene',
                ST_GeometryType(ST_GeomFromGeoJSON($2)),
                ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
                $3::jsonb
            )
            RETURNING id, name, category, properties,
                      ST_AsGeoJSON(geom)::text AS geom_json
            """,
            scene_name, json.dumps(geometry), json.dumps(props),
        )

    feature = _row_to_feature(row)
    feature["preview_url"]  = presigned
    feature["object_key"]   = preview_key
    feature["metadata_key"] = metadata_key
    feature["visual_url"]   = stac_asset_urls.get("visual", "")
    return feature


@router.get("/scenes")
async def list_archived_scenes(aoi_id: Optional[int] = Query(None)):
    """
    List archived scenes, optionally filtered by aoi_id.
    Each feature gets a fresh presigned preview URL.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        if aoi_id is not None:
            rows = await conn.fetch(
                """
                SELECT id, name, category, properties,
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
                SELECT id, name, category, properties,
                       ST_AsGeoJSON(geom)::text AS geom_json
                FROM spatial_features
                WHERE category = 'archived_scene'
                ORDER BY id DESC
                """
            )

    features = []
    for row in rows:
        feat = _row_to_feature(row)
        # Attach a fresh presigned URL if we have an object key
        obj_key = feat["properties"].get("object_key")
        if obj_key:
            try:
                feat["preview_url"] = presigned_get_url(obj_key)
            except Exception:
                feat["preview_url"] = feat["properties"].get("thumbnail", "")
        else:
            feat["preview_url"] = feat["properties"].get("thumbnail", "")
        # Visual COG URL for TiTiler-based tile rendering
        stac_urls = feat["properties"].get("stac_asset_urls") or {}
        feat["visual_url"] = stac_urls.get("visual", "")
        features.append(feat)
    return features


@router.get("/proxy-image")
async def proxy_image(url: str = Query(..., description="Remote image URL to proxy")):
    """
    Proxy a remote image (e.g. STAC S3 asset) through the backend so the
    browser doesn't hit a CORS-blocked origin directly.  MapLibre's 'image'
    source will call this endpoint instead of the raw S3 URL.
    """
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Failed to fetch remote image: {exc}")

    content_type = resp.headers.get("content-type", "image/jpeg")

    from fastapi.responses import Response
    return Response(
        content=resp.content,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.delete("/scenes/{scene_id}", status_code=204)
async def delete_archived_scene(scene_id: int):
    """Remove an archived scene from MinIO and PostGIS."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT properties FROM spatial_features
            WHERE id = $1 AND category = 'archived_scene'
            """,
            scene_id,
        )
        if not row:
            raise HTTPException(404, "Archived scene not found")

        props = row["properties"] or {}
        if isinstance(props, str):
            props = json.loads(props)

        # Remove objects from MinIO (best-effort)
        for key_field in ("object_key", "metadata_key"):
            key = props.get(key_field)
            if key:
                try:
                    delete_object(key)
                except Exception as exc:
                    logger.warning("Could not delete MinIO object %s: %s", key, exc)

        await conn.execute(
            "DELETE FROM spatial_features WHERE id = $1",
            scene_id,
        )
