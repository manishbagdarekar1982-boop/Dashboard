from datetime import date, datetime

from sqlalchemy import Date, DateTime, Double, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class OHLCData(Base):
    """Maps to the existing `public.historic_data` table (read-only)."""

    __tablename__ = "historic_data"
    __table_args__ = {"schema": "public", "extend_existing": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    token: Mapped[int] = mapped_column(Integer, nullable=False)
    date_time: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    curr_price: Mapped[float] = mapped_column(Double, nullable=False)   # close / LTP
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    daily_turnover: Mapped[float] = mapped_column(Double, nullable=False)
    div_amount: Mapped[float] = mapped_column(Double, nullable=False)
    high: Mapped[float] = mapped_column(Double, nullable=False)
    low: Mapped[float] = mapped_column(Double, nullable=False)
    open: Mapped[float] = mapped_column(Double, nullable=False)
    volume: Mapped[float] = mapped_column(Double, nullable=False)
    marketcap_value: Mapped[float] = mapped_column(Double, nullable=False)
