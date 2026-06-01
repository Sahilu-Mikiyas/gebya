/**
 * list.tsx — My Shopping List
 *
 * Phase 1-E: List state is now persisted to Supabase (lists + list_items tables).
 * - On mount: fetches or creates the user's default list, then loads list_items.
 * - Add item:    INSERT into list_items (optimistic UI, then refetch).
 * - Remove item: DELETE from list_items (optimistic UI).
 * - Check/uncheck: UPDATE list_items SET checked = true|false (optimistic).
 * - Clear done:  DELETE checked list_items in batch.
 * - Fallback:    If not signed in → local state only (guest mode).
 *
 * Optimizer, price estimation, and trip split logic are unchanged.
 */
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { optimizeSplit, healthCheck, OptimizeResponse, MarketLeg } from '@/lib/api';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyShelf from '@/components/EmptyShelf';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CatalogItem { id: string; name: string; emoji: string; category: CategoryKey; unit: string }
interface AllPrice    { item_id: string; market_id: string; market_name: string; price_etb: number }
interface ListRow     { id: string; item_id: string; qty: number; checked: boolean }

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function getOrCreateList(userId: string): Promise<string> {
  // Look for existing default list
  const { data: existing } = await supabase
    .from('lists')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'My List')
    .single();

  if (existing?.id) return existing.id;

  // Create one
  const { data: created, error } = await supabase
    .from('lists')
    .insert({ user_id: userId, name: 'My List' })
    .select('id')
    .single();

  if (error) throw error;
  return created.id;
}

