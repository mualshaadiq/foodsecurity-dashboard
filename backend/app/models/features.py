from pydantic import BaseModel
from typing import Any, Optional, List, Dict
from datetime import datetime


class FeatureProperties(BaseModel):
    """Feature properties model"""
    name: Optional[str] = None
    category: Optional[str] = None
    geom_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_by: Optional[int] = None
    # Additional properties stored in JSONB
    additional: Optional[Dict[str, Any]] = None


class Geometry(BaseModel):
    """GeoJSON Geometry model"""
    type: str
    coordinates: List[Any]


class Feature(BaseModel):
    """GeoJSON Feature model"""
    type: str = "Feature"
    id: int
    geometry: Geometry
    properties: Dict[str, Any]


class FeatureCollection(BaseModel):
    """GeoJSON FeatureCollection model"""
    type: str = "FeatureCollection"
    features: List[Feature]
    total_count: Optional[int] = None


class FeatureStats(BaseModel):
    """Feature statistics model"""
    total_features: int
    by_geometry_type: Dict[str, int]
    by_category: Dict[str, int]
    bbox: Optional[List[float]] = None
