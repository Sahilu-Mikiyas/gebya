"""
Phase 8 fix + Phase 9: alerts/suggest endpoint — added to the correct router file.
POST /alerts/suggest
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
import statistics
from datetime import datetime, timedelta, timezone
from collections import defaultdict

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


# ── Existing /check endpoint ───────────────────────────────────────────────────

class ActiveAlert(BaseModel):
    alert_id:     str
    user_id:      str
    item_id:      str
    market_id:    Optional[str]
    target_price: float
    direction:    str

class NewPriceLog(BaseModel):
    log_id:    str
    item_id:   str
    market_id: str
    price_etb: float

class CheckRequest(BaseModel):
    new_log: NewPriceLog
    alerts:  list[ActiveAlert]

class TriggeredAlert(BaseModel):
    alert_id:  str
    user_id:   str
    log_id:    str
    price_etb: float
    message:   str

class CheckResponse(BaseModel):
    triggered: list[TriggeredAlert]

@router.post("/check", response_model=CheckResponse)
async def check_alerts(req: CheckRequest) -> CheckResponse:
    triggered: list[TriggeredAlert] = []
    log = req.new_log

    # Phase 12-B: Server-side validation: price must be between 0.1x and 10x of 30-day median
    if SUPABASE_URL and SUPABASE_KEY:
        headers = {
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        url = (
            f"{SUPABASE_URL}/rest/v1/price_logs"
            f"?select=price_etb"
            f"&item_id=eq.{log.item_id}"
            f"&logged_at=gte.{since}"
        )
        try:
            async with httpx.AsyncClient(timeout=4) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                rows = resp.json()
                prices = [float(r["price_etb"]) for r in rows]
                if prices:
                    median = statistics.median(prices)
                    min_allowed = 0.1 * median
                    max_allowed = 10.0 * median
                    if log.price_etb < min_allowed or log.price_etb > max_allowed:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Price {log.price_etb:.1f} ETB is an anomaly. Must be between {min_allowed:.1f} and {max_allowed:.1f} ETB (based on 30-day median)."
                        )
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Security] Server-side price validation skipped/failed: {e}")

    for alert in req.alerts:
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


# ── New /suggest endpoint ──────────────────────────────────────────────────────

class SuggestRequest(BaseModel):
    viewed_item_ids:    List[str]
    user_neighbourhood: Optional[str] = None

class AlertSuggestion(BaseModel):
    item_id:         str
    item_name:       str
    item_emoji:      str
    direction:       str
    suggested_price: float
    reason:          str

class SuggestResponse(BaseModel):
    suggestions: List[AlertSuggestion]

@router.post("/suggest", response_model=SuggestResponse)
async def suggest_alerts(body: SuggestRequest) -> SuggestResponse:
    """
    Analyse 30-day price trends for recently-viewed items.
    Returns up to 5 smart alert suggestions sorted by price volatility.
    """
    if not body.viewed_item_ids or not SUPABASE_URL:
        return SuggestResponse(suggestions=[])

    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    ids   = ",".join(body.viewed_item_ids[:20])
    url   = (
        f"{SUPABASE_URL}/rest/v1/price_logs"
        f"?select=item_id,price_etb,logged_at,items(name,emoji)"
        f"&item_id=in.({ids})"
        f"&logged_at=gte.{since}"
        f"&order=logged_at.asc&limit=600"
    )

    try:
        async with httpx.AsyncClient(timeout=6) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            rows = resp.json()
    except Exception:
        return SuggestResponse(suggestions=[])

    item_prices: dict = defaultdict(list)
    item_meta:   dict = {}

    for r in rows:
        iid = r["item_id"]
        item_prices[iid].append(float(r["price_etb"]))
        if iid not in item_meta and r.get("items"):
            item_meta[iid] = r["items"]

    suggestions: list[AlertSuggestion] = []

    for iid, prices in item_prices.items():
        if len(prices) < 3:
            continue
        avg   = sum(prices) / len(prices)
        n     = len(prices)
        xs    = list(range(n))
        mx    = (n - 1) / 2
        denom = sum((x - mx) ** 2 for x in xs) or 1
        slope = sum((x - mx) * (p - avg) for x, p in zip(xs, prices)) / denom

        meta  = item_meta.get(iid, {})
        name  = meta.get("name", iid)
        emoji = meta.get("emoji", "🏷")

        if slope > 0.5:
            suggestions.append(AlertSuggestion(
                item_id=iid, item_name=name, item_emoji=emoji,
                direction="drop_below",
                suggested_price=round(avg * 0.95, 0),
                reason=f"Rising +{slope:.1f} ETB/log — alert when it drops",
            ))
        elif slope < -0.5:
            suggestions.append(AlertSuggestion(
                item_id=iid, item_name=name, item_emoji=emoji,
                direction="rise_above",
                suggested_price=round(avg * 1.05, 0),
                reason=f"Falling {slope:.1f} ETB/log — alert if it recovers",
            ))

    suggestions.sort(key=lambda s: abs(float(s.reason.split()[1].lstrip("+"))), reverse=True)
    return SuggestResponse(suggestions=suggestions[:5])
