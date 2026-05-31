"""
Phase 9 — Store Comparison Endpoint
POST /compare/stores

Given a list of item IDs and a set of market IDs, returns a
side-by-side price comparison matrix:
  - For each item × market, the latest price
  - Total basket cost per market
  - Ranked from cheapest to most expensive basket

GET /compare/items?item_id=uuid
  Returns all markets that have logged this item in the last 30 days,
  ordered by cheapest price.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional, Dict
import httpx
import os
from datetime import datetime, timedelta, timezone

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


# ── Models ─────────────────────────────────────────────────────────────────────

class CompareRequest(BaseModel):
    item_ids:   List[str]
    market_ids: Optional[List[str]] = None   # None = all markets that have data

class PriceCell(BaseModel):
    item_id:     str
    market_id:   str
    price_etb:   float
    logged_at:   str
    log_count:   int

class MarketColumn(BaseModel):
    market_id:   str
    market_name: str
    sub_city:    str
    total:       float           # basket total for this market
    rank:        int             # 1 = cheapest basket
    cells:       List[PriceCell] # one per requested item (may be missing)

class CompareResponse(BaseModel):
    markets:        List[MarketColumn]   # sorted cheapest first
    item_names:     Dict[str, str]       # item_id → name
    item_emojis:    Dict[str, str]       # item_id → emoji
    cheapest_market:str                  # market_id of cheapest basket
    cheapest_per_item: Dict[str, str]    # item_id → market_id of cheapest store for this item

class ItemMarketRow(BaseModel):
    market_id:   str
    market_name: str
    sub_city:    str
    price_etb:   float
    logged_at:   str
    log_count:   int
    savings_pct: float   # vs most expensive

class ItemCompareResponse(BaseModel):
    item_id:   str
    item_name: str
    item_emoji:str
    markets:   List[ItemMarketRow]   # sorted cheapest first


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _sb_get(path: str) -> list:
    """Generic authenticated Supabase REST GET."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=headers)
            r.raise_for_status()
            return r.json()
    except Exception:
        return []


# ── POST /compare/stores ───────────────────────────────────────────────────────

@router.post("/stores", response_model=CompareResponse)
async def compare_stores(body: CompareRequest) -> CompareResponse:
    """
    Compare basket prices across all markets (or a specified subset).
    Uses the latest_prices view for fresh data.
    """
    ids_filter = ",".join(body.item_ids)
    path       = (
        f"latest_prices"
        f"?select=item_id,market_id,market_name,price_etb,logged_at,log_count,sub_city,items(name,emoji)"
        f"&item_id=in.({ids_filter})"
    )
    if body.market_ids:
        path += f"&market_id=in.({','.join(body.market_ids)})"

    rows = await _sb_get(path)

    # Build lookup structures
    item_names:  Dict[str, str] = {}
    item_emojis: Dict[str, str] = {}
    # market_id → { market_name, sub_city, cells: {item_id → PriceCell} }
    markets_map: Dict[str, dict] = {}

    for r in rows:
        iid = r["item_id"]
        mid = r["market_id"]

        if iid not in item_names and r.get("items"):
            item_names[iid]  = r["items"]["name"]
            item_emojis[iid] = r["items"]["emoji"]

        if mid not in markets_map:
            markets_map[mid] = {
                "market_name": r.get("market_name", ""),
                "sub_city":    r.get("sub_city",    ""),
                "cells":       {},
            }
        markets_map[mid]["cells"][iid] = PriceCell(
            item_id=   iid,
            market_id= mid,
            price_etb= float(r["price_etb"]),
            logged_at= r.get("logged_at", ""),
            log_count= int(r.get("log_count", 0)),
        )

    # Build sorted market columns
    columns: List[MarketColumn] = []
    for mid, mdata in markets_map.items():
        cells = list(mdata["cells"].values())
        total = sum(c.price_etb for c in cells)
        columns.append(MarketColumn(
            market_id=   mid,
            market_name= mdata["market_name"],
            sub_city=    mdata["sub_city"],
            total=        total,
            rank=         0,      # set below
            cells=        cells,
        ))

    # Calculate cheapest market per item
    cheapest_per_item: Dict[str, str] = {}
    item_cheapest_tracker: Dict[str, float] = {}
    for r in rows:
        iid = r["item_id"]
        mid = r["market_id"]
        price = float(r["price_etb"])
        if iid not in item_cheapest_tracker or price < item_cheapest_tracker[iid]:
            item_cheapest_tracker[iid] = price
            cheapest_per_item[iid] = mid

    columns.sort(key=lambda c: c.total)
    cheapest_id = columns[0].market_id if columns else ""
    for i, col in enumerate(columns):
        col.rank = i + 1

    return CompareResponse(
        markets=         columns,
        item_names=      item_names,
        item_emojis=     item_emojis,
        cheapest_market= cheapest_id,
        cheapest_per_item= cheapest_per_item,
    )


# ── GET /compare/items?item_id=uuid ───────────────────────────────────────────

@router.get("/items", response_model=ItemCompareResponse)
async def compare_item_across_markets(
    item_id: str = Query(..., description="Item UUID to compare"),
) -> ItemCompareResponse:
    """
    Return all markets that have price data for this item, sorted cheapest first.
    """
    rows = await _sb_get(
        f"latest_prices"
        f"?select=market_id,market_name,sub_city,price_etb,logged_at,log_count,items(name,emoji)"
        f"&item_id=eq.{item_id}"
        f"&order=price_etb.asc"
    )

    if not rows:
        return ItemCompareResponse(
            item_id=item_id, item_name="Unknown", item_emoji="🏷", markets=[]
        )

    item_name  = rows[0]["items"]["name"]  if rows[0].get("items") else "Unknown"
    item_emoji = rows[0]["items"]["emoji"] if rows[0].get("items") else "🏷"

    prices = [float(r["price_etb"]) for r in rows]
    max_p  = max(prices) if prices else 1

    markets = [
        ItemMarketRow(
            market_id=   r["market_id"],
            market_name= r["market_name"],
            sub_city=    r.get("sub_city", ""),
            price_etb=   float(r["price_etb"]),
            logged_at=   r.get("logged_at", ""),
            log_count=   int(r.get("log_count", 0)),
            savings_pct= round((max_p - float(r["price_etb"])) / max_p * 100, 1),
        )
        for r in rows
    ]

    return ItemCompareResponse(
        item_id=item_id, item_name=item_name, item_emoji=item_emoji, markets=markets
    )
