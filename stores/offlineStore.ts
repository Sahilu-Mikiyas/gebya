/**
 * offlineStore — manages connectivity state and the pending-log queue.
 *
 * Changes from Sprint 1:
 *  - PendingLog now includes `unit` and `notes` fields
 *  - Added `flushPending` action that drains the queue to Supabase
 *    when connectivity is restored (called from _layout.tsx)
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export interface PendingLog {
  id:        string;   // local uuid
  item_id:   string;
  market_id: string;
  price_etb: number;
  logged_at: string;   // ISO string
  unit?:     string;   // e.g. 'kg', 'piece', 'bundle'
  notes?:    string;
  synced:    boolean;
  sync_error?: string; // Phase 3-A
}

interface OfflineState {
  isOnline:     boolean;
  pendingLogs:  PendingLog[];
  setOnline:    (v: boolean) => void;
  addPending:   (log: PendingLog) => Promise<void>;
  markSynced:   (id: string)    => Promise<void>;
  removePending: (id: string)   => Promise<void>; // Phase 3-A
  loadPending:  ()              => Promise<void>;
  /** Flush all unsynced logs to Supabase. Call when connectivity is restored. */
  flushPending: (userId: string) => Promise<{ synced: number; failed: number }>;
}

const STORAGE_KEY = 'gebya_pending_logs';

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline:    true,
  pendingLogs: [],

  setOnline: (v) => set({ isOnline: v }),

  loadPending: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ pendingLogs: JSON.parse(raw) });
    } catch (_) {}
  },

  addPending: async (log) => {
    const updated = [...get().pendingLogs, log];
    set({ pendingLogs: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  markSynced: async (id) => {
    const updated = get().pendingLogs.map((l) =>
      l.id === id ? { ...l, synced: true, sync_error: undefined } : l,
    );
    set({ pendingLogs: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  removePending: async (id) => {
    const updated = get().pendingLogs.filter((l) => l.id !== id);
    set({ pendingLogs: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  flushPending: async (userId: string) => {
    const unsynced = get().pendingLogs.filter((l) => !l.synced);
    if (!unsynced.length) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const log of unsynced) {
      try {
        const { error } = await supabase.from('price_logs').insert({
          item_id:   log.item_id,
          market_id: log.market_id,
          price_etb: log.price_etb,
          logged_by: userId,
          logged_at: log.logged_at,
          unit:      log.unit  ?? 'kg',
          notes:     log.notes ?? null,
        });

        if (error) {
          failed++;
          // Save error detail
          const updated = get().pendingLogs.map((l) =>
            l.id === log.id ? { ...l, sync_error: error.message } : l,
          );
          set({ pendingLogs: updated });
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } else {
          await get().markSynced(log.id);
          // Award points for each synced log
          await supabase.rpc('award_points', { p_user_id: userId, p_points: 10 });
          synced++;
        }
      } catch (err: any) {
        failed++;
        const errMsg = err?.message ?? 'Unknown sync network error';
        const updated = get().pendingLogs.map((l) =>
          l.id === log.id ? { ...l, sync_error: errMsg } : l,
        );
        set({ pendingLogs: updated });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    }

    return { synced, failed };
  },
}));
