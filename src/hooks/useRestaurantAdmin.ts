import { useAppStore } from '@/store/appStore';

/** Matches csPos `restaurant_admin` middleware + RoyaltyController::ensureRestaurantAdmin */
export function useRestaurantAdmin(): boolean {
  const user = useAppStore(s => s.user);
  return user?.role === 'restaurant_admin' || user?.role === 'super_admin';
}
