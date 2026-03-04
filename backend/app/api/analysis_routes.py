"""
analysis_routes.py — /api/analysis/* endpoints

Sentinel-2 analysis pipeline per archived scene:
  1. Load archived scene from spatial_features (category='archived_scene')
  2. Retrieve B04 (red) + B08 (NIR) asset URLs from properties.stac_asset_urls
  3. Call TiTiler /cog/statistics for each band via internal Docker network
  4. Compute NDVI = (NIR_mean − Red_mean) / (NIR_mean + Red_mean)
  5. Estimate paddy area from scene bbox
  6. Apply yield model: predicted_yield_ton = max(0, ndvi_mean) × area_ha × 4.5
  7. Persist result in sentinel_analysis_results
  8. Upsert spatial_features overlays (category='ndvi_zone', 'yield_zone')
     so they appear immediately in the Crop Health / Yield Prediction map layers
"""

import json
import logging
import math
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.core.storage import presigned_get_url_internal
from app.db.connection import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()

# TiTiler container – reachable on the internal Docker network.
# The developmentseed/titiler image exposes port 80 (not 8000).
TITILER_URL = "http://titiler:80"

# Constant: rough rice yield factor (ton/ha at NDVI=1.0)
RICE_YIELD_FACTOR = 4.5


# ── TiTiler helpers ───────────────────────────────────────────────────────

async def _cog_statistics(cog_url: str) -> dict:
    """Fetch pixel statistics for a Cloud-Optimised GeoTIFF via TiTiler."""
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(
            f"{TITILER_URL}/cog/statistics",
            params={"url": cog_url},
        )
        resp.raise_for_status()
    return resp.json()


def _band_mean(stats: dict) -> float:
    """
    Extract the mean pixel value from a TiTiler statistics response.

    TiTiler returns one of two shapes:
        {"b1": {"mean": …, "min": …, …}}          ← direct band dict
        {"<url>": {"b1": {"mean": …, …}}}          ← URL-keyed dict
    """
    if "b1" in stats and isinstance(stats["b1"], dict):
        return float(stats["b1"].get("mean", 0) or 0)
    for val in stats.values():
        if isinstance(val, dict):
            if "b1" in val and isinstance(val["b1"], dict):
                return float(val["b1"].get("mean", 0) or 0)
            if "mean" in val:
                return float(val.get("mean", 0) or 0)
    return 0.0


# ── Geometry helpers ──────────────────────────────────────────────────────

def _geom_area_ha(geom: dict) -> float:
    """
    Rough geographic area in hectares from a GeoJSON geometry bbox.
    At equatorial scales: 1 degree ≈ 111 km; adjusted by cos(lat).
    """
    coords: list = geom.get("coordinates", [])
    if not coords:
        return 0.0

    geom_type = geom.get("type", "")
    if geom_type == "Polygon":
        flat = [c for ring in coords for c in ring]
    elif geom_type == "MultiPolygon":
        flat = [c for poly in coords for ring in poly for c in ring]
    else:
        return 0.0

    if not flat:
        return 0.0

    lons = [c[0] for c in flat]
    lats = [c[1] for c in flat]
    w = max(lons) - min(lons)
    h = max(lats) - min(lats)
    lat_c = (max(lats) + min(lats)) / 2
    return w * h * (111_000 ** 2) * abs(math.cos(math.radians(lat_c))) / 10_000


