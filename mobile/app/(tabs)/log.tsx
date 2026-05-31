/**
 * Log Price screen  — Sprint 1 core feature
 * Lets authenticated users log a price for an item at a market.
 * Writes to Supabase price_logs (online) or offline queue (offline).
 */
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStore } from '@/stores/offlineStore';
import { useToastStore } from '@/stores/toastStore';
import { optimizeSplit } from '@/lib/api';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import PulseButton from '@/components/PulseButton';
import AnomalyHint from '@/components/AnomalyHint';
import GlowyInput from '@/components/GlowyInput';
import { hap } from '@/lib/haptics';

// ── Types ────────────────────────────────────────────────────────────────────
interface Item    { id: string; name: string; emoji: string; category: CategoryKey; unit: string }
interface Market  { id: string; name: string; sub_city: string }

// ── Data fetchers ────────────────────────────────────────────────────────────
async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('id, name, emoji, category, unit')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

async function fetchMarkets(): Promise<Market[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('id, name, sub_city')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// ── Alert checker (fire-and-forget) ──────────────────────────────────────────
async function checkAlerts(
  logId: string, itemId: string, marketId: string, priceEtb: number, userId: string,
) {
  try {
    // Fetch user's active alerts for this item
    const { data: alerts } = await supabase
      .from('alerts')
      .select('id,item_id,market_id,target_price,direction')
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .eq('is_active', true)
      .is('triggered_at', null);

    if (!alerts?.length) return;

    const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'}/alerts/check`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_log: { log_id: logId, item_id: itemId, market_id: marketId, price_etb: priceEtb },
        alerts:  alerts.map((a) => ({
          alert_id:     a.id,
          user_id:      userId,
          item_id:      a.item_id,
          market_id:    a.market_id,
          target_price: a.target_price,
          direction:    a.direction,
        })),
      }),
    });

    if (!res.ok) return;
    const { triggered } = await res.json();

    for (const t of triggered) {
      // Mark alert as triggered in DB
      await supabase.from('alerts')
        .update({ triggered_at: new Date().toISOString(), is_active: false })
        .eq('id', t.alert_id);

      // Show in-app toast — imported via module-level store access
      useToastStore.getState().showToast(`🔔 Alert: ${t.message}`, 'success');
    }
  } catch {
    // Silent fail — alert checking is non-critical
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function LogScreen() {
  const { user }                           = useAuthStore();
  const { isOnline, addPending }           = useOfflineStore();
  const { showToast }                      = useToastStore();
  const insets                             = useSafeAreaInsets();
  const queryClient                        = useQueryClient();
  const router                             = useRouter();

  const [selectedItem,   setSelectedItem]  = useState<Item   | null>(null);
  const [selectedMarket, setMarket]        = useState<Market | null>(null);
  const [price,          setPrice]         = useState('');
  const [unit,           setUnit]          = useState<'kg' | 'piece' | 'bundle'>('kg');
  const [note,           setNote]          = useState('');
  const [submitting,     setSubmitting]    = useState(false);

  const [itemSearch,  setItemSearch]  = useState('');
  const [showItems,   setShowItems]   = useState(false);
  const [showMarkets, setShowMarkets] = useState(false);

  const { data: items   = [] } = useQuery({ queryKey: ['items'],   queryFn: fetchItems   });
  const { data: markets = [] } = useQuery({ queryKey: ['markets'], queryFn: fetchMarkets });

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(itemSearch.toLowerCase()),
  );

  const submit = async () => {
    if (!user)           return Alert.alert('Please sign in first');
    if (!selectedItem)   return Alert.alert('Pick an item');
    if (!selectedMarket) return Alert.alert('Pick a market');
    const priceNum = parseFloat(price);
    if (!price || isNaN(priceNum) || priceNum <= 0) return Alert.alert('Enter a valid price');

    setSubmitting(true);

    if (!isOnline) {
      // Offline — queue locally
      await addPending({
        id:        crypto.randomUUID(),
        item_id:   selectedItem.id,
        market_id: selectedMarket.id,
        price_etb: priceNum,
        logged_at: new Date().toISOString(),
        unit,
        notes:     note.trim() || undefined,
        synced:    false,
      });
      setSubmitting(false);
      reset();
      hap.success();
      router.push(`/log-success?item=${encodeURIComponent(selectedItem.name)}&market=${encodeURIComponent(selectedMarket.name)}&price=${priceNum}&online=false` as any);
      return;
    }

    // Phase 12-A: Rate limit check (max 5 logs/item/market/user/24h)
    const { data: withinLimit, error: limitErr } = await supabase.rpc('check_log_rate_limit', {
      p_user_id: user.id,
      p_item_id: selectedItem.id,
      p_market_id: selectedMarket.id,
    });

    if (limitErr) {
      console.warn('[Rate Limit] Failed to check limit:', limitErr.message);
    } else if (withinLimit === false) {
      setSubmitting(false);
      hap.error();
      return Alert.alert(
        'Rate Limit Exceeded',
        'You have reached the limit of 5 logs for this item at this market in the last 24 hours.'
      );
    }

    const { data: logData, error } = await supabase.from('price_logs').insert({
      item_id:   selectedItem.id,
      market_id: selectedMarket.id,
      logged_by: user.id,
      price_etb: priceNum,
      unit,
      notes:     note.trim() || null,
    }).select('id').single();

    if (error) {
      setSubmitting(false);
      hap.error();
      Alert.alert('Error', error.message);
    } else {
      // Award +10 points (non-blocking)
      supabase.rpc('award_points', { p_user_id: user.id, p_points: 10 }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      });

      setSubmitting(false);
      // Check if any of this user's alerts were triggered
      checkAlerts(logData?.id ?? '', selectedItem.id, selectedMarket.id, priceNum, user.id);

      const itemName  = selectedItem.name;
      const mktName   = selectedMarket.name;
      reset();
      hap.success();
      router.push(`/log-success?item=${encodeURIComponent(itemName)}&market=${encodeURIComponent(mktName)}&price=${priceNum}&online=true` as any);
    }
  };

  const reset = () => {
    setSelectedItem(null);
    setMarket(null);
    setPrice('');
    setUnit('kg');
    setNote('');
    setItemSearch('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Log a Price</Text>
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>📡 Offline — will sync later</Text>
          </View>
        )}

        {/* ITEM PICKER */}
        <Text style={styles.fieldLabel}>Item</Text>
        <TouchableOpacity
          style={styles.picker}
          onPress={() => { setShowItems(!showItems); setShowMarkets(false); }}
        >
          <Text style={selectedItem ? styles.pickerValue : styles.pickerPlaceholder}>{selectedItem ? `${selectedItem.emoji} ${selectedItem.name}` : 'Choose item...'}</Text>
          <Text style={styles.chevron}>{showItems ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showItems && (
          <View style={styles.dropdown}>
            <GlowyInput
              style={styles.searchInput}
              placeholder="Search items..."
              value={itemSearch}
              onChangeText={setItemSearch}
            />
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {filteredItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.dropItem,
                    selectedItem?.id === item.id && styles.dropItemSel,
                  ]}
                  onPress={() => { setSelectedItem(item); setShowItems(false); setItemSearch(''); }}
                >
                  <View style={[styles.catBadge, { backgroundColor: categoryColor(item.category) + '30', borderColor: categoryColor(item.category) }]}>
                    <Text style={{ fontSize: 12, color: categoryColor(item.category) }}>{item.emoji}</Text>
                  </View>
                  <Text style={styles.dropItemText}>{item.name}</Text>
                  <Text style={styles.dropItemUnit}>{item.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* MARKET PICKER */}
        <Text style={styles.fieldLabel}>Market</Text>
        <TouchableOpacity
          style={styles.picker}
          onPress={() => { setShowMarkets(!showMarkets); setShowItems(false); }}
        >
          <Text style={selectedMarket ? styles.pickerValue : styles.pickerPlaceholder}>{selectedMarket ? `${selectedMarket.name} — ${selectedMarket.sub_city}` : 'Choose market...'}</Text>
          <Text style={styles.chevron}>{showMarkets ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showMarkets && (
          <View style={styles.dropdown}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {markets.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.dropItem,
                    selectedMarket?.id === m.id && styles.dropItemSel,
                  ]}
                  onPress={() => { setMarket(m); setShowMarkets(false); }}
                >
                  <Text style={styles.dropItemText}>{`🏪 ${m.name}`}</Text>
                  <Text style={styles.dropItemUnit}>{m.sub_city}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* PRICE INPUT */}
        <Text style={styles.fieldLabel}>{`Price (ETB)${selectedItem ? ` per ${selectedItem.unit}` : ''}`}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.currency}>ETB</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor={Colors.t4}
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
        </View>
        {/* Anomaly hint — shown when FastAPI is available */}
        <AnomalyHint
          itemId={selectedItem?.id ?? null}
          marketId={selectedMarket?.id ?? null}
          price={price}
        />

        {/* UNIT TOGGLE */}
        <Text style={styles.fieldLabel}>Unit</Text>
        <View style={styles.segControl}>
          {(['kg', 'piece', 'bundle'] as const).map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.segBtn, unit === u && styles.segBtnOn]}
              onPress={() => setUnit(u)}
              activeOpacity={0.7}
            >
              <Text style={[styles.segLabel, unit === u && styles.segLabelOn]}>
                {u === 'kg' ? 'Per kg' : u === 'piece' ? 'Per piece' : 'Per bundle'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* PRICE PREVIEW */}
        {price !== '' && !isNaN(parseFloat(price)) && parseFloat(price) > 0 && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Price Preview</Text>
            <Text style={styles.previewPrice}>{`${parseFloat(price).toFixed(0)} ETB / ${unit}${unit === 'kg' ? ` = ${(parseFloat(price) / 10).toFixed(1)} ETB per 100g` : ''}`}</Text>
            <Text style={styles.previewPts}>You'll earn +10 pts ✨</Text>
          </View>
        )}

        {/* NOTE */}
        <Text style={styles.fieldLabel}>Note (optional)</Text>
        <GlowyInput
          style={styles.noteInput}
          placeholder="e.g. Very fresh, near entrance stall"
          value={note}
          onChangeText={setNote}
          maxLength={140}
          multiline
        />

        {/* SUBMIT */}
        {submitting ? (
          <View style={[styles.btn, { opacity: 0.6 }]}>
            <ActivityIndicator color={Colors.bg} />
          </View>
        ) : (
          <PulseButton
            label="Submit Price ✓ +10 pts"
            onPress={submit}
            style={{ marginTop: 28 }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  center:  { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 60 },
  title:   { fontSize: 24, fontWeight: '800', color: Colors.t1, marginBottom: 20 },
  offlineBanner: { backgroundColor: Colors.oil + '20', borderRadius: 10, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: Colors.oil + '40' },
  offlineText:   { color: Colors.oil, fontSize: 13, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.t3, marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  picker:     { backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerValue:       { fontSize: 15, color: Colors.t1 },
  pickerPlaceholder: { fontSize: 15, color: Colors.t4 },
  chevron:    { color: Colors.t4, fontSize: 12 },
  dropdown:   { backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginTop: 4, overflow: 'hidden' },
  searchInput:{ borderBottomWidth: 1, borderBottomColor: Colors.border, padding: 12, color: Colors.t1, fontSize: 14 },
  dropItem:   { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border2 },
  dropItemSel:{ backgroundColor: Colors.veggie + '15' },
  dropItemText:{ flex: 1, fontSize: 14, color: Colors.t1 },
  dropItemUnit:{ fontSize: 12, color: Colors.t4 },
  catBadge:   { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  priceRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  currency:   { paddingHorizontal: 14, fontSize: 15, color: Colors.birr, fontWeight: '700' },
  priceInput: { flex: 1, padding: 14, fontSize: 24, fontWeight: '800', color: Colors.t1 },
  // Unit toggle
  segControl: { flexDirection: 'row', backgroundColor: Colors.s2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  segBtn:     { flex: 1, padding: 11, alignItems: 'center' },
  segBtnOn:   { backgroundColor: Colors.veggie },
  segLabel:   { fontSize: 12, fontWeight: '700', color: Colors.t4 },
  segLabelOn: { color: Colors.bg },
  // Price preview
  previewCard:  { backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.veggie + '30', padding: 14, marginTop: 10, gap: 4 },
  previewTitle: { fontSize: 10, fontWeight: '800', color: Colors.t5, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewPrice: { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  previewPts:   { fontSize: 12, color: Colors.deal, fontWeight: '600' },
  // Note
  noteInput:    { backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, color: Colors.t1, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  // Submit
  btn:        { backgroundColor: Colors.veggie, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 28 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { fontSize: 16, fontWeight: '700', color: Colors.bg },
});
