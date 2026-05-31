/**
 * Log Success modal — shown after a price is successfully submitted.
 * Displayed as a bottom sheet modal (Stack.Screen presentation='modal').
 *
 * Route: /log-success?item=Tomatoes&market=Shola%20Market&online=true
 */
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Animated,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LogSuccessScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{
    item:   string;
    market: string;
    price:  string;
    online: string;
  }>();

  const isOnline = params.online !== 'false';
  const itemName = params.item   ?? 'Item';
  const market   = params.market ?? 'Market';
  const price    = params.price  ?? '';

  // Scale-in animation for the ✓ icon
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🏷️ ${itemName} is ${price} ETB at ${market}! Found on Gebya — community price tracker for Addis Ababa.`,
      });
    } catch {}
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 24 }]}>
      {/* Checkmark */}
      <Animated.View style={[styles.iconWrap, { transform: [{ scale }] }]}>
        <Text style={styles.icon}>✓</Text>
      </Animated.View>

      {/* Title */}
      <Text style={styles.title}>
        {isOnline ? 'Price Logged!' : 'Saved Offline'}
      </Text>
      <Text style={styles.subtitle}>
        {isOnline
          ? `Thanks for helping the community.\nYour log is now live.`
          : "Will sync automatically when you're back online."}
      </Text>

      {/* Details */}
      {isOnline && (
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Item</Text>
            <Text style={styles.detailValue}>{itemName}</Text>
          </View>
          <View style={[styles.detailRow, styles.detailRowLast]}>
            <Text style={styles.detailLabel}>Market</Text>
            <Text style={styles.detailValue}>{market}</Text>
          </View>
          <View style={styles.pointsRow}>
            <Text style={styles.pointsLabel}>You earned</Text>
            <Text style={styles.pointsValue}>+10 pts</Text>
          </View>
        </View>
      )}

      {/* CTAs */}
      <View style={styles.btnGroup}>
        {isOnline && (
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
            <Text style={styles.shareBtnText}>📣 Share with community</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            router.dismiss();
            router.replace('/(tabs)');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => router.dismiss()}
          activeOpacity={0.7}
        >
          <Text style={styles.ghostBtnText}>Log another price</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 16,
  },

  // Icon
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  icon: { fontSize: 42, color: Colors.veggie },

  // Text
  title:    { fontSize: 26, fontWeight: '900', color: Colors.t1, letterSpacing: -0.6, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.t4, textAlign: 'center', lineHeight: 21 },

  // Detail card
  detailCard: {
    width: '100%',
    backgroundColor: Colors.s1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 10,
    marginTop: 4,
  },
  detailRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border2 },
  detailRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  detailLabel:   { fontSize: 12, color: Colors.t5, fontWeight: '600' },
  detailValue:   { fontSize: 13, color: Colors.t2, fontWeight: '700' },
  pointsRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border2 },
  pointsLabel:   { fontSize: 12, color: Colors.t5 },
  pointsValue:   { fontSize: 20, fontWeight: '900', color: Colors.deal, letterSpacing: -0.5 },

  // Buttons
  btnGroup:      { width: '100%', gap: 10, marginTop: 8 },
  shareBtn:      { backgroundColor: Colors.s2, borderRadius: 14, padding: 15, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  shareBtnText:  { fontSize: 14, fontWeight: '700', color: Colors.t2 },
  primaryBtn:    { backgroundColor: Colors.veggie, borderRadius: 14, padding: 17, alignItems: 'center' },
  primaryBtnText:{ fontSize: 15, fontWeight: '800', color: Colors.bg },
  ghostBtn:      { padding: 10, alignItems: 'center' },
  ghostBtnText:  { fontSize: 14, color: Colors.t4, fontWeight: '600' },
});
