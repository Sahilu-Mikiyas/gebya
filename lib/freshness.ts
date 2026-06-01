/**
 * freshness.ts — Phase 11-A
 * Determines the "age" of a price log and returns color + staleness flag.
 *
 * Age bands:
 *   < 2 hours   → fresh   (#39FF14 neon green, glowing)
 *   < 24 hours  → recent  (#22C55E green)
 *   1–3 days    → aging   (#F59E0B amber)
 *   3+ days     → stale   (#444444 grey, price should show strikethrough)
 */

export type FreshnessLevel = 'fresh' | 'recent' | 'aging' | 'stale';

const TWO_HOURS  = 2   * 60 * 60 * 1000;
const ONE_DAY    = 24  * 60 * 60 * 1000;
const THREE_DAYS = 3   * 24 * 60 * 60 * 1000;

export function getFreshnessLevel(loggedAt: string): FreshnessLevel {
  const age = Date.now() - new Date(loggedAt).getTime();
  if (age < TWO_HOURS)  return 'fresh';
  if (age < ONE_DAY)    return 'recent';
  if (age < THREE_DAYS) return 'aging';
  return 'stale';
}

export function getFreshnessColor(level: FreshnessLevel): string {
  switch (level) {
    case 'fresh':  return '#39FF14';   // neon green
    case 'recent': return '#22C55E';   // green
    case 'aging':  return '#F59E0B';   // amber
    case 'stale':  return '#444444';   // dim grey
  }
}

export function isStale(loggedAt: string): boolean {
  return getFreshnessLevel(loggedAt) === 'stale';
}
