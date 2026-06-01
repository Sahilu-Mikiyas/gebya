/**
 * BestDealCard — Phase 4
 * Shows the single cheapest price across all items & markets.
 * Placed at the top of the Home feed between the header and category chips.
 */
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { Colors } from '@/constants/colors';
import { categoryColor, CategoryKey } from '@/constants/colors';

export interface DealItem {
  item_id:         string;
  item_name:       string;
  item_emoji:      string;
  item_category:   CategoryKey;
  item_unit:       string;
  market_name:     string;
  market_sub_city: string;
  price_etb:       number;
  avg_price:       number;      // community average for savings %
  logged_at:       string;
  confirmed_count: number;
}

interface Props {
  deal: DealItem;
  onPress:     () => void;
  onAddToList: () => void;
}

function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

import { Fonts } from '@/constants/fonts';
import { normalizePrice } from '@/lib/price';

export default function BestDealCard({ deal, onPress, onAddToList }: Props) {
  const catColor = categoryColor(deal.item_category);
  const saving   = deal.avg_price > 0
    ? Math.round(((deal.avg_price - deal.price_etb) / deal.avg_price) * 100)
    : 0;

  // Subtle pulse on the ⚡ chip
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.82}
      onPress={onPress}
    >
      {/* Glow orb */}
      <View style={[styles.glow, { backgroundColor: catColor + '20' }]} />

      {/* Top row: deal chip + confirm badge */}
      <View style={styles.topRow}>
        <Animated.View style={[styles.dealChip, { transform: [{ scale: pulse }] }]}>
          <Text style={styles.dealChipText}>⚡ Best Deal Right Now</Text>
        </Animated.View>
        {deal.confirmed_count > 0 && (
          <View style={styles.confirmBadge}>
            <Text style={styles.confirmText}>✓ {deal.confirmed_count}</Text>
          </View>
        )}
      </View>

      {/* Item name + emoji */}
      <View style={styles.itemRow}>
        <Text style={styles.emoji}>{deal.item_emoji}</Text>
        <Text style={styles.itemName} numberOfLines={1}>{deal.item_name}</Text>
      </View>

      {/* Price row */}
      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: catColor }]}>
          {deal.price_etb.toFixed(0)} ETB
        </Text>
        <Text style={styles.unit}>/{deal.item_unit}</Text>
        {saving > 5 && (
          <View style={styles.savingBadge}>
            <Text style={styles.savingText}>−{saving}%</Text>
          </View>
        )}
        {deal.avg_price > 0 && saving > 0 && (
          <Text style={styles.avgStrike}>
            avg {deal.avg_price.toFixed(0)}
          </Text>
        )}
      </View>

      {/* Normalized Price */}
      <Text style={styles.normalizedText}>
        {normalizePrice(deal.price_etb, deal.item_unit)}
      </Text>

      {/* Market + time */}
      <Text style={styles.meta}>
        📍 {deal.market_name} · {deal.market_sub_city} · {timeAgo(deal.logged_at)}
      </Text>

      {/* Add to list CTA */}
      <TouchableOpacity style={styles.addBtn} onPress={onAddToList} activeOpacity={0.8}>
        <Text style={styles.addBtnText}>Add to Shopping List →</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(34,197,94,0.06)',
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     'rgba(34,197,94,0.25)',
    padding:         18,
    marginHorizontal:16,
    marginBottom:    12,
    gap:             8,
    overflow:        'hidden',
  },
  glow: {
    position:     'absolute',
    top:          -30,
    right:        -30,
    width:        130,
    height:       130,
    borderRadius: 65,
  },

  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dealChip:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,212,255,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)' },
  dealChipText:{ fontSize: 10, fontWeight: '800', color: Colors.deal, letterSpacing: 0.3 },
  confirmBadge:{ backgroundColor: 'rgba(57,255,20,0.15)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(57,255,20,0.3)' },
  confirmText: { fontSize: 10, fontWeight: '800', color: Colors.verified },

  itemRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  emoji:    { fontSize: 24 },
  itemName: { fontSize: 18, fontWeight: '900', color: Colors.t1, flex: 1, letterSpacing: -0.4 },

  priceRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price:       { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  unit:        { fontSize: 13, color: Colors.t5, fontWeight: '600' },
  savingBadge: { backgroundColor: Colors.veggie + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.veggie + '40' },
  savingText:  { fontSize: 11, fontWeight: '800', color: Colors.veggie },
  avgStrike:   { fontSize: 12, color: Colors.t5, textDecorationLine: 'line-through' },

  normalizedText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.t3,
    marginTop: 2,
    marginBottom: 2,
  },

  meta: { fontSize: 11, color: Colors.t5, marginTop: 2 },

  addBtn:     { backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 10, padding: 11, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
  addBtnText: { fontSize: 13, fontWeight: '800', color: Colors.veggie },
});
