import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStore } from '@/stores/offlineStore';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Profile {
  display_name: string;
  neighbourhood: string;
  trust_score: number;
  level: number;
  total_pts: number;
  tier: string;
}

const TIER_COLOR: Record<string, string> = {
  new:      Colors.t4,
  rising:   Colors.birr,
  trusted:  Colors.veggie,
  verified: Colors.deal,
};

export default function ProfileScreen() {
  const { user, setSession } = useAuthStore();
  const { pendingLogs }      = useOfflineStore();
  const insets               = useSafeAreaInsets();
  const [signingOut, setSigning] = useState(false);

  const { data: profile } = useQuery<Profile>({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, neighbourhood, trust_score, level, total_pts, tier')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const signOut = async () => {
    setSigning(true);
    const { error } = await supabase.auth.signOut();
    setSigning(false);
    if (error) Alert.alert('Error', error.message);
    else setSession(null);
  };

  const pendingCount = pendingLogs.filter((l) => !l.synced).length;
  const tierColor    = TIER_COLOR[profile?.tier ?? 'new'];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Avatar area */}
      <View style={styles.avatar}>
        <Text style={styles.avatarEmoji}>👤</Text>
      </View>
      <Text style={styles.name}>{profile?.display_name ?? user?.email?.split('@')[0] ?? 'Loading...'}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      {/* Tier badge */}
      {profile?.tier && (
        <View style={[styles.tier, { borderColor: tierColor }]}>
          <Text style={[styles.tierText, { color: tierColor }]}>
            {profile.tier.toUpperCase()} MEMBER
          </Text>
        </View>
      )}

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{profile?.total_pts ?? 0}</Text>
          <Text style={styles.statLabel}>Points</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>Lv {profile?.level ?? 1}</Text>
          <Text style={styles.statLabel}>Level</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{profile?.trust_score ?? 0}</Text>
          <Text style={styles.statLabel}>Trust</Text>
        </View>
      </View>

      {/* Pending sync indicator */}
      {pendingCount > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            📡 {pendingCount} log{pendingCount > 1 ? 's' : ''} pending sync
          </Text>
        </View>
      )}

      {/* Sign out */}
      <TouchableOpacity
        style={[styles.signOutBtn, signingOut && styles.btnDisabled]}
        onPress={signOut}
        disabled={signingOut}
        activeOpacity={0.8}
      >
        {signingOut
          ? <ActivityIndicator color={Colors.t1} />
          : <Text style={styles.signOutText}>Sign out</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', padding: 24 },
  avatar:   { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.s2, alignItems: 'center', justifyContent: 'center', marginTop: 40, marginBottom: 16, borderWidth: 2, borderColor: Colors.border },
  avatarEmoji: { fontSize: 48 },
  name:     { fontSize: 22, fontWeight: '800', color: Colors.t1 },
  email:    { fontSize: 13, color: Colors.t4, marginTop: 4 },
  tier:     { marginTop: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, borderWidth: 1 },
  tierText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 28, marginBottom: 20 },
  statBox:  { backgroundColor: Colors.s1, borderRadius: 14, padding: 16, alignItems: 'center', minWidth: 90, borderWidth: 1, borderColor: Colors.border },
  statNum:  { fontSize: 20, fontWeight: '800', color: Colors.t1 },
  statLabel:{ fontSize: 11, color: Colors.t4, marginTop: 4 },
  pendingBanner: { backgroundColor: Colors.oil + '20', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.oil + '40', width: '100%', alignItems: 'center' },
  pendingText:   { color: Colors.oil, fontSize: 13, fontWeight: '600' },
  signOutBtn: { marginTop: 'auto', backgroundColor: Colors.s2, borderRadius: 14, padding: 16, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  btnDisabled:{ opacity: 0.6 },
  signOutText:{ fontSize: 15, fontWeight: '600', color: Colors.flagged },
});
