"""
storage.py — MinIO / S3 client helpers

Object key convention:
    {aoi_id}/{satellite-provider}/{YYYY}/{MM}/{DD}/{scene-id}-{type}.{ext}

Examples:
    3/sentinel-2a/2026/02/26/S2A_31MBN_20260226_0_L2A-preview.jpg
    3/sentinel-2a/2026/02/26/S2A_31MBN_20260226_0_L2A-metadata.json
"""
import io
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)

# Client used for upload/download operations (talks to internal Docker hostname)
_client: Optional[Minio] = None

# Client used ONLY for generating presigned URLs (uses the public-facing hostname
# so the HMAC signature matches what the browser sends as the Host header)
_public_client: Optional[Minio] = None


def get_client() -> Minio:
    """Internal client — used for put/delete/bucket ops."""
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def _get_public_client() -> Minio:
    """
    Presign client — endpoint matches what the browser resolves.

    Presigned URL signatures include the Host header value.  If we sign
    with the internal Docker name ('minio:9000') but the browser hits
    'localhost:9000', MinIO rejects the request with 403 SignatureDoesNotMatch.

    We parse MINIO_PUBLIC_URL (e.g. 'http://localhost:9000') and build a
    separate client so signatures are computed against the public host.

    IMPORTANT: we pre-populate the internal region cache so the SDK never
    makes a region-discovery HEAD request to localhost:9000 (unreachable from
    inside Docker).  MinIO uses 'us-east-1' as its default region.
    """
    global _public_client
    if _public_client is None:
        parsed = urlparse(settings.MINIO_PUBLIC_URL)
        secure = parsed.scheme == "https"
        endpoint = parsed.netloc  # e.g. 'localhost:9000'
        _public_client = Minio(
            endpoint,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=secure,
        )
        # Pre-seed bucket→region so the SDK skips the region-discovery
        # network call (which would fail because localhost:9000 is not
        # reachable from inside the FastAPI container).
        _public_client._region_map[settings.MINIO_BUCKET] = "us-east-1"
    return _public_client


def ensure_bucket(bucket: str | None = None) -> str:
    """Create the bucket if it doesn't exist; return bucket name."""
    bucket = bucket or settings.MINIO_BUCKET
    client = get_client()
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
            logger.info("Created MinIO bucket: %s", bucket)
    except S3Error as e:
        logger.error("MinIO bucket error: %s", e)
        raise
    return bucket


def build_object_key(aoi_id: int | str, provider: str, acq_date: str, scene_id: str, suffix: str) -> str:
    """
    Build a storage key following the directory convention.

    {aoi_id}/{satellite-provider}/{YYYY}/{MM}/{DD}/{scene-id}-{suffix}

    Args:
        aoi_id:    AOI database id  e.g. 42
        provider:  e.g. 'sentinel-2a'
        acq_date:  e.g. '2026-02-26'  (YYYY-MM-DD or ISO datetime)
        scene_id:  STAC item id
        suffix:    e.g. 'preview.jpg' | 'metadata.json' | 'visual.tif'
    """
    try:
        dt = datetime.fromisoformat(acq_date[:10])
    except ValueError:
        dt = datetime.now(timezone.utc)
    return f"{aoi_id}/{provider}/{dt.year:04d}/{dt.month:02d}/{dt.day:02d}/{scene_id}-{suffix}"


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream",
                 bucket: str | None = None) -> str:
    """
    Upload raw bytes to MinIO.

    Returns:
        s3://bucket/key  URI string
    """
    bucket = ensure_bucket(bucket)
    client = get_client()
    client.put_object(
        bucket, key,
        io.BytesIO(data), len(data),
        content_type=content_type,
    )
    logger.info("Uploaded %d bytes → s3://%s/%s", len(data), bucket, key)
    return f"s3://{bucket}/{key}"


def presigned_get_url(key: str, expires_hours: int = 72,
                      bucket: str | None = None) -> str:
    """
    Return a presigned GET URL valid for `expires_hours` hours.

    Uses the public-facing client so the HMAC signature is computed
    against the hostname the browser actually sends (localhost:9000),
    not the internal Docker hostname (minio:9000).
    """
    bucket = bucket or settings.MINIO_BUCKET
    client = _get_public_client()
    return client.presigned_get_object(
        bucket, key,
        expires=timedelta(hours=expires_hours),
    )


def delete_object(key: str, bucket: str | None = None) -> None:
    """Remove an object from MinIO."""
    bucket = bucket or settings.MINIO_BUCKET
    client = get_client()
    client.remove_object(bucket, key)
    logger.info("Deleted s3://%s/%s", bucket, key)
