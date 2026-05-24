"""
Alert Trigger Checker
──────────────────────
Called by a Supabase webhook or cron whenever new price_logs are inserted.
Checks which active alerts are triggered and returns the list.
The mobile app / a separate job reads triggered alerts and sends push notifications.

POST /alerts/check
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class ActiveAlert(BaseModel):
    alert_id:     str
    user_id:      str
    item_id:      str
    market_id:    Optional[str]   # None = any market
    target_price: float
    direction:    str             # "drop_below" | "rise_above"


class NewPriceLog(BaseModel):
    log_id:    str
    item_id:   str
    market_id: str
    price_etb: float


class CheckRequest(BaseModel):
    new_log:  NewPriceLog
    alerts:   list[ActiveAlert]


class TriggeredAlert(BaseModel):
    alert_id:  str
    user_id:   str
    log_id:    str
    price_etb: float
    message:   str


class CheckResponse(BaseModel):
    triggered: list[TriggeredAlert]


@router.post("/check", response_model=CheckResponse)
def check_alerts(req: CheckRequest) -> CheckResponse:
    triggered: list[TriggeredAlert] = []
    log = req.new_log

    for alert in req.alerts:
        # Market filter: None means any market
        if alert.market_id and alert.market_id != log.market_id:
            continue
        if alert.item_id != log.item_id:
            continue

        hit = False
        if alert.direction == "drop_below" and log.price_etb <= alert.target_price:
            hit = True
            msg = f"{log.price_etb:.0f} ETB dropped below your {alert.target_price:.0f} ETB target 🎉"
        elif alert.direction == "rise_above" and log.price_etb >= alert.target_price:
            hit = True
            msg = f"{log.price_etb:.0f} ETB rose above your {alert.target_price:.0f} ETB alert"

        if hit:
            triggered.append(TriggeredAlert(
                alert_id=alert.alert_id,
                user_id=alert.user_id,
                log_id=log.log_id,
                price_etb=log.price_etb,
                message=msg,
            ))

    return CheckResponse(triggered=triggered)
