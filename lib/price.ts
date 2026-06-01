/**
 * Price Normalization utility helper — Phase 14-D
 */
export function normalizePrice(price: number, unit: string): string {
  if (unit === 'kg') {
    return `= ${(price / 10).toFixed(2)} ETB / 100g`;
  }
  return `= ${price.toFixed(2)} ETB / ${unit}`;
}
