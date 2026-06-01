/**
 * alerts.tsx — Phase 8 upgrade
 *
 * Three tabs:
 *  Active    — live alerts with animated ProximityBar + latest price
 *  History   — last 30 days of triggered alerts
 *  Suggest   — FastAPI smart suggestions based on viewed items
 *
 * Also: tapping a triggered alert → /alert-triggered celebration screen.
 */
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { healthCheck } from '@/lib/api';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProximityBar from '@/components/ProximityBar';
import { SkeletonDealRow } from '@/components/Skeleton';
import EmptyShelf from '@/components/EmptyShelf';

// ── Types ──────────────────────────────────────────────────────────────────────
interface AlertRow {
  id:              string;
  item_id:         string;
  market_id:       string | null;
  target_price:    number;
  direction:       'drop_below' | 'rise_above';
  is_active:       boolean;
  triggered_at:    string | null;
  created_at:      string;
  item_name:       string;
  item_emoji:      string;
  market_name:     string | null;
  current_price?:  number | null;
}

interface Suggestion {
  item_id:         string;
  item_name:       string;
  item_emoji:      string;
  direction:       'drop_below' | 'rise_above';
  suggested_price: number;
  reason:          string;
}

type Tab = 'active' | 'history' | 'suggest';

// ── Fetchers ───────────────────────────────────────────────────────────────────
async function fetchAlerts(userId: string): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select(`
      id, item_id, market_id, target_price, direction,
      is_active, triggered_at, created_at,
      items(name, emoji),
      markets(name)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = ((data ?? []) as any[]).map((r) => ({
    ...r,
    item_name:   r.items?.name   ?? 'Unknown',
    item_emoji:  r.items?.emoji  ?? '🛒',
    market_name: r.markets?.name ?? null,
  }));

  // Enrich active alerts with latest price
  const activeIds = rows
    .filter((r) => r.is_active && !r.triggered_at)
    .map((r) => r.item_id);

  if (activeIds.length > 0) {
    const { data: prices } = await supabase
      .from('latest_prices')
      .select('item_id, price_etb')
      .in('item_id', activeIds);

    const priceMap: Record<string, number> = {};
    for (const p of (prices ?? [])) {
      priceMap[(p as any).item_id] = (p as any).price_etb;
    }

    return rows.map((r) => ({
      ...r,
      current_price: priceMap[r.item_id] ?? null,
    }));
  }

  return rows;
}

async function fetchSuggestions(viewedIds: string[]): Promise<Suggestion[]> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
  try {
    const res = await fetch(`${apiUrl}/alerts/suggest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ viewed_item_ids: viewedIds }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.suggestions ?? [];
  } catch {
    return [];
  }
}

