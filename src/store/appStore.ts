import { create } from 'zustand';
import type { User, Restaurant, Tax } from '../types';

interface AppState {
  user: User | null;
  restaurant: Restaurant | null;
  token: string | null;
  isHydrated: boolean;
  setAuth: (user: User, restaurant: Restaurant, token: string) => void;
  clearAuth: () => void;
  setHydrated: () => void;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSyncedAt: (ts: string) => void;
  taxes: Tax[];
  restaurantSettings: Record<string, Record<string, string>>;
  setTaxes: (taxes: Tax[]) => void;
  setRestaurantSettings: (settings: Record<string, Record<string, string>>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  restaurant: null,
  token: null,
  isHydrated: false,
  setAuth: (user, restaurant, token) => set({ user, restaurant, token }),
  clearAuth: () => set({ user: null, restaurant: null, token: null }),
  setHydrated: () => set({ isHydrated: true }),
  isOnline: false,
  isSyncing: false,
  lastSyncedAt: null,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  taxes: [],
  restaurantSettings: {},
  setTaxes: (taxes) => set({ taxes }),
  setRestaurantSettings: (restaurantSettings) => set({ restaurantSettings }),
}));
