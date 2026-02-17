from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta

from app.auth.models import User, UserCreate, UserLogin, Token
from app.auth.security import verify_password, get_password_hash, create_access_token
from app.auth.dependencies import get_current_user, require_admin
from app.db.connection import get_pool
from app.core.config import settings

router = APIRouter()


@router.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, current_user: User = Depends(require_admin)):
    """
    Register a new user (admin only)
    
    Only administrators can create new user accounts.
    """
    pool = get_pool()
    
    async with pool.acquire() as conn:
        # Check if username or email already exists
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE username = $1 OR email = $2",
            user_data.username,
            user_data.email
        )
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username or email already registered"
            )
        
        # Hash password
        hashed_password = get_password_hash(user_data.password)
        
        # Insert new user
        user_row = await conn.fetchrow(
            """
            INSERT INTO users (email, username, hashed_password, full_name, role, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id, email, username, full_name, role, is_active, created_at
            """,
            user_data.email,
            user_data.username,
            hashed_password,
            user_data.full_name,
            user_data.role,
            True
        )
    
    return User(
        id=user_row['id'],
        email=user_row['email'],
        username=user_row['username'],
        full_name=user_row['full_name'],
        role=user_row['role'],
        is_active=user_row['is_active'],
        created_at=user_row['created_at']
    )


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Login with username and password
    
    Returns a JWT access token for authentication.
    """
    pool = get_pool()
    
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            """
            SELECT id, email, username, hashed_password, full_name, role, is_active, created_at
            FROM users
            WHERE username = $1
            """,
            form_data.username
        )
    
    if not user_row or not verify_password(form_data.password, user_row['hashed_password']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user_row['is_active']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_row['username'], "role": user_row['role']},
        expires_delta=access_token_expires
    )
    
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current user information
    
    Returns the authenticated user's profile.
    """
    return current_user
