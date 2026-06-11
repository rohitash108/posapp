import NetInfo from '@react-native-community/netinfo';
import { syncApi } from '../api/sync';
import {
  upsertCategories, upsertItems, upsertTables, upsertCustomers,
  upsertOrders, getSyncQueue, removeSyncQueueItem, incrementSyncRetries,
} from '../database/repositories';
import { useAppStore } from '../store/appStore';

const MAX_RETRIES = 5;

class SyncService {
  private isRunning = false;
  private unsubscribeNetInfo?: () => void;

  start(): void {
    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      useAppStore.getState().setOnline(online);
      if (online) this.runSync();
    });
  }

  stop(): void {
    this.unsubscribeNetInfo?.();
  }

  async fullPull(): Promise<void> {
    const lastSync = useAppStore.getState().lastSyncedAt;
    const res = await syncApi.pull(lastSync ?? undefined);
    const data = res.data;
    await upsertCategories(data.categories ?? []);
    await upsertItems(data.items ?? []);
    await upsertTables(data.tables ?? []);
    await upsertCustomers(data.customers ?? []);
    await upsertOrders(data.orders ?? []);
    useAppStore.getState().setLastSyncedAt(data.synced_at);
    useAppStore.getState().setTaxes(data.taxes ?? []);
    useAppStore.getState().setRestaurantSettings(data.settings ?? {});
  }

  async pushQueue(): Promise<void> {
    const queue = await getSyncQueue();
    if (queue.length === 0) return;
    const ordersToCreate: any[] = [];
    const statusUpdates: any[] = [];
    for (const item of queue) {
      if (item.retries >= MAX_RETRIES) continue;
      const payload = JSON.parse(item.payload);
      if (item.action === 'create_order') ordersToCreate.push({ ...payload, queue_id: item.id });
      else statusUpdates.push({ ...payload, queue_id: item.id });
    }
    if (!ordersToCreate.length && !statusUpdates.length) return;
    try {
      const res = await syncApi.push({ orders: ordersToCreate, status_updates: statusUpdates });
      for (const c of res.data.created ?? []) await removeSyncQueueItem(c.local_uuid);
      for (const e of res.data.errors ?? []) {
        const qItem = queue.find((q) => q.id === e.local_uuid);
        if (qItem) await incrementSyncRetries(qItem.id);
      }
    } catch {
      for (const item of queue) await incrementSyncRetries(item.id);
    }
  }

  async runSync(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    useAppStore.getState().setSyncing(true);
    try {
      await this.pushQueue();
      await this.fullPull();
    } catch (e) {
      console.warn('[Sync]', e);
    } finally {
      this.isRunning = false;
      useAppStore.getState().setSyncing(false);
    }
  }

  async manualSync(): Promise<void> {
    if (!useAppStore.getState().isOnline) {
      throw new Error('No internet connection.');
    }
    await this.runSync();
  }
}

export const syncService = new SyncService();
