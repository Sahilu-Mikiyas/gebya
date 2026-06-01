/**
 * compare.tsx — Phase 9-B
 * Store comparison screen.
 *
 * Flow:
 *  1. User picks 1–6 items from the catalog
 *  2. Hits "Compare" → calls FastAPI POST /compare/stores
 *  3. Results: side-by-side price matrix + ranked market list + savings badge
 */
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, FlatList, useWindowDimensions, Alert,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { healthCheck } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { hap } from '@/lib/haptics';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CatalogItem { id: string; name: string; emoji: string; category: CategoryKey; unit: string }

interface PriceCell  { item_id: string; market_id: string; price_etb: number; log_count: number }
interface MarketCol  { market_id: string; market_name: string; sub_city: string; total: number; rank: number; cells: PriceCell[] }
interface CompareResult {
  markets:         MarketCol[];
  item_names:      Record<string, string>;
  item_emojis:     Record<string, string>;
  cheapest_market: string;
  cheapest_per_item?: Record<string, string>;
}

// ── Fetch catalog ──────────────────────────────────────────────────────────────
async function fetchCatalog(): Promise<CatalogItem[]> {
  const { data } = await supabase.from('items').select('id,name,emoji,category,unit').order('name');
  return (data ?? []) as CatalogItem[];
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const qc = useQueryClient();

  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState<string[]>([]);
  const [result,     setResult]     = useState<CompareResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [apiDown,    setApiDown]    = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const { data: catalog = [] } = useQuery({ queryKey: ['items'], queryFn: fetchCatalog });

  const filtered = useMemo(() =>
    catalog.filter((i) =>
      !selected.includes(i.id) &&
      i.name.toLowerCase().includes(search.toLowerCase()),
    ).slice(0, 25),
  [catalog, selected, search]);

  const selectedItems = catalog.filter((i) => selected.includes(i.id));

  const addItem = (id: string) => {
    if (selected.length >= 6) return;
    setSelected((p) => [...p, id]);
    setSearch('');
    setResult(null);
  };
  const removeItem = (id: string) => {
    setSelected((p) => p.filter((x) => x !== id));
    setResult(null);
  };

  // ── Run comparison ─────────────────────────────────────────────────────────
  const runCompare = async () => {
    if (selected.length === 0) return;
    setLoading(true);
    setApiDown(false);
    setResult(null);

    const up = await healthCheck();
    if (!up) { setApiDown(true); setLoading(false); return; }

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/compare/stores`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ item_ids: selected }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setApiDown(true);
    } finally {
      setLoading(false);
    }
  };

  const getOrCreateListId = async (userId: string): Promise<string> => {
    const { data: existing } = await supabase
      .from('lists')
      .select('id')
      .eq('user_id', userId)
      .eq('name', 'My List')
      .single();

    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
      .from('lists')
      .insert({ user_id: userId, name: 'My List' })
      .select('id')
      .single();

    if (error) throw error;
    return created.id;
  };

  const saveToList = async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      return Alert.alert('Please sign in', 'You need to be signed in to save shopping plans.');
    }
    
    setLoading(true);
    try {
      const listId = await getOrCreateListId(userId);
      
      const { data: existingItems } = await supabase
        .from('list_items')
        .select('item_id')
        .eq('list_id', listId);
        
      const existingIds = new Set(existingItems?.map((x) => x.item_id) ?? []);
      const itemsToInsert = selected.filter((id) => !existingIds.has(id));
      
      if (itemsToInsert.length > 0) {
        const { error } = await supabase
          .from('list_items')
          .insert(
            itemsToInsert.map((itemId) => ({
              list_id: listId,
              item_id: itemId,
              qty: 1,
              checked: false,
            }))
          );
        if (error) throw error;
      }
      
      qc.invalidateQueries({ queryKey: ['list-rows', listId] });
      hap.success();
      
      Alert.alert('Saved!', 'Comparison items added to your shopping plan.', [
        { text: 'Go to List', onPress: () => router.push('/(tabs)/list') },
        { text: 'OK', style: 'cancel' }
      ]);
    } catch (err: any) {
      hap.error();
      Alert.alert('Error saving plan', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Winner banner ──────────────────────────────────────────────────────────
  const winnerBanner = (() => {
    if (!result || result.markets.length === 0) return null;
    const bestMkt = result.markets[0];
    const worstMkt = result.markets[result.markets.length - 1];
    const savings = worstMkt.total - bestMkt.total;
    if (savings <= 0) return null;
    return (
      <View style={styles.winnerBanner}>
        <Text style={styles.winnerText}>
          🏆 {bestMkt.market_name} saves you{' '}
          <Text style={{ fontFamily: Fonts.mono }}>
            {savings.toFixed(0)} ETB
          </Text>{' '}
          vs most expensive!
        </Text>
      </View>
    );
  })();

  // ── Render result table ────────────────────────────────────────────────────
  const renderTable = (res: CompareResult) => {
    const firstColWidth = Math.max(screenWidth / ((res.markets.length || 1) + 1) * 1.25, 130);
    const cellWidth = Math.max(screenWidth / ((res.markets.length || 1) + 1), 105);

    return (
      <View style={styles.resultWrap}>
        {/* Winner banner */}
        {winnerBanner}

        {/* Scrollable Matrix Table */}
        <ScrollView style={styles.tableScroll} horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.table}>
            {/* Header row */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.headerCell, { width: firstColWidth }]}><Text style={styles.headerCellTxt}>Items</Text></View>
              {res.markets.map((mkt) => (
                <View key={mkt.market_id} style={[styles.headerCell, { width: cellWidth }]}>
                  <Text style={styles.mktNameHeader} numberOfLines={1}>{mkt.market_name}</Text>
                  <Text style={styles.mktSubHeader} numberOfLines={1}>{mkt.sub_city}</Text>
                </View>
              ))}
            </View>
            
            {/* Data rows */}
            {selectedItems.map((item) => (
              <View key={item.id} style={styles.tableRow}>
                <View style={[styles.cell, { width: firstColWidth, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12 }]}>
                  <Text style={styles.cellItemEmoji}>{item.emoji}</Text>
                  <Text style={styles.cellItemName} numberOfLines={1}>{item.name}</Text>
                </View>
                {res.markets.map((mkt) => {
                  const cell = mkt.cells.find((c) => c.item_id === item.id);
                  const isCheapest = res.cheapest_per_item?.[item.id] === mkt.market_id;
                  
                  if (!cell) {
                    return (
                      <View key={mkt.market_id} style={[styles.cell, { width: cellWidth }]}>
                        <Text style={styles.cellNa}>—</Text>
                      </View>
                    );
                  }
                  
                  return (
                    <View key={mkt.market_id} style={[styles.cell, { width: cellWidth }, isCheapest && styles.cellCheapestBg]}>
                      <Text style={[styles.cellPriceText, isCheapest && styles.cellPriceCheapest]}>
                        {`${cell.price_etb.toFixed(0)} ETB${isCheapest ? ' ✓' : ''}`}
                      </Text>
                      <Text style={styles.cellLogsTxt}>{cell.log_count} log{cell.log_count > 1 ? 's' : ''}</Text>
                    </View>
                  );
                })}
              </View>
            ))}

            {/* Total Basket Row */}
            <View style={[styles.tableRow, styles.totalRow]}>
              <View style={[styles.cell, { width: firstColWidth, paddingLeft: 12 }]}>
                <Text style={styles.totalRowLabel}>Total Basket</Text>
              </View>
              {res.markets.map((mkt) => {
                const isCheapest = mkt.market_id === res.cheapest_market;
                return (
                  <View key={mkt.market_id} style={[styles.cell, { width: cellWidth }, isCheapest && styles.cellCheapestBg]}>
                    <Text style={[styles.totalPriceText, isCheapest && styles.totalPriceCheapest]}>
                      {`${mkt.total.toFixed(0)} ETB`}
                    </Text>
                    <Text style={styles.totalRankTxt}>{`Rank #${mkt.rank}`}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Save Shopping Plan Button */}
        <TouchableOpacity style={styles.saveBtn} onPress={saveToList} activeOpacity={0.85}>
          <Text style={styles.saveBtnText}>📋 Save as Shopping Plan</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Compare Stores</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Instructions */}
        <Text style={styles.hint}>Pick up to 6 items to compare their basket price across all markets.</Text>

        {/* Selected chips */}
        {selectedItems.length > 0 && (
          <View style={styles.chips}>
            {selectedItems.map((item) => (
              <TouchableOpacity key={item.id} style={styles.chip} onPress={() => removeItem(item.id)}>
                <Text style={styles.chipEmoji}>{item.emoji}</Text>
                <Text style={styles.chipTxt}>{item.name}</Text>
                <Text style={styles.chipX}>✕</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Add item */}
        {selected.length < 6 && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowPicker((v) => !v)}>
            <Text style={styles.addTxt}>＋ Add item ({selected.length}/6)</Text>
          </TouchableOpacity>
        )}

        {/* Search dropdown */}
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
              data={filtered}
              keyExtractor={(i) => i.id}
              style={{ maxHeight: 220 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.suggestion} onPress={() => addItem(item.id)}>
                  <Text style={styles.suggEmoji}>{item.emoji}</Text>
                  <Text style={styles.suggName}>{item.name}</Text>
                  <Text style={styles.suggUnit}>{item.unit}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.noResults}>No items match</Text>}
            />
          </View>
        )}

        {/* Compare button */}
        {selectedItems.length >= 1 && (
          <TouchableOpacity
            style={[styles.compareBtn, loading && { opacity: 0.6 }]}
            onPress={runCompare}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={Colors.bg} />
              : <Text style={styles.compareTxt}>⚡ Compare {selectedItems.length} Item{selectedItems.length > 1 ? 's' : ''}</Text>}
          </TouchableOpacity>
        )}

        {/* API down */}
        {apiDown && (
          <View style={styles.apiBox}>
            <Text style={styles.apiTitle}>🔌 API Offline</Text>
            <Text style={styles.apiSub}>Start the FastAPI server to use store comparison.</Text>
          </View>
        )}

        {/* Results */}
        {result && renderTable(result)}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow:{ fontSize: 22, color: Colors.t2 },
  title:   { fontSize: 18, fontWeight: '800', color: Colors.t1 },
  content: { padding: 16 },

  hint: { fontSize: 14, color: Colors.t4, marginBottom: 16, lineHeight: 20 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.veggie + '15', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.veggie + '40' },
  chipEmoji: { fontSize: 14 },
  chipTxt:   { fontSize: 13, fontWeight: '700', color: Colors.veggie },
  chipX:     { fontSize: 11, color: Colors.veggie + 'AA' },

  addBtn:  { backgroundColor: Colors.s2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', marginBottom: 8 },
  addTxt:  { fontSize: 14, fontWeight: '600', color: Colors.t3 },

  pickerBox:   { backgroundColor: Colors.s2, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, overflow: 'hidden' },
  pickerInput: { paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: Colors.t1, borderBottomWidth: 1, borderBottomColor: Colors.border },
  suggestion:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border2 },
  suggEmoji:   { fontSize: 18, width: 28, textAlign: 'center' },
  suggName:    { flex: 1, fontSize: 14, color: Colors.t1 },
  suggUnit:    { fontSize: 12, color: Colors.t4 },
  noResults:   { padding: 16, color: Colors.t4, textAlign: 'center', fontSize: 14 },

  compareBtn: { backgroundColor: Colors.deal, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginVertical: 8 },
  compareTxt: { fontSize: 16, fontWeight: '800', color: Colors.bg },

  apiBox:  { backgroundColor: Colors.flagged + '12', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.flagged + '30', marginBottom: 16 },
  apiTitle:{ fontSize: 14, fontWeight: '700', color: Colors.flagged, marginBottom: 4 },
  apiSub:  { fontSize: 12, color: Colors.t4 },

  resultWrap: { marginTop: 20, gap: 16 },
  winnerBanner: { backgroundColor: Colors.veggie + '15', borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.veggie, marginBottom: 8 },
  winnerText: { fontSize: 13, fontWeight: '700', color: Colors.veggie, lineHeight: 18 },
  tableScroll: { borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.s1, overflow: 'hidden' },
  table: { flexDirection: 'column' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: Colors.s2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border2, alignItems: 'center', minHeight: 52 },
  totalRow: { backgroundColor: Colors.s2, borderBottomWidth: 0 },
  headerCell: { paddingVertical: 12, paddingHorizontal: 10, justifyContent: 'center' },
  headerCellTxt: { fontSize: 11, fontWeight: '800', color: Colors.t3, textTransform: 'uppercase', letterSpacing: 0.5 },
  mktNameHeader: { fontSize: 12, fontWeight: '800', color: Colors.t1 },
  mktSubHeader: { fontSize: 9, color: Colors.t4, marginTop: 2 },
  cell: { paddingVertical: 10, paddingHorizontal: 10, justifyContent: 'center' },
  cellItemEmoji: { fontSize: 14 },
  cellItemName: { fontSize: 12, fontWeight: '600', color: Colors.t2, flex: 1 },
  cellPriceText: { fontSize: 11, fontFamily: Fonts.mono, color: Colors.t3 },
  cellPriceCheapest: { color: Colors.veggie },
  cellCheapestBg: { backgroundColor: Colors.veggie + '0a' },
  cellLogsTxt: { fontSize: 9, color: Colors.t5, marginTop: 2 },
  cellNa: { fontSize: 13, color: Colors.t5, fontWeight: '500' },
  totalRowLabel: { fontSize: 13, fontWeight: '800', color: Colors.t1 },
  totalPriceText: { fontSize: 12, fontFamily: Fonts.mono, color: Colors.birr },
  totalPriceCheapest: { color: Colors.veggie },
  totalRankTxt: { fontSize: 9, color: Colors.t4, marginTop: 2 },
  saveBtn: { backgroundColor: Colors.veggie, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: Colors.bg },
});
