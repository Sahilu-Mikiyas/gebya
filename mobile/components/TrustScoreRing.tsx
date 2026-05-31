/**
 * TrustScoreRing — Phase 7-A
 * Animated SVG conic ring showing trust score (0–100).
 * Animates from 0 → actual score on mount.
 * Center shows tier badge emoji + score number.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export type TrustTier = 'new' | 'rising' | 'trusted' | 'verified' | string;

interface Props {
  score: number;   // 0–100
  tier:  TrustTier;
  size?: number;   // diameter (default 120)
}

const TIER_CONFIG: Record<string, { color: string; emoji: string; label: string }> = {
  new:      { color: '#9CA3AF', emoji: '🌱', label: 'New'      },
  rising:   { color: '#F59E0B', emoji: '⭐', label: 'Rising'   },
  trusted:  { color: '#22C55E', emoji: '✅', label: 'Trusted'  },
  verified: { color: '#00D4FF', emoji: '💎', label: 'Verified' },
};

// Custom wrapper to filter out web-incompatible props (like collapsable) added by Animated.createAnimatedComponent
const WebSafeCircle = React.forwardRef(({ collapsable, ...props }: any, ref: any) => (
  <Circle ref={ref} {...props} />
));

// Animated circle that reacts to an Animated.Value
const AnimatedCircle = Animated.createAnimatedComponent(WebSafeCircle);

export default function TrustScoreRing({ score, tier, size = 120 }: Props) {
  const cfg    = TIER_CONFIG[tier] ?? TIER_CONFIG.new;
  const R      = (size - 16) / 2;          // radius
  const cx     = size / 2;
  const cy     = size / 2;
  const circum = 2 * Math.PI * R;          // circumference

  // Animate dashoffset from full (no fill) to target
  const anim    = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim, {
        toValue:         score,
        duration:        1200,
        delay:           200,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue:         1,
        duration:        400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [score]);

  // strokeDashoffset: circum → 0 as score goes 0 → 100
  const dashOffset = anim.interpolate({
    inputRange:  [0, 100],
    outputRange: [circum, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[{ width: size, height: size, opacity }]}>
      <Svg width={size} height={size}>
        {/* Track (background ring) */}
        <Circle
          cx={cx} cy={cy} r={R}
          stroke="#1E1E1E"
          strokeWidth={10}
          fill="none"
        />
        {/* Score arc */}
        <AnimatedCircle
          cx={cx} cy={cy} r={R}
          stroke={cfg.color}
          strokeWidth={10}
          fill="none"
          strokeDasharray={`${circum} ${circum}`}
          strokeDashoffset={dashOffset as any}
          strokeLinecap="round"
          // Start at top (12 o'clock) by rotating −90°
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>

      {/* Center content */}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={styles.emoji}>{cfg.emoji}</Text>
        <Text style={[styles.score, { color: cfg.color }]}>{score}</Text>
        <Text style={styles.label}>{cfg.label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  emoji:  { fontSize: 20, marginBottom: 2 },
  score:  { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  label:  { fontSize: 9,  fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase' },
});
