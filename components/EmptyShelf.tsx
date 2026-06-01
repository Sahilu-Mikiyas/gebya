/**
 * EmptyShelf — Phase 10-E
 * Illustrated empty state component used across the app.
 * Uses animated SVG elements + fade/scale entrance.
 *
 * Usage:
 *   <EmptyShelf
 *     variant="search"
 *     title="No results"
 *     sub="Try a different item or market"
 *   />
 */
import { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Rect, Circle, Line, Path, Ellipse } from 'react-native-svg';
import { Colors } from '@/constants/colors';

export type ShelfVariant =
  | 'search'     // magnifying glass
  | 'list'       // empty checklist
  | 'alert'      // bell with zz
  | 'logs'       // empty clipboard
  | 'market'     // closed stall
  | 'default';   // generic shelf

interface Props {
  variant?: ShelfVariant;
  title:    string;
  sub?:     string;
  size?:    number;
  style?:   ViewStyle;
}

// ── SVG illustrations (inline, no external assets) ─────────────────────────────

function SearchIllustration({ size }: { size: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 120 120">
      {/* Glass circle */}
      <Circle cx="50" cy="50" r="28" stroke={Colors.t4} strokeWidth="7" fill="none" />
      {/* Handle */}
      <Line x1="70" y1="70" x2="95" y2="95" stroke={Colors.t4} strokeWidth="7" strokeLinecap="round" />
      {/* Inner shine */}
      <Circle cx="43" cy="43" r="8" fill={Colors.s3} />
      {/* Question mark */}
      <Text style={{ fontSize: 18, position: 'absolute' }}>?</Text>
    </Svg>
  );
}

function ShelfIllustration({ size }: { size: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 120 120">
      {/* Shelf board */}
      <Rect x="10" y="80" width="100" height="8" rx="4" fill={Colors.t5} />
      {/* Left leg */}
      <Rect x="18" y="88" width="6" height="24" rx="3" fill={Colors.t5} />
      {/* Right leg */}
      <Rect x="96" y="88" width="6" height="24" rx="3" fill={Colors.t5} />
      {/* Empty dust lines */}
      <Line x1="35" y1="72" x2="85" y2="72" stroke={Colors.border} strokeWidth="2" strokeDasharray="5,4" />
      <Line x1="45" y1="62" x2="75" y2="62" stroke={Colors.border} strokeWidth="2" strokeDasharray="5,4" />
      {/* Sad face */}
      <Circle cx="60" cy="38" r="20" fill={Colors.s2} stroke={Colors.border} strokeWidth="2" />
      <Circle cx="53" cy="33" r="2.5" fill={Colors.t4} />
      <Circle cx="67" cy="33" r="2.5" fill={Colors.t4} />
      <Path d="M 50 46 Q 60 40 70 46" stroke={Colors.t4} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function AlertIllustration({ size }: { size: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 120 120">
      {/* Bell body */}
      <Path d="M 60 20 C 40 20 30 35 30 55 L 25 80 L 95 80 L 90 55 C 90 35 80 20 60 20Z"
        fill={Colors.s2} stroke={Colors.border} strokeWidth="2" />
      {/* Bell dot */}
      <Circle cx="60" cy="90" r="8" fill={Colors.s2} stroke={Colors.border} strokeWidth="2" />
      {/* Zz */}
      <Text style={{ fontSize: 0 }} />
      <Line x1="75" y1="28" x2="83" y2="20" stroke={Colors.t5} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="75" y1="28" x2="83" y2="28" stroke={Colors.t5} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="83" y1="20" x2="91" y2="20" stroke={Colors.t5} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

function LogsIllustration({ size }: { size: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 120 120">
      {/* Clipboard */}
      <Rect x="25" y="20" width="70" height="88" rx="8" fill={Colors.s2} stroke={Colors.border} strokeWidth="2" />
      <Rect x="45" y="14" width="30" height="14" rx="7" fill={Colors.s1} stroke={Colors.border} strokeWidth="2" />
      {/* Lines (empty) */}
      <Line x1="38" y1="48" x2="82" y2="48" stroke={Colors.border} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="38" y1="62" x2="72" y2="62" stroke={Colors.border} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="38" y1="76" x2="65" y2="76" stroke={Colors.border} strokeWidth="2.5" strokeLinecap="round" />
      {/* Pen */}
      <Rect x="78" y="80" width="8" height="22" rx="4" fill={Colors.t4} transform="rotate(-30 82 91)" />
    </Svg>
  );
}

// ── Map variant → illustration ─────────────────────────────────────────────────
function Illustration({ variant, size }: { variant: ShelfVariant; size: number }) {
  switch (variant) {
    case 'search': return <SearchIllustration size={size} />;
    case 'alert':  return <AlertIllustration size={size} />;
    case 'logs':   return <LogsIllustration size={size} />;
    default:       return <ShelfIllustration size={size} />;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EmptyShelf({ variant = 'default', title, sub, size = 120, style }: Props) {
  const opacity  = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.wrap, style, { opacity, transform: [{ translateY }] }]}>
      <Illustration variant={variant} size={size} />
      <Text style={styles.title}>{title}</Text>
      {sub && <Text style={styles.sub}>{sub}</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap:  { alignItems: 'center', padding: 32, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.t3, textAlign: 'center' },
  sub:   { fontSize: 14, color: Colors.t5, textAlign: 'center', lineHeight: 21, paddingHorizontal: 16 },
});
