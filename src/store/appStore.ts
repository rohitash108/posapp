import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import { setItem, getItem, deleteItem } from '../utils/storage';
import type { User, Restaurant, Tax } from '../types';

// Cross-platform async storage adapter for Zustand persist.
// Web uses localStorage (synchronous wrapper via createJSONStorage), native uses SecureStore.
const crossPlatformStorage = {
  getItem:    (key: string) => getItem(key),
  setItem:    (key: string, value: string) => setItem(key, value),
  removeItem: (key: string) => deleteItem(key),
};

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

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      restaurant: null,
      token: null,
      isHydrated: false,
      setAuth: (user, restaurant, token) => set({ user, restaurant, token }),
      clearAuth: () => set({ user: null, restaurant: null, token: null }),
      setHydrated: () => set({ isHydrated: true }),
      // Default online=true; the layout's event listener overrides on actual disconnect.
      isOnline: true,
      isSyncing: false,
      lastSyncedAt: null,
      setOnline: (isOnline) => set({ isOnline }),
      setSyncing: (isSyncing) => set({ isSyncing }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      taxes: [],
      restaurantSettings: {},
      setTaxes: (taxes) => set({ taxes }),
      setRestaurantSettings: (restaurantSettings) => set({ restaurantSettings }),
    }),
    {
      name: 'cspos-app-store',
      storage: createJSONStorage(() => crossPlatformStorage),
      // Only persist auth + sync metadata; transient UI state is not persisted.
      partialize: (state) => ({
        user:               state.user,
        restaurant:         state.restaurant,
        token:              state.token,
        lastSyncedAt:       state.lastSyncedAt,
        taxes:              state.taxes,
        restaurantSettings: state.restaurantSettings,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);
