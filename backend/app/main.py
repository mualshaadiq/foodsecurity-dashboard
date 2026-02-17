from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.db.connection import create_pool, close_pool, init_admin_user
from app.api import auth, features, export_routes

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
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    await close_pool()
    logger.info("Application shutdown complete")


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
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(features.router, prefix="/api/features", tags=["Features"])
app.include_router(export_routes.router, prefix="/api/export", tags=["Export"])


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
