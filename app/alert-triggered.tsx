/**
 * alert-triggered.tsx — Phase 8-C
 * Full-screen celebration modal shown when an alert target is hit.
 * Route: /alert-triggered?alertId=&itemId=&marketId=&targetPrice=&currentPrice=
 *
 * Registered in _layout.tsx as presentation: 'modal'
 */
import { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ItemInfo   { name: string; emoji: string; unit: string }
interface MarketInfo { name: string; sub_city: string }
interface LogInfo    { confirmed_count: number; logged_at: string }

export default function AlertTriggeredScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    itemId, marketId,
    targetPrice: tpStr, currentPrice: cpStr,
  } = useLocalSearchParams<{
    alertId:      string;
    itemId:       string;
    marketId:     string;
    targetPrice:  string;
    currentPrice: string;
  }>();

  const targetPrice  = parseFloat(tpStr  ?? '0');
  const currentPrice = parseFloat(cpStr  ?? '0');
  const saving       = Math.max(0, targetPrice - currentPrice).toFixed(0);

  // ── Animations ─────────────────────────────────────────────────────────────
  const bellScale   = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const chipsY      = useRef([0,1,2].map(() => new Animated.Value(30))).current;
  const chipsOp     = useRef([0,1,2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Bell pop in
    Animated.spring(bellScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }).start();

    // Glow pulse loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1,   duration: 900, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    // Chips stagger in
    chipsY.forEach((anim, i) => {
      Animated.spring(anim, { toValue: 0, useNativeDriver: true, delay: 400 + i * 150, tension: 60 }).start();
    });
    chipsOp.forEach((anim, i) => {
      Animated.timing(anim, { toValue: 1, duration: 300, delay: 400 + i * 150, useNativeDriver: true }).start();
    });
  }, []);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: item } = useQuery<ItemInfo>({
    queryKey: ['item-info', itemId],
    queryFn: async (): Promise<ItemInfo> => {
      const { data } = await supabase.from('items').select('name,emoji,unit').eq('id', itemId).single();
      if (!data) throw new Error('Item not found');
      return { name: data.name, emoji: data.emoji, unit: data.unit };
    },
    enabled: !!itemId,
  });

  const { data: market } = useQuery<MarketInfo>({
    queryKey: ['market-info', marketId],
    queryFn: async (): Promise<MarketInfo> => {
      const { data } = await supabase.from('markets').select('name,sub_city').eq('id', marketId).single();
      if (!data) throw new Error('Market not found');
      return { name: data.name, sub_city: data.sub_city };
    },
    enabled: !!marketId,
  });

  const { data: logInfo } = useQuery<LogInfo>({
    queryKey: ['latest-log', itemId, marketId],
    queryFn: async (): Promise<LogInfo> => {
      const { data } = await supabase
        .from('latest_prices')
        .select('confirmed_count, logged_at')
        .eq('item_id', itemId)
        .eq('market_id', marketId)
        .single();
      if (!data) throw new Error('Price not found');
      return { confirmed_count: (data as any).confirmed_count, logged_at: (data as any).logged_at };
    },
    enabled: !!itemId && !!marketId,
  });

  function timeAgo(iso?: string) {
    if (!iso) return '—';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (m < 2)  return 'just now';
    if (m < 60) return `${m}m ago`;
    return `${Math.round(m / 60)}h ago`;
  }

  const chips = [
    { label: `💰 Save ${saving} ETB`,                 color: Colors.veggie },
    { label: `✓ ${logInfo?.confirmed_count ?? 0} confirms`, color: Colors.deal  },
    { label: `🕐 Updated ${timeAgo(logInfo?.logged_at)}`, color: Colors.t3   },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Bell icon with glow */}
        <View style={styles.bellWrap}>
          <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
          <Animated.View style={{ transform: [{ scale: bellScale }] }}>
            <Text style={styles.bell}>🔔</Text>
          </Animated.View>
        </View>

        <Text style={styles.headline}>Your target price{'\n'}was hit!</Text>

        {/* Price comparison */}
        <View style={styles.priceRow}>
          <View style={styles.priceBox}>
            <Text style={styles.priceBoxLabel}>Your target</Text>
            <Text style={styles.priceStrike}>{targetPrice.toFixed(0)} ETB</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
          <View style={[styles.priceBox, styles.priceBoxWin]}>
            <Text style={[styles.priceBoxLabel, { color: Colors.veggie }]}>Current price</Text>
            <Text style={[styles.priceNow, { color: Colors.veggie }]}>{currentPrice.toFixed(0)} ETB</Text>
          </View>
        </View>

        {/* Chips row */}
        <View style={styles.chips}>
          {chips.map((chip, i) => (
            <Animated.View
              key={i}
              style={[
                styles.chip,
                { backgroundColor: chip.color + '15', borderColor: chip.color + '40' },
                { opacity: chipsOp[i], transform: [{ translateY: chipsY[i] }] },
              ]}
            >
              <Text style={[styles.chipTxt, { color: chip.color }]}>{chip.label}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Market info */}
        {market && (
          <View style={styles.marketRow}>
            <Text style={styles.marketIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.marketName}>{market.name}</Text>
              <Text style={styles.marketSub}>{market.sub_city}</Text>
            </View>
          </View>
        )}

        {/* Item header */}
        {item && (
          <View style={styles.itemRow}>
            <Text style={styles.itemEmoji}>{item.emoji}</Text>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemUnit}>per {item.unit}</Text>
          </View>
        )}

        {/* CTAs */}
        <View style={styles.ctaGroup}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push(`/item/${itemId}` as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryTxt}>View Full Item Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryTxt}>← Back to Alerts</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  content: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 48, paddingTop: 32 },

  bellWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 24, position: 'relative' },
  glow: {
    position:        'absolute',
    width:           130,
    height:          130,
    borderRadius:    65,
    backgroundColor: Colors.veggie + '30',
  },
  bell:     { fontSize: 72 },
  headline: { fontSize: 30, fontWeight: '900', color: Colors.t1, textAlign: 'center', letterSpacing: -0.8, lineHeight: 36, marginBottom: 28 },

  priceRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24, width: '100%' },
  priceBox:     { flex: 1, backgroundColor: Colors.s2, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  priceBoxWin:  { backgroundColor: Colors.veggie + '12', borderColor: Colors.veggie + '40' },
  priceBoxLabel:{ fontSize: 11, color: Colors.t5, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  priceStrike:  { fontSize: 22, fontWeight: '800', color: Colors.t4, textDecorationLine: 'line-through' },
  priceNow:     { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  arrow:        { fontSize: 20, color: Colors.t5 },

  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 },
  chip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, borderWidth: 1 },
  chipTxt:  { fontSize: 12, fontWeight: '700' },

  marketRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.s1, borderRadius: 14, padding: 16, width: '100%', borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  marketIcon: { fontSize: 20 },
  marketName: { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  marketSub:  { fontSize: 12, color: Colors.t4, marginTop: 2 },

  itemRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  itemEmoji: { fontSize: 28 },
  itemName:  { fontSize: 17, fontWeight: '800', color: Colors.t1 },
  itemUnit:  { fontSize: 12, color: Colors.t4 },

  ctaGroup:     { width: '100%', gap: 10 },
  primaryBtn:   { backgroundColor: Colors.veggie, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  primaryTxt:   { fontSize: 16, fontWeight: '800', color: Colors.bg },
  secondaryBtn: { backgroundColor: Colors.s1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  secondaryTxt: { fontSize: 15, fontWeight: '600', color: Colors.t3 },
});
