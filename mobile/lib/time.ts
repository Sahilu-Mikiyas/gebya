/**
 * time.ts — Phase 11-E
 * Relative time formatting utility for community log attribution.
 *
 * Examples:
 *   formatRelativeTime('2024-01-01T10:00:00Z') → "22 min ago"
 *   formatRelativeTime('2024-01-01T08:00:00Z') → "2 hours ago"
 *   formatRelativeTime('2023-12-29T10:00:00Z') → "3 days ago"
 */

export function formatRelativeTime(isoDate: string): string {
  const diff  = Date.now() - new Date(isoDate).getTime();
  const secs  = Math.floor(diff / 1_000);
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (secs  < 60)  return 'just now';
  if (mins  < 60)  return `${mins} min ago`;
  if (hours < 24)  return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days  < 7)   return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (days  < 30)  return `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? 's' : ''} ago`;
  return new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
