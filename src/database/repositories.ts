import { getDatabase } from './schema';
import type { Category, Item, RestaurantTable, Customer, Order, SyncQueueItem } from '../types';

// ── Categories ────────────────────────────────────────────────────────────────

export async function upsertCategories(categories: Category[]): Promise<void> {
  const db = await getDatabase();
  for (const c of categories) {
    await db.runAsync(
      `INSERT INTO categories (id, name, image, sort_order, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, image=excluded.image,
         sort_order=excluded.sort_order, is_active=excluded.is_active,
         updated_at=excluded.updated_at`,
      [c.id, c.name, c.image ?? null, c.sort_order, c.is_active ? 1 : 0, c.updated_at ?? null]
    );
  }
}

export async function getCategories(): Promise<Category[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order');
  return rows.map((r) => ({ ...r, is_active: !!r.is_active }));
}

// ── Items ─────────────────────────────────────────────────────────────────────

export async function upsertItems(items: Item[]): Promise<void> {
  const db = await getDatabase();
  for (const item of items) {
    await db.runAsync(
      `INSERT INTO items
         (id, category_id, name, description, image, price, food_type,
          is_available, is_open_item, sort_order, tax_rate, tax_name,
          addons_json, variations_json, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         category_id=excluded.category_id, name=excluded.name,
         description=excluded.description, image=excluded.image,
         price=excluded.price, food_type=excluded.food_type,
         is_available=excluded.is_available, is_open_item=excluded.is_open_item,
         sort_order=excluded.sort_order, tax_rate=excluded.tax_rate,
         tax_name=excluded.tax_name, addons_json=excluded.addons_json,
         variations_json=excluded.variations_json, updated_at=excluded.updated_at`,
      [
        item.id, item.category_id, item.name, item.description ?? null,
        item.image ?? null, item.price, item.food_type ?? null,
        item.is_available ? 1 : 0, item.is_open_item ? 1 : 0,
        item.sort_order, item.tax_rate ?? null, item.tax_name ?? null,
        JSON.stringify(item.addons), JSON.stringify(item.variations),
        item.updated_at ?? null,
      ]
    );
  }
}

export async function getItems(categoryId?: number): Promise<Item[]> {
  const db = await getDatabase();
  const sql = categoryId
    ? 'SELECT * FROM items WHERE is_available=1 AND category_id=? ORDER BY sort_order'
    : 'SELECT * FROM items WHERE is_available=1 ORDER BY sort_order';
  const rows = await db.getAllAsync<any>(sql, categoryId ? [categoryId] : []);
  return rows.map((r) => ({
    ...r,
    is_available: !!r.is_available,
    is_open_item: !!r.is_open_item,
    addons: JSON.parse(r.addons_json ?? '[]'),
    variations: JSON.parse(r.variations_json ?? '[]'),
  }));
}

// ── Tables ────────────────────────────────────────────────────────────────────

export async function upsertTables(tables: RestaurantTable[]): Promise<void> {
  const db = await getDatabase();
  for (const t of tables) {
    await db.runAsync(
      `INSERT INTO restaurant_tables
         (id, name, table_number, slug, floor, capacity, status, has_active_order, qr_url, qr_image_url, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, table_number=excluded.table_number, slug=excluded.slug,
         floor=excluded.floor, capacity=excluded.capacity, status=excluded.status,
         has_active_order=excluded.has_active_order, qr_url=excluded.qr_url,
         qr_image_url=excluded.qr_image_url, updated_at=excluded.updated_at`,
      [
        t.id, t.name, t.table_number ?? null, t.slug ?? null, t.floor ?? null,
        t.capacity ?? null, t.status, t.has_active_order ? 1 : 0,
        t.qr_url ?? null, t.qr_image_url ?? null, t.updated_at ?? null,
      ]
    );
  }
}

