"""
archive_routes.py — /api/archive/* endpoints

Archive workflow per scene:
  1. Download the thumbnail/preview JPEG from the STAC asset URL
  2. Serialise the full STAC item as JSON
  3. Upload both to MinIO; return immediately with cog_status='pending'
  4. Background: stream-download all analytical band COGs (B02–B12, SCL, visual)
     to MinIO and update PostGIS with minio_band_keys + cog_status='complete'

MinIO key convention:
    {aoi_id}/{satellite-provider}/{YYYY}/{MM}/{DD}/{scene-id}-{type}.{ext}
e.g.
    3/sentinel-2a/2026/02/26/S2A_31MBN_20260226_0_L2A-B04.tif
    3/sentinel-2a/2026/02/26/S2A_31MBN_20260226_0_L2A-visual.tif
"""

import io
import json
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.core.config import settings
from app.core.storage import (
    build_object_key, upload_bytes, upload_stream,
    presigned_get_url, delete_object,
)
from app.db.connection import get_pool

# Sentinel-2 L2A band / asset names to download to MinIO.
# visual = true-colour COG; SCL = scene classification (cloud mask).
DOWNLOAD_BANDS = frozenset({
    "B02", "B03", "B04", "B05", "B06", "B07",
    "B08", "B8A", "B11", "B12",
    "SCL", "visual",
})

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


async def _download_bands_to_minio(
    scene_id: int,
    stac_asset_urls: dict,
    aoi_id: int,
    provider: str,
    acq_date: str,
    stac_id: str,
) -> None:
    """
    Background task: download each Sentinel-2 analytical band COG from its
    original Element84 / AWS source URL and store it in MinIO.

    On completion, PostGIS is updated with:
      - ``minio_band_keys``  — dict mapping band name → MinIO object key
      - ``cog_status``       — 'complete' | 'error'

    This allows TiTiler (on the same Docker network) to serve tiles from
    the local MinIO cache rather than going back to Element84 every time.
    """
    minio_band_keys: dict[str, str] = {}
    failed: list[str] = []

    for band, src_url in stac_asset_urls.items():
        if band not in DOWNLOAD_BANDS or not src_url:
            continue
        try:
            # Derive file extension from the source URL
            path_part = src_url.split("?")[0]          # strip query string
            ext = path_part.rsplit(".", 1)[-1].lower() # e.g. 'tif', 'jp2'
            if ext not in ("tif", "tiff", "jp2", "jpeg", "jpg", "png"):
                ext = "tif"
            ct = "image/tiff" if ext in ("tif", "tiff") else f"image/{ext}"

            key = build_object_key(aoi_id, provider, acq_date, stac_id, f"{band}.{ext}")

            logger.info("Downloading COG band %s for scene %d …", band, scene_id)
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, read=600.0),
                follow_redirects=True,
            ) as client:
                async with client.stream("GET", src_url) as resp:
                    resp.raise_for_status()
                    buf = io.BytesIO()
                    async for chunk in resp.aiter_bytes(chunk_size=65_536):
                        buf.write(chunk)

            buf.seek(0)
            size = len(buf.getvalue())
            buf.seek(0)
            upload_stream(key, buf, size, ct)
            minio_band_keys[band] = key
            logger.info("Stored band %s → s3://%s/%s", band, settings.MINIO_BUCKET, key)

        except Exception as exc:
            logger.error("COG download failed for scene %d band %s: %s", scene_id, band, exc)
            failed.append(band)

    cog_status = "error" if failed else "complete"
    if failed:
        logger.warning("Scene %d: %d band(s) failed to download: %s", scene_id, len(failed), failed)

    # Persist MinIO band keys + status back into PostGIS
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE spatial_features
            SET properties = properties
                || jsonb_build_object(
                       'minio_band_keys', $2::jsonb,
                       'cog_status',      $3
                   )
            WHERE id = $1
            """,
            scene_id,
            json.dumps(minio_band_keys),
            cog_status,
        )
    logger.info("Scene %d COG download finished — status: %s", scene_id, cog_status)


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/scenes", status_code=201)
async def archive_scene(body: dict, background_tasks: BackgroundTasks):
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
    feature["cog_status"]   = "pending"

    # Kick off background download of all analytical band COGs to MinIO.
    # The endpoint returns immediately; the download happens asynchronously.
    saved_id = row["id"]
    background_tasks.add_task(
        _download_bands_to_minio,
        saved_id, stac_asset_urls, aoi_id, platform, acq_date, stac_id,
    )

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


@router.get("/scenes/{scene_id}")
async def get_archived_scene(scene_id: int):
    """
    Return a single archived scene by id, with cog_status and download progress.
    Used by the frontend notification poller.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, name, category, properties,
                   ST_AsGeoJSON(geom)::text AS geom_json
            FROM spatial_features
            WHERE id = $1 AND category = 'archived_scene'
            """,
            scene_id,
        )
    if not row:
        raise HTTPException(404, "Archived scene not found")

    feat = _row_to_feature(row)
    props = feat["properties"]

    # Attach presigned preview URL
    obj_key = props.get("object_key")
    if obj_key:
        try:
            feat["preview_url"] = presigned_get_url(obj_key)
        except Exception:
            feat["preview_url"] = props.get("thumbnail", "")
    else:
        feat["preview_url"] = props.get("thumbnail", "")

    # Band download progress
    minio_keys = props.get("minio_band_keys") or {}
    if isinstance(minio_keys, str):
        minio_keys = json.loads(minio_keys)
    feat["bands_downloaded"] = len(minio_keys)
    feat["cog_status"]       = props.get("cog_status", "pending")

    stac_urls = props.get("stac_asset_urls") or {}
    feat["visual_url"] = minio_keys.get("visual", "") or stac_urls.get("visual", "")
    return feat


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

        # Remove objects from MinIO (best-effort): preview, metadata, and all band COGs
        keys_to_delete: list[str] = []
        for key_field in ("object_key", "metadata_key"):
            k = props.get(key_field)
            if k:
                keys_to_delete.append(k)
        # Also remove downloaded band COGs
        minio_band_keys = props.get("minio_band_keys") or {}
        if isinstance(minio_band_keys, str):
            minio_band_keys = json.loads(minio_band_keys)
        keys_to_delete.extend(minio_band_keys.values())

        for key in keys_to_delete:
            try:
                delete_object(key)
            except Exception as exc:
                logger.warning("Could not delete MinIO object %s: %s", key, exc)

        await conn.execute(
            "DELETE FROM spatial_features WHERE id = $1",
            scene_id,
        )
