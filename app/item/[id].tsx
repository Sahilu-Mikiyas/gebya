/**
 * Item Detail — market price comparison + voting + anomaly + alerts + charts
 * Phase 3 + 5 + 6
 */
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, ScrollView,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StorePriceBarChart, { StoreBarData } from '@/components/StorePriceBarChart';
import PriceTrendChart, { WeekPoint } from '@/components/PriceTrendChart';
import { SkeletonStat, SkeletonBarChart, SkeletonLineChart, SkeletonDealRow } from '@/components/Skeleton';
import { Fonts } from '@/constants/fonts';
import { normalizePrice } from '@/lib/price';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ItemInfo { id: string; name: string; emoji: string; category: CategoryKey; unit: string }
interface MarketPrice {
  price_log_id: string; market_id: string; market_name: string; market_sub_city: string;
  price_etb: number; logged_at: string; confirmed_count: number; flagged_count: number; is_anomaly: boolean;
}
type VoteMap = Record<string, 'confirm' | 'flag'>;

// ── Fetchers ──────────────────────────────────────────────────────────────────
async function fetchItem(id: string): Promise<ItemInfo | null> {
  const { data } = await supabase.from('items').select('id,name,emoji,category,unit').eq('id', id).single();
  return data ?? null;
}
async function fetchPrices(itemId: string): Promise<MarketPrice[]> {
  const { data, error } = await supabase
    .from('latest_prices')
    .select('id,market_id,market_name,market_sub_city,price_etb,logged_at,confirmed_count,flagged_count,is_anomaly')
    .eq('item_id', itemId).order('price_etb', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, price_log_id: r.id }));
}
async function fetchMyVotes(ids: string[], userId: string): Promise<VoteMap> {
  if (!ids.length) return {};
  const { data } = await supabase.from('votes').select('price_log_id,vote').in('price_log_id', ids).eq('user_id', userId);
  const map: VoteMap = {};
  for (const v of data ?? []) map[v.price_log_id] = v.vote as 'confirm' | 'flag';
  return map;
}
async function fetchMarkets() {
  const { data } = await supabase.from('markets').select('id,name').eq('is_active', true).order('name');
  return data ?? [];
}
async function fetchWeeklyTrend(itemId: string): Promise<WeekPoint[]> {
  const { data, error } = await supabase
    .from('weekly_price_trend')
    .select('week_start, avg_price')
    .eq('item_id', itemId)
    .order('week_start', { ascending: true });
  if (error) return [];
  return (data ?? []) as WeekPoint[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function freshnessColor(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 12) return Colors.veggie;
  if (h < 48) return Colors.birr;
  return Colors.flagged;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ItemDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuthStore();
  const qc       = useQueryClient();
  const { showToast } = useToastStore();

  // Alert modal state
  const [alertModal,    setAlertModal]    = useState(false);
  const [alertDir,      setAlertDir]      = useState<'drop_below' | 'rise_above'>('drop_below');
  const [alertPrice,    setAlertPrice]    = useState('');
  const [alertMarketId, setAlertMarketId] = useState<string | null>(null);
  const [savingAlert,   setSavingAlert]   = useState(false);

  const { data: item,    isLoading: li } = useQuery({ queryKey: ['item', id],    queryFn: () => fetchItem(id) });
  const { data: prices,  isLoading: lp } = useQuery({ queryKey: ['prices', id],  queryFn: () => fetchPrices(id) });
  const { data: markets = [] }           = useQuery({ queryKey: ['markets'],      queryFn: fetchMarkets });
  const { data: weekTrend = [] }         = useQuery({
    queryKey: ['weekly-trend', id],
    queryFn:  () => fetchWeeklyTrend(id!),
    enabled:  !!id,
  });

  const { data: stats30d } = useQuery({
    queryKey: ['item-stats-30d', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('item_price_stats', { p_item_id: id });
      if (error) {
        console.warn('[item_price_stats] RPC failed:', error.message);
        return null;
      }
      return data?.[0] as { min_price: number; avg_price: number; max_price: number } | null;
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
  });

  const priceLogIds = prices?.map((p) => p.price_log_id) ?? [];
  const { data: serverVotes = {} } = useQuery({
    queryKey: ['my-votes', id, user?.id],
    queryFn:  () => user ? fetchMyVotes(priceLogIds, user.id) : {},
    enabled:  !!user && priceLogIds.length > 0,
  });
  const [localVotes, setLocalVotes] = useState<VoteMap>({});
  const votes: VoteMap = { ...serverVotes, ...localVotes };

  // ── Vote ──────────────────────────────────────────────────────────────────
  const castVote = useCallback(async (priceLogId: string, vote: 'confirm' | 'flag') => {
    if (!user) return;
    const current = votes[priceLogId];
    const next = current === vote ? null : vote;
    setLocalVotes((p) => { const n = { ...p }; if (next) n[priceLogId] = next; else delete n[priceLogId]; return n; });
    if (current) await supabase.from('votes').delete().eq('price_log_id', priceLogId).eq('user_id', user.id);
    if (next)    await supabase.from('votes').insert({ price_log_id: priceLogId, user_id: user.id, vote: next });
    qc.invalidateQueries({ queryKey: ['prices', id] });
    qc.invalidateQueries({ queryKey: ['my-votes', id, user.id] });
    setLocalVotes({});
  }, [user, votes, id]);

  // ── Save Alert ────────────────────────────────────────────────────────────
  const saveAlert = async () => {
    if (!user || !item) return;
    const price = parseFloat(alertPrice);
    if (!alertPrice || isNaN(price) || price <= 0) {
      showToast('Enter a valid target price', 'error');
      return;
    }
    setSavingAlert(true);
    const { error } = await supabase.from('alerts').insert({
      user_id:      user.id,
      item_id:      item.id,
      market_id:    alertMarketId,
      target_price: price,
      direction:    alertDir,
    });
    setSavingAlert(false);
    if (error) {
      showToast('Failed to save alert: ' + error.message, 'error');
    } else {
      setAlertModal(false);
      setAlertPrice('');
      setAlertMarketId(null);
      qc.invalidateQueries({ queryKey: ['alerts', user.id] });
      showToast(
        `Alert set: notify when ${item.name} ${alertDir === 'drop_below' ? 'drops below' : 'rises above'} ${price} ETB`,
        'success'
      );
    }
  };

  const isLoading = li || lp;
  const catColor  = item ? categoryColor(item.category) : Colors.veggie;
  const lowest    = prices?.[0]?.price_etb ?? null;
  const highest   = prices?.[prices.length - 1]?.price_etb ?? null;
  const avg       = prices?.length ? prices.reduce((s, p) => s + p.price_etb, 0) / prices.length : null;

  // Build bar chart data from prices array (one bar per market)
  const barChartData: StoreBarData[] = (prices ?? []).map((p, i) => ({
    store:      p.market_name,
    price:      p.price_etb,
    isCheapest: i === 0 && !p.is_anomaly,
  }));

  if (isLoading) return (
    <ScrollView style={[styles.root, { paddingTop: insets.top }]} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Back row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text style={{ fontSize: 20, color: Colors.t2 }}>←</Text>
        <Text style={{ fontSize: 15, color: Colors.t2, fontWeight: '600' }}>Back</Text>
      </View>
      {/* Stat boxes */}
      <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 12 }}>
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </View>
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <SkeletonBarChart />
        <SkeletonLineChart />
        {[0,1,2].map((i) => <SkeletonDealRow key={i} />)}
      </View>
    </ScrollView>
  );
  if (!item) return (
    <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
      <Text style={{ color: Colors.t3, fontSize: 16 }}>Item not found</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
        <Text style={{ color: Colors.deal, fontSize: 15 }}>← Go back</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Price card ─────────────────────────────────────────────────────────────
  const renderPrice = ({ item: p, index }: { item: MarketPrice; index: number }) => {
    const isBest   = index === 0 && (prices?.length ?? 0) > 1 && !p.is_anomaly;
    const fColor   = freshnessColor(p.logged_at);
    const barWidth = lowest && highest && highest > lowest
      ? Math.max(4, ((p.price_etb - lowest) / (highest - lowest)) * 100) : 50;
    const myVote   = votes[p.price_log_id];

    return (
      <View style={[styles.card, isBest && styles.cardBest, p.is_anomaly && styles.cardAnomaly]}>
        <View style={styles.badgeRow}>
          {isBest      && <View style={styles.bestBadge}><Text style={styles.bestTxt}>✓ BEST PRICE</Text></View>}
          {p.is_anomaly && <View style={styles.anomalyBadge}><Text style={styles.anomalyTxt}>⚠ SUSPICIOUS</Text></View>}
        </View>

        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.mktName}>{p.market_name}</Text>
            <Text style={styles.mktSub}>{p.market_sub_city}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.priceVal, isBest && { color: Colors.veggie }, p.is_anomaly && { color: Colors.flagged }]}>
              {p.price_etb.toFixed(0)}
            </Text>
            <Text style={styles.priceUnit}>ETB/{item.unit}</Text>
          </View>
        </View>

        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${barWidth}%`, backgroundColor: p.is_anomaly ? Colors.flagged : isBest ? Colors.veggie : Colors.birr }]} />
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.freshDot, { backgroundColor: fColor }]} />
          <Text style={[styles.freshLbl, { color: fColor }]}>{timeAgo(p.logged_at)}</Text>
          {p.confirmed_count > 0 && <Text style={styles.metaCount}>· ✓ {p.confirmed_count}</Text>}
          {p.flagged_count   > 0 && <Text style={[styles.metaCount, { color: Colors.flagged }]}>· ⚑ {p.flagged_count}</Text>}
        </View>

        {user && (
          <View style={styles.voteRow}>
            <TouchableOpacity
              style={[styles.voteBtn, myVote === 'confirm' && styles.voteBtnConfirm]}
              onPress={() => castVote(p.price_log_id, 'confirm')}
            >
              <Text style={[styles.voteTxt, myVote === 'confirm' && { color: Colors.bg }]}>✓ Looks right</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.voteBtn, myVote === 'flag' && styles.voteBtnFlag]}
              onPress={() => castVote(p.price_log_id, 'flag')}
            >
              <Text style={[styles.voteTxt, myVote === 'flag' && { color: Colors.bg }]}>⚑ Looks wrong</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ── List header ────────────────────────────────────────────────────────────
  const ListHeader = (
    <View>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Text style={styles.backArrow}>←</Text>
        <Text style={styles.backLbl}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { borderBottomColor: catColor + '40' }]}>
        <View style={[styles.heroEmoji, { backgroundColor: catColor + '20' }]}>
          <Text style={{ fontSize: 40 }}>{item.emoji}</Text>
        </View>
        <Text style={styles.heroName}>{item.name}</Text>
        <Text style={[styles.heroCat, { color: catColor }]}>{item.category} · per {item.unit}</Text>

        {prices && prices.length > 0 && (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: Colors.veggie }]}>{lowest?.toFixed(0)}</Text>
                <Text style={styles.statLbl}>Lowest</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{avg?.toFixed(0)}</Text>
                <Text style={styles.statLbl}>Average</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: Colors.flagged }]}>{highest?.toFixed(0)}</Text>
                <Text style={styles.statLbl}>Highest</Text>
              </View>
            </View>
            {lowest !== null && (
              <Text style={styles.normalizedHeroPrice}>
                {normalizePrice(lowest, item.unit)}
              </Text>
            )}
          </>
        )}

        {/* Alert button */}
        {user && (
          <TouchableOpacity
            style={styles.alertBtn}
            onPress={() => setAlertModal(true)}
          >
            <Text style={styles.alertBtnTxt}>🔔 Set Price Alert</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bar chart — avg price by store */}
      {barChartData.length > 1 && (
        <View style={styles.chartWrap}>
          <StorePriceBarChart data={barChartData} unit={item.unit} catColor={catColor} />
        </View>
      )}

      {/* 4-week trend chart */}
      {weekTrend.length > 1 && (
        <View style={styles.chartWrap}>
          <PriceTrendChart data={weekTrend} unit={item.unit} catColor={catColor} />
        </View>
      )}

      {/* 30-Day price range stat tiles */}
      {stats30d && (
        <View style={styles.stats30dSection}>
          <Text style={styles.stats30dTitle}>📊 30-Day Market Range</Text>
          <View style={styles.stats30dRow}>
            <View style={[styles.statTile, { borderColor: Colors.veggie + '30' }]}>
              <Text style={[styles.statTileVal, { color: Colors.veggie }]}>
                {`${parseFloat(stats30d.min_price as any).toFixed(0)}`} <Text style={{ fontSize: 9, fontWeight: '700' }}>ETB</Text>
              </Text>
              <Text style={styles.statTileLbl}>30d Min</Text>
            </View>
            <View style={[styles.statTile, { borderColor: Colors.birr + '30' }]}>
              <Text style={[styles.statTileVal, { color: Colors.birr }]}>
                {`${parseFloat(stats30d.avg_price as any).toFixed(0)}`} <Text style={{ fontSize: 9, fontWeight: '700' }}>ETB</Text>
              </Text>
              <Text style={styles.statTileLbl}>30d Avg</Text>
            </View>
            <View style={[styles.statTile, { borderColor: Colors.flagged + '30' }]}>
              <Text style={[styles.statTileVal, { color: Colors.flagged }]}>
                {`${parseFloat(stats30d.max_price as any).toFixed(0)}`} <Text style={{ fontSize: 9, fontWeight: '700' }}>ETB</Text>
              </Text>
              <Text style={styles.statTileLbl}>30d Max</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.secRow}>
        <Text style={styles.secTitle}>Prices across markets</Text>
        <Text style={styles.secCount}>{prices?.length ?? 0} markets</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FlatList
        data={prices}
        keyExtractor={(p) => p.price_log_id}
        renderItem={renderPrice}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.t2 }}>No prices logged yet</Text>
          </View>
        }
      />

      {/* Log price FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: catColor }]}
        onPress={() => router.push('/(tabs)/log')}
      >
        <Text style={styles.fabTxt}>＋ Log Price</Text>
      </TouchableOpacity>

      {/* Set Alert Modal */}
      <Modal visible={alertModal} transparent animationType="slide" onRequestClose={() => setAlertModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>🔔 Set Price Alert</Text>
            <Text style={styles.modalItem}>{item.emoji} {item.name}</Text>

            {/* Direction toggle */}
            <Text style={styles.modalLabel}>Alert condition</Text>
            <View style={styles.dirRow}>
              <TouchableOpacity
                style={[styles.dirBtn, alertDir === 'drop_below' && styles.dirBtnActive]}
                onPress={() => setAlertDir('drop_below')}
              >
                <Text style={[styles.dirTxt, alertDir === 'drop_below' && { color: Colors.bg }]}>📉 Drops below</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dirBtn, alertDir === 'rise_above' && styles.dirBtnRiseActive]}
                onPress={() => setAlertDir('rise_above')}
              >
                <Text style={[styles.dirTxt, alertDir === 'rise_above' && { color: Colors.bg }]}>📈 Rises above</Text>
              </TouchableOpacity>
            </View>

            {/* Target price */}
            <Text style={styles.modalLabel}>Target price (ETB)</Text>
            <View style={styles.priceRow}>
              <Text style={styles.currency}>ETB</Text>
              <TextInput
                style={styles.priceInput}
                value={alertPrice}
                onChangeText={setAlertPrice}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.t5}
              />
            </View>

            {/* Market filter */}
            <Text style={styles.modalLabel}>Market (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                <TouchableOpacity
                  style={[styles.mktChip, alertMarketId === null && styles.mktChipActive]}
                  onPress={() => setAlertMarketId(null)}
                >
                  <Text style={[styles.mktChipTxt, alertMarketId === null && { color: Colors.bg }]}>Any market</Text>
                </TouchableOpacity>
                {markets.map((m: any) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.mktChip, alertMarketId === m.id && styles.mktChipActive]}
                    onPress={() => setAlertMarketId(m.id)}
                  >
                    <Text style={[styles.mktChipTxt, alertMarketId === m.id && { color: Colors.bg }]}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Buttons */}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setAlertModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingAlert && { opacity: 0.6 }]}
                onPress={saveAlert}
                disabled={savingAlert}
              >
                {savingAlert
                  ? <ActivityIndicator color={Colors.bg} />
                  : <Text style={styles.saveTxt}>Set Alert</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  list:   { paddingHorizontal: 16, paddingBottom: 110, gap: 10 },

  backRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14 },
  backArrow: { fontSize: 20, color: Colors.t2 },
  backLbl:   { fontSize: 15, color: Colors.t2, fontWeight: '600' },

  hero:       { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24, borderBottomWidth: 1, marginBottom: 8 },
  heroEmoji:  { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroName:   { fontSize: 26, fontWeight: '800', color: Colors.t1, letterSpacing: -0.5, textAlign: 'center' },
  heroCat:    { fontSize: 13, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },
  statsRow:   { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  statBox:    { flex: 1, backgroundColor: Colors.s1, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statVal:    { fontSize: 20, fontWeight: '800', color: Colors.t1 },
  statLbl:    { fontSize: 11, color: Colors.t4, marginTop: 4, fontWeight: '600' },
  normalizedHeroPrice: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.t3,
    marginTop: 12,
    textAlign: 'center',
  },

  alertBtn:    { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.birr, flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertBtnTxt: { fontSize: 14, fontWeight: '700', color: Colors.birr },
  chartWrap:   { paddingHorizontal: 16, marginBottom: 2 },

  secRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 12 },
  secTitle: { fontSize: 15, fontWeight: '700', color: Colors.t2 },
  secCount: { fontSize: 13, color: Colors.t4 },

  card:         { backgroundColor: Colors.s1, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  cardBest:     { borderColor: Colors.veggie + '50', backgroundColor: Colors.veggie + '06' },
  cardAnomaly:  { borderColor: Colors.flagged + '60', backgroundColor: Colors.flagged + '08' },
  badgeRow:     { flexDirection: 'row', gap: 8 },
  bestBadge:    { backgroundColor: Colors.veggie, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  bestTxt:      { fontSize: 10, fontWeight: '800', color: Colors.bg, letterSpacing: 0.5 },
  anomalyBadge: { backgroundColor: Colors.flagged, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  anomalyTxt:   { fontSize: 10, fontWeight: '800', color: Colors.bg, letterSpacing: 0.5 },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mktName:      { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  mktSub:       { fontSize: 12, color: Colors.t4, marginTop: 2 },
  priceVal:     { fontSize: 24, fontWeight: '800', color: Colors.birr, letterSpacing: -0.5 },
  priceUnit:    { fontSize: 11, color: Colors.t4, marginTop: 1 },
  barBg:        { height: 4, backgroundColor: Colors.s3, borderRadius: 2 },
  barFill:      { height: 4, borderRadius: 2 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  freshDot:     { width: 6, height: 6, borderRadius: 3 },
  freshLbl:     { fontSize: 11, fontWeight: '600' },
  metaCount:    { fontSize: 11, color: Colors.t4 },
  voteRow:      { flexDirection: 'row', gap: 8 },
  voteBtn:      { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  voteBtnConfirm:{ backgroundColor: Colors.veggie, borderColor: Colors.veggie },
  voteBtnFlag:  { backgroundColor: Colors.flagged, borderColor: Colors.flagged },
  voteTxt:      { fontSize: 13, fontWeight: '700', color: Colors.t3 },

  fab:    { position: 'absolute', bottom: 24, left: 24, right: 24, backgroundColor: Colors.veggie, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  fabTxt: { fontSize: 16, fontWeight: '800', color: Colors.bg },

  // Alert modal
  modalOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: Colors.s1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle:  { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: Colors.t1, marginBottom: 4 },
  modalItem:    { fontSize: 15, color: Colors.t3, marginBottom: 20 },
  modalLabel:   { fontSize: 12, fontWeight: '700', color: Colors.t4, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  dirRow:       { flexDirection: 'row', gap: 8 },
  dirBtn:       { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  dirBtnActive: { backgroundColor: Colors.veggie, borderColor: Colors.veggie },
  dirBtnRiseActive: { backgroundColor: Colors.flagged, borderColor: Colors.flagged },
  dirTxt:       { fontSize: 13, fontWeight: '700', color: Colors.t3 },
  priceRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  currency:     { paddingHorizontal: 14, fontSize: 15, color: Colors.birr, fontWeight: '700' },
  priceInput:   { flex: 1, padding: 14, fontSize: 22, fontWeight: '800', color: Colors.t1 },
  mktChip:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1.5, borderColor: Colors.border },
  mktChipActive:{ backgroundColor: Colors.deal, borderColor: Colors.deal },
  mktChipTxt:   { fontSize: 13, fontWeight: '600', color: Colors.t3 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn:    { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelTxt:    { fontSize: 15, fontWeight: '600', color: Colors.t3 },
  saveBtn:      { flex: 2, paddingVertical: 15, borderRadius: 14, backgroundColor: Colors.birr, alignItems: 'center' },
  saveTxt:      { fontSize: 15, fontWeight: '800', color: Colors.bg },

  // stats30d styles
  stats30dSection: { paddingHorizontal: 16, marginTop: 12, marginBottom: 8 },
  stats30dTitle: { fontSize: 12, fontWeight: '800', color: Colors.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  stats30dRow: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, backgroundColor: Colors.s1, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 12, alignItems: 'center', justifyContent: 'center' },
  statTileVal: { fontSize: 16, fontWeight: '900' },
  statTileLbl: { fontSize: 9, color: Colors.t4, fontWeight: '700', textTransform: 'uppercase', marginTop: 4, letterSpacing: 0.3 },
});
