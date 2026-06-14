/**
 * Web sync service — mirrors SyncService for native.
 * Uses IndexedDB for offline storage and syncs with the Laravel API.
 */
import client from '@/api/client';
import { ordersApi } from '@/api/orders';
import { useAppStore } from '@/store/appStore';
import {
  webSaveCategories, webSaveItems, webSaveTables,
  webGetSyncQueue, webRemoveSyncQueue, webSetLastSync,
} from '@/utils/webDb';

export const webSyncService = {
  async pull(): Promise<void> {
    const lastSync = useAppStore.getState().lastSyncedAt;
    const res = await client.get('/sync/pull', { params: lastSync ? { since: lastSync } : {} });
    const {
      categories = [], items = [], tables = [], taxes = [],
      customers = [], orders = [], settings = {}, synced_at,
    } = res.data;
    await webSaveCategories(categories);
    await webSaveItems(items);
    if (tables.length > 0) await webSaveTables(tables);
    useAppStore.getState().setTaxes(taxes);
    if (settings && Object.keys(settings).length > 0) {
      useAppStore.getState().setRestaurantSettings(settings);
    }
    const syncedAt = synced_at ?? new Date().toISOString();
    await webSetLastSync(syncedAt);
    useAppStore.getState().setLastSyncedAt(syncedAt);
    // customers/orders cached in memory for web session via API calls; full IDB parity optional
    void customers;
    void orders;
  },

  async push(): Promise<void> {
    const queue = await webGetSyncQueue();
    for (const item of queue) {
      try {
        if (item.action === 'create_order') {
          await ordersApi.create(JSON.parse(item.payload));
        } else if (item.action === 'update_status') {
          const { order_id, status } = JSON.parse(item.payload);
          await ordersApi.updateStatus(order_id, status);
        }
        await webRemoveSyncQueue(item.id);
      } catch (e: any) {
        if (!e?.response) break;
        console.warn('[WebSync] Push failed:', item.id, e?.message);
      }
    }
  },

  async sync(): Promise<void> {
    const store = useAppStore.getState();
    store.setSyncing(true);
    try {
      await this.pull();
      await this.push();
    } catch (e) {
      console.warn('[WebSync] Sync failed:', e);
      throw e;
    } finally {
      store.setSyncing(false);
    }
  },
};
