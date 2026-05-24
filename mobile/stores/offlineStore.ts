import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PendingLog {
  id:        string;   // local uuid
  item_id:   string;
  market_id: string;
  price_etb: number;
  logged_at: string;   // ISO string
  synced:    boolean;
}

interface OfflineState {
  isOnline:     boolean;
  pendingLogs:  PendingLog[];
  setOnline:    (v: boolean) => void;
  addPending:   (log: PendingLog) => Promise<void>;
  markSynced:   (id: string)    => Promise<void>;
  loadPending:  ()              => Promise<void>;
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
      l.id === id ? { ...l, synced: true } : l,
    );
    set({ pendingLogs: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },
}));
