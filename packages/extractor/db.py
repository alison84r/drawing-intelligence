"""
Database layer: Postgres via SQLAlchemy 2.

Schema: part -> drawing_revision -> inspection -> characteristic.
Tables are created on startup for the demo; Alembic migrations come with the production build.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Text, create_engine, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://di:di@localhost:15433/drawing_intelligence")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True, connect_args={"connect_timeout": 5})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Part(Base):
    __tablename__ = "part"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    part_number: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    part_name: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    revisions: Mapped[list["DrawingRevision"]] = relationship(back_populates="part", cascade="all, delete-orphan", order_by="DrawingRevision.imported_at")


class DrawingRevision(Base):
    __tablename__ = "drawing_revision"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    part_id: Mapped[str] = mapped_column(ForeignKey("part.id", ondelete="CASCADE"), index=True)
    revision: Mapped[str] = mapped_column(String(40), default="")
    file_name: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    pdf: Mapped[bytes] = mapped_column(LargeBinary)
    page_sizes: Mapped[list[dict[str, float]]] = mapped_column(JSONB, default=list)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    part: Mapped[Part] = relationship(back_populates="revisions")
    inspections: Mapped[list["Inspection"]] = relationship(back_populates="revision", cascade="all, delete-orphan", order_by="Inspection.created_at")


class Inspection(Base):
    __tablename__ = "inspection"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    revision_id: Mapped[str] = mapped_column(ForeignKey("drawing_revision.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Full FAI")
    fair_number: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    part_info: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    # AS9102 Form 2 rows: materials, special processes, functional tests.
    product_accountability: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    revision: Mapped[DrawingRevision] = relationship(back_populates="inspections")
    characteristics: Mapped[list["Characteristic"]] = relationship(back_populates="inspection", cascade="all, delete-orphan", order_by="Characteristic.balloon_number, Characteristic.sub_number")


class Characteristic(Base):
    __tablename__ = "characteristic"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inspection_id: Mapped[str] = mapped_column(ForeignKey("inspection.id", ondelete="CASCADE"), index=True)
    balloon_number: Mapped[int] = mapped_column(Integer)
    sub_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="Draft")
    record: Mapped[dict[str, Any]] = mapped_column(JSONB)
    inspection: Mapped[Inspection] = relationship(back_populates="characteristics")


def init_db() -> None:
    Base.metadata.create_all(engine)
    # Columns added after the first demo install. Alembic replaces this in the production build.
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE inspection ADD COLUMN IF NOT EXISTS product_accountability JSONB NOT NULL DEFAULT '[]'::jsonb"))


def get_session() -> Session:
    return SessionLocal()


__all__ = ["Base", "Part", "DrawingRevision", "Inspection", "Characteristic", "engine", "init_db", "get_session", "func", "Text"]
