import { create } from 'zustand';

interface OrderBadgeState {
  pendingCount: number;
  kitchenCount: number;
  update: (pending: number, kitchen: number) => void;
}

export const useOrderBadgeStore = create<OrderBadgeState>((set) => ({
  pendingCount: 0,
  kitchenCount: 0,
  update: (pendingCount, kitchenCount) => set({ pendingCount, kitchenCount }),
}));
