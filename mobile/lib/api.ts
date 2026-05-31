/**
 * Gebya FastAPI client
 */
import Constants from 'expo-constants';

const BASE = (
  Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'
) as string;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShoppingItem {
  item_id:   string;
  item_name: string;
  qty:       number;
}

export interface MarketPriceInput {
  market_id:   string;
  market_name: string;
  item_id:     string;
  price_etb:   number;
}

export interface OptimizeRequest {
  shopping_list: ShoppingItem[];
  prices:        MarketPriceInput[];
  trip_penalty?: number;   // default 20 ETB
  max_markets?:  number;   // default 3
}

export interface MarketLeg {
  market_id:   string;
  market_name: string;
  items: {
    item_id:   string;
    item_name: string;
    qty:       number;
    price_etb: number;
    subtotal:  number;
  }[];
  subtotal: number;
}

export interface OptimizeResponse {
  single_best:    MarketLeg | null;
  split:          MarketLeg[];
  total_single:   number;
  total_split:    number;
  savings:        number;
  extra_trips:    number;
  recommendation: 'single' | 'split';
}

// ── Calls ─────────────────────────────────────────────────────────────────────

export async function optimizeSplit(req: OptimizeRequest): Promise<OptimizeResponse> {
  const res = await fetch(`${BASE}/optimizer/split`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(req),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Optimizer error ${res.status}: ${msg}`);
  }
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
