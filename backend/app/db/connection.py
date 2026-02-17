import asyncpg
import logging
from typing import Optional
from app.core.config import settings
from app.auth.security import get_password_hash

logger = logging.getLogger(__name__)

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def create_pool():
    """Create database connection pool"""
    global _pool
    
    try:
        # Parse DATABASE_URL to remove the +asyncpg part for asyncpg
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        
        _pool = await asyncpg.create_pool(
            db_url,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
        logger.info("Database connection pool created")
    except Exception as e:
        logger.error(f"Failed to create database pool: {e}")
        raise


async def close_pool():
    """Close database connection pool"""
    global _pool
    
    if _pool:
        await _pool.close()
        logger.info("Database connection pool closed")


def get_pool() -> asyncpg.Pool:
    """Get database connection pool"""
    if _pool is None:
        raise RuntimeError("Database pool not initialized")
    return _pool


async def get_connection():
    """Get a database connection from the pool"""
    pool = get_pool()
    async with pool.acquire() as connection:
        yield connection


async def init_admin_user():
    """Initialize admin user if credentials provided in environment"""
    if not all([settings.ADMIN_EMAIL, settings.ADMIN_USERNAME, settings.ADMIN_PASSWORD]):
        logger.info("Admin credentials not provided, skipping admin user creation")
        return
    
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            # Check if admin user already exists
            existing = await conn.fetchrow(
                "SELECT id FROM users WHERE username = $1 OR email = $2",
                settings.ADMIN_USERNAME,
                settings.ADMIN_EMAIL
            )
            
            if existing:
                logger.info("Admin user already exists")
                return
            
            # Create admin user
            hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
            
            await conn.execute(
                """
                INSERT INTO users (email, username, hashed_password, full_name, role, is_active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                """,
                settings.ADMIN_EMAIL,
                settings.ADMIN_USERNAME,
                hashed_password,
                "Administrator",
                "admin",
                True
            )
            
            logger.info(f"Admin user created: {settings.ADMIN_USERNAME}")
    
    except Exception as e:
        logger.error(f"Failed to create admin user: {e}")
        # Don't raise - allow app to start even if admin creation fails
