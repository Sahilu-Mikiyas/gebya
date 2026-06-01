/**
 * haptics.ts — Phase 10-F
 * Thin wrapper around expo-haptics that:
 *  - Is a no-op on web (haptics API not available)
 *  - Provides named helpers for consistent feedback patterns
 *
 * Usage:
 *   import { hap } from '@/lib/haptics';
 *   hap.light();     // gentle tap (checkboxes, toggles)
 *   hap.medium();    // button press
 *   hap.heavy();     // destructive action (delete)
 *   hap.success();   // success celebration
 *   hap.warning();   // alert / anomaly
 *   hap.error();     // form validation fail
 */
import { Platform } from 'react-native';

// Lazy import so web doesn't try to load the native module
let Haptics: typeof import('expo-haptics') | null = null;

if (Platform.OS !== 'web') {
  // Dynamic require to avoid web bundling errors
  try {
    Haptics = require('expo-haptics');
  } catch {
    // expo-haptics not available (e.g. web fallback)
  }
}

const noop = () => {};

export const hap = {
  light: Haptics
    ? () => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Light)
    : noop,

  medium: Haptics
    ? () => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Medium)
    : noop,

  heavy: Haptics
    ? () => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Heavy)
    : noop,

  success: Haptics
    ? () => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Success)
    : noop,

  warning: Haptics
    ? () => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Warning)
    : noop,

  error: Haptics
    ? () => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Error)
    : noop,
};
