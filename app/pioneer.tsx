/**
 * pioneer.tsx — Phase 9-C
 * Pioneer Item Submission screen.
 *
 * Lets users submit a NEW item (not yet in the catalog) for review.
 * Inserts into `item_submissions` table (pending moderator approval).
 * Earns +25 Pioneer Points on submission.
 *
 * Fields: name, emoji, category, unit, typical_price, notes
 */
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PulseButton from '@/components/PulseButton';
import GlowyInput from '@/components/GlowyInput';

const CATEGORIES: { key: CategoryKey; label: string; emoji: string }[] = [
  { key: 'veggie',  label: 'Vegetable', emoji: '🥦' },
  { key: 'grain',   label: 'Grain',     emoji: '🌾' },
  { key: 'protein', label: 'Protein',   emoji: '🥩' },
  { key: 'dairy',   label: 'Dairy',     emoji: '🥛' },
  { key: 'spice',   label: 'Spice',     emoji: '🌶️' },
  { key: 'oil',     label: 'Oil/Fat',   emoji: '🫙' },
  { key: 'bread',   label: 'Bread',     emoji: '🍞' },
  { key: 'other',   label: 'Other',     emoji: '📦' },
];

const UNITS = ['kg', 'piece', 'bundle', 'litre', 'gram', 'dozen'];

const PIONEER_POINTS = 25;

export default function PioneerScreen() {
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const { user }  = useAuthStore();
  const { showToast } = useToastStore();

  const [name,    setName]    = useState('');
  const [emoji,   setEmoji]   = useState('');
  const [category,setCat]     = useState<CategoryKey>('veggie');
  const [unit,    setUnit]    = useState('kg');
  const [price,   setPrice]   = useState('');
  const [notes,   setNotes]   = useState('');
  const [submitting, setSub]  = useState(false);

  const catColor = categoryColor(category);
  const canSubmit = name.trim().length >= 2 && price.length > 0;

  const submit = async () => {
    if (!user) { Alert.alert('Sign in required'); return; }
    if (!canSubmit) return;

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Invalid price', 'Enter a positive price in ETB.');
      return;
    }

    setSub(true);
    try {
      const { error } = await supabase.from('item_submissions').insert({
        submitted_by:   user.id,
        name:           name.trim(),
        emoji:          emoji.trim() || '🏷',
        category,
        unit,
        typical_price:  priceNum,
        notes:          notes.trim() || null,
        status:         'pending',
      });

      if (error) throw error;

      // Award pioneer points (non-blocking)
      supabase.rpc('award_points', { p_user_id: user.id, p_points: PIONEER_POINTS });

      showToast(`🏅 Submitted! +${PIONEER_POINTS} Pioneer Points`, 'success');
      router.back();
    } catch (e: any) {
      Alert.alert('Submission failed', e.message);
    } finally {
      setSub(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Submit New Item</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Pioneer badge */}
          <View style={styles.pioneerCard}>
            <Text style={styles.pioneerEmoji}>🏅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pioneerTitle}>Pioneer Submission</Text>
              <Text style={styles.pioneerSub}>
                Help expand Gebya by adding items not yet in the catalog.
                Earn{' '}
                <Text style={styles.pts}>+{PIONEER_POINTS} Pioneer Points</Text>
                {' '}when your submission is reviewed.
              </Text>
            </View>
          </View>

          {/* Item name */}
          <Text style={styles.label}>Item Name *</Text>
          <GlowyInput
            style={styles.input}
            placeholder="e.g. Enset flour, Berbere spice mix…"
            value={name}
            onChangeText={setName}
            maxLength={60}
            autoCapitalize="words"
          />

          {/* Emoji */}
          <Text style={styles.label}>Emoji (optional)</Text>
          <GlowyInput
            style={[styles.input, { fontSize: 28, letterSpacing: 4 }]}
            placeholder="🥦"
            value={emoji}
            onChangeText={(t) => setEmoji(t.slice(0, 3))}
            maxLength={3}
          />

          {/* Category */}
          <Text style={styles.label}>Category *</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              const col    = categoryColor(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.catChip, active && { backgroundColor: col + '20', borderColor: col }]}
                  onPress={() => setCat(c.key)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.catEmoji}>{c.emoji}</Text>
                  <Text style={[styles.catLabel, active && { color: col, fontWeight: '800' }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Unit */}
          <Text style={styles.label}>Sold per (Unit) *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.units}>
            {UNITS.map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitChip, unit === u && styles.unitChipOn]}
                onPress={() => setUnit(u)}
              >
                <Text style={[styles.unitTxt, unit === u && styles.unitTxtOn]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Typical price */}
          <Text style={styles.label}>Typical Price in ETB (your estimate) *</Text>
          <View style={styles.priceRow}>
            <Text style={styles.currency}>ETB</Text>
            <GlowyInput
              style={styles.priceInput}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
            />
          </View>

          {/* Notes */}
          <Text style={styles.label}>Notes (optional)</Text>
          <GlowyInput
            style={[styles.input, styles.noteInput]}
            placeholder="Seasonal? Only at certain markets? Any detail helps."
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={200}
          />

          {/* Submit */}
          {submitting ? (
            <View style={[styles.submitPlaceholder]}>
              <ActivityIndicator color={Colors.bg} />
            </View>
          ) : (
            <PulseButton
              label={`Submit Item · +${PIONEER_POINTS} pts`}
              onPress={submit}
              disabled={!canSubmit}
              color={canSubmit ? Colors.veggie : Colors.s3}
              textColor={canSubmit ? Colors.bg : Colors.t5}
              style={styles.submitBtn}
            />
          )}

          <Text style={styles.disclaimer}>
            Submissions are reviewed by the Gebya team before appearing in the catalog.
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow:{ fontSize: 22, color: Colors.t2 },
  title:   { fontSize: 18, fontWeight: '800', color: Colors.t1 },
  content: { padding: 20 },

  pioneerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: Colors.birr + '10', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.birr + '30', marginBottom: 24 },
  pioneerEmoji:{ fontSize: 34 },
  pioneerTitle:{ fontSize: 14, fontWeight: '800', color: Colors.t1, marginBottom: 4 },
  pioneerSub:  { fontSize: 13, color: Colors.t4, lineHeight: 19 },
  pts:         { color: Colors.birr, fontWeight: '800' },

  label:   { fontSize: 13, fontWeight: '700', color: Colors.t4, marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:   { backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, fontSize: 15, color: Colors.t1 },
  noteInput:{ minHeight: 80, textAlignVertical: 'top' },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.s2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1.5, borderColor: Colors.border },
  catEmoji:{ fontSize: 14 },
  catLabel:{ fontSize: 13, color: Colors.t3, fontWeight: '600' },

  units:    { marginTop: 0 },
  unitChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.s2, marginRight: 8, borderWidth: 1.5, borderColor: Colors.border },
  unitChipOn: { backgroundColor: Colors.deal + '15', borderColor: Colors.deal },
  unitTxt:    { fontSize: 13, fontWeight: '600', color: Colors.t3 },
  unitTxtOn:  { color: Colors.deal, fontWeight: '800' },

  priceRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  currency:   { paddingHorizontal: 14, fontSize: 15, color: Colors.birr, fontWeight: '700' },
  priceInput: { flex: 1, padding: 14, fontSize: 24, fontWeight: '800', color: Colors.t1 },

  submitBtn:         { marginTop: 28 },
  submitPlaceholder: { marginTop: 28, backgroundColor: Colors.veggie, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  disclaimer: { fontSize: 12, color: Colors.t5, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
