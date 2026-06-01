/**
 * settings.tsx — Phase 9-A
 * Settings hub with:
 *  - Edit Profile (display name + neighbourhood)
 *  - Notification preferences (stored in profiles)
 *  - App version, reset onboarding (dev), sign out
 */
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useToastStore } from '@/stores/toastStore';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlowyInput from '@/components/GlowyInput';

// ── Sub-cities list (Addis Ababa) ──────────────────────────────────────────────
const SUB_CITIES = [
  'Arada', 'Addis Ketema', 'Gulele', 'Lideta', 'Kirkos',
  'Yeka', 'Bole', 'Akaky Kaliti', 'Nifas Silk-Lafto', 'Kolfe Keranio', 'Lemi Kura',
];

const APP_VERSION = '0.9.0';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ProfileData {
  display_name:       string | null;
  neighbourhood:      string | null;
  notify_alerts:      boolean;
  notify_weekly:      boolean;
  is_admin:           boolean;
}

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchProfile(uid: string): Promise<ProfileData> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, neighbourhood, notify_alerts, notify_weekly, is_admin')
    .eq('id', uid)
    .single();
  if (error) throw error;
  return {
    display_name:  data.display_name  ?? '',
    neighbourhood: data.neighbourhood ?? '',
    notify_alerts: data.notify_alerts ?? true,
    notify_weekly: data.notify_weekly ?? false,
    is_admin:      data.is_admin      ?? false,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user, setSession } = useAuthStore();
  const { reset: resetOnboarding } = useOnboardingStore();
  const { showToast } = useToastStore();
  const qc = useQueryClient();
  const uid = user?.id ?? '';

  // ── State ──────────────────────────────────────────────────────────────────
  const [showEditName,   setShowEditName]   = useState(false);
  const [showEditHood,   setShowEditHood]   = useState(false);
  const [nameInput,      setNameInput]      = useState('');
  const [saving,         setSaving]         = useState(false);
  const [signingOut,     setSigningOut]     = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['settings-profile', uid],
    queryFn:  () => fetchProfile(uid),
    enabled:  !!uid,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<ProfileData>) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-profile', uid] });
      qc.invalidateQueries({ queryKey: ['profile', uid] });
    },
  });

  const saveName = useCallback(async () => {
    if (!nameInput.trim()) return;
    setSaving(true);
    await updateMutation.mutateAsync({ display_name: nameInput.trim() });
    setSaving(false);
    setShowEditName(false);
    showToast('Display name updated ✓', 'success');
  }, [nameInput, updateMutation, showToast]);

  const saveHood = useCallback(async (hood: string) => {
    await updateMutation.mutateAsync({ neighbourhood: hood });
    setShowEditHood(false);
    showToast(`Neighbourhood set to ${hood} ✓`, 'success');
  }, [updateMutation, showToast]);

  const toggleSwitch = useCallback(async (key: 'notify_alerts' | 'notify_weekly', val: boolean) => {
    await updateMutation.mutateAsync({ [key]: val });
  }, [updateMutation]);

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSession(null);
  };

  const confirmResetOnboarding = () => {
    Alert.alert('Reset Onboarding?', 'You will see the intro screens again on next launch.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => { await resetOnboarding(); showToast('Onboarding reset', 'success'); }},
    ]);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Profile section ─────────────────────────────────────────────── */}
        <SectionLabel>Profile</SectionLabel>

        <SettingsRow
          icon="👤"
          label="Display Name"
          value={isLoading ? '…' : profile?.display_name || '(not set)'}
          onPress={() => { setNameInput(profile?.display_name ?? ''); setShowEditName(true); }}
        />
        <SettingsRow
          icon="📍"
          label="Neighbourhood"
          value={isLoading ? '…' : profile?.neighbourhood || '(not set)'}
          onPress={() => setShowEditHood(true)}
        />
        <SettingsRow
          icon="✉️"
          label="Email"
          value={user?.email ?? '—'}
        />

        {/* ── Notifications section ────────────────────────────────────────── */}
        <SectionLabel>Notifications</SectionLabel>

        <SwitchRow
          icon="🔔"
          label="Price Alert Notifications"
          sub="Get notified when your alerts fire"
          value={profile?.notify_alerts ?? true}
          onToggle={(v) => toggleSwitch('notify_alerts', v)}
        />
        <SwitchRow
          icon="📊"
          label="Weekly Price Digest"
          sub="Summary of cheapest deals near you"
          value={profile?.notify_weekly ?? false}
          onToggle={(v) => toggleSwitch('notify_weekly', v)}
        />

        {/* ── Quick links ──────────────────────────────────────────────────── */}
        <SectionLabel>Explore</SectionLabel>

        <SettingsRow
          icon="🏪"
          label="Compare Stores"
          onPress={() => router.push('/compare' as any)}
        />
        <SettingsRow
          icon="🌟"
          label="Submit a New Item"
          onPress={() => router.push('/pioneer' as any)}
        />

        {/* ── Admin section ───────────────────────────────────────────────── */}
        {profile?.is_admin && (
          <>
            <SectionLabel>Administration</SectionLabel>
            <SettingsRow
              icon="👮"
              label="Review Submissions"
              sub="Approve or reject pioneer items"
              onPress={() => router.push('/admin' as any)}
            />
          </>
        )}

        {/* ── App section ──────────────────────────────────────────────────── */}
        <SectionLabel>App</SectionLabel>

        <SettingsRow icon="ℹ️" label="Version" value={APP_VERSION} />

        <SettingsRow
          icon="🔄"
          label="Replay Onboarding"
          sub="Developer / debug only"
          onPress={confirmResetOnboarding}
          destructive
        />

        {/* ── Sign out ─────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.signOutBtn, signingOut && { opacity: 0.6 }]}
          onPress={signOut}
          disabled={signingOut}
          activeOpacity={0.8}
        >
          {signingOut
            ? <ActivityIndicator color={Colors.flagged} />
            : <Text style={styles.signOutTxt}>Sign Out</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Edit Name Modal ──────────────────────────────────────────────────── */}
      <Modal visible={showEditName} transparent animationType="slide" onRequestClose={() => setShowEditName(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Display Name</Text>
            <GlowyInput
              style={styles.sheetInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Your name"
              maxLength={40}
              autoFocus
            />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEditName(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveName} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.saveTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit Neighbourhood Modal ─────────────────────────────────────────── */}
      <Modal visible={showEditHood} transparent animationType="slide" onRequestClose={() => setShowEditHood(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Your Neighbourhood</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {SUB_CITIES.map((city) => {
                const active = profile?.neighbourhood === city;
                return (
                  <TouchableOpacity
                    key={city}
                    style={[styles.cityRow, active && styles.cityRowActive]}
                    onPress={() => saveHood(city)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.cityTxt, active && styles.cityTxtActive]}>{city}</Text>
                    {active && <Text style={{ color: Colors.veggie, fontSize: 16 }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Reusable rows ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function SettingsRow({ icon, label, value, sub, onPress, destructive }: {
  icon:        string;
  label:       string;
  value?:      string;
  sub?:        string;
  onPress?:    () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      disabled={!onPress}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, destructive && { color: Colors.flagged }]}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {value && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
      {onPress && <Text style={styles.rowChevron}>›</Text>}
    </TouchableOpacity>
  );
}

function SwitchRow({ icon, label, sub, value, onToggle }: {
  icon:     string;
  label:    string;
  sub?:     string;
  value:    boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.s3, true: Colors.veggie + '80' }}
        thumbColor={value ? Colors.veggie : Colors.t5}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow:{ fontSize: 22, color: Colors.t2 },
  title:   { fontSize: 18, fontWeight: '800', color: Colors.t1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: Colors.t5, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 20, paddingHorizontal: 4 },

  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s1, borderRadius: 14, padding: 14, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: Colors.border },
  rowIcon:    { fontSize: 18, width: 24, textAlign: 'center' },
  rowBody:    { flex: 1 },
  rowLabel:   { fontSize: 15, fontWeight: '600', color: Colors.t1 },
  rowSub:     { fontSize: 12, color: Colors.t5, marginTop: 2 },
  rowValue:   { fontSize: 13, color: Colors.t4, maxWidth: 130, textAlign: 'right' },
  rowChevron: { fontSize: 20, color: Colors.t5 },

  signOutBtn: { backgroundColor: Colors.s1, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.flagged + '40', marginTop: 24 },
  signOutTxt: { fontSize: 15, fontWeight: '700', color: Colors.flagged },

  // Modals
  overlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: Colors.s1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  handle:  { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.t1, marginBottom: 16 },
  sheetInput: { backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, fontSize: 16, color: Colors.t1, marginBottom: 20 },
  sheetBtns:  { flexDirection: 'row', gap: 10 },
  cancelBtn:  { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelTxt:  { fontSize: 15, fontWeight: '600', color: Colors.t3 },
  saveBtn:    { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.veggie, alignItems: 'center' },
  saveTxt:    { fontSize: 15, fontWeight: '800', color: Colors.bg },

  cityRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.border2 },
  cityRowActive: { backgroundColor: Colors.veggie + '10' },
  cityTxt:       { fontSize: 15, color: Colors.t2, fontWeight: '600' },
  cityTxtActive: { color: Colors.veggie, fontWeight: '800' },
});
