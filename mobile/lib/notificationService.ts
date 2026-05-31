/**
 * notificationService.ts — Phase 10-A
 *
 * Handles Expo Push Notification registration:
 *  - Requests permission on first call
 *  - Gets Expo push token
 *  - Saves token to profiles.push_token in Supabase
 *  - Sets up notification listeners for foreground handling
 *
 * Call registerForPushNotifications(userId) once after sign-in.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

// Configure how notifications appear while app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

/**
 * Register device for push notifications and save token to Supabase.
 * Safe to call multiple times — no-ops if already registered.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Push notifications are not supported/needed on Web demo without VAPID keys
  if (Platform.OS === 'web') {
    console.log('[Push] Running on Web — skipping push registration');
    return null;
  }

  // Push tokens only work on physical devices
  if (!Device.isDevice) {
    console.log('[Push] Running on simulator — skipping push registration');
    return null;
  }

  // Check / request permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission denied');
    return null;
  }

  // Android foreground channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('gebya-alerts', {
      name:        'Price Alerts',
      importance:  Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:  '#22C55E',
    });
  }

  // Get token — projectId required for Expo Go, read standard from Constants
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? undefined;

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token     = tokenData.data;

  // Persist to Supabase (non-blocking, best-effort)
  supabase.from('profiles')
    .update({ push_token: token })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) console.warn('[Push] Failed to save token:', error.message);
    });

  return token;
}

/**
 * Subscribe to received notifications (foreground) and responses (tap).
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(
  onReceive:  (n: Notifications.Notification) => void,
  onResponse: (r: Notifications.NotificationResponse) => void,
): () => void {
  const recSub = Notifications.addNotificationReceivedListener(onReceive);
  const resSub = Notifications.addNotificationResponseReceivedListener(onResponse);

  return () => {
    recSub.remove();
    resSub.remove();
  };
}
