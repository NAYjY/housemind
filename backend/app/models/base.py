"""
app/models/base.py — HouseMind
Declarative base shared by all SQLAlchemy models.
Import Base here; never re-declare it in individual model files.
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
