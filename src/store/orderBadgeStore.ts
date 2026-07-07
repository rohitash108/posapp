import { create } from 'zustand';
import type { Order } from '@/types';

interface OrderBadgeState {
  pendingCount: number;
  kitchenCount: number;
  refreshVersion: number;
  aggAlert: { source: string; orders: Order[] } | null;
  qrAlert: Order[] | null;
  update: (pending: number, kitchen: number) => void;
  bumpRefresh: () => void;
  setAggAlert: (alert: { source: string; orders: Order[] }) => void;
  clearAggAlert: () => void;
  setQrAlert: (orders: Order[]) => void;
  clearQrAlert: () => void;
}

export const useOrderBadgeStore = create<OrderBadgeState>((set) => ({
  pendingCount: 0,
  kitchenCount: 0,
  refreshVersion: 0,
  aggAlert: null,
  qrAlert: null,
  update: (pendingCount, kitchenCount) => set({ pendingCount, kitchenCount }),
  bumpRefresh: () => set((s) => ({ refreshVersion: s.refreshVersion + 1 })),
  setAggAlert: (aggAlert) => set({ aggAlert }),
  clearAggAlert: () => set({ aggAlert: null }),
  setQrAlert: (qrAlert) => set({ qrAlert }),
  clearQrAlert: () => set({ qrAlert: null }),
}));
