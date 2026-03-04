"""
analysis_routes.py  /api/analysis/* endpoints

Sentinel-2 NDVI pipeline per archived scene:
  1. Load archived scene from spatial_features (category='archived_scene')
  2. Resolve B04 (red) + B08 (NIR) MinIO keys from minio_band_keys
  3. Download both bands via rasterio (internal vsicurl -> MinIO)
  4. Compute pixel-wise NDVI = (B08 - B04) / (B08 + B04)  -> Float32 GeoTIFF
  5. Write tiled, overview-enabled GeoTIFF to MinIO
     key: {aoi_id}/ndvi/{scene_id}-ndvi.tif
  6. Store ndvi_tif_key + ndvi_processed_at in sentinel_analysis_results
  7. Return analysis summary + TiTiler tile-URL template so the frontend
     can display the NDVI raster immediately.
"""

import io
import json
import logging
import math
import os
import tempfile
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

import httpx
import numpy as np
import rasterio
from fastapi import APIRouter, HTTPException, Query
from rasterio.enums import Resampling
from rasterio.warp import reproject

from app.core.storage import (
    build_object_key,
    ensure_bucket,
    get_client,
    presigned_get_url_internal,
)
from app.db.connection import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()

TITILER_URL = "http://titiler:80"
RICE_YIELD_FACTOR = 4.5
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ndvi-worker")

os.environ.setdefault("GDAL_HTTP_UNSAFESSL", "YES")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "3")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "1")


def _geom_area_ha(geom: dict) -> float:
    coords = geom.get("coordinates", [])
    if not coords:
        return 0.0
    geom_type = geom.get("type", "")
    if geom_type == "Polygon":
        flat = [c for ring in coords for c in ring]
    elif geom_type == "MultiPolygon":
        flat = [c for poly in coords for ring in poly for c in ring]
    else:
        return 0.0
    lons = [c[0] for c in flat]
    lats = [c[1] for c in flat]
    w = max(lons) - min(lons)
    h = max(lats) - min(lats)
    lat_c = (max(lats) + min(lats)) / 2
    return w * h * (111_000 ** 2) * abs(math.cos(math.radians(lat_c))) / 10_000


