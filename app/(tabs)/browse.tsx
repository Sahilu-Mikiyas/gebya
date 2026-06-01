/**
 * Browse — search items or explore markets
 */
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Item {
  id:       string;
  name:     string;
  emoji:    string;
  category: CategoryKey;
  unit:     string;
}

interface Market {
  id:       string;
  name:     string;
  sub_city: string;
  lat:      number | null;
  lng:      number | null;
}

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
    .select('id, name, sub_city, lat, lng')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

type Tab = 'items' | 'markets';

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab]       = useState<Tab>('items');
  const [search, setSearch] = useState('');

  const { data: items   = [], isLoading: loadingItems   } = useQuery({ queryKey: ['items'],   queryFn: fetchItems   });
  const { data: markets = [], isLoading: loadingMarkets } = useQuery({ queryKey: ['markets'], queryFn: fetchMarkets });

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredMarkets = markets.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.sub_city.toLowerCase().includes(search.toLowerCase())
  );

  const isLoading = tab === 'items' ? loadingItems : loadingMarkets;

  const renderItem = ({ item }: { item: Item }) => {
    const color = categoryColor(item.category);
    return (
      <TouchableOpacity
        style={styles.itemCard}
        activeOpacity={0.75}
        onPress={() => router.push(`/item/${item.id}` as any)}
      >
        <View style={[styles.itemEmoji, { backgroundColor: color + '18' }]}>
          <Text style={styles.emojiText}>{item.emoji}</Text>
        </View>
        <View style={styles.itemBody}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={[styles.itemCat, { color }]}>{item.category} · per {item.unit}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const renderMarket = ({ item: m }: { item: Market }) => (
    <TouchableOpacity
      style={styles.marketCard}
      activeOpacity={0.75}
      onPress={() => router.push(`/market/${m.id}` as any)}
    >
      <View style={styles.marketIcon}>
        <Text style={styles.marketEmoji}>🏪</Text>
      </View>
      <View style={styles.marketBody}>
        <Text style={styles.marketName}>{m.name}</Text>
        <Text style={styles.marketSub}>{m.sub_city}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Browse</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={tab === 'items' ? 'Search items…' : 'Search markets…'}
          placeholderTextColor={Colors.t5}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'items' && styles.tabActive]}
          onPress={() => { setTab('items'); setSearch(''); }}
        >
          <Text style={[styles.tabText, tab === 'items' && styles.tabTextActive]}>
            🥬 Items ({items.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'markets' && styles.tabActive]}
          onPress={() => { setTab('markets'); setSearch(''); }}
        >
          <Text style={[styles.tabText, tab === 'markets' && styles.tabTextActive]}>
            🏪 Markets ({markets.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.veggie} size="large" />
        </View>
      ) : tab === 'items' ? (
        <FlatList
          data={filteredItems}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No items found</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredMarkets}
          keyExtractor={(m) => m.id}
          renderItem={renderMarket}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No markets found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title:  { fontSize: 26, fontWeight: '800', color: Colors.t1, letterSpacing: -0.5 },

  // Search
  searchWrap:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 14, backgroundColor: Colors.s2, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, gap: 10 },
  searchIcon:  { fontSize: 16 },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: Colors.t1 },
  clearBtn:    { fontSize: 14, color: Colors.t4, paddingLeft: 4 },

  // Tabs
  tabRow:       { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 4, gap: 4 },
  tabBtn:       { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive:    { backgroundColor: Colors.s4 },
  tabText:      { fontSize: 13, fontWeight: '600', color: Colors.t4 },
  tabTextActive:{ color: Colors.t1 },

  // List
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },

  // Item card
  itemCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s1, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.border },
  itemEmoji: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 22 },
  itemBody:  { flex: 1 },
  itemName:  { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  itemCat:   { fontSize: 12, marginTop: 3, fontWeight: '600', textTransform: 'capitalize' },
  chevron:   { fontSize: 22, color: Colors.t5 },

  // Market card
  marketCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s1, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.border },
  marketIcon:  { width: 46, height: 46, borderRadius: 12, backgroundColor: Colors.s3, alignItems: 'center', justifyContent: 'center' },
  marketEmoji: { fontSize: 22 },
  marketBody:  { flex: 1 },
  marketName:  { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  marketSub:   { fontSize: 12, color: Colors.t4, marginTop: 3 },

  emptyText: { fontSize: 15, color: Colors.t4 },
});