// ── Proximity calculation ──────────────────────────────────────────────────────
function calcProximity(alert: AlertRow): number {
  if (!alert.current_price) return 0;
  const { target_price, current_price, direction } = alert;
  if (direction === 'drop_below') {
    // proximity goes 0→1 as current_price drops toward target
    const range = target_price * 0.3; // consider "nearby" within 30% of target
    return Math.max(0, 1 - (current_price - target_price) / range);
  } else {
    const range = target_price * 0.3;
    return Math.max(0, 1 - (target_price - current_price) / range);
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function AlertsScreen() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const qc       = useQueryClient();
  const [tab, setTab] = useState<Tab>('active');

  const uid = user?.id ?? '';

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts', uid],
    queryFn:  () => fetchAlerts(uid),
    enabled:  !!uid,
    refetchInterval: 60_000,   // refresh every minute
  });

  // Grab recently viewed items from query cache (from item detail screens)
  const viewedIds = Object.keys(qc.getQueryCache().getAll()
    .filter((q) => q.queryKey[0] === 'item-detail')
    .reduce((acc, q) => ({ ...acc, [q.queryKey[1] as string]: true }), {}));

  const { data: suggestions = [], isLoading: loadingSugg } = useQuery({
    queryKey: ['alert-suggestions', viewedIds.slice(0, 10)],
    queryFn:  () => fetchSuggestions(viewedIds.slice(0, 10)),
    enabled:  tab === 'suggest',
    staleTime: 5 * 60_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alerts').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['alerts', uid] });
      qc.setQueryData<AlertRow[]>(['alerts', uid], (old = []) =>
        old.filter((a) => a.id !== id),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alerts', uid] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('alerts').update({ is_active: !is_active }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: ['alerts', uid] });
      qc.setQueryData<AlertRow[]>(['alerts', uid], (old = []) =>
        old.map((a) => a.id === id ? { ...a, is_active: !is_active } : a),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alerts', uid] }),
  });

  const confirmDelete = useCallback((id: string) => {
    Alert.alert('Delete alert?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  }, [deleteMutation]);

  // ── Quick-create from suggestion ───────────────────────────────────────────
  const createFromSuggestion = useCallback(async (s: Suggestion) => {
    if (!uid) return;
    await supabase.from('alerts').insert({
      user_id:      uid,
      item_id:      s.item_id,
      target_price: s.suggested_price,
      direction:    s.direction,
      is_active:    true,
    });
    qc.invalidateQueries({ queryKey: ['alerts', uid] });
    setTab('active');
  }, [uid, qc]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeAlerts    = alerts.filter((a) => a.is_active && !a.triggered_at);
  const triggeredAlerts = alerts.filter((a) => !!a.triggered_at);
  const pausedAlerts    = alerts.filter((a) => !a.is_active && !a.triggered_at);
  const historyAlerts   = [...triggeredAlerts].sort(
    (a, b) => new Date(b.triggered_at!).getTime() - new Date(a.triggered_at!).getTime(),
  );

  // ── Render alert card ──────────────────────────────────────────────────────
  const renderAlert = (a: AlertRow, showProximity = false) => {
    const isTriggered = !!a.triggered_at;
    const proximity   = showProximity ? calcProximity(a) : 0;
    const accentColor = isTriggered
      ? Colors.veggie
      : a.direction === 'drop_below' ? Colors.deal : Colors.flagged;

    return (
      <TouchableOpacity
        key={a.id}
        style={[styles.card, !a.is_active && !isTriggered && styles.cardMuted]}
        activeOpacity={isTriggered ? 0.75 : 1}
        onPress={isTriggered
          ? () => router.push({
              pathname: '/alert-triggered',
              params: {
                alertId:      a.id,
                itemId:       a.item_id,
                marketId:     a.market_id ?? '',
                targetPrice:  a.target_price.toString(),
                currentPrice: (a.current_price ?? a.target_price).toString(),
              },
            } as any)
          : undefined}
      >
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={styles.itemEmoji}>{a.item_emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{a.item_name}</Text>
              <Text style={styles.conditionText}>
                {a.direction === 'drop_below' ? '📉 Drop below' : '📈 Rise above'}
                {' '}
                <Text style={{ color: accentColor, fontWeight: '800' }}>
                  {a.target_price.toFixed(0)} ETB
                </Text>
              </Text>
              <Text style={styles.marketText}>
                {a.market_name ? `@ ${a.market_name}` : 'Any market'}
              </Text>

              {/* Current price */}
              {showProximity && a.current_price && (
                <Text style={styles.currentPrice}>
                  {'Now: '}
                  <Text style={{ fontWeight: '800', color: Colors.t1 }}>
                    {a.current_price.toFixed(0)} ETB
                  </Text>
                </Text>
              )}
            </View>

            {/* Status badge */}
            {isTriggered ? (
              <View style={[styles.badge, { backgroundColor: Colors.veggie + '20' }]}>
                <Text style={[styles.badgeTxt, { color: Colors.veggie }]}>Fired ✓</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.badge, { backgroundColor: a.is_active ? Colors.deal + '20' : Colors.s3 }]}
                onPress={() => toggleMutation.mutate({ id: a.id, is_active: a.is_active })}
              >
                <Text style={[styles.badgeTxt, { color: a.is_active ? Colors.deal : Colors.t4 }]}>
                  {a.is_active ? 'Active' : 'Paused'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Proximity bar */}
          {showProximity && !isTriggered && a.current_price && (
            <ProximityBar
              proximity={proximity}
              direction={a.direction}
              currentPrice={a.current_price}
              targetPrice={a.target_price}
            />
          )}

          {isTriggered && a.triggered_at && (
            <Text style={styles.triggeredAt}>
              {'Triggered '}
              {new Date(a.triggered_at).toLocaleDateString('en-ET', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' · Tap to view ›'}
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(a.id)}>
          <Text style={styles.deleteTxt}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ── Render suggestion card ─────────────────────────────────────────────────
  const renderSuggestion = (s: Suggestion) => (
    <View key={s.item_id + s.direction} style={styles.suggCard}>
      <Text style={styles.suggEmoji}>{s.item_emoji}</Text>
      <View style={styles.suggBody}>
        <Text style={styles.suggName}>{s.item_name}</Text>
        <Text style={styles.suggDir}>
          {s.direction === 'drop_below' ? '📉 Alert when drops below' : '📈 Alert when rises above'}
          {' '}
          <Text style={{ fontWeight: '800', color: Colors.deal }}>
            {s.suggested_price.toFixed(0)} ETB
          </Text>
        </Text>
        <Text style={styles.suggReason}>{s.reason}</Text>
      </View>
      <TouchableOpacity style={styles.suggAdd} onPress={() => createFromSuggestion(s)}>
        <Text style={styles.suggAddTxt}>+ Add</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Price Alerts</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {([
          { key: 'active',  label: `Active (${activeAlerts.length + pausedAlerts.length})` },
          { key: 'history', label: `History (${historyAlerts.length})` },
          { key: 'suggest', label: '✨ Suggest' },
        ] as const).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tabBtn, tab === key && styles.tabBtnOn]}
            onPress={() => setTab(key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabTxt, tab === key && styles.tabTxtOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.veggie} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── ACTIVE TAB ─────────────────────────────────────────────────── */}
          {tab === 'active' && (
            <>
              {activeAlerts.length === 0 && pausedAlerts.length === 0 ? (
                <EmptyShelf
                  variant="alert"
                  title="No active alerts"
                  sub={'Tap “Set Alert” on any item\'s detail page to get notified when a price drops.'}
                />
              ) : (
                <>
                  {activeAlerts.length > 0 && (
                    <Section title={`🔔 Watching (${activeAlerts.length})`}>
                      {activeAlerts.map((a) => renderAlert(a, true))}
                    </Section>
                  )}
                  {pausedAlerts.length > 0 && (
                    <Section title={`⏸ Paused (${pausedAlerts.length})`}>
                      {pausedAlerts.map((a) => renderAlert(a, false))}
                    </Section>
                  )}
                </>
              )}
            </>
          )}

          {/* ── HISTORY TAB ────────────────────────────────────────────────── */}
          {tab === 'history' && (
            <>
              {historyAlerts.length === 0 ? (
                <EmptyState
                  emoji="📭"
                  title="No triggered alerts yet"
                  sub="When a price hits your target, it will appear here."
                />
              ) : (
                <Section title={`✓ Triggered (${historyAlerts.length})`}>
                  {historyAlerts.map((a) => renderAlert(a, false))}
                </Section>
              )}
            </>
          )}

          {/* ── SUGGEST TAB ────────────────────────────────────────────────── */}
          {tab === 'suggest' && (
            <>
              <View style={styles.suggestHint}>
                <Text style={styles.suggestHintTxt}>
                  💡 Based on price trends for items you've viewed recently
                </Text>
              </View>

              {loadingSugg ? (
                <View style={{ gap: 8 }}>
                  {[0,1,2].map((i) => <SkeletonDealRow key={i} />)}
                </View>
              ) : suggestions.length === 0 ? (
                <EmptyState
                  emoji="🤔"
                  title="No suggestions yet"
                  sub="Browse a few items first and we'll recommend smart alerts."
                />
              ) : (
                <Section title="Recommended for you">
                  {suggestions.map(renderSuggestion)}
                </Section>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function EmptyState({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 48 }}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.bg },
  scrollContent: { padding: 16 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 22, color: Colors.t2 },
  title:     { fontSize: 18, fontWeight: '800', color: Colors.t1 },

  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn:    { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.s2 },
  tabBtnOn:  { backgroundColor: Colors.veggie },
  tabTxt:    { fontSize: 11, fontWeight: '700', color: Colors.t4 },
  tabTxtOn:  { color: Colors.bg },

  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: Colors.t5, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  card:      { flexDirection: 'row', backgroundColor: Colors.s1, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cardMuted: { opacity: 0.55 },
  accentBar: { width: 4, flexShrink: 0 },
  cardBody:  { flex: 1, padding: 14 },
  cardTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemEmoji: { fontSize: 22, marginTop: 1 },
  itemName:  { fontSize: 15, fontWeight: '700', color: Colors.t1, marginBottom: 3 },
  conditionText: { fontSize: 13, color: Colors.t3 },
  marketText:    { fontSize: 12, color: Colors.t4, marginTop: 2 },
  currentPrice:  { fontSize: 12, color: Colors.t4, marginTop: 4 },
  badge:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeTxt:      { fontSize: 11, fontWeight: '700' },
  triggeredAt:   { fontSize: 11, color: Colors.veggie, marginTop: 8, fontWeight: '600' },
  deleteBtn:     { padding: 14, justifyContent: 'center' },
  deleteTxt:     { fontSize: 14, color: Colors.t5 },

  suggestHint:    { backgroundColor: Colors.deal + '12', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.deal + '30' },
  suggestHintTxt: { fontSize: 13, color: Colors.deal, fontWeight: '600', textAlign: 'center' },

  suggCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s1, borderRadius: 14, padding: 14, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: Colors.border },
  suggEmoji: { fontSize: 26 },
  suggBody:  { flex: 1, gap: 3 },
  suggName:  { fontSize: 14, fontWeight: '700', color: Colors.t1 },
  suggDir:   { fontSize: 12, color: Colors.t3 },
  suggReason:{ fontSize: 11, color: Colors.t5 },
  suggAdd:   { backgroundColor: Colors.deal + '20', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.deal + '50' },
  suggAddTxt:{ fontSize: 12, fontWeight: '800', color: Colors.deal },

  empty:      { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.t2 },
  emptySub:   { fontSize: 14, color: Colors.t4, textAlign: 'center', lineHeight: 21, paddingHorizontal: 24 },
});
