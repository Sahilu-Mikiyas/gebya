"""
Split Shopping Optimizer
────────────────────────
Given a shopping list and a dict of market→item→price, find the cheapest
single-market plan and whether splitting across 2–3 markets saves money
after accounting for a per-extra-trip penalty (default 20 ETB).

POST /optimizer/split
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter()


# ── Request / Response models ────────────────────────────────────────────────

class ShoppingItem(BaseModel):
    item_id:  str
    item_name: str
    qty:      float = 1.0


class MarketPrice(BaseModel):
    market_id:   str
    market_name: str
    item_id:     str
    price_etb:   float


class OptimizeRequest(BaseModel):
    shopping_list: list[ShoppingItem]
    prices:        list[MarketPrice]       # all available prices for list items
    trip_penalty:  float = Field(20.0, description="Extra trip cost in ETB")
    max_markets:   int   = Field(3,    description="Max markets to include in split")


class MarketLeg(BaseModel):
    market_id:   str
    market_name: str
    items:       list[dict]   # [{item_id, item_name, qty, price_etb, subtotal}]
    subtotal:    float


class OptimizeResponse(BaseModel):
    single_best: Optional[MarketLeg]
    split:       list[MarketLeg]
    total_single:  float
    total_split:   float
    savings:       float          # positive = split wins
    extra_trips:   int
    recommendation: str           # "single" | "split"


# ── Core algorithm ───────────────────────────────────────────────────────────

def _build_price_map(prices: list[MarketPrice]) -> dict:
    """
    Returns: {item_id: {market_id: (price_etb, market_name)}}
    """
    pm: dict = {}
    for p in prices:
        pm.setdefault(p.item_id, {})[p.market_id] = (p.price_etb, p.market_name)
    return pm


def _cheapest_market_for_item(item_id: str, price_map: dict) -> tuple | None:
    """Returns (market_id, market_name, price_etb) or None."""
    options = price_map.get(item_id)
    if not options:
        return None
    best = min(options.items(), key=lambda kv: kv[1][0])
    return (best[0], best[1][1], best[1][0])


def _single_best(
    shopping_list: list[ShoppingItem],
    price_map: dict,
) -> tuple[str | None, str | None, dict, float]:
    """
    Find single market that minimises total basket cost.
    Returns (market_id, market_name, {item_id: price}, total).
    """
    # Collect all markets that can supply at least one item
    all_markets: set[str] = set()
    for imap in price_map.values():
        all_markets.update(imap.keys())

    best_market_id   = None
    best_market_name = None
    best_total       = float("inf")
    best_prices      = {}

    for mid in all_markets:
        total = 0.0
        item_prices = {}
        for si in shopping_list:
            imap = price_map.get(si.item_id, {})
            if mid in imap:
                p, _ = imap[mid]
                total += p * si.qty
                item_prices[si.item_id] = p
            else:
                # Market can't supply this item — use cheapest elsewhere (no trip penalty here)
                best_alt = _cheapest_market_for_item(si.item_id, price_map)
                if best_alt:
                    total += best_alt[2] * si.qty
                    item_prices[si.item_id] = best_alt[2]
                # If no price at all, skip item from cost (handled gracefully)

        if total < best_total:
            best_total       = total
            best_market_id   = mid
            best_market_name = next(iter(price_map.values()))[mid][1] if mid in next(iter(price_map.values()), {}) else mid
            # Re-derive market_name cleanly
            for imap in price_map.values():
                if mid in imap:
                    best_market_name = imap[mid][1]
                    break
            best_prices = item_prices

    return best_market_id, best_market_name, best_prices, best_total


def _greedy_split(
    shopping_list: list[ShoppingItem],
    price_map: dict,
    trip_penalty: float,
    max_markets: int,
    base_market_id: str,
    base_prices: dict,
    base_total: float,
) -> list[tuple[str, str, list[ShoppingItem]]]:
    """
    Greedy: for each additional candidate market, compute savings vs base.
    Add market to split if savings > trip_penalty.
    Returns list of (market_id, market_name, [items to buy there]).
    """
    # Which items go to the base market initially
    assignment: dict[str, str] = {si.item_id: base_market_id for si in shopping_list}
    current_prices: dict[str, float] = dict(base_prices)

    splits: list[tuple[str, str, list]] = []
    trips_added = 0

    # Collect candidate markets (excluding base)
    candidate_markets: set[str] = set()
    for imap in price_map.values():
        candidate_markets.update(imap.keys())
    candidate_markets.discard(base_market_id)

    while trips_added < max_markets - 1 and candidate_markets:
        best_cand    = None
        best_savings = trip_penalty  # must beat penalty to be worth it
        best_reassign: dict[str, str]   = {}
        best_new_prices: dict[str, float] = {}

        for cand_id in candidate_markets:
            reassign    = {}
            new_prices  = dict(current_prices)
            cand_savings = 0.0

            for si in shopping_list:
                imap = price_map.get(si.item_id, {})
                if cand_id in imap:
                    cand_price = imap[cand_id][0]
                    cur_price  = current_prices.get(si.item_id, float("inf"))
                    saved = (cur_price - cand_price) * si.qty
                    if saved > 0:
                        cand_savings      += saved
                        reassign[si.item_id] = cand_id
                        new_prices[si.item_id] = cand_price

            if cand_savings > best_savings:
                best_savings  = cand_savings
                best_cand     = cand_id
                best_reassign = reassign
                best_new_prices = new_prices

        if best_cand is None:
            break

        # Commit this candidate
        assignment.update(best_reassign)
        current_prices.update(best_new_prices)
        candidate_markets.discard(best_cand)

        # Find market name
        cand_name = best_cand
        for imap in price_map.values():
            if best_cand in imap:
                cand_name = imap[best_cand][1]
                break

        items_at_cand = [si for si in shopping_list if best_reassign.get(si.item_id) == best_cand]
        splits.append((best_cand, cand_name, items_at_cand))
        trips_added += 1

    return splits, assignment, current_prices


# ── Route ────────────────────────────────────────────────────────────────────

@router.post("/split", response_model=OptimizeResponse)
def optimize_split(req: OptimizeRequest) -> OptimizeResponse:
    price_map = _build_price_map(req.prices)

    # 1. Find single-best market
    base_id, base_name, base_prices, base_total = _single_best(req.shopping_list, price_map)

    if base_id is None:
        return OptimizeResponse(
            single_best=None, split=[], total_single=0, total_split=0,
            savings=0, extra_trips=0, recommendation="single",
        )

    # Build single-best leg
    single_leg = MarketLeg(
        market_id=base_id,
        market_name=base_name,
        items=[
            {
                "item_id":   si.item_id,
                "item_name": si.item_name,
                "qty":       si.qty,
                "price_etb": base_prices.get(si.item_id, 0),
                "subtotal":  base_prices.get(si.item_id, 0) * si.qty,
            }
            for si in req.shopping_list
        ],
        subtotal=base_total,
    )

    # 2. Greedy split
    extra_legs, final_assignment, final_prices = _greedy_split(
        req.shopping_list, price_map,
        req.trip_penalty, req.max_markets,
        base_id, base_prices, base_total,
    )

    if not extra_legs:
        return OptimizeResponse(
            single_best=single_leg, split=[single_leg],
            total_single=base_total, total_split=base_total,
            savings=0, extra_trips=0, recommendation="single",
        )

    # Build split legs
    extra_market_ids = {leg[0] for leg in extra_legs}
    base_items_in_split = [si for si in req.shopping_list if final_assignment.get(si.item_id) == base_id]

    base_split_leg = MarketLeg(
        market_id=base_id,
        market_name=base_name,
        items=[
            {
                "item_id":   si.item_id,
                "item_name": si.item_name,
                "qty":       si.qty,
                "price_etb": final_prices.get(si.item_id, 0),
                "subtotal":  final_prices.get(si.item_id, 0) * si.qty,
            }
            for si in base_items_in_split
        ],
        subtotal=sum(final_prices.get(si.item_id, 0) * si.qty for si in base_items_in_split),
    )

    all_legs: list[MarketLeg] = [base_split_leg]
    for (cid, cname, citems) in extra_legs:
        leg = MarketLeg(
            market_id=cid,
            market_name=cname,
            items=[
                {
                    "item_id":   si.item_id,
                    "item_name": si.item_name,
                    "qty":       si.qty,
                    "price_etb": final_prices.get(si.item_id, 0),
                    "subtotal":  final_prices.get(si.item_id, 0) * si.qty,
                }
                for si in citems
            ],
            subtotal=sum(final_prices.get(si.item_id, 0) * si.qty for si in citems),
        )
        all_legs.append(leg)

    total_split = sum(final_prices.get(si.item_id, 0) * si.qty for si in req.shopping_list)
    extra_trips = len(extra_legs)
    trip_cost   = extra_trips * req.trip_penalty
    net_savings = base_total - total_split - trip_cost

    return OptimizeResponse(
        single_best=single_leg,
        split=all_legs,
        total_single=round(base_total, 2),
        total_split=round(total_split + trip_cost, 2),
        savings=round(net_savings, 2),
        extra_trips=extra_trips,
        recommendation="split" if net_savings > 0 else "single",
    )