export async function getTables(): Promise<RestaurantTable[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM restaurant_tables
     ORDER BY CASE WHEN table_number IS NULL THEN 1 ELSE 0 END, table_number,
              CASE WHEN floor IS NULL OR floor='' THEN 1 ELSE 0 END, floor, name`
  );
  return rows.map(r => ({ ...r, has_active_order: !!r.has_active_order }));
}

export async function updateTableStatus(id: number, status: RestaurantTable['status']): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE restaurant_tables SET status=? WHERE id=?', [status, id]);
}

export async function deleteTableLocal(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM restaurant_tables WHERE id=?', [id]);
}

// ── Customers ─────────────────────────────────────────────────────────────────

export async function upsertCustomers(customers: Customer[]): Promise<void> {
  const db = await getDatabase();
  for (const c of customers) {
    // Only persist registered customers (those with a real id from the customers table)
    if (!c.is_registered || c.id === null) continue;
    await db.runAsync(
      `INSERT INTO customers (id, name, phone, email, address, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, phone=excluded.phone, email=excluded.email,
         address=excluded.address, updated_at=excluded.updated_at`,
      [c.id, c.name, c.phone ?? null, c.email ?? null, c.address ?? null, c.updated_at ?? null]
    );
  }
}

export async function getCustomers(search?: string): Promise<Customer[]> {
  const db = await getDatabase();
  if (search) {
    return db.getAllAsync<Customer>(
      'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 100',
      [`%${search}%`, `%${search}%`]
    );
  }
  return db.getAllAsync<Customer>('SELECT * FROM customers ORDER BY name LIMIT 200');
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function upsertOrders(orders: Order[]): Promise<void> {
  const db = await getDatabase();
  for (const o of orders) {
    await db.runAsync(
      `INSERT INTO orders
         (id, order_number, order_type, status, payment_status, payment_method,
          restaurant_table_id, customer_id, customer_name, customer_phone,
          subtotal, tax_amount, discount_amount, total, received_amount,
          notes, is_synced, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
       ON CONFLICT(id) DO UPDATE SET
         order_number=excluded.order_number, status=excluded.status,
         payment_status=excluded.payment_status, payment_method=excluded.payment_method,
         subtotal=excluded.subtotal, tax_amount=excluded.tax_amount,
         discount_amount=excluded.discount_amount, total=excluded.total,
         received_amount=excluded.received_amount, is_synced=1,
         updated_at=excluded.updated_at`,
      [
        o.id, o.order_number, o.order_type, o.status, o.payment_status,
        o.payment_method ?? null, o.restaurant_table_id ?? null,
        o.customer_id ?? null, o.customer_name ?? null, o.customer_phone ?? null,
        o.subtotal, o.tax_amount, o.discount_amount, o.total,
        o.received_amount, o.notes ?? null, o.created_at ?? null, o.updated_at ?? null,
      ]
    );
    for (const item of o.items ?? []) {
      if (item.id) {
        await db.runAsync(
          `INSERT OR REPLACE INTO order_items
             (server_id, order_id, item_id, name, variation, addons_json,
              quantity, unit_price, total_price, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            item.id, o.id, item.item_id ?? null, item.name, item.variation ?? null,
            JSON.stringify(item.addons ?? []), item.quantity,
            item.unit_price, item.total_price, item.notes ?? null,
          ]
        );
      }
    }
  }
}

export async function createLocalOrder(
  order: Omit<Order, 'id' | 'order_number'> & { local_uuid: string }
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO orders
       (local_uuid, order_type, status, payment_status, payment_method,
        restaurant_table_id, customer_id, customer_name, customer_phone,
        subtotal, tax_amount, discount_amount, total, received_amount,
        notes, is_synced, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
    [
      order.local_uuid, order.order_type, order.status, order.payment_status,
      order.payment_method ?? null, order.restaurant_table_id ?? null,
      order.customer_id ?? null, order.customer_name ?? null, order.customer_phone ?? null,
      order.subtotal, order.tax_amount, order.discount_amount, order.total,
      order.received_amount, order.notes ?? null,
      order.created_at ?? null, order.updated_at ?? null,
    ]
  );
  const orderId = result.lastInsertRowId;
  for (const item of order.items ?? []) {
    await db.runAsync(
      `INSERT INTO order_items
         (order_id, item_id, name, variation, addons_json, quantity, unit_price, total_price, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        orderId, item.item_id ?? null, item.name, item.variation ?? null,
        JSON.stringify(item.addons ?? []), item.quantity,
        item.unit_price, item.total_price, item.notes ?? null,
      ]
    );
  }
  return orderId;
}

export async function getOrders(limit = 50): Promise<Order[]> {
  const db = await getDatabase();
  const orders = await db.getAllAsync<any>(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT ?', [limit]
  );
  const result: Order[] = [];
  for (const o of orders) {
    const items = await db.getAllAsync<any>('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    result.push({
      ...o,
      items: items.map((i: any) => ({ ...i, addons: JSON.parse(i.addons_json ?? '[]') })),
    });
  }
  return result;
}

export async function updateLocalOrderStatus(localId: number, status: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE orders SET status=?, updated_at=? WHERE id=?', [status, new Date().toISOString(), localId]);
}

// ── Sync queue ────────────────────────────────────────────────────────────────

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'retries'>): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO sync_queue (id, action, payload, retries, created_at) VALUES (?,?,?,0,?)',
    [item.id, item.action, item.payload, item.created_at]
  );
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<SyncQueueItem>('SELECT * FROM sync_queue ORDER BY created_at');
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sync_queue WHERE id=?', [id]);
}

export async function incrementSyncRetries(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE sync_queue SET retries=retries+1 WHERE id=?', [id]);
}
