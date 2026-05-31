/**
 * admin.tsx — Phase 14-F
 * Admin Submission Review Screen.
 *
 * Lists all pending items submitted via Pioneer flow.
 * Admins can Approve (inserts into items catalog) or Reject them.
 */
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyShelf from '@/components/EmptyShelf';
import { formatRelativeTime } from '@/lib/time';

interface Submission {
  id:            string;
  submitted_by:  string;
  name:          string;
  emoji:         string;
  category:      CategoryKey;
  unit:          string;
  typical_price: number;
  notes:         string | null;
  status:        string;
  created_at:    string;
  profiles:      { display_name: string | null } | null;
}

export default function AdminScreen() {
  const insets      = useSafeAreaInsets();
  const router      = useRouter();
  const { user }    = useAuthStore();
  const { showToast } = useToastStore();
  const qc          = useQueryClient();

  const [processingId, setProcessingId] = useState<string | null>(null);

  // 1. Verify user's admin status
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['profile-admin', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isAdmin = profile?.is_admin ?? false;

  // 2. Fetch pending submissions
  const { data: submissions = [], isLoading: loadingSubmissions, refetch } = useQuery({
    queryKey: ['pending-submissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_submissions')
        .select('*, profiles:submitted_by(display_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Submission[];
    },
    enabled: isAdmin,
  });

  // 3. Approve Mutation
  const approveMutation = useMutation({
    mutationFn: async (sub: Submission) => {
      if (!user) throw new Error('Not logged in');
      setProcessingId(sub.id);

      // A. Insert into items table
      const { data: newItem, error: insertError } = await supabase
        .from('items')
        .insert({
          name:        sub.name,
          emoji:       sub.emoji,
          category:    sub.category,
          unit:        sub.unit,
          is_approved: true,
          added_by:    sub.submitted_by,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // B. Update submission status to 'approved'
      const { error: updateError } = await supabase
        .from('item_submissions')
        .update({
          status:      'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', sub.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      showToast('Item approved & added to catalog!', 'success');
      qc.invalidateQueries({ queryKey: ['pending-submissions'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      setProcessingId(null);
    },
    onError: (err: any) => {
      Alert.alert('Approval Failed', err.message);
      setProcessingId(null);
    },
  });

  // 4. Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: async (subId: string) => {
      if (!user) throw new Error('Not logged in');
      setProcessingId(subId);

      const { error } = await supabase
        .from('item_submissions')
        .update({
          status:      'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', subId);

      if (error) throw error;
    },
    onSuccess: () => {
      showToast('Submission rejected.', 'success');
      qc.invalidateQueries({ queryKey: ['pending-submissions'] });
      setProcessingId(null);
    },
    onError: (err: any) => {
      Alert.alert('Rejection Failed', err.message);
      setProcessingId(null);
    },
  });

  const handleApprove = (sub: Submission) => {
    Alert.alert(
      'Approve Submission?',
      `Add "${sub.name}" to the public items catalog?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => approveMutation.mutate(sub) },
      ],
    );
  };

  const handleReject = (subId: string) => {
    Alert.alert(
      'Reject Submission?',
      'Mark this item submission as rejected?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => rejectMutation.mutate(subId) },
      ],
    );
  };

  if (loadingProfile || (isAdmin && loadingSubmissions)) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.veggie} size="large" />
        <Text style={styles.loadingText}>Loading Admin Hub...</Text>
      </View>
    );
  }

  if (!user || !isAdmin) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.lockEmoji}>🔒</Text>
        <Text style={styles.errorTitle}>Access Denied</Text>
        <Text style={styles.errorSub}>
          This area is restricted to Gebya system administrators.
        </Text>
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.homeBtnText}>Return to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Admin Review</Text>
          <Text style={styles.subtitle}>{submissions.length} pending submissions</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={submissions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyShelf
            variant="default"
            title="Clean Review Queue!"
            sub="No pending item submissions to review."
          />
        }
        renderItem={({ item }) => {
          const isBusy = processingId === item.id;
          const col    = categoryColor(item.category);
          
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.emojiWrap, { backgroundColor: col + '15' }]}>
                  <Text style={styles.emoji}>{item.emoji}</Text>
                </View>
                <View style={styles.cardHeaderBody}>
                  <Text style={styles.subName}>{item.name}</Text>
                  <Text style={[styles.subCat, { color: col }]}>
                    {item.category} · per {item.unit}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.details}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Estimated Price:</Text>
                  <Text style={styles.detailVal}>{item.typical_price.toFixed(0)} ETB</Text>
                </View>
                {item.notes && (
                  <View style={[styles.detailRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
                    <Text style={styles.detailLabel}>Notes:</Text>
                    <Text style={styles.notesText}>{item.notes}</Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Submitted By:</Text>
                  <Text style={styles.detailVal}>
                    {item.profiles?.display_name ? `@${item.profiles.display_name}` : 'Anonymous Pioneer'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Time:</Text>
                  <Text style={styles.detailVal}>{formatRelativeTime(item.created_at)}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                {isBusy ? (
                  <ActivityIndicator color={Colors.veggie} style={{ marginVertical: 10, alignSelf: 'center', flex: 1 }} />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => handleReject(item.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.rejectBtnText}>✕ Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => handleApprove(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.approveBtnText}>✓ Approve</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  center:  { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  loadingText: { fontSize: 13, color: Colors.t4, marginTop: 8 },

  // Lock Screen
  lockEmoji:  { fontSize: 54 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: Colors.t1, marginTop: 12 },
  errorSub:   { fontSize: 14, color: Colors.t4, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  homeBtn:    { marginTop: 24, backgroundColor: Colors.veggie, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  homeBtnText:{ fontSize: 14, fontWeight: '800', color: Colors.bg },

  // Header
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon:  { fontSize: 22, color: Colors.t2 },
  title:     { fontSize: 18, fontWeight: '800', color: Colors.t1 },
  subtitle:  { fontSize: 12, color: Colors.t4, marginTop: 2 },

  // List & Cards
  list: { padding: 16, gap: 16 },
  card: { backgroundColor: Colors.s1, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  emojiWrap:  { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emoji:      { fontSize: 24 },
  cardHeaderBody: { flex: 1 },
  subName:    { fontSize: 16, fontWeight: '800', color: Colors.t1 },
  subCat:     { fontSize: 12, fontWeight: '600', marginTop: 3, textTransform: 'capitalize' },

  divider: { height: 1, backgroundColor: Colors.border2 },

  details: { padding: 14, gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 12, color: Colors.t4, fontWeight: '600' },
  detailVal: { fontSize: 12, color: Colors.t2, fontWeight: '700' },
  notesText: { fontSize: 12, color: Colors.t3, lineHeight: 18, backgroundColor: Colors.s2, borderRadius: 8, padding: 8, width: '100%', borderWidth: 1, borderColor: Colors.border2 },

  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border2 },
  actionBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { borderRightWidth: 1, borderRightColor: Colors.border2 },
  rejectBtnText: { fontSize: 13, fontWeight: '800', color: Colors.flagged },
  approveBtn: {},
  approveBtnText: { fontSize: 13, fontWeight: '800', color: Colors.veggie },
});
