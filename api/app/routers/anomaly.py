"""
Anomaly Detection
─────────────────
Flag price logs that deviate significantly from the item-market median.

POST /anomaly/check   — check a single new price before inserting
POST /anomaly/scan    — scan existing logs and return anomaly IDs
"""
from fastapi import APIRouter
from pydantic import BaseModel
import statistics

router = APIRouter()

ANOMALY_THRESHOLD = 2.0   # flag if price > 2× median OR < 0.5× median


class PricePoint(BaseModel):
    log_id:    str
    price_etb: float


class CheckRequest(BaseModel):
    new_price:    float
    recent_prices: list[float]   # last N confirmed prices for same item+market


class CheckResponse(BaseModel):
    is_anomaly: bool
    median:     float | None
    ratio:      float | None
    message:    str


class ScanRequest(BaseModel):
    logs: list[PricePoint]      # all logs for a single item+market combo


class ScanResponse(BaseModel):
    anomaly_ids: list[str]
    median:      float | None


@router.post("/check", response_model=CheckResponse)
def check_anomaly(req: CheckRequest) -> CheckResponse:
    if len(req.recent_prices) < 3:
        return CheckResponse(
            is_anomaly=False, median=None, ratio=None,
            message="Not enough history to detect anomaly",
        )

    med = statistics.median(req.recent_prices)
    if med == 0:
        return CheckResponse(
            is_anomaly=False, median=0, ratio=None,
            message="Median is zero — cannot compute ratio",
        )

    ratio = req.new_price / med
    is_anomaly = ratio > ANOMALY_THRESHOLD or ratio < (1 / ANOMALY_THRESHOLD)

    return CheckResponse(
        is_anomaly=is_anomaly,
        median=round(med, 2),
        ratio=round(ratio, 3),
        message=(
            f"Price is {ratio:.1f}× the median — flagged as anomaly"
            if is_anomaly else
            f"Price is within normal range ({ratio:.1f}× median)"
        ),
    )


@router.post("/scan", response_model=ScanResponse)
def scan_anomalies(req: ScanRequest) -> ScanResponse:
    if len(req.logs) < 3:
        return ScanResponse(anomaly_ids=[], median=None)

    prices = [l.price_etb for l in req.logs]
    med    = statistics.median(prices)

    anomaly_ids = [
        l.log_id for l in req.logs
        if med > 0 and (l.price_etb / med > ANOMALY_THRESHOLD or l.price_etb / med < 1 / ANOMALY_THRESHOLD)
    ]

    return ScanResponse(anomaly_ids=anomaly_ids, median=round(med, 2))
