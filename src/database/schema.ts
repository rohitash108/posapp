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
      id         INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      floor      TEXT,
      capacity   INTEGER,
      status     TEXT    DEFAULT 'available',
      updated_at TEXT
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
}
