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
from rasterio.shutil import copy as rio_copy
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


def _build_tile_url(ndvi_cog_url: str, p2: float, p98: float) -> str:
    """Build a TiTiler tile URL with histogram-stretched rescale and nodata masking."""
    return (
        "/titiler/cog/tiles/WebMercatorQuad/{z}/{x}/{y}"
        + "?url=" + urllib.parse.quote(ndvi_cog_url, safe="")
        + f"&colormap_name=rdylgn&rescale={p2:.4f},{p98:.4f}&nodata=-9999"
    )


def _build_ndwi_tile_url(ndwi_cog_url: str, p2: float, p98: float) -> str:
    """Build a TiTiler tile URL for NDWI; blues colormap (high = more water)."""
    return (
        "/titiler/cog/tiles/WebMercatorQuad/{z}/{x}/{y}"
        + "?url=" + urllib.parse.quote(ndwi_cog_url, safe="")
        + f"&colormap_name=blues&rescale={p2:.4f},{p98:.4f}&nodata=-9999"
    )


def _compute_ndvi_cog(b04_url, b08_url, aoi_id, provider, acq_date, scene_id, acq_date_iso):
    """
    Download B04+B08 via rasterio/vsicurl, compute NDVI raster, upload proper COG to MinIO.
    Returns (ndvi_tif_key, ndvi_mean, ndvi_class, ndvi_p2, ndvi_p98).

    COG creation uses the two-step approach:
      1. Write a regular tiled GeoTIFF + internal overviews to /tmp
      2. Copy to a new COG file (copy_src_overviews=True places overviews before
         data so TiTiler can do efficient range requests)
    Statistics p2/p98 are returned so the tile URL can use a histogram-stretched
    rescale for proper visual contrast.
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
    # Percentile-based rescale values for histogram stretching in TiTiler
    ndvi_p2  = float(np.percentile(valid, 2))  if valid.size > 0 else -0.2
    ndvi_p98 = float(np.percentile(valid, 98)) if valid.size > 0 else 0.8
    logger.info("NDVI stats: mean=%.3f p2=%.3f p98=%.3f", ndvi_mean, ndvi_p2, ndvi_p98)
    ndvi_class = (
        "healthy"  if ndvi_mean > 0.4 else
        "moderate" if ndvi_mean > 0.2 else
        "low"      if ndvi_mean > 0.0 else
        "critical"
    )

    processed_at_iso = datetime.now(timezone.utc).isoformat()

    # Intermediate tiled GeoTIFF — data written here, overviews built in-place
    base_profile = profile.copy()
    base_profile.update({
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

    with tempfile.NamedTemporaryFile(suffix="_ndvi_tmp.tif", delete=False) as tmp:
        tmp_path = tmp.name
    cog_path = tmp_path.replace("_ndvi_tmp.tif", "_ndvi_cog.tif")

    try:
        # Step 1: write data + overviews to intermediate file
        with rasterio.open(tmp_path, "w", **base_profile) as dst:
            dst.write(ndvi, 1)
            dst.update_tags(
                NDVI_MEAN=f"{ndvi_mean:.4f}",
                NDVI_CLASS=ndvi_class,
                NDVI_P2=f"{ndvi_p2:.4f}",
                NDVI_P98=f"{ndvi_p98:.4f}",
                ACQ_DATE=acq_date_iso,
                PROCESSED_AT=processed_at_iso,
                SCENE_ID=str(scene_id),
            )
            dst.build_overviews([2, 4, 8, 16, 32], Resampling.average)
            dst.update_tags(ns="rio_overview", resampling="average")

        # Step 2: copy to proper COG — overviews come BEFORE image data in output
        rio_copy(
            tmp_path, cog_path,
            driver="GTiff",
            copy_src_overviews=True,
            compress="deflate",
            predictor=3,
            tiled=True,
            blockxsize=512,
            blockysize=512,
        )

        key    = build_object_key(aoi_id, provider, acq_date, f"scene-{scene_id}", "ndvi.tif")
        bucket = ensure_bucket()
        client = get_client()
        client.fput_object(
            bucket,
            key,
            cog_path,
            content_type="image/tiff",
            metadata={
                "x-amz-meta-acq-date":     acq_date_iso,
                "x-amz-meta-processed-at": processed_at_iso,
                "x-amz-meta-scene-id":     str(scene_id),
                "x-amz-meta-ndvi-mean":    f"{ndvi_mean:.4f}",
                "x-amz-meta-ndvi-class":   ndvi_class,
                "x-amz-meta-ndvi-p2":      f"{ndvi_p2:.4f}",
                "x-amz-meta-ndvi-p98":     f"{ndvi_p98:.4f}",
            },
        )
        logger.info(
            "NDVI COG uploaded -> s3://%s/%s (%.1fMB ndvi=%.3f p2=%.3f p98=%.3f)",
            bucket, key, os.path.getsize(cog_path) / 1_048_576, ndvi_mean, ndvi_p2, ndvi_p98,
        )
    finally:
        for p in (tmp_path, cog_path):
            try:
                os.unlink(p)
            except OSError:
                pass

    return key, ndvi_mean, ndvi_class, ndvi_p2, ndvi_p98


def _compute_ndwi_cog(b03_url, b08_url, aoi_id, provider, acq_date, scene_id, acq_date_iso):
    """
    Download B03 (Green) + B08 (NIR) via rasterio/vsicurl, compute NDWI raster,
    upload proper COG to MinIO.

    NDWI (McFeeters 1996) = (B03 - B08) / (B03 + B08)
    Positive values indicate open water; negative values indicate dry land / vegetation.

    Returns (ndwi_tif_key, ndwi_mean, ndwi_class, ndwi_p2, ndwi_p98).
    """
    logger.info("NDWI: opening B03 via vsicurl")
    with rasterio.open(f"/vsicurl/{b03_url}") as b03_ds:
        b03_raw    = b03_ds.read(1).astype(np.float32)
        tgt_crs    = b03_ds.crs
        transform  = b03_ds.transform
        height     = b03_ds.height
        width      = b03_ds.width
        profile    = b03_ds.profile.copy()
        b03_nodata = b03_ds.nodata

    logger.info("NDWI: opening B08 via vsicurl")
    with rasterio.open(f"/vsicurl/{b08_url}") as b08_ds:
        if b08_ds.crs == tgt_crs and b08_ds.width == width and b08_ds.height == height:
            b08_raw    = b08_ds.read(1).astype(np.float32)
            b08_nodata = b08_ds.nodata
        else:
            logger.info("NDWI: reprojecting B08 to match B03 grid")
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

    nodata_mask = np.zeros_like(b03_raw, dtype=bool)
    if b03_nodata is not None:
        nodata_mask |= (b03_raw == b03_nodata)
    if b08_nodata is not None:
        nodata_mask |= (b08_raw == b08_nodata)
    nodata_mask |= (b03_raw <= 0) & (b08_raw <= 0)

    with np.errstate(divide="ignore", invalid="ignore"):
        denom = b03_raw + b08_raw
        ndwi  = np.where(
            (denom > 0) & ~nodata_mask,
            (b03_raw - b08_raw) / denom,
            np.float32(-9999),
        ).astype(np.float32)

    valid     = ndwi[ndwi != -9999]
    ndwi_mean = float(np.nanmean(valid)) if valid.size > 0 else 0.0
    ndwi_mean = max(-1.0, min(1.0, ndwi_mean))
    ndwi_p2   = float(np.percentile(valid,  2)) if valid.size > 0 else -0.5
    ndwi_p98  = float(np.percentile(valid, 98)) if valid.size > 0 else  0.5
    logger.info("NDWI stats: mean=%.3f p2=%.3f p98=%.3f", ndwi_mean, ndwi_p2, ndwi_p98)
    ndwi_class = (
        "high"     if ndwi_mean > 0.3  else
        "moderate" if ndwi_mean > 0.1  else
        "low"      if ndwi_mean > 0.0  else
        "dry"
    )

    processed_at_iso = datetime.now(timezone.utc).isoformat()

    base_profile = profile.copy()
    base_profile.update({
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

    with tempfile.NamedTemporaryFile(suffix="_ndwi_tmp.tif", delete=False) as tmp:
        tmp_path = tmp.name
    cog_path = tmp_path.replace("_ndwi_tmp.tif", "_ndwi_cog.tif")

    try:
        with rasterio.open(tmp_path, "w", **base_profile) as dst:
            dst.write(ndwi, 1)
            dst.update_tags(
                NDWI_MEAN=f"{ndwi_mean:.4f}",
                NDWI_CLASS=ndwi_class,
                NDWI_P2=f"{ndwi_p2:.4f}",
                NDWI_P98=f"{ndwi_p98:.4f}",
                ACQ_DATE=acq_date_iso,
                PROCESSED_AT=processed_at_iso,
                SCENE_ID=str(scene_id),
            )
            dst.build_overviews([2, 4, 8, 16, 32], Resampling.average)
            dst.update_tags(ns="rio_overview", resampling="average")

        rio_copy(
            tmp_path, cog_path,
            driver="GTiff",
            copy_src_overviews=True,
            compress="deflate",
            predictor=3,
            tiled=True,
            blockxsize=512,
            blockysize=512,
        )

        key    = build_object_key(aoi_id, provider, acq_date, f"scene-{scene_id}", "ndwi.tif")
        bucket = ensure_bucket()
        client = get_client()
        client.fput_object(
            bucket, key, cog_path,
            content_type="image/tiff",
            metadata={
                "x-amz-meta-acq-date":     acq_date_iso,
                "x-amz-meta-processed-at": processed_at_iso,
                "x-amz-meta-scene-id":     str(scene_id),
                "x-amz-meta-ndwi-mean":    f"{ndwi_mean:.4f}",
                "x-amz-meta-ndwi-class":   ndwi_class,
                "x-amz-meta-ndwi-p2":      f"{ndwi_p2:.4f}",
                "x-amz-meta-ndwi-p98":     f"{ndwi_p98:.4f}",
            },
        )
        logger.info(
            "NDWI COG uploaded -> s3://%s/%s (%.1fMB ndwi=%.3f p2=%.3f p98=%.3f)",
            bucket, key, os.path.getsize(cog_path) / 1_048_576, ndwi_mean, ndwi_p2, ndwi_p98,
        )
    finally:
        for p in (tmp_path, cog_path):
            try:
                os.unlink(p)
            except OSError:
                pass

    return key, ndwi_mean, ndwi_class, ndwi_p2, ndwi_p98


@router.post("/run-ndwi")
async def run_ndwi_analysis(body: dict):
    """
    Run Sentinel-2 NDWI analysis on an archived scene.
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

    b03_url = _band_url("B03", "green", "b03")
    b08_url = _band_url("B08", "nir", "nir09", "b08")

    if not b03_url or not b08_url:
        raise HTTPException(
            422,
            "Scene is missing B03 or B08 bands in MinIO. "
            "Archive the scene from the Imagery tab and wait for the download to complete.",
        )

    geom              = json.loads(scene_row["geom_json"]) if scene_row["geom_json"] else None
    estimated_area_ha = _geom_area_ha(geom) if geom else 0.0
    province_code     = (aoi_name or "N/A")[:6].upper().strip() or "N/A"
    now               = datetime.now(timezone.utc)

    import asyncio
    loop = asyncio.get_event_loop()
    try:
        ndwi_tif_key, ndwi_mean, ndwi_class, ndwi_p2, ndwi_p98 = await loop.run_in_executor(
            _EXECUTOR,
            _compute_ndwi_cog,
            b03_url, b08_url, aoi_id or 0, provider, acq_date, scene_id, acq_date,
        )
    except Exception as exc:
        logger.exception("NDWI computation failed for scene %s", scene_id)
        raise HTTPException(500, f"NDWI computation failed: {exc}")

    ndwi_processed_at = datetime.now(timezone.utc)

    # Merge NDWI stats into band_metadata alongside any existing NDVI stats
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, band_metadata FROM sentinel_analysis_results WHERE scene_id = $1",
            scene_id,
        )
        if existing:
            bmeta = existing["band_metadata"] or {}
            if isinstance(bmeta, str):
                bmeta = json.loads(bmeta)
            bmeta.update({
                "ndwi_mean":  round(ndwi_mean, 4),
                "ndwi_class": ndwi_class,
                "ndwi_p2":    round(ndwi_p2, 4),
                "ndwi_p98":   round(ndwi_p98, 4),
            })
            await conn.execute(
                """
                UPDATE sentinel_analysis_results
                   SET band_metadata    = $1::jsonb,
                       ndwi_tif_key     = $2,
                       ndwi_processed_at = $3
                 WHERE scene_id = $4
                """,
                json.dumps(bmeta), ndwi_tif_key, ndwi_processed_at, scene_id,
            )
            result_id = existing["id"]
        else:
            # No NDVI row yet — create a minimal one
            band_meta = json.dumps({
                "ndwi_mean":  round(ndwi_mean, 4),
                "ndwi_class": ndwi_class,
                "ndwi_p2":    round(ndwi_p2, 4),
                "ndwi_p98":   round(ndwi_p98, 4),
            })
            result_id = await conn.fetchval(
                """
                INSERT INTO sentinel_analysis_results
                    (scene_id, aoi_id, province_code, ndvi_mean,
                     estimated_area_ha, predicted_yield_ton,
                     cloud_cover, analyzed_at, band_metadata,
                     ndwi_tif_key, ndwi_processed_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
                RETURNING id
                """,
                scene_id, aoi_id, province_code, 0.0,
                estimated_area_ha, 0.0,
                cloud, now, band_meta, ndwi_tif_key, ndwi_processed_at,
            )

    logger.info("NDWI analysis done: scene=%s ndwi=%.3f class=%s key=%s",
                scene_id, ndwi_mean, ndwi_class, ndwi_tif_key)

    ndwi_cog_url  = presigned_get_url_internal(ndwi_tif_key, expires_hours=24)
    ndwi_tile_url = _build_ndwi_tile_url(ndwi_cog_url, ndwi_p2, ndwi_p98)

    return {
        "id":               result_id,
        "scene_id":         scene_id,
        "aoi_id":           aoi_id,
        "ndwi_mean":        round(ndwi_mean, 4),
        "ndwi_class":       ndwi_class,
        "ndwi_p2":          round(ndwi_p2, 4),
        "ndwi_p98":         round(ndwi_p98, 4),
        "estimated_area_ha": round(estimated_area_ha, 2),
        "analyzed_at":      now.isoformat(),
        "ndwi_tif_key":     ndwi_tif_key,
        "ndwi_processed_at": ndwi_processed_at.isoformat(),
        "ndwi_tile_url":    ndwi_tile_url,
        "acq_date":         acq_date,
    }


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
        ndvi_tif_key, ndvi_mean, ndvi_class, ndvi_p2, ndvi_p98 = await loop.run_in_executor(
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
        "ndvi_p2":    round(ndvi_p2, 4),
        "ndvi_p98":   round(ndvi_p98, 4),
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
    ndvi_tile_url = _build_tile_url(ndvi_cog_url, ndvi_p2, ndvi_p98)

    return {
        "id":                  result_id,
        "scene_id":            scene_id,
        "aoi_id":              aoi_id,
        "province_code":       province_code,
        "ndvi_mean":           round(ndvi_mean, 4),
        "ndvi_class":          ndvi_class,
        "ndvi_p2":             round(ndvi_p2, 4),
        "ndvi_p98":            round(ndvi_p98, 4),
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
                   ndvi_processed_at, estimated_area_ha, predicted_yield_ton,
                   band_metadata
              FROM sentinel_analysis_results
             WHERE scene_id = $1
             ORDER BY analyzed_at DESC
             LIMIT 1
            """,
            scene_id,
        )
    if not row or not row["ndvi_tif_key"]:
        raise HTTPException(404, "No NDVI result found. Run analysis first.")

    bmeta  = row["band_metadata"] or {}
    if isinstance(bmeta, str):
        bmeta = json.loads(bmeta)
    p2  = float(bmeta.get("ndvi_p2",  -0.2))
    p98 = float(bmeta.get("ndvi_p98",  0.8))

    ndvi_cog_url  = presigned_get_url_internal(row["ndvi_tif_key"], expires_hours=24)
    ndvi_tile_url = _build_tile_url(ndvi_cog_url, p2, p98)
    return {
        "scene_id":            scene_id,
        "ndvi_tile_url":       ndvi_tile_url,
        "ndvi_mean":           row["ndvi_mean"],
        "ndvi_class":          row["ndvi_class"],
        "ndvi_p2":             p2,
        "ndvi_p98":            p98,
        "ndvi_processed_at":   row["ndvi_processed_at"].isoformat() if row["ndvi_processed_at"] else None,
        "estimated_area_ha":   row["estimated_area_ha"],
        "predicted_yield_ton": row["predicted_yield_ton"],
    }


@router.get("/results")
async def list_results(aoi_id: Optional[int] = Query(None)):
    """
    List analysis results, optionally filtered by aoi_id.
    Each row is enriched with:
      - acq_date  — from the parent archived-scene spatial_feature
      - ndvi_tile_url — fresh TiTiler tile URL (presigned, 24h validity)
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        if aoi_id is not None:
            rows = await conn.fetch(
                """
                SELECT r.id, r.scene_id, r.aoi_id, r.province_code, r.ndvi_mean,
                       r.estimated_area_ha, r.predicted_yield_ton, r.cloud_cover,
                       r.analyzed_at, r.ndvi_tif_key, r.ndvi_processed_at,
                       r.ndwi_tif_key, r.ndwi_processed_at AS ndwi_processed_at,
                       r.band_metadata,
                       (sf.properties->>'acq_date') AS acq_date
                  FROM sentinel_analysis_results r
                  LEFT JOIN spatial_features sf ON sf.id = r.scene_id
                 WHERE r.aoi_id = $1
                 ORDER BY r.analyzed_at DESC
                """,
                aoi_id,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT r.id, r.scene_id, r.aoi_id, r.province_code, r.ndvi_mean,
                       r.estimated_area_ha, r.predicted_yield_ton, r.cloud_cover,
                       r.analyzed_at, r.ndvi_tif_key, r.ndvi_processed_at,
                       r.ndwi_tif_key, r.ndwi_processed_at AS ndwi_processed_at,
                       r.band_metadata,
                       (sf.properties->>'acq_date') AS acq_date
                  FROM sentinel_analysis_results r
                  LEFT JOIN spatial_features sf ON sf.id = r.scene_id
                 ORDER BY r.analyzed_at DESC
                """
            )

    results = []
    for r in rows:
        bmeta = r["band_metadata"] or {}
        if isinstance(bmeta, str):
            bmeta = json.loads(bmeta)

        ndvi_tile_url = None
        if r["ndvi_tif_key"]:
            try:
                ndvi_cog_url  = presigned_get_url_internal(r["ndvi_tif_key"], expires_hours=24)
                p2            = float(bmeta.get("ndvi_p2",  -0.2))
                p98           = float(bmeta.get("ndvi_p98",  0.8))
                ndvi_tile_url = _build_tile_url(ndvi_cog_url, p2, p98)
            except Exception:
                pass

        ndwi_tile_url = None
        if r["ndwi_tif_key"]:
            try:
                ndwi_cog_url  = presigned_get_url_internal(r["ndwi_tif_key"], expires_hours=24)
                wp2           = float(bmeta.get("ndwi_p2",  -0.5))
                wp98          = float(bmeta.get("ndwi_p98",  0.5))
                ndwi_tile_url = _build_ndwi_tile_url(ndwi_cog_url, wp2, wp98)
            except Exception:
                pass

        results.append({
            "id":                  r["id"],
            "scene_id":            r["scene_id"],
            "aoi_id":              r["aoi_id"],
            "province_code":       r["province_code"],
            "ndvi_mean":           r["ndvi_mean"],
            "ndvi_class":          bmeta.get("ndvi_class"),
            "estimated_area_ha":   r["estimated_area_ha"],
            "predicted_yield_ton": r["predicted_yield_ton"],
            "cloud_cover":         r["cloud_cover"],
            "analyzed_at":         r["analyzed_at"].isoformat()       if r["analyzed_at"]       else None,
            "ndvi_processed_at":   r["ndvi_processed_at"].isoformat() if r["ndvi_processed_at"] else None,
            "acq_date":            r["acq_date"],
            "ndvi_tile_url":       ndvi_tile_url,
            "ndwi_tile_url":       ndwi_tile_url,
        })
    return results


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