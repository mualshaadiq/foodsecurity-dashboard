import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.db.connection import create_pool, close_pool, init_admin_user, get_pool
from app.api import auth, features, export_routes, food_security, archive_routes, analysis_routes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting application...")
    await create_pool()
    
    # Initialize admin user if specified in environment
    await init_admin_user()
    
    logger.info("Application started successfully")

    # Re-queue any archive downloads that were interrupted by a previous
    # container restart (cog_status missing, 'pending', or 'downloading').
    asyncio.create_task(_recover_interrupted_downloads())

    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    await close_pool()
    logger.info("Application shutdown complete")


async def _recover_interrupted_downloads() -> None:
    """Re-queue band downloads for scenes whose background task was killed."""
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            # Atomically claim un-finished scenes so only one worker recovers each.
            rows = await conn.fetch(
                """
                WITH to_claim AS (
                    SELECT id FROM spatial_features
                    WHERE category = 'archived_scene'
                      AND COALESCE(properties->>'cog_status', 'pending')
                          NOT IN ('complete', 'error', 'recovering')
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE spatial_features sf
                SET properties = sf.properties || '{"cog_status":"recovering"}'::jsonb
                FROM to_claim
                WHERE sf.id = to_claim.id
                RETURNING sf.id,
                          (sf.properties->>'aoi_id')::int  AS aoi_id,
                          sf.properties->>'platform'        AS provider,
                          sf.properties->>'acq_date'        AS acq_date,
                          sf.properties->>'stac_id'         AS stac_id,
                          sf.properties->'stac_asset_urls'  AS stac_asset_urls_json
                """
            )
        if not rows:
            return
        import json
        for row in rows:
            scene_id = row["id"]
            stac_urls_raw = row["stac_asset_urls_json"]
            if not stac_urls_raw:
                continue
            stac_asset_urls = json.loads(stac_urls_raw) if isinstance(stac_urls_raw, str) else dict(stac_urls_raw)
            logger.info("Startup recovery: re-queuing COG download for scene %d", scene_id)
            asyncio.create_task(
                archive_routes._download_bands_to_minio(
                    scene_id,
                    stac_asset_urls,
                    row["aoi_id"],
                    row["provider"],
                    row["acq_date"],
                    row["stac_id"],
                )
            )
    except Exception as exc:
        logger.error("Startup recovery failed: %s", exc)


# Create FastAPI application
app = FastAPI(
    title="GIS Web Application API",
    description="REST API for spatial data management with PostGIS backend",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router,           prefix="/api/auth",    tags=["Authentication"])
app.include_router(features.router,       prefix="/api/features", tags=["Features"])
app.include_router(export_routes.router,  prefix="/api/export",   tags=["Export"])
app.include_router(food_security.router,  prefix="/api/food-security", tags=["Food Security"])
app.include_router(archive_routes.router,  prefix="/api/archive",   tags=["Archive"])
app.include_router(analysis_routes.router, prefix="/api/analysis",  tags=["Analysis"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "GIS Web Application API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}
