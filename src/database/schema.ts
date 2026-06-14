import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('cspos.db');
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id         INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      image      TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active  INTEGER DEFAULT 1,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id              INTEGER PRIMARY KEY,
      category_id     INTEGER,
      name            TEXT    NOT NULL,
      description     TEXT,
      image           TEXT,
      price           REAL    NOT NULL DEFAULT 0,
      food_type       TEXT,
      is_available    INTEGER DEFAULT 1,
      is_open_item    INTEGER DEFAULT 0,
      sort_order      INTEGER DEFAULT 0,
      tax_rate        REAL,
      tax_name        TEXT,
      addons_json     TEXT    DEFAULT '[]',
      variations_json TEXT    DEFAULT '[]',
      updated_at      TEXT,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id               INTEGER PRIMARY KEY,
      name             TEXT    NOT NULL,
      table_number     INTEGER,
      slug             TEXT,
      floor            TEXT,
      capacity         INTEGER,
      status           TEXT    DEFAULT 'available',
      has_active_order INTEGER DEFAULT 0,
      qr_url           TEXT,
      qr_image_url     TEXT,
      updated_at       TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id         INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      phone      TEXT,
      email      TEXT,
      address    TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id                  INTEGER PRIMARY KEY,
      local_uuid          TEXT    UNIQUE,
      order_number        TEXT,
      order_type          TEXT    NOT NULL DEFAULT 'dine_in',
      status              TEXT    NOT NULL DEFAULT 'pending',
      payment_status      TEXT    NOT NULL DEFAULT 'unpaid',
      payment_method      TEXT,
      restaurant_table_id INTEGER,
      customer_id         INTEGER,
      customer_name       TEXT,
      customer_phone      TEXT,
      waiter_id           INTEGER,
      waiter_name         TEXT,
      source              TEXT    DEFAULT 'pos',
      external_id         TEXT,
      coupon_code         TEXT,
      coupon_discount     REAL    DEFAULT 0,
      kot_printed         INTEGER DEFAULT 0,
      is_draft            INTEGER DEFAULT 0,
      delivery_address    TEXT,
      delivery_partner    TEXT,
      rider_name          TEXT,
      rider_phone         TEXT,
      subtotal            REAL    DEFAULT 0,
      tax_amount          REAL    DEFAULT 0,
      discount_amount     REAL    DEFAULT 0,
      total               REAL    DEFAULT 0,
      received_amount     REAL    DEFAULT 0,
      notes               TEXT,
      is_synced           INTEGER DEFAULT 0,
      created_at          TEXT,
      updated_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id    INTEGER NOT NULL,
      server_id   INTEGER,
      item_id     INTEGER,
      name        TEXT    NOT NULL,
      variation   TEXT,
      addons_json TEXT    DEFAULT '[]',
      quantity    INTEGER NOT NULL DEFAULT 1,
      unit_price  REAL    NOT NULL DEFAULT 0,
      total_price REAL    NOT NULL DEFAULT 0,
      notes       TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id         TEXT    PRIMARY KEY,
      action     TEXT    NOT NULL,
      payload    TEXT    NOT NULL,
      retries    INTEGER DEFAULT 0,
      created_at TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_category   ON items(category_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_synced    ON orders(is_synced);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);

  // Migrate existing orders table — add columns introduced after initial schema
  const orderInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(orders)');
  const orderCols = new Set(orderInfo.map(c => c.name));
  if (!orderCols.has('waiter_id'))        await db.execAsync('ALTER TABLE orders ADD COLUMN waiter_id INTEGER');
  if (!orderCols.has('waiter_name'))      await db.execAsync('ALTER TABLE orders ADD COLUMN waiter_name TEXT');
  if (!orderCols.has('source'))           await db.execAsync("ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'pos'");
  if (!orderCols.has('external_id'))      await db.execAsync('ALTER TABLE orders ADD COLUMN external_id TEXT');
  if (!orderCols.has('coupon_code'))      await db.execAsync('ALTER TABLE orders ADD COLUMN coupon_code TEXT');
  if (!orderCols.has('coupon_discount'))  await db.execAsync('ALTER TABLE orders ADD COLUMN coupon_discount REAL DEFAULT 0');
  if (!orderCols.has('kot_printed'))      await db.execAsync('ALTER TABLE orders ADD COLUMN kot_printed INTEGER DEFAULT 0');
  if (!orderCols.has('is_draft'))         await db.execAsync('ALTER TABLE orders ADD COLUMN is_draft INTEGER DEFAULT 0');
  if (!orderCols.has('delivery_address')) await db.execAsync('ALTER TABLE orders ADD COLUMN delivery_address TEXT');
  if (!orderCols.has('delivery_partner')) await db.execAsync('ALTER TABLE orders ADD COLUMN delivery_partner TEXT');
  if (!orderCols.has('rider_name'))       await db.execAsync('ALTER TABLE orders ADD COLUMN rider_name TEXT');
  if (!orderCols.has('rider_phone'))      await db.execAsync('ALTER TABLE orders ADD COLUMN rider_phone TEXT');

  // Migrate existing restaurant_tables rows to include new columns
  const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(restaurant_tables)');
  const existingCols = new Set(tableInfo.map(c => c.name));
  if (!existingCols.has('table_number'))
    await db.execAsync('ALTER TABLE restaurant_tables ADD COLUMN table_number INTEGER');
  if (!existingCols.has('slug'))
    await db.execAsync('ALTER TABLE restaurant_tables ADD COLUMN slug TEXT');
  if (!existingCols.has('has_active_order'))
    await db.execAsync('ALTER TABLE restaurant_tables ADD COLUMN has_active_order INTEGER DEFAULT 0');
  if (!existingCols.has('qr_url'))
    await db.execAsync('ALTER TABLE restaurant_tables ADD COLUMN qr_url TEXT');
  if (!existingCols.has('qr_image_url'))
    await db.execAsync('ALTER TABLE restaurant_tables ADD COLUMN qr_image_url TEXT');
}
