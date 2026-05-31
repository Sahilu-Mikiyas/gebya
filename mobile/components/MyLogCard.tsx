/**
 * MyLogCard — Phase 7-B
 * Displays a single price log submitted by the current user.
 * Actions: Edit price (modal) | Flag as Outdated | Delete
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Colors, categoryColor, CategoryKey } from '@/constants/colors';

export interface MyLog {
  id:              string;
  price_etb:       number;
  logged_at:       string;
  is_anomaly:      boolean;
  is_flagged:      boolean;
  confirmed_count: number;
  flagged_count:   number;
  items:    { name: string; emoji: string; category: string } | null;
  markets:  { name: string } | null;
}

interface Props {
  log:             MyLog;
  onEdit:          (logId: string, newPrice: number) => Promise<void>;
  onFlagOutdated:  (logId: string) => Promise<void>;
  onDelete:        (logId: string) => Promise<void>;
}

function timeLabel(iso: string) {
  const d   = new Date(iso);
  const now = Date.now();
  const h   = (now - d.getTime()) / 3_600_000;
  if (h < 1)  return 'just now';
  if (h < 24) return `${Math.round(h)}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-ET', { month: 'short', day: 'numeric' });
}

function statusBadge(log: MyLog): { label: string; color: string } {
  if (log.is_flagged)          return { label: '📅 Outdated', color: Colors.t5 };
  if (log.is_anomaly)          return { label: '⚠ Anomaly',  color: Colors.flagged };
  if (log.confirmed_count >= 3)return { label: '✓ Verified', color: Colors.veggie };
  if (log.confirmed_count >= 1)return { label: '⏳ Pending', color: Colors.birr };
  return                              { label: '🆕 New',      color: Colors.deal };
}

export default function MyLogCard({ log, onEdit, onFlagOutdated, onDelete }: Props) {
  const [showEdit,    setShowEdit]    = useState(false);
  const [editPrice,   setEditPrice]   = useState(log.price_etb.toString());
  const [saving,      setSaving]      = useState(false);

  const item    = log.items;
  const market  = log.markets;
  const catColor= item ? categoryColor(item.category as CategoryKey) : Colors.veggie;
  const status  = statusBadge(log);
  const dimmed  = log.is_flagged;

  const handleEdit = async () => {
    const n = parseFloat(editPrice);
    if (isNaN(n) || n <= 0) return;
    setSaving(true);
    await onEdit(log.id, n);
    setSaving(false);
    setShowEdit(false);
  };

  const handleFlag = () => {
    Alert.alert(
      'Flag as outdated?',
      'This price will be marked outdated and excluded from averages.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Flag it', style: 'destructive', onPress: () => onFlagOutdated(log.id) },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete this log?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(log.id) },
      ],
    );
  };

  return (
    <>
      <View style={[styles.card, dimmed && styles.cardDimmed]}>
        {/* Left: emoji */}
        <View style={[styles.emojiWrap, { backgroundColor: catColor + '18' }]}>
          <Text style={styles.emoji}>{item?.emoji ?? '🏷'}</Text>
        </View>

        {/* Middle: info */}
        <View style={styles.body}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item?.name ?? '—'}
          </Text>
          <Text style={styles.market} numberOfLines={1}>
            🏪 {market?.name ?? '—'} · {timeLabel(log.logged_at)}
          </Text>
          {/* Status + votes */}
          <View style={styles.metaRow}>
            <View style={[styles.statusBadge, { backgroundColor: status.color + '18' }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
            {log.confirmed_count > 0 && (
              <Text style={styles.vote}>✓ {log.confirmed_count}</Text>
            )}
            {log.flagged_count > 0 && (
              <Text style={[styles.vote, { color: Colors.flagged }]}>⚑ {log.flagged_count}</Text>
            )}
          </View>
        </View>

        {/* Right: price + actions */}
        <View style={styles.right}>
          <Text style={[styles.price, { color: catColor }]}>{log.price_etb.toFixed(0)}</Text>
          <Text style={styles.priceUnit}>ETB</Text>

          {!log.is_flagged && (
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => { setEditPrice(log.price_etb.toString()); setShowEdit(true); }} style={styles.actionBtn}>
                <Text style={styles.actionTxt}>✏</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleFlag} style={styles.actionBtn}>
                <Text style={[styles.actionTxt, { color: Colors.birr }]}>📅</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.actionBtn}>
                <Text style={[styles.actionTxt, { color: Colors.flagged }]}>🗑</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Edit price modal */}
      <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Price</Text>
            <Text style={styles.modalItem}>{item?.emoji} {item?.name} @ {market?.name}</Text>

            <View style={styles.priceRow}>
              <Text style={styles.currency}>ETB</Text>
              <TextInput
                style={styles.priceInput}
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEdit(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleEdit}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={Colors.bg} />
                  : <Text style={styles.saveTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.s1,
    borderRadius:    14,
    padding:         12,
    gap:             10,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  cardDimmed: { opacity: 0.5 },

  emojiWrap: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emoji:     { fontSize: 20 },

  body:     { flex: 1, minWidth: 0, gap: 3 },
  itemName: { fontSize: 14, fontWeight: '700', color: Colors.t1 },
  market:   { fontSize: 11, color: Colors.t4 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusBadge:{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  vote:       { fontSize: 10, color: Colors.t5 },

  right:     { alignItems: 'flex-end', flexShrink: 0, gap: 2 },
  price:     { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  priceUnit: { fontSize: 10, color: Colors.t5 },
  actions:   { flexDirection: 'row', gap: 2, marginTop: 4 },
  actionBtn: { padding: 5 },
  actionTxt: { fontSize: 14, color: Colors.t4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: Colors.s1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  modalHandle:  { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: Colors.t1, marginBottom: 4 },
  modalItem:    { fontSize: 14, color: Colors.t4, marginBottom: 20 },
  priceRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.s2, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  currency:     { paddingHorizontal: 14, fontSize: 15, color: Colors.birr, fontWeight: '700' },
  priceInput:   { flex: 1, padding: 14, fontSize: 26, fontWeight: '800', color: Colors.t1 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn:    { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelTxt:    { fontSize: 15, fontWeight: '600', color: Colors.t3 },
  saveBtn:      { flex: 2, paddingVertical: 15, borderRadius: 14, backgroundColor: Colors.veggie, alignItems: 'center' },
  saveTxt:      { fontSize: 15, fontWeight: '800', color: Colors.bg },
});
