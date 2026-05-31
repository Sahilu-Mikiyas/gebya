/**
 * AnomalyHint — Phase 10-B
 * Shown below the price input on log.tsx.
 * Calls FastAPI POST /anomaly/check in real-time as user types.
 * Shows a color-coded banner: normal | high | very_high | outlier
 *
 * Debounced 600ms to avoid flooding the API.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors } from '@/constants/colors';

interface AnomalyResult {
  is_anomaly:   boolean;
  severity:     'normal' | 'high' | 'very_high' | 'outlier';
  message:      string;
  z_score?:     number;
  expected_min: number;
  expected_max: number;
}

interface Props {
  itemId:   string | null;
  marketId: string | null;
  price:    string;
}

const SEVERITY_COLORS: Record<string, string> = {
  normal:    Colors.veggie,
  high:      Colors.birr,
  very_high: '#F97316',   // orange
  outlier:   Colors.flagged,
};

const SEVERITY_EMOJI: Record<string, string> = {
  normal:    '✅',
  high:      '⚠️',
  very_high: '🔶',
  outlier:   '🚨',
};

export default function AnomalyHint({ itemId, marketId, price }: Props) {
  const [result,  setResult]  = useState<AnomalyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Clear previous debounce
    if (timerRef.current) clearTimeout(timerRef.current);

    const priceNum = parseFloat(price);
    if (!itemId || !marketId || isNaN(priceNum) || priceNum <= 0) {
      setResult(null);
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      return;
    }

    setLoading(true);

    timerRef.current = setTimeout(async () => {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
      try {
        const res = await fetch(`${apiUrl}/anomaly/check`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id:   itemId,
            market_id: marketId,
            price_etb: priceNum,
          }),
        });

        if (res.ok) {
          const data: AnomalyResult = await res.json();
          setResult(data);
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }
      } catch {
        // API offline — silently skip
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [price, itemId, marketId]);

  if (!result && !loading) return null;

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <Text style={styles.loadingTxt}>🔍 Checking price…</Text>
      </View>
    );
  }

  if (!result) return null;

  const color = SEVERITY_COLORS[result.severity] ?? Colors.t4;
  const emoji = SEVERITY_EMOJI[result.severity]  ?? '•';

  return (
    <Animated.View style={[styles.banner, { backgroundColor: color + '15', borderColor: color + '40' }, { opacity }]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.message, { color }]}>{result.message}</Text>
        <Text style={styles.range}>
          {`Expected range: ${result.expected_min.toFixed(0)}–${result.expected_max.toFixed(0)} ETB`}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 8 },
  emoji:      { fontSize: 18, marginTop: 1 },
  message:    { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  range:      { fontSize: 11, color: Colors.t5, marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  loadingTxt: { fontSize: 12, color: Colors.t4 },
});
