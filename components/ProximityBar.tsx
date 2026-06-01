/**
 * ProximityBar — Phase 8-A
 * Animated fill bar showing how close the current price is
 * to the user's alert target.
 * proximity = 0 → far away, 1.0 → triggered
 */
import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  proximity:  number;   // 0–1
  direction:  'drop_below' | 'rise_above';
  currentPrice: number;
  targetPrice:  number;
}

function barColor(proximity: number, direction: 'drop_below' | 'rise_above'): string {
  if (proximity >= 1)   return Colors.veggie;
  if (proximity >= 0.8) return Colors.birr;
  return direction === 'drop_below' ? Colors.deal : Colors.flagged;
}

export default function ProximityBar({ proximity, direction, currentPrice, targetPrice }: Props) {
  const clamped = Math.min(Math.max(proximity, 0), 1);
  const anim    = useRef(new Animated.Value(0)).current;
  const color   = barColor(clamped, direction);

  useEffect(() => {
    Animated.timing(anim, {
      toValue:         clamped,
      duration:        900,
      delay:           200,
      useNativeDriver: false,
    }).start();
  }, [clamped]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const pct    = Math.round(clamped * 100);
  const diff   = Math.abs(currentPrice - targetPrice).toFixed(0);
  const label  = clamped >= 1
    ? '🎯 Target reached!'
    : `${diff} ETB away (${pct}% there)`;

  return (
    <View style={styles.wrap}>
      {/* Bar track */}
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: width as any, backgroundColor: color }]} />
      </View>
      {/* Label */}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { marginTop: 10, gap: 5 },
  track: { height: 4, backgroundColor: Colors.s3, borderRadius: 2, overflow: 'hidden' },
  fill:  { height: 4, borderRadius: 2 },
  label: { fontSize: 10, fontWeight: '700' },
});
