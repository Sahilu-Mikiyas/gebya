"""
Phase 10-C — FastAPI Push Notification Sender
POST /push/send

Sends one or more Expo push notifications via the Expo Push API.
Called by the alert check flow when an alert is triggered.

POST /push/send
{
  "notifications": [
    {
      "to":    "ExponentPushToken[...]",
      "title": "Price Alert!",
      "body":  "Tomatoes dropped to 45 ETB at Merkato 🎉",
      "data":  { "alertId": "...", "itemId": "...", "marketId": "..." }
    }
  ]
}
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import httpx

router = APIRouter()

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


# ── Models ─────────────────────────────────────────────────────────────────────

class PushMessage(BaseModel):
    to:       str
    title:    str
    body:     str
    data:     Optional[Dict[str, Any]] = None
    sound:    str = "default"
    badge:    Optional[int] = None
    priority: str = "high"

class SendRequest(BaseModel):
    notifications: List[PushMessage]

class PushTicket(BaseModel):
    status:  str
    id:      Optional[str] = None
    message: Optional[str] = None

class SendResponse(BaseModel):
    tickets: List[PushTicket]


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/send", response_model=SendResponse)
async def send_push_notifications(req: SendRequest) -> SendResponse:
    """
    Batch send Expo push notifications.
    Expo recommends batches of ≤ 100 per request.
    """
    if not req.notifications:
        return SendResponse(tickets=[])

    # Chunk into ≤100 per Expo limit
    all_tickets: list[PushTicket] = []
    chunks = [req.notifications[i:i+100] for i in range(0, len(req.notifications), 100)]

    async with httpx.AsyncClient(timeout=10) as client:
        for chunk in chunks:
            payload = [n.model_dump(exclude_none=True) for n in chunk]
            try:
                resp = await client.post(
                    EXPO_PUSH_URL,
                    json=payload,
                    headers={
                        "Content-Type":  "application/json",
                        "Accept":        "application/json",
                        "Accept-Encoding": "gzip, deflate",
                    },
                )
                resp.raise_for_status()
                data = resp.json().get("data", [])
                for t in data:
                    all_tickets.append(PushTicket(
                        status=  t.get("status", "error"),
                        id=      t.get("id"),
                        message= t.get("message"),
                    ))
            except Exception as e:
                # Return error ticket for entire chunk
                all_tickets.extend([
                    PushTicket(status="error", message=str(e))
                    for _ in chunk
                ])

    return SendResponse(tickets=all_tickets)


# ── Helper: alert-triggered push builder ──────────────────────────────────────

def build_alert_push(
    push_token:    str,
    item_name:     str,
    item_emoji:    str,
    price_etb:     float,
    target_price:  float,
    direction:     str,
    alert_id:      str,
    item_id:       str,
    market_id:     str,
    market_name:   str,
) -> PushMessage:
    """Build a PushMessage for a triggered price alert."""
    if direction == "drop_below":
        title = f"💰 Price Drop! {item_emoji} {item_name}"
        body  = (
            f"{item_name} is now {price_etb:.0f} ETB at {market_name} "
            f"(your target was {target_price:.0f} ETB) 🎉"
        )
    else:
        title = f"📈 Price Rise! {item_emoji} {item_name}"
        body  = (
            f"{item_name} rose to {price_etb:.0f} ETB at {market_name} "
            f"(above your {target_price:.0f} ETB alert)"
        )

    return PushMessage(
        to=    push_token,
        title= title,
        body=  body,
        data=  {
            "alertId":  alert_id,
            "itemId":   item_id,
            "marketId": market_id,
            "screen":   "alert-triggered",
        },
    )