async function fetchListRows(listId: string): Promise<ListRow[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('id, item_id, qty, checked')
    .eq('list_id', listId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchCatalog(): Promise<CatalogItem[]> {
  const { data, error } = await supabase
    .from('items').select('id,name,emoji,category,unit').order('name');
  if (error) throw error;
  return data ?? [];
}

async function fetchAllPrices(itemIds: string[]): Promise<AllPrice[]> {
  if (!itemIds.length) return [];
  const { data, error } = await supabase
    .from('latest_prices')
    .select('item_id, market_id, market_name, price_etb')
    .in('item_id', itemIds);
  if (error) throw error;
  return data ?? [];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ListScreen() {
  const insets      = useSafeAreaInsets();
  const { user }    = useAuthStore();
  const qc          = useQueryClient();

  const [search,     setSearch]   = useState('');
  const [showPicker, setShow]     = useState(false);
  const [optimizing, setOpt]      = useState(false);
  const [result,     setResult]   = useState<OptimizeResponse | null>(null);
  const [apiDown,    setApiDown]  = useState(false);

  // ── Supabase queries ────────────────────────────────────────────────────────
  // Step 1: resolve (or create) the user's default list
  const { data: listId } = useQuery({
    queryKey: ['list-id', user?.id],
    queryFn:  () => getOrCreateList(user!.id),
    enabled:  !!user,
    staleTime: Infinity,
  });

  // Step 2: fetch list_items for this list
  const { data: listRows = [], isLoading: loadingRows } = useQuery({
    queryKey: ['list-rows', listId],
    queryFn:  () => fetchListRows(listId!),
    enabled:  !!listId,
  });

  // Catalog of all items
  const { data: catalog = [] } = useQuery({
    queryKey: ['items'],
    queryFn:  fetchCatalog,
  });

  // Prices for the items in the list
  const itemIds = listRows.map((r) => r.item_id);
  const { data: allPrices = [] } = useQuery({
    queryKey: ['all-prices', itemIds],
    queryFn:  () => fetchAllPrices(itemIds),
    enabled:  itemIds.length > 0,
  });

  // Recent price log counts in last 7 days for confidence chips
  const { data: recentLogCounts = {} } = useQuery({
    queryKey: ['recent-log-counts', itemIds],
    queryFn: async () => {
      if (!itemIds.length) return {};
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('price_logs')
        .select('item_id, market_id')
        .in('item_id', itemIds)
        .gte('logged_at', sevenDaysAgo);
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      for (const log of (data ?? [])) {
        const key = `${log.market_id}_${log.item_id}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
    enabled: itemIds.length > 0,
    staleTime: 60_000,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!listId) throw new Error('No list');
      const { error } = await supabase
        .from('list_items')
        .insert({ list_id: listId, item_id: itemId, qty: 1, checked: false });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list-rows', listId] });
      setResult(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from('list_items').delete().eq('id', rowId);
      if (error) throw error;
    },
    onMutate: async (rowId) => {
      // Optimistic: remove immediately
      await qc.cancelQueries({ queryKey: ['list-rows', listId] });
      qc.setQueryData<ListRow[]>(['list-rows', listId], (old = []) =>
        old.filter((r) => r.id !== rowId),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['list-rows', listId] }),
  });

  const checkMutation = useMutation({
    mutationFn: async ({ rowId, checked }: { rowId: string; checked: boolean }) => {
      const { error } = await supabase
        .from('list_items').update({ checked }).eq('id', rowId);
      if (error) throw error;
    },
    onMutate: async ({ rowId, checked }) => {
      await qc.cancelQueries({ queryKey: ['list-rows', listId] });
      qc.setQueryData<ListRow[]>(['list-rows', listId], (old = []) =>
        old.map((r) => (r.id === rowId ? { ...r, checked } : r)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['list-rows', listId] }),
  });

  const clearDoneMutation = useMutation({
    mutationFn: async () => {
      const doneIds = listRows.filter((r) => r.checked).map((r) => r.id);
      if (!doneIds.length) return;
      const { error } = await supabase
        .from('list_items').delete().in('id', doneIds);
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['list-rows', listId] });
      qc.setQueryData<ListRow[]>(['list-rows', listId], (old = []) =>
        old.filter((r) => !r.checked),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['list-rows', listId] });
      setResult(null);
    },
  });

  // ── Derived data ────────────────────────────────────────────────────────────
  const cheapestMap = useMemo(() => {
    const m: Record<string, { price: number; market: string }> = {};
    for (const p of allPrices) {
      if (!m[p.item_id] || p.price_etb < m[p.item_id].price) {
        m[p.item_id] = { price: p.price_etb, market: p.market_name };
      }
    }
    return m;
  }, [allPrices]);

  const listItems = useMemo(() =>
    listRows
      .map((row) => ({ row, item: catalog.find((i) => i.id === row.item_id) }))
      .filter((x): x is { row: ListRow; item: CatalogItem } => !!x.item),
  [listRows, catalog]);

  const checkedCount   = listRows.filter((r) => r.checked).length;
  const unchecked      = listItems.filter((x) => !x.row.checked).length;
  const totalEstimate  = listRows.reduce((s, r) => s + (cheapestMap[r.item_id]?.price ?? 0), 0);

  const suggestions = catalog
    .filter((i) =>
      !listRows.some((r) => r.item_id === i.id) &&
      i.name.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 20);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const addItem = useCallback((itemId: string) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to save your shopping list.');
      return;
    }
    addMutation.mutate(itemId);
    setSearch('');
    setShow(false);
  }, [user, addMutation]);

  const confirmClearDone = () => {
    Alert.alert('Remove checked items?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => clearDoneMutation.mutate() },
    ]);
  };

  // ── Optimizer ────────────────────────────────────────────────────────────────
  const runOptimizer = async () => {
    if (!listItems.length) return;
    setOpt(true);
    setResult(null);
    setApiDown(false);

    const up = await healthCheck();
    if (!up) { setApiDown(true); setOpt(false); return; }

    try {
      const shoppingList = listItems.map(({ item }) => ({
        item_id: item.id, item_name: item.name, qty: 1,
      }));
      const prices = allPrices.map((p) => ({
        market_id: p.market_id, market_name: p.market_name,
        item_id: p.item_id, price_etb: p.price_etb,
      }));
      setResult(await optimizeSplit({ shopping_list: shoppingList, prices }));
    } catch (e: any) {
      Alert.alert('Optimizer error', e.message);
    } finally {
      setOpt(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderLeg = (leg: MarketLeg, idx: number, isMain: boolean) => {
    // Calculate total logs for the items in this leg
    const totalLegLogs = leg.items.reduce(
      (sum, it) => sum + (recentLogCounts[`${leg.market_id}_${it.item_id}`] ?? 0),
      0,
    );

    let confColor: string = Colors.flagged; // red
    let confText          = 'No recent data';
    let confBg            = Colors.flagged + '15';

    if (totalLegLogs >= 3) {
      confColor = Colors.veggie; // green
      confText  = 'High confidence';
      confBg    = Colors.veggie + '15';
    } else if (totalLegLogs >= 1) {
      confColor = Colors.birr; // amber
      confText  = 'Limited data';
      confBg    = Colors.birr + '15';
    }

    return (
      <View key={leg.market_id + idx} style={[styles.leg, isMain && styles.legMain]}>
        <View style={styles.legHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.legMarket}>{`🏪 ${leg.market_name}`}</Text>
            <View style={[styles.confChip, { backgroundColor: confBg, borderColor: confColor + '40' }]}>
              <View style={[styles.confDot, { backgroundColor: confColor }]} />
              <Text style={[styles.confText, { color: confColor }]}>
                {`${confText} (${totalLegLogs} log${totalLegLogs !== 1 ? 's' : ''})`}
              </Text>
            </View>
          </View>
          <Text style={styles.legTotal}>{leg.subtotal.toFixed(0)} ETB</Text>
        </View>
        {leg.items.map((it) => (
          <View key={it.item_id} style={styles.legItem}>
            <Text style={styles.legItemName}>
              {catalog.find((i) => i.id === it.item_id)?.emoji ?? '•'}  {it.item_name}
            </Text>
            <Text style={styles.legItemPrice}>{it.price_etb.toFixed(0)} ETB</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderEntry = ({ row, item }: { row: ListRow; item: CatalogItem }) => {
    const best  = cheapestMap[row.item_id];
    const color = categoryColor(item.category);
    return (
      <View key={row.id} style={[styles.entry, row.checked && styles.entryChecked]}>
        <TouchableOpacity
          style={[styles.checkbox, row.checked && { backgroundColor: Colors.veggie, borderColor: Colors.veggie }]}
          onPress={() => checkMutation.mutate({ rowId: row.id, checked: !row.checked })}
        >
          {row.checked && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
        <View style={[styles.entryEmoji, { backgroundColor: color + '18' }]}>
          <Text style={{ fontSize: 18 }}>{item.emoji}</Text>
        </View>
        <View style={styles.entryBody}>
          <Text style={[styles.entryName, row.checked && styles.strike]}>{item.name}</Text>
          {best
            ? <Text style={styles.entryHint}>Best: <Text style={{ color: Colors.veggie, fontWeight: '700' }}>{best.price} ETB</Text> @ {best.market}</Text>
            : <Text style={styles.entryHint}>No price data yet</Text>}
        </View>
        <TouchableOpacity onPress={() => removeMutation.mutate(row.id)} style={{ padding: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.t5 }}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── UI ────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>My List</Text>
            <Text style={styles.subtitle}>{unchecked} item{unchecked !== 1 ? 's' : ''} remaining</Text>
          </View>
          {checkedCount > 0 && (
            <TouchableOpacity onPress={confirmClearDone} style={styles.clearBtn}>
              <Text style={styles.clearTxt}>Clear done ({checkedCount})</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Syncing banner */}
        {!user && (
          <View style={styles.guestBanner}>
            <Text style={styles.guestText}>🔒 Sign in to save your list across devices</Text>
          </View>
        )}

        {/* Estimate bar */}
        {listRows.length > 0 && totalEstimate > 0 && (
          <View style={styles.estimateBar}>
            <Text style={styles.estimateLabel}>Est. total (best prices)</Text>
            <Text style={styles.estimateValue}>{totalEstimate.toFixed(0)} ETB</Text>
          </View>
        )}

        {/* Add item button */}
        <View style={styles.addWrap}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShow((v) => !v)}>
            <Text style={styles.addTxt}>＋ Add item to list</Text>
          </TouchableOpacity>
        </View>

        {/* Item search dropdown */}
        {showPicker && (
          <View style={styles.pickerBox}>
            <TextInput
              style={styles.pickerInput}
              placeholder="Search items…"
              placeholderTextColor={Colors.t5}
              value={search}
              onChangeText={setSearch}
              autoFocus
              autoCapitalize="none"
            />
            <FlatList
              data={suggestions}
              keyExtractor={(i) => i.id}
              style={{ maxHeight: 220 }}
              keyboardShouldPersistTaps="handled"
              scrollEnabled
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestion}
                  onPress={() => addItem(item.id)}
                >
                  <Text style={styles.suggestEmoji}>{item.emoji}</Text>
                  <Text style={styles.suggestName}>{item.name}</Text>
                  <Text style={styles.suggestUnit}>{item.unit}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.noResults}>
                  {search ? 'No items match' : 'Start typing to search'}
                </Text>
              }
            />
          </View>
        )}

        {/* Loading state */}
        {loadingRows && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.veggie} />
            <Text style={styles.loadingText}>Loading your list…</Text>
          </View>
        )}

        {/* Checklist */}
        {!loadingRows && listItems.length === 0 && !showPicker && (
          <EmptyShelf
            variant="list"
            title="Your list is empty"
            sub={"Add items and we'll find the cheapest route across Addis markets."}
          />
        )}

        {!loadingRows && listItems.length > 0 && (
          <View style={styles.listWrap}>
            {listItems.map(renderEntry)}
          </View>
        )}

        {/* Optimize button */}
        {listItems.length >= 1 && (
          <TouchableOpacity
            style={[styles.optimizeBtn, optimizing && { opacity: 0.6 }]}
            onPress={runOptimizer}
            disabled={optimizing}
            activeOpacity={0.85}
          >
            {optimizing
              ? <ActivityIndicator color={Colors.bg} />
              : <Text style={styles.optimizeTxt}>⚡ Find Best Route</Text>}
          </TouchableOpacity>
        )}

        {/* API down notice */}
        {apiDown && (
          <View style={styles.apiDownBox}>
            <Text style={styles.apiDownTitle}>🔌 Optimizer offline</Text>
            <Text style={styles.apiDownSub}>
              Start the FastAPI server:{'\n'}
              <Text style={{ fontFamily: 'monospace', color: Colors.t2 }}>
                cd gebya/api && uvicorn main:app --port 8000
              </Text>
            </Text>
          </View>
        )}

        {/* Optimizer result */}
        {result && (
          <View style={styles.resultBox}>
            {result.recommendation === 'split' ? (
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>✂ Split your trip</Text>
                <Text style={styles.resultSavings}>Save {result.savings.toFixed(0)} ETB</Text>
              </View>
            ) : (
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>🏪 One stop shop</Text>
                <Text style={[styles.resultSavings, { color: Colors.t3 }]}>Best single market</Text>
              </View>
            )}

            <View style={styles.costRow}>
              <View style={styles.costBox}>
                <Text style={styles.costVal}>{result.total_single.toFixed(0)} ETB</Text>
                <Text style={styles.costLabel}>Single market</Text>
              </View>
              {result.recommendation === 'split' && (
                <>
                  <Text style={styles.costArrow}>→</Text>
                  <View style={[styles.costBox, styles.costBoxWin]}>
                    <Text style={[styles.costVal, { color: Colors.veggie }]}>{result.total_split.toFixed(0)} ETB</Text>
                    <Text style={styles.costLabel}>Split ({result.extra_trips + 1} stops)</Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.legs}>
              {result.recommendation === 'split'
                ? result.split.map((leg, i) => renderLeg(leg, i, i === 0))
                : result.single_best
                  ? renderLeg(result.single_best, 0, true)
                  : null}
            </View>

            {result.recommendation === 'split' && result.extra_trips > 0 && (
              <Text style={styles.tripNote}>
                Includes {result.extra_trips} extra trip{result.extra_trips > 1 ? 's' : ''} @ 20 ETB each
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: Colors.bg },

  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title:    { fontSize: 26, fontWeight: '800', color: Colors.t1, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.t4, marginTop: 2 },
  clearBtn: { backgroundColor: Colors.s2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  clearTxt: { fontSize: 12, color: Colors.flagged, fontWeight: '600' },

  guestBanner: { marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.birr + '18', borderRadius: 10, padding: 11, borderWidth: 1, borderColor: Colors.birr + '40' },
  guestText:   { fontSize: 12, color: Colors.birr, fontWeight: '600', textAlign: 'center' },

  estimateBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.veggie + '12', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: Colors.veggie + '30' },
  estimateLabel: { fontSize: 13, color: Colors.t3 },
  estimateValue: { fontSize: 18, fontWeight: '800', color: Colors.veggie },

  addWrap: { paddingHorizontal: 16, marginBottom: 8 },
  addBtn:  { backgroundColor: Colors.s2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  addTxt:  { fontSize: 15, fontWeight: '600', color: Colors.t3 },

  pickerBox:   { marginHorizontal: 16, backgroundColor: Colors.s2, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, overflow: 'hidden' },
  pickerInput: { paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: Colors.t1, borderBottomWidth: 1, borderBottomColor: Colors.border },
  suggestion:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border2 },
  suggestEmoji:{ fontSize: 18, width: 28, textAlign: 'center' },
  suggestName: { flex: 1, fontSize: 14, color: Colors.t1 },
  suggestUnit: { fontSize: 12, color: Colors.t4 },
  noResults:   { padding: 16, color: Colors.t4, textAlign: 'center', fontSize: 14 },

  loadingWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  loadingText: { fontSize: 14, color: Colors.t4 },

  listWrap: { paddingHorizontal: 16, gap: 8, marginBottom: 8 },

  entry:        { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s1, borderRadius: 14, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.border },
  entryChecked: { opacity: 0.45 },
  checkbox:     { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkmark:    { fontSize: 13, color: Colors.bg, fontWeight: '800' },
  entryEmoji:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  entryBody:    { flex: 1 },
  entryName:    { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  strike:       { textDecorationLine: 'line-through', color: Colors.t4 },
  entryHint:    { fontSize: 12, color: Colors.t4, marginTop: 2 },

  optimizeBtn:  { marginHorizontal: 16, marginTop: 4, marginBottom: 16, backgroundColor: Colors.deal, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  optimizeTxt:  { fontSize: 16, fontWeight: '800', color: Colors.bg },

  apiDownBox:   { marginHorizontal: 16, marginBottom: 16, backgroundColor: Colors.flagged + '15', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.flagged + '40' },
  apiDownTitle: { fontSize: 15, fontWeight: '700', color: Colors.flagged, marginBottom: 6 },
  apiDownSub:   { fontSize: 13, color: Colors.t3, lineHeight: 20 },

  resultBox:    { marginHorizontal: 16, marginBottom: 16, backgroundColor: Colors.s1, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resultTitle:  { fontSize: 17, fontWeight: '800', color: Colors.t1 },
  resultSavings:{ fontSize: 15, fontWeight: '700', color: Colors.veggie },

  costRow:    { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  costBox:    { flex: 1, backgroundColor: Colors.s2, borderRadius: 12, padding: 12, alignItems: 'center' },
  costBoxWin: { backgroundColor: Colors.veggie + '15', borderWidth: 1, borderColor: Colors.veggie + '40' },
  costVal:    { fontSize: 20, fontWeight: '800', color: Colors.birr },
  costLabel:  { fontSize: 11, color: Colors.t4, marginTop: 4 },
  costArrow:  { fontSize: 18, color: Colors.t5 },

  legs:       { padding: 12, gap: 10 },
  leg:        { backgroundColor: Colors.s2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  legMain:    { borderColor: Colors.deal + '50' },
  legHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  legMarket:  { fontSize: 14, fontWeight: '700', color: Colors.t1 },
  legTotal:   { fontSize: 14, fontWeight: '800', color: Colors.birr },
  confChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, borderWidth: 1, alignSelf: 'flex-start', marginTop: 4 },
  confDot:    { width: 5, height: 5, borderRadius: 2.5 },
  confText:   { fontSize: 9, fontWeight: '700' },
  legItem:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border2 },
  legItemName:{ fontSize: 13, color: Colors.t2 },
  legItemPrice:{ fontSize: 13, fontWeight: '600', color: Colors.t3 },

  tripNote: { fontSize: 12, color: Colors.t5, textAlign: 'center', paddingBottom: 14, paddingHorizontal: 16 },

  empty:      { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.t2 },
  emptySub:   { fontSize: 14, color: Colors.t4, textAlign: 'center', lineHeight: 21 },
});
