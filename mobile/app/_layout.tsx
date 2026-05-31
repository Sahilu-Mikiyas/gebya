import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStore } from '@/stores/offlineStore';
import { useToastStore } from '@/stores/toastStore';
import NetInfo from '@react-native-community/netinfo';
import ToastContainer from '@/components/Toast';
import { useOnboardingStore } from '@/stores/onboardingStore';
import LoadingBar from '@/components/LoadingBar';
import { registerForPushNotifications, subscribeToNotifications } from '@/lib/notificationService';
import ErrorBoundary from '@/components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 min
      retry: 2,
    },
  },
});

/**
 * Returns true when the current URL looks like a Supabase auth callback.
 * Magic links land at http://localhost:8082/#access_token=…
 * PKCE OAuth lands at http://localhost:8082/?code=…
 */
function isAuthCallbackUrl(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return (
    window.location.hash.includes('access_token') ||
    window.location.search.includes('code=')
  );
}

function AuthGuard() {
  const { session, setSession, setLoading } = useAuthStore();
  const { setOnline, loadPending } = useOfflineStore();
  const { completed: onboarded, checked: onboardChecked, checkOnboarded } = useOnboardingStore();
  const router   = useRouter();
  const segments = useSegments();

  // Check AsyncStorage for onboarding completion once on mount
  useEffect(() => { checkOnboarded(); }, []);

  // ── Push notification registration ─────────────────────────────────────────
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    // Register and save token to profiles
    registerForPushNotifications(userId);

    // Handle taps on received notifications → deep-link
    const unsub = subscribeToNotifications(
      (_notification) => {/* foreground: toast is sufficient */},
      (response) => {
        const data = response.notification.request.content.data as any;
        if (data?.screen === 'alert-triggered' && data.alertId) {
          router.push({
            pathname: '/alert-triggered',
            params: {
              alertId:      data.alertId,
              itemId:       data.itemId   ?? '',
              marketId:     data.marketId ?? '',
              targetPrice:  '0',
              currentPrice: '0',
            },
          } as any);
        }
      },
    );
    return unsub;
  }, [session?.user?.id]);


  /**
   * While we're on a magic-link callback URL, suppress the route guard.
   * Without this, `getSession()` races with URL-hash processing and can
   * overwrite the just-set session with null, sending the user back to login.
   */
  const pendingCallback = useRef(isAuthCallbackUrl());
  const [guardReady, setGuardReady] = useState(!pendingCallback.current);

  // ── Auth state ─────────────────────────────────────────────────────────────
  useEffect(() => {
    /**
     * Use onAuthStateChange as the single source of truth — no getSession() call.
     * onAuthStateChange always fires INITIAL_SESSION synchronously upon subscription,
     * so we never miss the current auth state.
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (pendingCallback.current) {
        // We're handling a callback URL — hold the guard until Supabase confirms
        // the outcome (SIGNED_IN or SIGNED_OUT). INITIAL_SESSION may fire first
        // with null before the hash is processed; we ignore it here.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          pendingCallback.current = false;
          setGuardReady(true);
          setLoading(false);
        }
      } else {
        // Normal app launch — INITIAL_SESSION carries the stored session (or null).
        if (event === 'INITIAL_SESSION') {
          setGuardReady(true);
          setLoading(false);
        }
      }
    });

    // Safety net: if the magic-link is invalid/expired and SIGNED_IN never fires,
    // unblock the guard after 8 s so the user isn't stuck on a blank screen.
    const safetyTimer = setTimeout(() => {
      if (pendingCallback.current) {
        pendingCallback.current = false;
        setGuardReady(true);
        setLoading(false);
      }
    }, 8_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  // ── Network state ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Track previous online state to detect transitions
    let prevOnline: boolean | null = null;

    const unsub = NetInfo.addEventListener(async (state) => {
      const nowOnline = state.isConnected ?? true;
      setOnline(nowOnline);

      // If we just came back online, flush any pending offline logs
      if (prevOnline === false && nowOnline) {
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          const { synced, failed } = await useOfflineStore.getState().flushPending(userId);
          if (synced > 0) {
            useToastStore.getState().showToast(
              `✅ Synced ${synced} offline log${synced > 1 ? 's' : ''} · +${synced * 10} pts`,
              'success',
            );
          }
          if (failed > 0) {
            useToastStore.getState().showToast(
              `⚠️ ${failed} log${failed > 1 ? 's' : ''} failed to sync`,
              'error',
            );
          }
        }
      }

      prevOnline = nowOnline;
    });

    loadPending();
    return unsub;
  }, []);

  // ── Route guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!guardReady)       return;   // still resolving auth state
    if (!onboardChecked)   return;   // still reading AsyncStorage

    const inAuthGroup       = segments[0] === '(auth)';
    const inOnboarding      = segments[0] === 'onboarding';

    if (!session && !inAuthGroup) {
      // Not logged in → go to login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Just logged in — check if onboarding needed
      if (!onboarded) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    } else if (session && !inAuthGroup && !inOnboarding && !onboarded) {
      // Logged in, navigated somewhere, but never onboarded
      router.replace('/onboarding');
    }
  }, [session, segments, guardReady, onboarded, onboardChecked]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
    JetBrainsMono_700Bold,
  });

  // Hold render until fonts are ready to prevent FOUT
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#080808' }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <LoadingBar />
      <AuthGuard />
      <ErrorBoundary>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="item/[id]" />
          <Stack.Screen name="alerts" />
          <Stack.Screen name="market/[id]" />
          <Stack.Screen
            name="log-success"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="alert-triggered"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="settings" />
          <Stack.Screen name="compare"  />
          <Stack.Screen name="pioneer"  />
        </Stack>
      </ErrorBoundary>
      <ToastContainer />
    </QueryClientProvider>
  );
}
