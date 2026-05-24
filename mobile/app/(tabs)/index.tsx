/**
 * Home / Dashboard screen
 * Shows latest price logs + quick-access categories
 * Sprint 1: skeleton + real data from Supabase
 */
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PriceFeed {
  id:             string;
  item_name:      string;
  item_emoji:     string;
  item_category:  CategoryKey;
  item_unit:      string;
  market_name:    string;
  market_sub_city:string;
  price_etb:      number;
  logged_at:      string;
  confirmed_count:number;
}

async function fetchFeed(): Promise<PriceFeed[]> {
  const { data, error } = await supabase
    .from('latest_prices')
    .select('*')
    .order('logged_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

const CATEGORIES = [
  { key: 'veggie',  label: 'Veggies', emoji: '🥬' },
  { key: 'grain',   label: 'Grains',  emoji: '🌾' },
  { key: 'protein', label: 'Protein', emoji: '🍗' },
  { key: 'oil',     label: 'Oil',     emoji: '🫙' },
  { key: 'dairy',   label: 'Dairy',   emoji: '🥛' },
  { key: 'spice',   label: 'Spice',   emoji: '🌶' },
] as const;

export default function HomeScreen() {
  const { user }  = useAuthStore();
  const insets    = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['feed'],
    queryFn:  fetchFeed,
  });

  const renderItem = ({ item }: { item: PriceFeed }) => {
    const catColor = categoryColor(item.item_category);
    const hoursAgo = Math.round(
      (Date.now() - new Date(item.logged_at).getTime()) / 3_600_000,
    );
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.8}>
        <View style={[styles.catDot, { backgroundColor: catColor }]} />
        <Text style={styles.emoji}>{item.item_emoji}</Text>
        <View style={styles.cardBody}>
          <Text style={styles.itemName}>{item.item_name}</Text>
          <Text style={styles.market}>{item.market_name} · {item.market_sub_city}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.price}>{item.price_etb.toFixed(0)}</Text>
          <Text style={styles.unit}>ETB/{item.item_unit}</Text>
          <Text style={styles.age}>{hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)}d ago`}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>ሰላም 👋</Text>
          <Text style={styles.subtitle}>Live market prices</Text>
        </View>
        <View style={styles.offlineDot} />
      </View>

      {/* Category chips */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(c) => c.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catRow}
        renderItem={({ item: c }) => (
          <TouchableOpacity
            style={[styles.catChip, { borderColor: categoryColor(c.key) }]}
            activeOpacity={0.7}
          >
            <Text style={styles.catEmoji}>{c.emoji}</Text>
            <Text style={[styles.catLabel, { color: categoryColor(c.key) }]}>{c.label}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Feed */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.veggie} size="large" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.veggie}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No prices yet. Be the first to log! 🚀</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: Colors.bg },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  greeting: { fontSize: 20, fontWeight: '800', color: Colors.t1 },
  subtitle: { fontSize: 13, color: Colors.t4, marginTop: 2 },
  offlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.veggie },
  catRow:   { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  catChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1, backgroundColor: Colors.s1 },
  catEmoji: { fontSize: 14 },
  catLabel: { fontSize: 12, fontWeight: '700' },
  list:     { paddingHorizontal: 16, gap: 8, paddingBottom: 20 },
  card:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s1, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.border },
  catDot:   { width: 4, height: 36, borderRadius: 2 },
  emoji:    { fontSize: 24, width: 32, textAlign: 'center' },
  cardBody: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  market:   { fontSize: 12, color: Colors.t4, marginTop: 2 },
  cardRight:{ alignItems: 'flex-end' },
  price:    { fontSize: 18, fontWeight: '800', color: Colors.birr },
  unit:     { fontSize: 11, color: Colors.t4, marginTop: 1 },
  age:      { fontSize: 10, color: Colors.t5, marginTop: 4 },
  emptyText:{ fontSize: 15, color: Colors.t4, textAlign: 'center' },
});