def _compute_ndvi_cog(b04_url, b08_url, aoi_id, provider, acq_date, scene_id, acq_date_iso):
    """
    Download B04+B08 via rasterio/vsicurl, compute NDVI raster, upload COG to MinIO.
    Returns (ndvi_tif_key, ndvi_mean, ndvi_class).
    """
    logger.info("NDVI: opening B04 via vsicurl")
    with rasterio.open(f"/vsicurl/{b04_url}") as b04_ds:
        b04_raw    = b04_ds.read(1).astype(np.float32)
        tgt_crs    = b04_ds.crs
        transform  = b04_ds.transform
        height     = b04_ds.height
        width      = b04_ds.width
        profile    = b04_ds.profile.copy()
        b04_nodata = b04_ds.nodata

    logger.info("NDVI: opening B08 via vsicurl")
    with rasterio.open(f"/vsicurl/{b08_url}") as b08_ds:
        if b08_ds.crs == tgt_crs and b08_ds.width == width and b08_ds.height == height:
            b08_raw    = b08_ds.read(1).astype(np.float32)
            b08_nodata = b08_ds.nodata
        else:
            logger.info("NDVI: reprojecting B08 to match B04 grid")
            b08_raw    = np.zeros((height, width), dtype=np.float32)
            b08_nodata = b08_ds.nodata
            reproject(
                source=rasterio.band(b08_ds, 1),
                destination=b08_raw,
                src_transform=b08_ds.transform,
                src_crs=b08_ds.crs,
                dst_transform=transform,
                dst_crs=tgt_crs,
                resampling=Resampling.bilinear,
            )

    nodata_mask = np.zeros_like(b04_raw, dtype=bool)
    if b04_nodata is not None:
        nodata_mask |= (b04_raw == b04_nodata)
    if b08_nodata is not None:
        nodata_mask |= (b08_raw == b08_nodata)
    nodata_mask |= (b04_raw <= 0) & (b08_raw <= 0)

    with np.errstate(divide="ignore", invalid="ignore"):
        denom = b04_raw + b08_raw
        ndvi  = np.where(
            (denom > 0) & ~nodata_mask,
            (b08_raw - b04_raw) / denom,
            np.float32(-9999),
        ).astype(np.float32)

    valid     = ndvi[ndvi != -9999]
    ndvi_mean = float(np.nanmean(valid)) if valid.size > 0 else 0.0
    ndvi_mean = max(-1.0, min(1.0, ndvi_mean))
    ndvi_class = (
        "healthy"  if ndvi_mean > 0.4 else
        "moderate" if ndvi_mean > 0.2 else
        "low"      if ndvi_mean > 0.0 else
        "critical"
    )

    processed_at_iso = datetime.now(timezone.utc).isoformat()

    cog_profile = profile.copy()
    cog_profile.update({
        "driver":     "GTiff",
        "dtype":      "float32",
        "count":      1,
        "nodata":     -9999,
        "compress":   "deflate",
        "predictor":  3,
        "tiled":      True,
        "blockxsize": 512,
        "blockysize": 512,
        "interleave": "band",
    })

    with tempfile.NamedTemporaryFile(suffix="_ndvi.tif", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        with rasterio.open(tmp_path, "w", **cog_profile) as dst:
            dst.write(ndvi, 1)
            dst.update_tags(
                NDVI_MEAN=f"{ndvi_mean:.4f}",
                NDVI_CLASS=ndvi_class,
                ACQ_DATE=acq_date_iso,
                PROCESSED_AT=processed_at_iso,
                SCENE_ID=str(scene_id),
            )
            dst.build_overviews([2, 4, 8, 16, 32], Resampling.average)
            dst.update_tags(ns="rio_overview", resampling="average")

        key    = build_object_key(aoi_id, provider, acq_date, f"scene-{scene_id}", "ndvi.tif")
        bucket = ensure_bucket()
        client = get_client()
        client.fput_object(
            bucket,
            key,
            tmp_path,
            content_type="image/tiff",
            metadata={
                "x-amz-meta-acq-date":     acq_date_iso,
                "x-amz-meta-processed-at": processed_at_iso,
                "x-amz-meta-scene-id":     str(scene_id),
                "x-amz-meta-ndvi-mean":    f"{ndvi_mean:.4f}",
                "x-amz-meta-ndvi-class":   ndvi_class,
            },
        )
        logger.info(
            "NDVI COG uploaded -> s3://%s/%s (%.1fMB ndvi=%.3f)",
            bucket, key, os.path.getsize(tmp_path) / 1_048_576, ndvi_mean,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return key, ndvi_mean, ndvi_class


@router.post("/run")
async def run_analysis(body: dict):
    """
    Run Sentinel-2 NDVI analysis on an archived scene.
    Body: { "scene_id": <int> }
    Returns summary + TiTiler tile-URL template for immediate map display.
    """
    scene_id = body.get("scene_id")
    if not scene_id:
        raise HTTPException(422, "scene_id is required")

    pool = get_pool()

    async with pool.acquire() as conn:
        scene_row = await conn.fetchrow(
            """
            SELECT id, name, properties, ST_AsGeoJSON(geom)::text AS geom_json
            FROM spatial_features
            WHERE id = $1 AND category = 'archived_scene'
            """,
            scene_id,
        )

    if not scene_row:
        raise HTTPException(404, "Archived scene not found")

    props = scene_row["properties"] or {}
    if isinstance(props, str):
        props = json.loads(props)

    stac_urls = props.get("stac_asset_urls") or {}
    aoi_id    = props.get("aoi_id")
    cloud     = props.get("cloud_cover")
    acq_date  = props.get("acq_date", "")
    aoi_name  = props.get("aoi_name", "")
    provider  = props.get("satellite_id", "sentinel-2a").lower()

    minio_keys = props.get("minio_band_keys") or {}
    if isinstance(minio_keys, str):
        minio_keys = json.loads(minio_keys)

    def _band_url(name, *aliases):
        for n in (name, *aliases):
            mkey = minio_keys.get(n)
            if mkey:
                try:
                    return presigned_get_url_internal(mkey, expires_hours=4)
                except Exception as exc:
                    logger.warning("Presign failed for %s: %s", mkey, exc)
        for n in (name, *aliases):
            url = stac_urls.get(n)
            if url:
                return url
        return None

    b04_url = _band_url("B04", "red", "b04")
    b08_url = _band_url("B08", "nir", "nir09", "b08")

    if not b04_url or not b08_url:
        raise HTTPException(
            422,
            "Scene is missing B04 or B08 bands in MinIO. "
            "Archive the scene from the Imagery tab and wait for the download to complete.",
        )

    geom              = json.loads(scene_row["geom_json"]) if scene_row["geom_json"] else None
    estimated_area_ha = _geom_area_ha(geom) if geom else 0.0
    province_code     = (aoi_name or "N/A")[:6].upper().strip() or "N/A"
    now               = datetime.now(timezone.utc)

    import asyncio
    loop = asyncio.get_event_loop()
    try:
        ndvi_tif_key, ndvi_mean, ndvi_class = await loop.run_in_executor(
            _EXECUTOR,
            _compute_ndvi_cog,
            b04_url, b08_url, aoi_id or 0, provider, acq_date, scene_id, acq_date,
        )
    except Exception as exc:
        logger.exception("NDVI computation failed for scene %s", scene_id)
        raise HTTPException(500, f"NDVI computation failed: {exc}")

    ndvi_processed_at   = datetime.now(timezone.utc)
    predicted_yield_ton = max(0.0, ndvi_mean) * estimated_area_ha * RICE_YIELD_FACTOR

    band_meta = json.dumps({
        "ndvi_mean":  round(ndvi_mean, 4),
        "ndvi_class": ndvi_class,
    })

    async with pool.acquire() as conn:
        existing_id = await conn.fetchval(
            "SELECT id FROM sentinel_analysis_results WHERE scene_id = $1",
            scene_id,
        )
        if existing_id:
            await conn.execute(
                """
                UPDATE sentinel_analysis_results
                   SET ndvi_mean           = $1,
                       estimated_area_ha   = $2,
                       predicted_yield_ton = $3,
                       analyzed_at         = $4,
                       band_metadata       = $5::jsonb,
                       ndvi_tif_key        = $6,
                       ndvi_processed_at   = $7
                 WHERE scene_id = $8
                """,
                ndvi_mean, estimated_area_ha, predicted_yield_ton,
                now, band_meta, ndvi_tif_key, ndvi_processed_at, scene_id,
            )
            result_id = existing_id
        else:
            result_id = await conn.fetchval(
                """
                INSERT INTO sentinel_analysis_results
                    (scene_id, aoi_id, province_code, ndvi_mean,
                     estimated_area_ha, predicted_yield_ton,
                     cloud_cover, analyzed_at, band_metadata,
                     ndvi_tif_key, ndvi_processed_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
                RETURNING id
                """,
                scene_id, aoi_id, province_code, ndvi_mean,
                estimated_area_ha, predicted_yield_ton,
                cloud, now, band_meta, ndvi_tif_key, ndvi_processed_at,
            )

    logger.info("Analysis done: scene=%s ndvi=%.3f class=%s key=%s",
                scene_id, ndvi_mean, ndvi_class, ndvi_tif_key)

    ndvi_cog_url  = presigned_get_url_internal(ndvi_tif_key, expires_hours=24)
    ndvi_tile_url = (
        "/titiler/cog/tiles/WebMercatorQuad/{z}/{x}/{y}"
        + "?url=" + urllib.parse.quote(ndvi_cog_url, safe="")
        + "&colormap_name=rdylgn&rescale=-1,1"
    )

    return {
        "id":                  result_id,
        "scene_id":            scene_id,
        "aoi_id":              aoi_id,
        "province_code":       province_code,
        "ndvi_mean":           round(ndvi_mean, 4),
        "ndvi_class":          ndvi_class,
        "estimated_area_ha":   round(estimated_area_ha, 2),
        "predicted_yield_ton": round(predicted_yield_ton, 2),
        "analyzed_at":         now.isoformat(),
        "ndvi_tif_key":        ndvi_tif_key,
        "ndvi_processed_at":   ndvi_processed_at.isoformat(),
        "ndvi_tile_url":       ndvi_tile_url,
        "acq_date":            acq_date,
    }


@router.get("/scenes/{scene_id}/ndvi-tile-url")
async def get_ndvi_tile_url(scene_id: int):
    """Return a fresh TiTiler tile-URL template for a scene NDVI COG."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT ndvi_tif_key, ndvi_mean, ndvi_class,
                   ndvi_processed_at, estimated_area_ha, predicted_yield_ton
              FROM sentinel_analysis_results
             WHERE scene_id = $1
             ORDER BY analyzed_at DESC
             LIMIT 1
            """,
            scene_id,
        )
    if not row or not row["ndvi_tif_key"]:
        raise HTTPException(404, "No NDVI result found. Run analysis first.")

    ndvi_cog_url  = presigned_get_url_internal(row["ndvi_tif_key"], expires_hours=24)
    ndvi_tile_url = (
        "/titiler/cog/tiles/WebMercatorQuad/{z}/{x}/{y}"
        + "?url=" + urllib.parse.quote(ndvi_cog_url, safe="")
        + "&colormap_name=rdylgn&rescale=-1,1"
    )
    return {
        "scene_id":            scene_id,
        "ndvi_tile_url":       ndvi_tile_url,
        "ndvi_mean":           row["ndvi_mean"],
        "ndvi_class":          row["ndvi_class"],
        "ndvi_processed_at":   row["ndvi_processed_at"].isoformat() if row["ndvi_processed_at"] else None,
        "estimated_area_ha":   row["estimated_area_ha"],
        "predicted_yield_ton": row["predicted_yield_ton"],
    }


@router.get("/results")
async def list_results(aoi_id: Optional[int] = Query(None)):
    """List analysis results, optionally filtered by aoi_id."""
    pool = get_pool()
    async with pool.acquire() as conn:
        if aoi_id is not None:
            rows = await conn.fetch(
                """
                SELECT id, scene_id, aoi_id, province_code, ndvi_mean,
                       estimated_area_ha, predicted_yield_ton, cloud_cover,
                       analyzed_at, ndvi_tif_key, ndvi_processed_at
                  FROM sentinel_analysis_results
                 WHERE aoi_id = $1
                 ORDER BY analyzed_at DESC
                """,
                aoi_id,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, scene_id, aoi_id, province_code, ndvi_mean,
                       estimated_area_ha, predicted_yield_ton, cloud_cover,
                       analyzed_at, ndvi_tif_key, ndvi_processed_at
                  FROM sentinel_analysis_results
                 ORDER BY analyzed_at DESC
                """
            )
    return [
        {
            **dict(r),
            "analyzed_at":       r["analyzed_at"].isoformat()       if r["analyzed_at"]       else None,
            "ndvi_processed_at": r["ndvi_processed_at"].isoformat() if r["ndvi_processed_at"] else None,
        }
        for r in rows
    ]


@router.get("/latest-scene/{aoi_id}")
async def latest_scene(aoi_id: int):
    """Return the most recently archived scene_id for a given AOI."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id
              FROM spatial_features
             WHERE category = 'archived_scene'
               AND (properties->>'aoi_id')::int = $1
             ORDER BY id DESC
             LIMIT 1
            """,
            aoi_id,
        )
    if not row:
        raise HTTPException(404, "No archived scenes found for this AOI.")
    return {"scene_id": row["id"], "aoi_id": aoi_id}