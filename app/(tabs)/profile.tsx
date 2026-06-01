/**
 * profile.tsx — Phase 7
 * Full profile page:
 *  - TrustScoreRing (SVG animated arc)
 *  - Leaderboard rank "Rank #N in Addis"
 *  - Stats: Points · Level · Logs · Helpful Votes · Items Tracked · Markets Hit
 *  - My Recent Logs: edit price, flag outdated, delete
 *  - Sign out
 */
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStore } from '@/stores/offlineStore';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrustScoreRing, { TrustTier } from '@/components/TrustScoreRing';
import MyLogCard, { MyLog } from '@/components/MyLogCard';
import { SkeletonBox, SkeletonText, SkeletonDealRow } from '@/components/Skeleton';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Profile {
  display_name:  string | null;
  neighbourhood: string | null;
  trust_score:   number;
  level:         number;
  total_pts:     number;
  tier:          TrustTier;
}

interface ExtraStats {
  helpfulVotes:    number;
  itemsTracked:    number;
  marketsHit:      number;
  totalLogs:       number;
}

// ── Fetchers ───────────────────────────────────────────────────────────────────
async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, neighbourhood, trust_score, level, total_pts, tier')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchRank(userId: string): Promise<number | null> {
  const { data } = await supabase
    .from('leaderboard')
    .select('rank')
    .eq('id', userId)
    .single();
  const r = (data as any)?.rank;
  return r !== undefined && r !== null ? Number(r) : null;
}

async function fetchExtraStats(userId: string): Promise<ExtraStats> {
  const { data, error } = await supabase
    .from('price_logs')
    .select('confirmed_count, item_id, market_id')
    .eq('logged_by', userId);

  if (error) throw error;

  const logs = data ?? [];
  const distinctItems = new Set(logs.map(l => l.item_id));
  const distinctMarkets = new Set(logs.map(l => l.market_id));
  const totalHelpfulVotes = logs.reduce((sum, l) => sum + (l.confirmed_count ?? 0), 0);

  return {
    totalLogs:    logs.length,
    itemsTracked: distinctItems.size,
    marketsHit:   distinctMarkets.size,
    helpfulVotes: totalHelpfulVotes,
  };
}

