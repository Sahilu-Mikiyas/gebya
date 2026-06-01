/**
 * FeedRow — Phase 4 + Phase 11 upgrades
 * Community log row for the Home feed.
 *
 * Phase 11 additions:
 *  - FreshnessDot (11-A): colour-coded age indicator
 *  - Attribution (11-E): "by @username · 22 min ago" using formatRelativeTime
 */
import { View, Text, StyleSheet } from 'react-native';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import FreshnessDot from '@/components/FreshnessDot';
import { formatRelativeTime } from '@/lib/time';
import { isStale } from '@/lib/freshness';

export interface FeedEntry {
  id:            string;
  item_name:     string;
  item_emoji:    string;
  item_category: CategoryKey;
  market_name:   string;
  price_etb:     number;
  item_unit:     string;
  logged_at:     string;
  display_name:  string | null;
  is_anomaly:    boolean;
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function FeedRow({ entry }: { entry: FeedEntry }) {
  const catColor   = categoryColor(entry.item_category);
  const username   = entry.display_name ?? 'Anonymous';
  const stale      = isStale(entry.logged_at);

  return (
    <View style={styles.row}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(entry.display_name)}</Text>
      </View>

      {/* Content */}
      <View style={styles.body}>
        <Text style={styles.logLine} numberOfLines={1}>
          <Text style={styles.username}>@{username}</Text>
          {'  logged  '}
          <Text style={styles.item}>{entry.item_emoji} {entry.item_name}</Text>
        </Text>
        {/* 11-E: attribution line */}
        <Text style={styles.meta} numberOfLines={1}>
          {`🏪 ${entry.market_name} · ${formatRelativeTime(entry.logged_at)}`}
        </Text>
      </View>

      {/* Right: price + freshness dot */}
      <View style={styles.right}>
        <View style={styles.priceRow}>
          {/* 11-A: freshness dot */}
          <FreshnessDot loggedAt={entry.logged_at} size={7} />
          <Text style={[
            styles.price,
            { color: entry.is_anomaly ? Colors.flagged : catColor },
            stale && styles.stalePrice,
          ]}>
            {entry.price_etb.toFixed(0)}
            <Text style={styles.priceUnit}> ETB</Text>
          </Text>
        </View>
        {entry.is_anomaly ? (
          <View style={[styles.badge, { backgroundColor: Colors.flagged + '20', borderColor: Colors.flagged + '40' }]}>
            <Text style={[styles.badgeText, { color: Colors.flagged }]}>⚠ Flag</Text>
          </View>
        ) : (
          <View style={[styles.badge, { backgroundColor: catColor + '18', borderColor: catColor + '35' }]}>
            <Text style={[styles.badgeText, { color: catColor }]}>{entry.item_category}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: Colors.s1,
    borderRadius:    14,
    padding:         12,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  avatar: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: Colors.s3,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  avatarText: { fontSize: 11, fontWeight: '800', color: Colors.t3 },

  body:     { flex: 1, minWidth: 0, gap: 3 },
  logLine:  { fontSize: 12, color: Colors.t2, lineHeight: 16 },
  username: { fontWeight: '800', color: Colors.t1 },
  item:     { fontWeight: '700' },
  meta:     { fontSize: 10, color: Colors.t5 },

  right:      { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  priceRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  price:      { fontSize: 14, fontWeight: '900', letterSpacing: -0.3 },
  stalePrice: { textDecorationLine: 'line-through', opacity: 0.5 },
  priceUnit:  { fontSize: 10, fontWeight: '600', color: Colors.t5 },
  badge:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  badgeText:  { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
});
