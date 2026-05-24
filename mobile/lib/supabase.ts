import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const supabaseUrl  = (Constants.expoConfig?.extra?.supabaseUrl  ?? process.env.EXPO_PUBLIC_SUPABASE_URL)  as string;
const supabaseAnon = (Constants.expoConfig?.extra?.supabaseAnon ?? process.env.EXPO_PUBLIC_SUPABASE_ANON) as string;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Missing Supabase env vars. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON to your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
});
