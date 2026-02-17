from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class UserBase(BaseModel):
    """Base user model"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: Optional[str] = None


class UserCreate(UserBase):
    """User creation model"""
    password: str = Field(..., min_length=8)
    role: str = Field(default="user", pattern="^(admin|user|viewer)$")


class UserLogin(BaseModel):
    """User login model"""
    username: str
    password: str


class User(UserBase):
    """User model"""
    id: int
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """Token response model"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Token payload model"""
    username: Optional[str] = None
    scopes: List[str] = []
