/**
 * IndexedDB wrapper for web offline storage.
 * Mirrors the SQLite repository API used on native.
 */
import type { Category, Item, Order } from '@/types';

const DB_NAME = 'gtc_pos';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('items')) {
        const s = db.createObjectStore('items', { keyPath: 'id' });
        s.createIndex('category_id', 'category_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('orders')) {
        db.createObjectStore('orders', { keyPath: 'local_uuid' });
      }
      if (!db.objectStoreNames.contains('tables')) {
        db.createObjectStore('tables', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearAndPut<T>(storeName: string, items: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    items.forEach(i => store.put(i));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putOne<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteOne(storeName: string, key: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getMeta(key: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function setMeta(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Categories ────────────────────────────────────────────────────────────────
export const webGetCategories = (): Promise<Category[]> => getAll('categories');
export const webSaveCategories = (cats: Category[]) => clearAndPut('categories', cats);

// ── Items ─────────────────────────────────────────────────────────────────────
export async function webGetItems(categoryId?: number): Promise<Item[]> {
  const items = await getAll<Item>('items');
  return categoryId ? items.filter(i => i.category_id === categoryId) : items;
}
export const webSaveItems = (items: Item[]) => clearAndPut('items', items);

// ── Orders ────────────────────────────────────────────────────────────────────
export async function webGetOrders(limit = 100): Promise<Order[]> {
  const orders = await getAll<any>('orders');
  return orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit) as Order[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const webSaveOrder = (order: Record<string, any>) => putOne('orders', order);
export async function webUpdateOrderStatus(localUuid: string, status: string): Promise<void> {
  const orders = await getAll<any>('orders');
  const order = orders.find(o => o.local_uuid === localUuid);
  if (order) { order.status = status; await putOne('orders', order); }
}

// ── Tables ────────────────────────────────────────────────────────────────────
export const webGetTables = () => getAll<any>('tables');
export const webSaveTables = (tables: any[]) => clearAndPut('tables', tables);
export async function webUpdateTableStatus(id: number, status: string): Promise<void> {
  const tables = await getAll<any>('tables');
  const table = tables.find(t => t.id === id);
  if (table) { table.status = status; await putOne('tables', table); }
}

// ── Sync queue ────────────────────────────────────────────────────────────────
export const webAddSyncQueue = (item: any) => putOne('sync_queue', item);
export const webGetSyncQueue = (): Promise<any[]> => getAll('sync_queue');
export const webRemoveSyncQueue = (id: string) => deleteOne('sync_queue', id);

// ── Meta ──────────────────────────────────────────────────────────────────────
export const webGetLastSync = (): Promise<string | null> => getMeta('last_sync');
export const webSetLastSync = (t: string) => setMeta('last_sync', t);
export async function webHasData(): Promise<boolean> {
  const cats = await getAll<any>('categories');
  return cats.length > 0;
}
