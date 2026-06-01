/**
 * Skeleton shimmer component — replaces ActivityIndicator on all screens.
 * Usage:
 *   <SkeletonBox width="100%" height={48} borderRadius={12} />
 *   <SkeletonCircle size={40} />
 *   <SkeletonText width="60%" />
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';

// ── Shared hook ───────────────────────────────────────────────────────────────
function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 750, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [Colors.s1, Colors.s3],
  });
}

// ── Primitives ────────────────────────────────────────────────────────────────
interface BoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: BoxProps) {
  const bg = useShimmer();
  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: bg },
        style,
      ]}
    />
  );
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  const bg = useShimmer();
  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, flexShrink: 0 }}
    />
  );
}

export function SkeletonText({ width = '70%', style }: { width?: number | string; style?: ViewStyle }) {
  const bg = useShimmer();
  return (
    <Animated.View
      style={[
        { width: width as any, height: 12, borderRadius: 6, backgroundColor: bg },
        style,
      ]}
    />
  );
}

export function SkeletonPill({ width = 60, height = 20 }: { width?: number; height?: number }) {
  const bg = useShimmer();
  return (
    <Animated.View
      style={{ width, height, borderRadius: height / 2, backgroundColor: bg }}
    />
  );
}

// ── Composite skeletons ───────────────────────────────────────────────────────

/** Skeleton for a deal card row (Home / Browse) */
export function SkeletonDealRow() {
  return (
    <View style={[sk.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      <SkeletonCircle size={44} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonText width="55%" />
        <SkeletonText width="38%" />
      </View>
      <View style={{ gap: 7, alignItems: 'flex-end' }}>
        <SkeletonBox width={52} height={14} borderRadius={6} />
        <SkeletonPill width={40} height={18} />
      </View>
    </View>
  );
}

/** Skeleton for the hero Best Deal card */
export function SkeletonHero() {
  return (
    <View style={[sk.card, { padding: 18, gap: 10, borderRadius: 18 }]}>
      <SkeletonText width="40%" style={{ height: 10 }} />
      <SkeletonText width="65%" style={{ height: 20 }} />
      <SkeletonText width="50%" style={{ height: 28 }} />
      <SkeletonText width="45%" style={{ height: 11 }} />
      <SkeletonBox height={38} borderRadius={10} style={{ marginTop: 4 }} />
    </View>
  );
}

/** Skeleton for an item stat box (3-column grid on Item Detail) */
export function SkeletonStat() {
  return (
    <View style={[sk.card, { padding: 12, alignItems: 'center', gap: 8 }]}>
      <SkeletonBox width={48} height={20} borderRadius={6} />
      <SkeletonText width="80%" style={{ height: 9 }} />
    </View>
  );
}

/** Skeleton for a feed / community log row */
export function SkeletonFeedRow() {
  return (
    <View style={[sk.card, { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }]}>
      <SkeletonCircle size={30} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonText width="68%" />
        <SkeletonText width="40%" />
      </View>
      <SkeletonPill width={30} height={18} />
    </View>
  );
}

/** Skeleton for the bar chart card on Item Detail */
export function SkeletonBarChart() {
  return (
    <View style={[sk.card, { padding: 16 }]}>
      <SkeletonText width="55%" style={{ height: 10, marginBottom: 18 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 }}>
        {[72, 56, 64, 80, 48].map((h, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
            <SkeletonBox height={h} borderRadius={5} />
            <SkeletonPill width={32} height={9} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Skeleton for the line chart / trend card */
export function SkeletonLineChart() {
  return (
    <View style={[sk.card, { padding: 16 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
        <SkeletonText width="44%" style={{ height: 10 }} />
        <SkeletonPill width={60} height={18} />
      </View>
      <SkeletonBox height={60} borderRadius={6} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        {[0, 1, 2, 3].map((i) => <SkeletonPill key={i} width={22} height={9} />)}
      </View>
    </View>
  );
}

/** Skeleton for an alert row */
export function SkeletonAlertRow() {
  return (
    <View style={[sk.card, { flexDirection: 'row', gap: 12, padding: 14 }]}>
      <SkeletonCircle size={36} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonText width="60%" />
        <SkeletonText width="45%" />
        <SkeletonBox height={3} borderRadius={2} style={{ marginTop: 4 }} />
      </View>
      <View style={{ gap: 6, alignItems: 'flex-end' }}>
        <SkeletonBox width={48} height={16} borderRadius={6} />
        <SkeletonPill width={36} height={14} />
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: Colors.s1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
});
