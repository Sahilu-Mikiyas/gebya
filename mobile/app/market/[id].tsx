import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SkeletonBox,
  SkeletonDealRow,
  SkeletonText,
} from '@/components/Skeleton';
import FreshnessDot from '@/components/FreshnessDot';
import { isStale } from '@/lib/freshness';
import { formatRelativeTime } from '@/lib/time';
import { Fonts } from '@/constants/fonts';
import { normalizePrice } from '@/lib/price';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Market {
  id: string;
  name: string;
  sub_city: string;
  is_active: boolean;
}

interface PriceRow {
  id:            string;
  item_id:       string;
  item_name:     string;
  item_emoji:    string;
  item_category: CategoryKey;
  item_unit:     string;
  price_etb:     number;
  logged_at:     string;
  confirmed_count: number;
  is_anomaly:    boolean;
}

interface WeekStats {
  log_count: number;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────
async function fetchMarket(id: string): Promise<Market> {
  const { data, error } = await supabase
    .from('markets')
    .select('id, name, sub_city, is_active')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function fetchMarketPrices(id: string): Promise<PriceRow[]> {
  const { data, error } = await supabase
    .from('latest_prices')
    .select('*')
    .eq('market_id', id)
    .order('price_etb', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchWeekLogCount(marketId: string): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('price_logs')
    .select('id', { count: 'exact', head: true })
    .eq('market_id', marketId)
    .gte('logged_at', weekAgo);
  if (error) return 0;
  return count ?? 0;
}

async function fetchMarketRank(marketId: string): Promise<number | null> {
  const { data } = await supabase
    .from('market_value_rank')
    .select('rank')
    .eq('market_id', marketId)
    .maybeSingle();
  return (data as any)?.rank ?? null;
}

// ── Category filter ───────────────────────────────────────────────────────────
const CATS = [
  { key: 'all',     label: 'All'     },
  { key: 'veggie',  label: '🥬 Veg'  },
  { key: 'grain',   label: '🌾 Grain' },
  { key: 'protein', label: '🥩 Protein' },
  { key: 'oil',     label: '🫙 Oil'  },
  { key: 'dairy',   label: '🥛 Dairy' },
  { key: 'spice',   label: '🌶 Spice' },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────
export default function MarketDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const [activeCat, setActiveCat] = useState('all');

  const {
    data: market,
    isLoading: loadingMarket,
  } = useQuery({
    queryKey: ['market', id],
    queryFn:  () => fetchMarket(id!),
    enabled:  !!id,
  });

  const {
    data: prices = [],
    isLoading: loadingPrices,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['market-prices', id],
    queryFn:  () => fetchMarketPrices(id!),
    enabled:  !!id,
  });

  const { data: weekCount = 0 } = useQuery({
    queryKey: ['market-week-count', id],
    queryFn:  () => fetchWeekLogCount(id!),
    enabled:  !!id,
  });

  const { data: marketRank } = useQuery({
    queryKey: ['market-rank', id],
    queryFn:  () => fetchMarketRank(id!),
    enabled:  !!id,
    staleTime: 5 * 60_000,
  });

  const filtered = activeCat === 'all'
    ? prices
    : prices.filter((p) => p.item_category === activeCat);

  const isLoading = loadingMarket || loadingPrices;

  // Cheapest item for the "rank" stat
  const cheapestCount = prices.filter((p, i) => {
    // count items where this market has the overall cheapest price
    // (simplified: items flagged as cheapest)
    return !p.is_anomaly;
  }).length;

  const renderPrice = ({ item }: { item: PriceRow }) => {
    const catColor = categoryColor(item.item_category);
    const isCheap  = item === prices[0];
    const stale    = isStale(item.logged_at);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => router.push(`/item/${item.item_id}` as any)}
      >
        <Text style={styles.rowEmoji}>{item.item_emoji}</Text>
        <View style={styles.rowBody}>
          <Text style={styles.rowName}>{item.item_name}</Text>
          {/* 11-E: time attribution */}
          <Text style={styles.rowUnit}>
            {`per ${item.item_unit} · ${formatRelativeTime(item.logged_at)}`}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <View style={styles.priceRow}>
            {/* 11-A: freshness dot */}
            <FreshnessDot loggedAt={item.logged_at} size={7} />
            <Text style={[
              styles.rowPrice,
              { color: catColor },
              stale && { textDecorationLine: 'line-through', opacity: 0.5 },
            ]}>
              {`${item.price_etb.toFixed(0)} ETB`}
            </Text>
          </View>
          <Text style={styles.rowPriceNormalized}>
            {normalizePrice(item.price_etb, item.item_unit)}
          </Text>
          {isCheap && (
            <View style={styles.cheapBadge}>
              <Text style={styles.cheapText}>Cheapest</Text>
            </View>
          )}
          {item.is_anomaly && (
            <View style={[styles.cheapBadge, { backgroundColor: Colors.flagged + '25', borderColor: Colors.flagged + '50' }]}>
              <Text style={[styles.cheapText, { color: Colors.flagged }]}>⚠ Flag</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          {isLoading
            ? <SkeletonText width="60%" style={{ height: 20 }} />
            : <Text style={styles.marketName}>{market?.name ?? '—'}</Text>
          }
          {isLoading
            ? <SkeletonText width="40%" style={{ marginTop: 4 }} />
            : <Text style={styles.marketSub}>{market?.sub_city ?? ''}</Text>
          }
        </View>
        {market?.is_active && (
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Active</Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          {isLoading
            ? <SkeletonBox width={40} height={24} borderRadius={6} />
            : <Text style={styles.statNum}>{prices.length}</Text>
          }
          <Text style={styles.statLabel}>Items{'\n'}Tracked</Text>
        </View>
        <View style={styles.statBox}>
          {isLoading
            ? <SkeletonBox width={40} height={24} borderRadius={6} />
            : <Text style={[styles.statNum, { color: Colors.deal }]}>{weekCount}</Text>
          }
          <Text style={styles.statLabel}>Logs This{'\n'}Week</Text>
        </View>
        <View style={styles.statBox}>
          {isLoading
            ? <SkeletonBox width={40} height={24} borderRadius={6} />
            : <Text style={[styles.statNum, { color: Colors.veggie }]}>
                {marketRank != null ? `#${marketRank}` : '—'}
              </Text>
          }
          <Text style={styles.statLabel}>Best Value{'\n'}Rank</Text>
        </View>
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catRow}
      >
        {CATS.map((c) => {
          const active = activeCat === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.catChip, active && styles.catChipOn]}
              onPress={() => setActiveCat(c.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.catLabel, active && styles.catLabelOn]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Section title */}
      <Text style={styles.sectionTitle}>
        Current Prices · {market?.name ?? ''}
      </Text>

      {/* Price list */}
      {isLoading ? (
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => <SkeletonDealRow key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderPrice}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.veggie} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>No prices yet</Text>
              <Text style={styles.emptySub}>Be the first to log a price here!</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      {/* CTA */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.ctaBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)' as any)}
        >
          <Text style={styles.ctaBtnText}>Log a Price at {market?.name ?? 'this market'} ↗</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  backBtn:    { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.s2, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  backIcon:   { fontSize: 16, color: Colors.t2 },
  headerInfo: { flex: 1 },
  marketName: { fontSize: 20, fontWeight: '800', color: Colors.t1, letterSpacing: -0.4 },
  marketSub:  { fontSize: 11, color: Colors.t5, marginTop: 2 },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(57,255,20,0.08)', borderWidth: 1, borderColor: 'rgba(57,255,20,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  activeDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.verified },
  activeText: { fontSize: 10, fontWeight: '800', color: Colors.verified },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  statBox:  { flex: 1, backgroundColor: Colors.s1, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 4 },
  statNum:  { fontSize: 20, fontWeight: '900', color: Colors.t1 },
  statLabel:{ fontSize: 9, fontWeight: '700', color: Colors.t5, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

  // Categories
  catRow:      { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row' },
  catChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, borderWidth: 1, borderColor: Colors.border, backgroundColor: 'transparent' },
  catChipOn:   { backgroundColor: Colors.veggie, borderColor: Colors.veggie },
  catLabel:    { fontSize: 12, fontWeight: '700', color: Colors.t4 },
  catLabelOn:  { color: Colors.bg },

  // Section title
  sectionTitle: { fontSize: 12, fontWeight: '800', color: Colors.t4, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, marginBottom: 8 },

  // Price rows
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  row:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.s1, padding: 13 },
  rowEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  rowBody:  { flex: 1 },
  rowName:  { fontSize: 13, fontWeight: '700', color: Colors.t1 },
  rowUnit:  { fontSize: 10, color: Colors.t5, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowPrice: { fontSize: 15, fontWeight: '900' },
  rowPriceNormalized: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    color: Colors.t4,
    marginTop: 1,
    textAlign: 'right',
  },
  cheapBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: Colors.veggie + '25', borderWidth: 1, borderColor: Colors.veggie + '50' },
  cheapText:  { fontSize: 8, fontWeight: '800', color: Colors.veggie },
  sep:        { height: 1, backgroundColor: Colors.border2 },

  // Empty
  empty:      { alignItems: 'center', padding: 40, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.t2 },
  emptySub:   { fontSize: 13, color: Colors.t5, textAlign: 'center' },

  // CTA
  ctaWrap:   { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border },
  ctaBtn:    { backgroundColor: Colors.veggie, borderRadius: 14, padding: 16, alignItems: 'center' },
  ctaBtnText:{ fontSize: 14, fontWeight: '800', color: Colors.bg },
});
