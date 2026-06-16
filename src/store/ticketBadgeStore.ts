import { create } from 'zustand';

interface TicketBadgeState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

export const useTicketBadgeStore = create<TicketBadgeState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount }),
}));
