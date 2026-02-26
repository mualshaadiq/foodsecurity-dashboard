import os
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import List

from app.auth.models import User
from app.auth.security import decode_access_token
from app.db.connection import get_pool

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ── Dev bypass ────────────────────────────────────────────────────────────
# When ENVIRONMENT=development and the request carries the magic token,
# skip JWT validation entirely and return a synthetic admin user.
_DEV_BYPASS_TOKEN = "dev-bypass-token"
_DEV_USER = User(
    id=0,
    email="dev@example.com",
    username="dev",
    full_name="Dev User",
    role="admin",
    is_active=True,
    created_at=datetime(2000, 1, 1, tzinfo=timezone.utc),
)
# ─────────────────────────────────────────────────────────────────────────


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Dev bypass — accept magic token in development environment
    if token == _DEV_BYPASS_TOKEN and os.getenv("ENVIRONMENT", "development") == "development":
        return _DEV_USER

    # Decode token
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    # Get user from database
    pool = get_pool()
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            """
            SELECT id, email, username, full_name, role, is_active, created_at
            FROM users
            WHERE username = $1
            """,
            username
        )
    
    if user_row is None:
        raise credentials_exception
    
    user = User(
        id=user_row['id'],
        email=user_row['email'],
        username=user_row['username'],
        full_name=user_row['full_name'],
        role=user_row['role'],
        is_active=user_row['is_active'],
        created_at=user_row['created_at']
    )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_roles(allowed_roles: List[str]):
    """Dependency to check if user has required role"""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker


# Convenience dependencies
require_admin = require_roles(["admin"])
require_authenticated = require_roles(["admin", "user", "viewer"])
