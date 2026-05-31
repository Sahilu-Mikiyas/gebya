/**
 * Home — live price feed with Best Deal hero, category filter, and community feed.
 * Phase 4: adds BestDealCard, two-section layout, saving badges, community feed with usernames.
 */
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ScrollView,
  SectionList,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStore } from '@/stores/offlineStore';
import { useToastStore } from '@/stores/toastStore';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonHero, SkeletonDealRow, SkeletonFeedRow } from '@/components/Skeleton';
import BestDealCard, { DealItem } from '@/components/BestDealCard';
import FeedRow, { FeedEntry } from '@/components/FeedRow';
import EmptyShelf from '@/components/EmptyShelf';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PriceFeed {
  id:              string;
  item_id:         string;
  item_name:       string;
  item_emoji:      string;
  item_category:   CategoryKey;
  item_unit:       string;
  market_name:     string;
  market_id:       string;
  market_sub_city: string;
  price_etb:       number;
  avg_price?:      number;
  logged_at:       string;
  confirmed_count: number;
  flagged_count:   number;
  is_anomaly:      boolean;
}

interface LiveLog {
  id:           string;
  price_etb:    number;
  item_unit:    string;
  logged_at:    string;
  is_anomaly:   boolean;
  items:        { name: string; emoji: string; category: string } | null;
  markets:      { name: string } | null;
  profiles:     { display_name: string | null } | null;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────
async function fetchFeed(): Promise<PriceFeed[]> {
  const { data, error } = await supabase
    .from('latest_prices')
    .select('*')
    .order('logged_at', { ascending: false })
    .limit(80);
  if (error) throw error;
  return data ?? [];
}

async function fetchLiveFeed({ pageParam = 0 }): Promise<LiveLog[]> {
  const pageSize = 20;
  const from = pageParam * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await supabase
    .from('price_logs')
    .select('id, price_etb, item_unit, logged_at, is_anomaly, items(name, emoji, category), markets(name), profiles(display_name)')
    .order('logged_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data ?? []) as unknown as LiveLog[];
}

async function fetchDailyLogCount(): Promise<number> {
  const { data, error } = await supabase
    .from('daily_log_count')
    .select('count')
    .single();
  if (error) return 0;
  return (data as any)?.count ?? 0;
}

// ── Category filter ───────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all',     label: 'All',     emoji: '🛒' },
  { key: 'veggie',  label: 'Veggies', emoji: '🥬' },
  { key: 'grain',   label: 'Grains',  emoji: '🌾' },
  { key: 'protein', label: 'Protein', emoji: '🍗' },
  { key: 'dairy',   label: 'Dairy',   emoji: '🥛' },
  { key: 'oil',     label: 'Oil',     emoji: '🫙' },
  { key: 'spice',   label: 'Spice',   emoji: '🌶' },
  { key: 'bread',   label: 'Bread',   emoji: '🍞' },
] as const;

function freshnessLabel(logged_at: string) {
  const h = (Date.now() - new Date(logged_at).getTime()) / 3_600_000;
  if (h <  2) return { label: 'just now', color: Colors.veggie };
  if (h < 12) return { label: `${Math.round(h)}h ago`, color: Colors.veggie };
  if (h < 48) return { label: `${Math.round(h / 24)}d ago`, color: Colors.birr };
  return       { label: `${Math.round(h / 24)}d ago`, color: Colors.flagged };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user }     = useAuthStore();
  const { isOnline, pendingLogs, removePending } = useOfflineStore();
  const { showToast }= useToastStore();
  const insets       = useSafeAreaInsets();
  const router       = useRouter();
  const queryClient  = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const [offlineExpanded, setOfflineExpanded] = useState(false);
  const offlineAnim = useRef(new Animated.Value(0)).current;

  const toggleOfflineBanner = () => {
    const toVal = offlineExpanded ? 0 : 1;
    setOfflineExpanded(!offlineExpanded);
    Animated.spring(offlineAnim, {
      toValue: toVal,
      useNativeDriver: false,
    }).start();
  };

