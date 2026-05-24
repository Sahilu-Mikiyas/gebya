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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStore } from '@/stores/offlineStore';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

// ── Component ────────────────────────────────────────────────────────────────
export default function LogScreen() {
  const { user }                           = useAuthStore();
  const { isOnline, addPending }           = useOfflineStore();
  const insets                             = useSafeAreaInsets();

  const [selectedItem,   setSelectedItem]  = useState<Item   | null>(null);
  const [selectedMarket, setMarket]        = useState<Market | null>(null);
  const [price,          setPrice]         = useState('');
  const [submitting,     setSubmitting]    = useState(false);
  const [success,        setSuccess]       = useState(false);

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
        synced:    false,
      });
      setSubmitting(false);
      setSuccess(true);
      return;
    }

    const { error } = await supabase.from('price_logs').insert({
      item_id:   selectedItem.id,
      market_id: selectedMarket.id,
      user_id:   user.id,
      price_etb: priceNum,
    });

    setSubmitting(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSuccess(true);
    }
  };

  const reset = () => {
    setSelectedItem(null);
    setMarket(null);
    setPrice('');
    setSuccess(false);
    setItemSearch('');
  };

  if (success) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.successEmoji}>✅</Text>
        <Text style={styles.successTitle}>
          {isOnline ? 'Price logged!' : 'Saved offline'}
        </Text>
        <Text style={styles.successSub}>
          {isOnline
            ? `+10 pts · ${selectedItem?.name} at ${selectedMarket?.name}`
            : 'Will sync when you\'re back online'}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={reset}>
          <Text style={styles.btnText}>Log another</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
          <Text style={selectedItem ? styles.pickerValue : styles.pickerPlaceholder}>
            {selectedItem ? `${selectedItem.emoji} ${selectedItem.name}` : 'Choose item...'}
          </Text>
          <Text style={styles.chevron}>{showItems ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showItems && (
          <View style={styles.dropdown}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search items..."
              placeholderTextColor={Colors.t4}
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
          <Text style={selectedMarket ? styles.pickerValue : styles.pickerPlaceholder}>
            {selectedMarket ? `${selectedMarket.name} — ${selectedMarket.sub_city}` : 'Choose market...'}
          </Text>
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
                  <Text style={styles.dropItemText}>🏪 {m.name}</Text>
                  <Text style={styles.dropItemUnit}>{m.sub_city}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* PRICE INPUT */}
        <Text style={styles.fieldLabel}>
          Price (ETB){selectedItem && ` per ${selectedItem.unit}`}
        </Text>
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

        {/* SUBMIT */}
        <TouchableOpacity
          style={[styles.btn, submitting && styles.btnDisabled]}
          onPress={submit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color={Colors.bg} />
            : <Text style={styles.btnText}>Submit Price +10 pts</Text>}
        </TouchableOpacity>
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
  btn:        { backgroundColor: Colors.veggie, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 28 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { fontSize: 16, fontWeight: '700', color: Colors.bg },
  successEmoji: { fontSize: 72, marginBottom: 16 },
  successTitle: { fontSize: 26, fontWeight: '800', color: Colors.t1, marginBottom: 8 },
  successSub:   { fontSize: 14, color: Colors.t4, textAlign: 'center', marginBottom: 32 },
});
