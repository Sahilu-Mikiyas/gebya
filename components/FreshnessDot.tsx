/**
 * FreshnessDot — Phase 11-A
 * A colour-coded dot that shows how recently a price was logged.
 *
 * Age bands:
 *   < 2h   → neon green (#39FF14) with glow shadow
 *   < 24h  → green (#22C55E)
 *   1–3d   → amber (#F59E0B)
 *   3d+    → dim grey (#444444)
 *
 * Usage:
 *   <FreshnessDot loggedAt={log.logged_at} />
 *   <FreshnessDot loggedAt={log.logged_at} size={10} showLabel />
 */
import { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { getFreshnessLevel, getFreshnessColor, FreshnessLevel } from '@/lib/freshness';

interface Props {
  loggedAt:   string;
  size?:      number;   // dot diameter, default 8
  showLabel?: boolean;  // show "Fresh" / "2h ago" etc.
}

function freshnessLabel(level: FreshnessLevel, loggedAt: string): string {
  const mins  = Math.floor((Date.now() - new Date(loggedAt).getTime()) / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  switch (level) {
    case 'fresh':  return mins < 1 ? 'just now' : `${mins}m ago`;
    case 'recent': return `${hours}h ago`;
    case 'aging':  return `${days}d ago`;
    case 'stale':  return `${days}d ago`;
  }
}

export default function FreshnessDot({ loggedAt, size = 8, showLabel = false }: Props) {
  const level = getFreshnessLevel(loggedAt);
  const color = getFreshnessColor(level);
  const isFresh = level === 'fresh';

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isFresh) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 1000, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [isFresh]);

  const scale = pulseAnim.interpolate({
    inputRange:  [0.4, 1],
    outputRange: [0.85, 1],
  });

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.dot,
          {
            width:           size,
            height:          size,
            borderRadius:    size / 2,
            backgroundColor: color,
            opacity:         isFresh ? pulseAnim : 1,
            transform:       [{ scale: isFresh ? scale : 1 }],
            // Glow effect on fresh dots
            shadowColor:  isFresh ? color : 'transparent',
            shadowOpacity: isFresh ? 0.9 : 0,
            shadowRadius:  isFresh ? 5   : 0,
            shadowOffset:  { width: 0, height: 0 },
          },
        ]}
      />
      {showLabel && (
        <Text style={[styles.label, { color }]}>
          {freshnessLabel(level, loggedAt)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot:   { flexShrink: 0 },
  label: { fontSize: 10, fontWeight: '700' },
});
