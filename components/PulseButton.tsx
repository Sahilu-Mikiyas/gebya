/**
 * PulseButton — primary CTA button with a subtle breathing scale animation.
 * Scale pulses 1.0 → 1.03 → 1.0 every 2s.
 *
 * Web-safe: uses only `transform` (scale) via useNativeDriver — no shadow
 * animation on web (where it isn't supported).
 *
 * Usage:
 *   <PulseButton onPress={submit} label="Log This Price →" />
 *   <PulseButton onPress={next}   label="Get Started →" color={Colors.deal} />
 */
import { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, ViewStyle, Platform } from 'react-native';

interface Props {
  label:      string;
  onPress:    () => void;
  color?:     string;
  textColor?: string;
  disabled?:  boolean;
  style?:     ViewStyle;
}

export default function PulseButton({
  label,
  onPress,
  color     = '#22C55E',
  textColor = '#080808',
  disabled  = false,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.03, duration: 900, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.00, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.wrap,
        // Shadow only on native (not animated on web to avoid text-node crash)
        Platform.OS !== 'web' && {
          shadowColor:    color,
          shadowOpacity:  0.45,
          shadowOffset:   { width: 0, height: 4 },
          shadowRadius:   12,
          elevation:      8,
        },
        { transform: [{ scale }] },
        style,
      ]}
    >
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: color }, disabled && styles.disabled]}
        onPress={onPress}
        activeOpacity={0.85}
        disabled={disabled}
      >
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
  },
  btn: {
    borderRadius:      16,
    paddingVertical:   18,
    paddingHorizontal: 28,
    alignItems:        'center',
    justifyContent:    'center',
  },
  disabled: { opacity: 0.55 },
  label: {
    fontSize:      16,
    fontWeight:    '800',
    letterSpacing: -0.2,
  },
});