async function fetchMyLogs(userId: string): Promise<MyLog[]> {
  const { data, error } = await supabase
    .from('price_logs')
    .select(`
      id, price_etb, logged_at, is_anomaly, is_flagged,
      confirmed_count, flagged_count,
      items(name, emoji, category),
      markets(name)
    `)
    .eq('logged_by', userId)
    .order('logged_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as MyLog[];
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user, setSession } = useAuthStore();
  const { pendingLogs }      = useOfflineStore();
  const insets               = useSafeAreaInsets();
  const router               = useRouter();
  const qc                   = useQueryClient();
  const [signingOut, setSigning] = useState(false);

  const uid = user?.id ?? '';

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['profile', uid],
    queryFn:  () => fetchProfile(uid),
    enabled:  !!uid,
  });

  const { data: rank } = useQuery({
    queryKey: ['rank', uid],
    queryFn:  () => fetchRank(uid),
    enabled:  !!uid,
  });

  const { data: extra } = useQuery({
    queryKey: ['extra-stats', uid],
    queryFn:  () => fetchExtraStats(uid),
    enabled:  !!uid,
  });

  const { data: myLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['my-logs', uid],
    queryFn:  () => fetchMyLogs(uid),
    enabled:  !!uid,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async ({ logId, newPrice }: { logId: string; newPrice: number }) => {
      const { error } = await supabase
        .from('price_logs')
        .update({ price_etb: newPrice })
        .eq('id', logId)
        .eq('logged_by', uid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-logs', uid] }),
  });

  const flagMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase
        .from('price_logs')
        .update({ is_flagged: true })
        .eq('id', logId)
        .eq('logged_by', uid);
      if (error) throw error;
    },
    onMutate: async (logId) => {
      await qc.cancelQueries({ queryKey: ['my-logs', uid] });
      qc.setQueryData<MyLog[]>(['my-logs', uid], (old = []) =>
        old.map((l) => l.id === logId ? { ...l, is_flagged: true } : l),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['my-logs', uid] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase
        .from('price_logs')
        .delete()
        .eq('id', logId)
        .eq('logged_by', uid);
      if (error) throw error;
    },
    onMutate: async (logId) => {
      await qc.cancelQueries({ queryKey: ['my-logs', uid] });
      qc.setQueryData<MyLog[]>(['my-logs', uid], (old = []) =>
        old.filter((l) => l.id !== logId),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['my-logs', uid] });
      qc.invalidateQueries({ queryKey: ['extra-stats', uid] });
    },
  });

  const handleEdit = useCallback(async (logId: string, newPrice: number) => {
    await editMutation.mutateAsync({ logId, newPrice });
  }, [editMutation]);

  const handleFlag = useCallback(async (logId: string) => {
    await flagMutation.mutateAsync(logId);
  }, [flagMutation]);

  const handleDelete = useCallback(async (logId: string) => {
    await deleteMutation.mutateAsync(logId);
  }, [deleteMutation]);

  const signOut = async () => {
    setSigning(true);
    const { error } = await supabase.auth.signOut();
    setSigning(false);
    if (error) Alert.alert('Error', error.message);
    else setSession(null);
  };

  const pendingCount = pendingLogs.filter((l) => !l.synced).length;
  const displayName  = profile?.display_name ?? user?.email?.split('@')[0] ?? '—';
  const initials     = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={[styles.root, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero section ──────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>

        {/* Trust ring */}
        {loadingProfile ? (
          <SkeletonBox style={{ width: 120, height: 120, borderRadius: 60 }} />
        ) : (
          <TrustScoreRing
            score={Math.round(profile?.trust_score ?? 0)}
            tier={profile?.tier ?? 'new'}
            size={120}
          />
        )}

        {/* Name + rank */}
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>

        {rank !== null && rank !== undefined && (
          <View
            style={[
              styles.rankPill,
              rank === 1 && styles.rank1,
              rank === 2 && styles.rank2,
              rank === 3 && styles.rank3,
              rank > 3 && styles.rankGeneral,
            ]}
          >
            <Text
              style={[
                styles.rankText,
                rank === 1 && styles.rankText1,
                rank === 2 && styles.rankText2,
                rank === 3 && styles.rankText3,
                rank > 3 && styles.rankTextGeneral,
              ]}
            >
              🏆 Rank #{rank} in Addis
            </Text>
          </View>
        )}

        {/* Neighbourhood */}
        {profile?.neighbourhood && (
          <View style={styles.hood}>
            <Text style={styles.hoodText}>{`📍 ${profile.neighbourhood}`}</Text>
          </View>
        )}
      </View>

      {/* ── Stats grid ────────────────────────────────────────────────────── */}
      {loadingProfile ? (
        <View style={styles.statsGrid}>
          {[0,1,2,3,4,5].map((i) => (
            <SkeletonBox key={i} style={styles.statBox} />
          ))}
        </View>
      ) : (
        <View style={styles.statsGrid}>
          <StatBox val={profile?.total_pts ?? 0}   label="Points"        color={Colors.birr} />
          <StatBox val={`Lv ${profile?.level ?? 1}`} label="Level"       color={Colors.deal} />
          <StatBox val={extra?.totalLogs ?? 0}      label="Logs"         color={Colors.veggie} />
          <StatBox val={extra?.helpfulVotes ?? 0}   label="Helpful Votes"color={Colors.veggie} />
          <StatBox val={extra?.itemsTracked ?? 0}   label="Items"        color={Colors.t3} />
          <StatBox val={extra?.marketsHit ?? 0}     label="Markets"      color={Colors.t3} />
        </View>
      )}

      {/* ── Offline pending banner ────────────────────────────────────────── */}
      {pendingCount > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            {'📡 '}
            {pendingCount} log{pendingCount > 1 ? 's' : ''} pending sync
          </Text>
        </View>
      )}

      {/* ── Menu buttons ──────────────────────────────────────────────────── */}
      <View style={styles.menuSection}>
        <MenuButton icon="🔔" label="Price Alerts" onPress={() => router.push('/alerts')} />
        <MenuButton icon="⚙️" label="Settings"     onPress={() => router.push('/settings' as any)} />
      </View>

      {/* ── My Recent Logs ────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📋 My Recent Logs</Text>
          <Text style={styles.sectionCount}>{myLogs.length} entries</Text>
        </View>

        {loadingLogs ? (
          <View style={{ gap: 8 }}>
            {[0,1,2].map((i) => <SkeletonDealRow key={i} />)}
          </View>
        ) : myLogs.length === 0 ? (
          <View style={styles.emptyLogs}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>No logs yet</Text>
            <Text style={styles.emptySub}>Start logging prices to see them here.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {myLogs.map((log) => (
              <MyLogCard
                key={log.id}
                log={log}
                onEdit={handleEdit}
                onFlagOutdated={handleFlag}
                onDelete={handleDelete}
              />
            ))}
          </View>
        )}
      </View>

      {/* ── Sign out ──────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.signOutBtn, signingOut && { opacity: 0.6 }]}
        onPress={signOut}
        disabled={signingOut}
        activeOpacity={0.8}
      >
        {signingOut
          ? <ActivityIndicator color={Colors.flagged} />
          : <Text style={styles.signOutText}>Sign out</Text>}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatBox({ val, label, color }: { val: number | string; label: string; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statNum, { color }]}>{val}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuBtn} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  // Hero
  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 20 },
  avatar: {
    position:        'absolute',
    top:             24,
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: Colors.s3,
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          1,
  },
  avatarInitials: { fontSize: 14, fontWeight: '800', color: Colors.t3 },

  name:   { fontSize: 22, fontWeight: '800', color: Colors.t1, marginTop: 12 },
  email:  { fontSize: 12, color: Colors.t5, marginTop: 3 },

  rankPill: {
    marginTop:       10,
    paddingHorizontal: 14,
    paddingVertical:  6,
    borderRadius:    100,
    borderWidth:     1,
    shadowOffset:    { width: 0, height: 2 },
    shadowRadius:    6,
  },
  rankText: { fontSize: 12, fontWeight: '800' },
  rank1: {
    backgroundColor: '#FFD700',
    borderColor:     '#FFD700',
    shadowColor:     '#FFD700',
    shadowOpacity:   0.3,
  },
  rankText1: { color: '#080808' },
  rank2: {
    backgroundColor: '#E0E0E0',
    borderColor:     '#E0E0E0',
    shadowColor:     '#E0E0E0',
    shadowOpacity:   0.25,
  },
  rankText2: { color: '#080808' },
  rank3: {
    backgroundColor: '#CD7F32',
    borderColor:     '#CD7F32',
    shadowColor:     '#CD7F32',
    shadowOpacity:   0.25,
  },
  rankText3: { color: '#080808' },
  rankGeneral: {
    backgroundColor: Colors.s4,
    borderColor:     Colors.border,
    shadowColor:     'transparent',
    shadowOpacity:   0,
  },
  rankTextGeneral: { color: Colors.t1 },

  hood: {
    marginTop:       6,
    paddingHorizontal: 12,
    paddingVertical:  4,
    borderRadius:    100,
    backgroundColor: Colors.s2,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  hoodText: { fontSize: 11, color: Colors.t4 },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
    marginBottom:  20,
  },
  statBox: {
    flex:            1,
    minWidth:        '28%',
    backgroundColor: Colors.s1,
    borderRadius:    14,
    padding:         14,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.border,
    height:          72,
    justifyContent:  'center',
  },
  statNum:   { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: Colors.t5, marginTop: 4, fontWeight: '600', textAlign: 'center' },

  // Pending
  pendingBanner: {
    backgroundColor: Colors.birr + '15',
    borderRadius:    12,
    padding:         12,
    marginBottom:    16,
    borderWidth:     1,
    borderColor:     Colors.birr + '30',
    alignItems:      'center',
  },
  pendingText: { color: Colors.birr, fontSize: 13, fontWeight: '600' },

  // Menu
  menuSection: { gap: 8, marginBottom: 20 },
  menuBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.s1,
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     Colors.border,
    gap:             12,
  },
  menuIcon:    { fontSize: 18 },
  menuLabel:   { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.t2 },
  menuChevron: { fontSize: 20, color: Colors.t5 },

  // My logs section
  section:       { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { fontSize: 15, fontWeight: '800', color: Colors.t2 },
  sectionCount:  { fontSize: 12, color: Colors.t5 },

  emptyLogs:  { alignItems: 'center', padding: 32, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.t3 },
  emptySub:   { fontSize: 13, color: Colors.t5, textAlign: 'center' },

  // Sign out
  signOutBtn: {
    backgroundColor: Colors.s1,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.flagged + '40',
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: Colors.flagged },
});