  const offlineHeight = offlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });

  const { data: feedData = [], isLoading: loadingFeed, refetch: refetchFeed, isRefetching: isRefetchingFeed } = useQuery({
    queryKey: ['feed'],
    queryFn:  fetchFeed,
  });

  const { data: leaderboardData = [] } = useQuery({
    queryKey: ['market-leaderboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_value_rank')
        .select('market_id, market_name, value_ratio, rank, markets:market_id(sub_city)')
        .order('rank', { ascending: true })
        .limit(5);
      if (error) {
        console.warn('[fetchMarketLeaderboard] error, trying fallback:', error);
        const { data: fallbackData, error: err2 } = await supabase
          .from('market_value_rank')
          .select('market_id, market_name, value_ratio, rank')
          .order('rank', { ascending: true })
          .limit(5);
        if (err2) throw err2;
        return (fallbackData ?? []).map((x: any) => ({
          ...x,
          sub_city: 'Addis Ababa',
        }));
      }
      return (data ?? []).map((x: any) => ({
        market_id: x.market_id,
        market_name: x.market_name,
        value_ratio: x.value_ratio,
        rank: x.rank,
        sub_city: x.markets?.sub_city ?? 'Addis Ababa',
      }));
    },
    staleTime: 10 * 60_000,
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ['all-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('items').select('id, name, emoji');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: allMarkets = [] } = useQuery({
    queryKey: ['all-markets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('markets').select('id, name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const unsyncedLogs = pendingLogs.filter((l) => !l.synced);

  const {
    data: liveData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingLive,
    refetch: refetchLive,
    isRefetching: isRefetchingLive,
  } = useInfiniteQuery({
    queryKey: ['live-feed'],
    queryFn:  fetchLiveFeed,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length < 20 ? undefined : allPages.length;
    },
    staleTime: 60_000,
  });

  const { data: dailyCount = 0 } = useQuery({
    queryKey: ['daily-count'],
    queryFn:  fetchDailyLogCount,
    staleTime: 5 * 60_000,
  });

  const isLoading = loadingFeed || loadingLive;
  const isRefetching = isRefetchingFeed || isRefetchingLive;

  const refetch = useCallback(() => {
    refetchFeed();
    refetchLive();
  }, [refetchFeed, refetchLive]);

  // Best deal = cheapest non-anomaly price in the feed
  const bestDeal: DealItem | null = (() => {
    const sorted = [...feedData]
      .filter((p) => !p.is_anomaly)
      .sort((a, b) => a.price_etb - b.price_etb);
    if (!sorted.length) return null;
    const p = sorted[0];
    // Compute community avg for this item
    const sameItem = feedData.filter((x) => x.item_id === p.item_id);
    const avg = sameItem.length > 1
      ? sameItem.reduce((s, x) => s + x.price_etb, 0) / sameItem.length
      : 0;
    return {
      item_id:         p.item_id,
      item_name:       p.item_name,
      item_emoji:      p.item_emoji,
      item_category:   p.item_category,
      item_unit:       p.item_unit,
      market_name:     p.market_name,
      market_sub_city: p.market_sub_city,
      price_etb:       p.price_etb,
      avg_price:       avg,
      logged_at:       p.logged_at,
      confirmed_count: p.confirmed_count,
    };
  })();

  const filtered = activeCategory === 'all'
    ? feedData
    : feedData.filter((p) => p.item_category === activeCategory);

  // Build "Cheapest Finds" (top 5 deals by saving %)
  const cheapestFinds = [...filtered]
    .filter((p) => !p.is_anomaly)
    .sort((a, b) => a.price_etb - b.price_etb)
    .slice(0, 7);

  // Map live logs into FeedEntry shape
  const liveLogs = liveData?.pages.flat() ?? [];
  const feedEntries: FeedEntry[] = liveLogs.map((l) => ({
    id:            l.id,
    item_name:     (l.items as any)?.name    ?? '—',
    item_emoji:    (l.items as any)?.emoji   ?? '🏷',
    item_category: ((l.items as any)?.category ?? 'veggie') as CategoryKey,
    market_name:   (l.markets as any)?.name  ?? '—',
    price_etb:     l.price_etb,
    item_unit:     l.item_unit ?? 'kg',
    logged_at:     l.logged_at,
    display_name:  (l.profiles as any)?.display_name ?? null,
    is_anomaly:    l.is_anomaly,
  }));

  // ── Deal card render ──────────────────────────────────────────────────────
  const renderDealCard = ({ item }: { item: PriceFeed }) => {
    const catColor = categoryColor(item.item_category);
    const fresh    = freshnessLabel(item.logged_at);
    // Compute saving %
    const sameItem = feedData.filter((x) => x.item_id === item.item_id);
    const avg      = sameItem.length > 1
      ? sameItem.reduce((s, x) => s + x.price_etb, 0) / sameItem.length
      : 0;
    const saving   = avg > 0 ? Math.round(((avg - item.price_etb) / avg) * 100) : 0;

    return (
      <TouchableOpacity
        style={[styles.card, item.is_anomaly && styles.cardAnomaly]}
        activeOpacity={0.75}
        onPress={() => router.push(`/item/${item.item_id}` as any)}
      >
        <View style={[styles.accentBar, { backgroundColor: catColor }]} />
        <View style={[styles.emojiWrap, { backgroundColor: catColor + '18' }]}>
          <Text style={styles.emoji}>{item.item_emoji}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.itemName} numberOfLines={1}>{item.item_name}</Text>
          <Text style={styles.market} numberOfLines={1}>{`🏪 ${item.market_name} · ${item.market_sub_city}`}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.price, item.is_anomaly && { color: Colors.flagged }]}>{item.price_etb.toFixed(0)}</Text>
          <Text style={styles.unit}>ETB/{item.item_unit}</Text>
          {item.is_anomaly ? (
            <View style={[styles.freshBadge, { backgroundColor: Colors.flagged + '20' }]}>
              <Text style={[styles.freshText, { color: Colors.flagged }]}>⚠ suspicious</Text>
            </View>
          ) : saving > 5 ? (
            <View style={[styles.freshBadge, { backgroundColor: Colors.veggie + '20' }]}>
              <Text style={[styles.freshText, { color: Colors.veggie }]}>−{saving}%</Text>
            </View>
          ) : (
            <View style={[styles.freshBadge, { backgroundColor: fresh.color + '20' }]}>
              <Text style={[styles.freshText, { color: fresh.color }]}>{fresh.label}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Header (above FlatList) ───────────────────────────────────────────────
  const ListHeader = (
    <View style={{ gap: 8 }}>
      {/* Header bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>ሰላም 👋</Text>
          <Text style={styles.subtitle}>Today's Prices</Text>
        </View>
        <View style={[
          styles.statusPill,
          {
            borderColor:     isOnline ? Colors.veggie + '40' : Colors.flagged + '40',
            backgroundColor: isOnline ? Colors.veggie + '12' : Colors.flagged + '12',
          },
        ]}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.veggie : Colors.flagged }]} />
          <Text style={[styles.statusText, { color: isOnline ? Colors.veggie : Colors.flagged }]}>
            {isOnline ? (dailyCount > 0 ? `${dailyCount} logs today` : 'Live') : 'Offline'}
          </Text>
        </View>
      </View>

      {/* ⚠️ Expandable Offline Banner */}
      {!isOnline && (
        <View style={styles.offlineBannerContainer}>
          <TouchableOpacity
            style={styles.offlineBannerHeader}
            onPress={unsyncedLogs.length > 0 ? toggleOfflineBanner : undefined}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.offlineBannerIcon}>⚠️</Text>
              <Text style={styles.offlineBannerTitle}>
                {unsyncedLogs.length > 0
                  ? `Offline Mode — ${unsyncedLogs.length} logs pending`
                  : 'Offline Mode — Syncing paused'}
              </Text>
            </View>
            {unsyncedLogs.length > 0 && (
              <Text style={styles.offlineBannerToggleBtn}>
                {offlineExpanded ? 'Hide ▲' : 'View ▼'}
              </Text>
            )}
          </TouchableOpacity>
          
          {unsyncedLogs.length > 0 && (
            <Animated.View style={[styles.offlineBannerExpand, { maxHeight: offlineHeight }]}>
              <ScrollView
                nestedScrollEnabled
                style={styles.offlineQueueScroll}
                contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
              >
                {unsyncedLogs.map((log) => {
                  const feedMatch = feedData.find((f) => f.item_id === log.item_id);
                  const itemMatch = allItems.find((i) => i.id === log.item_id);
                  const marketMatch = allMarkets.find((m) => m.id === log.market_id);

                  const emoji = feedMatch?.item_emoji ?? itemMatch?.emoji ?? '🏷';
                  const itemName = feedMatch?.item_name ?? itemMatch?.name ?? 'Unknown Item';
                  const marketName = feedMatch?.market_name ?? marketMatch?.name ?? 'Unknown Market';

                  return (
                    <View key={log.id} style={styles.offlineLogItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Text style={styles.offlineItemEmoji}>{emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.offlineItemName} numberOfLines={1}>{itemName}</Text>
                            {log.sync_error && (
                              <View style={styles.failedBadge}>
                                <Text style={styles.failedBadgeText}>Failed</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.offlineMarketName} numberOfLines={1}>
                            {log.sync_error ? `❌ ${log.sync_error}` : marketName}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.offlineLogPrice}>{log.price_etb} ETB</Text>
                          <Text style={styles.offlineLogUnit}>{log.unit ? `per ${log.unit}` : 'per kg'}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.offlineDeleteBtn}
                          onPress={async () => {
                            await removePending(log.id);
                            showToast('Log removed from sync queue', 'info');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.offlineDeleteTxt}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              <View style={styles.offlineTipRow}>
                <Text style={styles.offlineTipText}>🔄 Will sync automatically when back online</Text>
              </View>
            </Animated.View>
          )}
        </View>
      )}

      {/* Best Deal Hero */}
      {bestDeal && (
        <BestDealCard
          deal={bestDeal}
          onPress={() => router.push(`/item/${bestDeal.item_id}` as any)}
          onAddToList={() => showToast(`${bestDeal.item_emoji} ${bestDeal.item_name} added to list!`, 'success')}
        />
      )}

      {/* 🏅 Best Value Markets This Week */}
      {leaderboardData && leaderboardData.length > 0 && (
        <View style={styles.leaderboardSection}>
          <Text style={styles.sectionTitle}>🏅 Best Value Markets This Week</Text>
          <View style={styles.leaderboardList}>
            {leaderboardData.map((item) => {
              const valueScore = Math.max(0, Math.min(100, Math.round((1.5 - item.value_ratio) * 100)));
              
              let rankBg = '#333333';
              let rankText = '#FFFFFF';
              let rankBorder = '#444444';
              let rankIcon = '';
              
              const rankNum = Number(item.rank);
              if (rankNum === 1) {
                rankBg = '#FFD700';
                rankText = '#000000';
                rankBorder = '#B8860B';
                rankIcon = '🏆';
              } else if (rankNum === 2) {
                rankBg = '#E0E0E0';
                rankText = '#000000';
                rankBorder = '#A0A0A0';
                rankIcon = '🥈';
              } else if (rankNum === 3) {
                rankBg = '#CD7F32';
                rankText = '#000000';
                rankBorder = '#8B4513';
                rankIcon = '🥉';
              }

              return (
                <TouchableOpacity
                  key={item.market_id}
                  style={styles.leaderboardCard}
                  onPress={() => router.push(`/market/${item.market_id}` as any)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.rankBadge, { backgroundColor: rankBg, borderColor: rankBorder }]}>
                    <Text style={[styles.rankText, { color: rankText }]}>
                      {rankIcon ? rankIcon : `${item.rank}`}
                    </Text>
                  </View>
                  <View style={styles.leaderboardBody}>
                    <Text style={styles.leaderboardMarketName} numberOfLines={1}>{item.market_name}</Text>
                    <Text style={styles.leaderboardSubCity}>{`📍 ${item.sub_city}`}</Text>
                    
                    {/* Score Bar */}
                    <View style={styles.scoreContainer}>
                      <View style={styles.scoreBarBg}>
                        <View style={[styles.scoreBarFill, { width: `${valueScore}%` }]} />
                      </View>
                      <Text style={styles.scoreLabel}>{`Value: ${valueScore}%`}</Text>
                    </View>
                  </View>
                  <View style={styles.leaderboardRight}>
                    <Text style={styles.ratioValue}>{(1 - item.value_ratio) >= 0 ? `−${((1 - item.value_ratio) * 100).toFixed(0)}%` : `+${((item.value_ratio - 1) * 100).toFixed(0)}%`}</Text>
                    <Text style={styles.ratioSub}>vs Avg</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {CATEGORIES.map((c) => {
          const active = activeCategory === c.key;
          const color  = c.key === 'all' ? Colors.deal : categoryColor(c.key as CategoryKey);
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.catChip, { borderColor: color }, active && { backgroundColor: color }]}
              onPress={() => setActiveCategory(c.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.catEmoji}>{c.emoji}</Text>
              <Text style={[styles.catLabel, { color: active ? Colors.bg : color }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Section title */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>⚡ Cheapest Finds</Text>
        <Text style={styles.sectionCount}>{cheapestFinds.length} items</Text>
      </View>

      {/* Static Cheapest Finds Deal Cards */}
      <View style={{ gap: 8, paddingHorizontal: 16, marginBottom: 16 }}>
        {cheapestFinds.map((item) => {
          const catColor = categoryColor(item.item_category);
          const fresh    = freshnessLabel(item.logged_at);
          const sameItem = feedData.filter((x) => x.item_id === item.item_id);
          const avg      = sameItem.length > 1
            ? sameItem.reduce((s, x) => s + x.price_etb, 0) / sameItem.length
            : 0;
          const saving   = avg > 0 ? Math.round(((avg - item.price_etb) / avg) * 100) : 0;

          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, item.is_anomaly && styles.cardAnomaly]}
              activeOpacity={0.75}
              onPress={() => router.push(`/item/${item.item_id}` as any)}
            >
              <View style={[styles.accentBar, { backgroundColor: catColor }]} />
              <View style={[styles.emojiWrap, { backgroundColor: catColor + '18' }]}>
                <Text style={styles.emoji}>{item.item_emoji}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.itemName} numberOfLines={1}>{item.item_name}</Text>
                <Text style={styles.market} numberOfLines={1}>{`🏪 ${item.market_name} · ${item.market_sub_city}`}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={[styles.price, item.is_anomaly && { color: Colors.flagged }]}>{item.price_etb.toFixed(0)}</Text>
                <Text style={styles.unit}>ETB/{item.item_unit}</Text>
                {item.is_anomaly ? (
                  <View style={[styles.freshBadge, { backgroundColor: Colors.flagged + '20' }]}>
                    <Text style={[styles.freshText, { color: Colors.flagged }]}>⚠ suspicious</Text>
                  </View>
                ) : saving > 5 ? (
                  <View style={[styles.freshBadge, { backgroundColor: Colors.veggie + '20' }]}>
                    <Text style={[styles.freshText, { color: Colors.veggie }]}>−{saving}%</Text>
                  </View>
                ) : (
                  <View style={[styles.freshBadge, { backgroundColor: fresh.color + '20' }]}>
                    <Text style={[styles.freshText, { color: fresh.color }]}>{fresh.label}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Section title for live feed */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>👥 Community · Live Feed</Text>
        <Text style={styles.sectionCount}>{feedEntries.length} logged</Text>
      </View>
    </View>
  );

  // ── Footer = community feed pagination spinner ───────────────────────────
  const ListFooter = () => {
    if (isFetchingNextPage) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator color={Colors.veggie} size="small" />
          <Text style={styles.footerLoaderText}>Loading more logs...</Text>
        </View>
      );
    }
    return null;
  };

  // ── Skeleton state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ScrollView
        style={[styles.root, { paddingTop: insets.top }]}
        contentContainerStyle={styles.skeletonContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>ሰላም 👋</Text>
            <Text style={styles.subtitle}>Today's Prices</Text>
          </View>
        </View>
        <SkeletonHero />
        <View style={{ gap: 8, marginTop: 12 }}>
          {[0,1,2,3,4].map((i) => <SkeletonDealRow key={i} />)}
        </View>
        <View style={{ gap: 8, marginTop: 20 }}>
          {[0,1,2].map((i) => <SkeletonFeedRow key={i} />)}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FlatList
        data={feedEntries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FeedRow entry={item} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.veggie} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <EmptyShelf
            variant="default"
            title="No community activity yet"
            sub="Be the first to log a price in your neighbourhood!"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  skeletonContainer: { paddingHorizontal: 16, paddingBottom: 20, gap: 8 },

  // Header
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  greeting:   { fontSize: 22, fontWeight: '800', color: Colors.t1, letterSpacing: -0.5 },
  subtitle:   { fontSize: 13, color: Colors.t4, marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 100, borderWidth: 1 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },

  // Categories
  catRow:   { paddingHorizontal: 16, paddingBottom: 16, gap: 8, flexDirection: 'row' },
  catChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1.5, backgroundColor: 'transparent' },
  catEmoji: { fontSize: 13 },
  catLabel: { fontSize: 12, fontWeight: '700' },

  // Section headers
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },
  sectionTitle:  { fontSize: 13, fontWeight: '800', color: Colors.t2 },
  sectionCount:  { fontSize: 11, color: Colors.t5, fontWeight: '600' },
  feedSection:   { paddingTop: 8 },

  // List
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },

  // Deal card
  card:        { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s1, borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.border },
  cardAnomaly: { borderColor: Colors.flagged + '50', backgroundColor: Colors.flagged + '06' },
  accentBar:   { width: 3, height: 40, borderRadius: 2, flexShrink: 0 },
  emojiWrap:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emoji:       { fontSize: 22 },
  cardBody:    { flex: 1, minWidth: 0 },
  itemName:    { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  market:      { fontSize: 12, color: Colors.t4, marginTop: 3 },
  cardRight:   { alignItems: 'flex-end', flexShrink: 0 },
  price:       { fontSize: 20, fontWeight: '800', color: Colors.birr, letterSpacing: -0.5 },
  unit:        { fontSize: 11, color: Colors.t4, marginTop: 1 },
  freshBadge:  { marginTop: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  freshText:   { fontSize: 10, fontWeight: '700' },

  // Offline Banner Styles
  offlineBannerContainer: { backgroundColor: '#78350F', borderBottomWidth: 1, borderColor: '#F59E0B' },
  offlineBannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  offlineBannerIcon: { fontSize: 13 },
  offlineBannerTitle: { fontSize: 12, fontWeight: '700', color: '#FCD34D' },
  offlineBannerToggleBtn: { fontSize: 10, fontWeight: '800', color: '#FCD34D', textTransform: 'uppercase' },
  offlineBannerExpand: { overflow: 'hidden' },
  offlineQueueScroll: { paddingHorizontal: 20, maxHeight: 150 },
  offlineLogItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#333333', marginBottom: 6 },
  offlineItemEmoji: { fontSize: 16 },
  offlineItemName: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  offlineMarketName: { fontSize: 10, color: '#999999', marginTop: 1 },
  offlineLogPrice: { fontSize: 12, fontWeight: '800', color: '#F59E0B' },
  offlineLogUnit: { fontSize: 8, color: '#666666', marginTop: 1 },
  offlineTipRow: { paddingHorizontal: 20, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#3A1E00', alignItems: 'center', backgroundColor: '#622E0B' },
  offlineTipText: { fontSize: 10, fontWeight: '600', color: '#FCD34D' },
  failedBadge: {
    backgroundColor: Colors.flagged + '20',
    borderColor:     Colors.flagged + '50',
    borderWidth:     1,
    borderRadius:    4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  failedBadgeText: {
    color: Colors.flagged,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  offlineDeleteBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.s3,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
  },
  offlineDeleteTxt: {
    fontSize: 12,
  },

  // Leaderboard styles
  leaderboardSection: { paddingHorizontal: 16, marginTop: 12, marginBottom: 16 },
  leaderboardList: { gap: 8, marginTop: 8 },
  leaderboardCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s1, borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.border },
  rankBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  rankText: { fontSize: 13, fontWeight: '900' },
  leaderboardBody: { flex: 1, minWidth: 0 },
  leaderboardMarketName: { fontSize: 14, fontWeight: '800', color: Colors.t1 },
  leaderboardSubCity: { fontSize: 11, color: Colors.t4, marginTop: 2 },
  scoreContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  scoreBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.s3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.veggie },
  scoreLabel: { fontSize: 10, fontWeight: '700', color: Colors.t3, width: 62 },
  leaderboardRight: { alignItems: 'flex-end', flexShrink: 0 },
  ratioValue: { fontSize: 14, fontWeight: '800', color: Colors.veggie },
  ratioSub: { fontSize: 9, color: Colors.t4, marginTop: 1 },

  // Footer Loader
  footerLoader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  footerLoaderText: { fontSize: 12, color: Colors.t4, fontWeight: '600' },

  // Empty
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.t2 },
  emptyBody:  { fontSize: 14, color: Colors.t4, textAlign: 'center' },
});
