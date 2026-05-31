/**
 * onboardingStore — Phase 3
 * Persists completion state to AsyncStorage.
 * Also tracks the current slide index for the scroll ref.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'gebya_onboarded';

interface OnboardingState {
  completed:    boolean;
  checked:      boolean;   // true once we've read AsyncStorage (prevents flicker)
  step:         number;
  checkOnboarded:     () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  nextStep:           () => void;
  reset:              () => void;   // dev helper
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  completed: false,
  checked:   false,
  step:      0,

  checkOnboarded: async () => {
    const val = await AsyncStorage.getItem(KEY);
    set({ completed: val === 'true', checked: true });
  },

  completeOnboarding: async () => {
    await AsyncStorage.setItem(KEY, 'true');
    set({ completed: true });
  },

  nextStep: () => set((s) => ({ step: Math.min(s.step + 1, 3) })),

  reset: async () => {
    await AsyncStorage.removeItem(KEY);
    set({ completed: false, step: 0 });
  },
}));