# ── Routes ────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_analysis(body: dict):
    """
    Run Sentinel-2 NDVI & yield analysis on an archived scene.

    Body: { "scene_id": <int> }

    Steps:
      1. Load scene & band URLs from spatial_features
      2. Call TiTiler statistics for B04 + B08
      3. Compute NDVI → ndvi_class → yield estimate
      4. Upsert sentinel_analysis_results
      5. Upsert ndvi_zone + yield_zone overlays in spatial_features
      6. Return analysis summary

    Returns 422 if the scene has no band URLs (archive it first from Imagery tab).
    Returns 502 if TiTiler is unreachable or the COG fetch fails.
    """
    scene_id = body.get("scene_id")
    if not scene_id:
        raise HTTPException(422, "scene_id is required")

    pool = get_pool()

    # ── 1. Load scene ──────────────────────────────────────────────────
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

    stac_urls   = props.get("stac_asset_urls") or {}
    aoi_id      = props.get("aoi_id")
    cloud       = props.get("cloud_cover")
    acq_date    = props.get("acq_date", "")
    aoi_name    = props.get("aoi_name", "")

    # ── 2. Resolve band URLs ───────────────────────────────────────────
    # Prefer locally-cached MinIO COGs (served via TiTiler on same Docker
    # network) over the original Element84 S3 source URLs.
    minio_keys = props.get("minio_band_keys") or {}
    if isinstance(minio_keys, str):
        import json as _json
        minio_keys = _json.loads(minio_keys)

    def _band_url(name: str, *aliases) -> str | None:
        """Return a TiTiler-accessible URL for a band, MinIO-first."""
        # Check MinIO cache first
        for n in (name, *aliases):
            mkey = minio_keys.get(n)
            if mkey:
                try:
                    return presigned_get_url_internal(mkey, expires_hours=2)
                except Exception as exc:
                    logger.warning("Presign failed for %s: %s", mkey, exc)
        # Fall back to original STAC URLs
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
            "Scene has no B04/B08 band URLs. Use the Imagery tab to archive the "
            "scene via the Element84 STAC search — ensure 'stac_asset_urls' includes B04 & B08.",
        )

    # ── 3. TiTiler statistics ──────────────────────────────────────────
    try:
        b04_stats, b08_stats = await _cog_statistics(b04_url), None
        b08_stats = await _cog_statistics(b08_url)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"TiTiler statistics error: {exc.response.status_code} {exc.response.text[:200]}")
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"TiTiler unreachable: {exc}")

    red_mean = _band_mean(b04_stats)
    nir_mean = _band_mean(b08_stats)

    # ── 4. NDVI ────────────────────────────────────────────────────────
    denom    = nir_mean + red_mean
    ndvi_mean = (nir_mean - red_mean) / denom if denom != 0 else 0.0
    ndvi_mean = max(-1.0, min(1.0, ndvi_mean))   # clamp to [-1, 1]

    ndvi_class = (
        "healthy"  if ndvi_mean > 0.4 else
        "moderate" if ndvi_mean > 0.2 else
        "low"      if ndvi_mean > 0.0 else
        "critical"
    )

    # ── 5. Area & yield ────────────────────────────────────────────────
    geom = json.loads(scene_row["geom_json"]) if scene_row["geom_json"] else None
    estimated_area_ha   = _geom_area_ha(geom) if geom else 0.0
    predicted_yield_ton = max(0.0, ndvi_mean) * estimated_area_ha * RICE_YIELD_FACTOR

    # Province code — shorten aoi_name to 6 chars as a surrogate key
    province_code = (aoi_name or "N/A")[:6].upper().strip() or "N/A"

    now = datetime.now(timezone.utc)
    band_meta_json = json.dumps({"b04": b04_stats, "b08": b08_stats, "red_mean": red_mean, "nir_mean": nir_mean})

    # ── 6. Upsert sentinel_analysis_results ───────────────────────────
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
                       band_metadata       = $5::jsonb
                 WHERE scene_id = $6
                """,
                ndvi_mean, estimated_area_ha, predicted_yield_ton,
                now, band_meta_json, scene_id,
            )
            result_id = existing_id
        else:
            result_id = await conn.fetchval(
                """
                INSERT INTO sentinel_analysis_results
                    (scene_id, aoi_id, province_code, ndvi_mean,
                     estimated_area_ha, predicted_yield_ton,
                     cloud_cover, analyzed_at, band_metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
                RETURNING id
                """,
                scene_id, aoi_id, province_code, ndvi_mean,
                estimated_area_ha, predicted_yield_ton,
                cloud, now, band_meta_json,
            )

        # ── 7. Upsert map overlays ─────────────────────────────────────
        if geom:
            geom_json_str   = json.dumps(geom)
            ndvi_props      = json.dumps({
                "scene_id":    scene_id,
                "analysis_id": result_id,
                "ndvi_mean":   round(ndvi_mean, 4),
                "ndvi_class":  ndvi_class,
                "acq_date":    acq_date,
                "aoi_id":      aoi_id,
                "category":    "ndvi_zone",
            })
            yield_props = json.dumps({
                "scene_id":        scene_id,
                "analysis_id":     result_id,
                "predicted_yield": round(predicted_yield_ton / max(estimated_area_ha, 1), 4),
                "acq_date":        acq_date,
                "aoi_id":          aoi_id,
                "category":        "yield_zone",
            })

            for cat, overlay_props in [("ndvi_zone", ndvi_props), ("yield_zone", yield_props)]:
                ov_id = await conn.fetchval(
                    "SELECT id FROM spatial_features "
                    "WHERE category = $1 AND (properties->>'scene_id')::int = $2",
                    cat, scene_id,
                )
                if ov_id:
                    await conn.execute(
                        "UPDATE spatial_features SET properties = $1::jsonb WHERE id = $2",
                        overlay_props, ov_id,
                    )
                else:
                    await conn.execute(
                        """
                        INSERT INTO spatial_features (name, category, geom_type, geom, properties)
                        VALUES (
                            $1, $2,
                            ST_GeometryType(ST_GeomFromGeoJSON($3)),
                            ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
                            $4::jsonb
                        )
                        """,
                        f"{cat.replace('_', ' ').title()} {acq_date}",
                        cat, geom_json_str, overlay_props,
                    )

    logger.info(
        "Analysis complete: scene=%s ndvi=%.3f area=%.1f ha yield=%.1f ton",
        scene_id, ndvi_mean, estimated_area_ha, predicted_yield_ton,
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
        "overlays_created":    geom is not None,
    }


@router.get("/results")
async def list_results(aoi_id: Optional[int] = Query(None)):
    """
    List analysis results, optionally filtered by aoi_id.
    Each row: id, scene_id, aoi_id, province_code, ndvi_mean,
              estimated_area_ha, predicted_yield_ton, cloud_cover, analyzed_at.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        if aoi_id is not None:
            rows = await conn.fetch(
                """
                SELECT id, scene_id, aoi_id, province_code, ndvi_mean,
                       estimated_area_ha, predicted_yield_ton, cloud_cover,
                       analyzed_at
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
                       analyzed_at
                FROM sentinel_analysis_results
                ORDER BY analyzed_at DESC
                """
            )

    return [
        {
            **dict(r),
            "analyzed_at": r["analyzed_at"].isoformat() if r["analyzed_at"] else None,
        }
        for r in rows
    ]


@router.get("/latest-scene/{aoi_id}")
async def latest_scene(aoi_id: int):
    """
    Return the most recently archived scene_id for a given AOI.
    Used by Monitoring Setting 'Run Now' to pick the scene automatically.
    """
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
        raise HTTPException(404, "No archived scenes found for this AOI. Archive a scene first.")
    return {"scene_id": row["id"], "aoi_id": aoi_id}
