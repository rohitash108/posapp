/**
 * Preserves original offline order creation timestamps across sync.
 * Server may set created_at to sync time; we keep the real offline time for display.
 */
import { getItem, setItem } from '@/utils/storage';
import type { Order } from '@/types';

const STORAGE_KEY = 'offline_order_created_at';

type Store = {
  byUuid: Record<string, string>;
  byId: Record<string, string>;
};

let cache: Store | null = null;

async function loadStore(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : { byUuid: {}, byId: {} };
  } catch {
    cache = { byUuid: {}, byId: {} };
  }
  return cache;
}

async function persist(store: Store): Promise<void> {
  cache = store;
  await setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function hydrateOfflineOrderTimes(): Promise<void> {
  await loadStore();
}

export async function rememberOfflineOrderTime(localUuid: string, createdAt: string): Promise<void> {
  const store = await loadStore();
  store.byUuid[localUuid] = createdAt;
  await persist(store);
}

export async function linkOfflineOrderServerId(localUuid: string, serverId: number): Promise<void> {
  const store = await loadStore();
  const createdAt = store.byUuid[localUuid];
  if (createdAt) {
    store.byId[String(serverId)] = createdAt;
    await persist(store);
  }
}

function peekCreatedAt(localUuid?: string | null, serverId?: number | null): string | undefined {
  if (!cache) return undefined;
  if (localUuid && cache.byUuid[localUuid]) return cache.byUuid[localUuid];
  if (serverId != null && cache.byId[String(serverId)]) return cache.byId[String(serverId)];
  return undefined;
}

/** Apply stored offline creation time when displaying orders. */
export function applyOfflineCreatedAt(order: Order): Order {
  const localUuid = (order as Order & { local_uuid?: string }).local_uuid;
  const preserved = peekCreatedAt(localUuid, order.id);
  if (!preserved) return order;
  return { ...order, created_at: preserved };
}

/** Parse sync queue / API payload and ensure created_at is set from offline time. */
export function withOfflineCreatedAt<T extends Record<string, unknown>>(
  payload: T,
  queueCreatedAt?: string,
): T & { created_at: string; updated_at: string } {
  const createdAt = (payload.created_at as string | undefined) ?? queueCreatedAt ?? new Date().toISOString();
  return { ...payload, created_at: createdAt, updated_at: (payload.updated_at as string | undefined) ?? createdAt };
}
