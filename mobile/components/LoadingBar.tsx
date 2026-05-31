/**
 * LoadingBar — thin 3px bar at the very top of the screen that sweeps
 * left-to-right whenever any TanStack Query fetch is in flight.
 *
 * Rendered once inside RootLayout, above everything else.
 * Reads from `loadingStore`. Wire queries via `useIsFetching()` in the store shim.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

const BAR_HEIGHT = 3;

export default function LoadingBar() {
  const fetching  = useIsFetching();
  const mutating  = useIsMutating();
  const isLoading = fetching > 0 || mutating > 0;

  // 0 = left edge, 1 = fully swept, 1.2 = fade out after overshoot
  const progress = useRef(new Animated.Value(0)).current;
  const opacity  = useRef(new Animated.Value(0)).current;

  // Track current animation so we can stop it
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Fade in
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();

      // Sweep progress 0 → 0.85 slowly (stops short — waiting for real end)
      anim.current?.stop();
      progress.setValue(0);
      anim.current = Animated.timing(progress, {
        toValue:  0.85,
        duration: 2_000,
        useNativeDriver: false,
      });
      anim.current.start();
    } else {
      // Complete sweep: 0.85 → 1.0, then fade out
      anim.current?.stop();
      anim.current = Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(opacity,  { toValue: 0, duration: 300, delay: 150, useNativeDriver: true }),
      ]);
      anim.current.start(() => progress.setValue(0));
    }
  }, [isLoading]);

  const width = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.bar, { opacity }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.fill,
          { width: width as any },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top:      0,
    left:     0,
    right:    0,
    height:   BAR_HEIGHT,
    zIndex:   99999,
    backgroundColor: 'transparent',
  },
  fill: {
    height:          BAR_HEIGHT,
    backgroundColor: '#22C55E',   // Colors.veggie — avoid importing to keep this file light
    // Glow effect on iOS
    shadowColor:     '#22C55E',
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.9,
    shadowRadius:    4,
  },
});
