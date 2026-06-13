import { create } from 'zustand';
import uuid from 'react-native-uuid';
import type { Cart, CartItem, OrderType } from '../types';

interface CartState {
  cart: Cart;
  /**
   * Per-table cart slots — keyed by table_id.
   * When the user switches tables the active cart is saved here and
   * the destination table's saved cart (if any) is restored as the active cart.
   * Only INACTIVE tables live in this map; the currently active table is `cart`.
   */
  tableCartMap: Record<number, Cart>;

  addItem: (item: Omit<CartItem, 'uuid'>) => void;
  removeItem: (uuid: string) => void;
  updateQuantity: (uuid: string, quantity: number) => void;
  setOrderType: (type: OrderType) => void;
  /**
   * setTable — lightweight: just updates cart.table_id without any slot
   * save/restore. Use this ONLY to deselect a table (pass undefined) while
   * keeping the current cart items in place.
   */
  setTable: (tableId?: number) => void;
  /**
   * switchTable — full per-table slot logic (CSPos behaviour):
   *   1. If a table is currently selected, save the active cart into
   *      tableCartMap[oldTableId].
   *   2. If newTableId is in tableCartMap, restore that cart as the active cart.
   *   3. Otherwise start a fresh cart for the new table.
   * Pass undefined to switch to "no table" (saves old slot, starts fresh cart
   * with no table_id — useful for takeaway after being on a table).
   */
  switchTable: (newTableId?: number) => void;
  setCustomer: (id?: number, name?: string, phone?: string) => void;
  setWaiter: (id?: number, name?: string) => void;
  setDiscount: (amount: number) => void;
  setCoupon: (code?: string, discount?: number) => void;
  setNotes: (notes: string) => void;
  setKotPrinted: (v: boolean) => void;
  setDraft: (v: boolean) => void;
  /**
   * clearCart — resets the active cart to empty AND removes the current
   * table's slot from tableCartMap (order placed = table is now free).
   */
  clearCart: () => void;
  getSubtotal: () => number;
  getTaxAmount: (rate: number) => number;
  getTotal: (taxRate?: number) => number;
}

const emptyCart = (): Cart => ({
  order_type: 'dine_in',
  items: [],
  discount_amount: 0,
  kot_printed: false,
  is_draft: false,
});

export const useCartStore = create<CartState>((set, get) => ({
  cart: emptyCart(),
  tableCartMap: {},

  addItem: (item) =>
    set((s) => ({
      cart: { ...s.cart, items: [...s.cart.items, { ...item, uuid: uuid.v4() as string }] },
    })),

  removeItem: (itemUuid) =>
    set((s) => ({
      cart: { ...s.cart, items: s.cart.items.filter((i) => i.uuid !== itemUuid) },
    })),

  updateQuantity: (itemUuid, quantity) =>
    set((s) => ({
      cart: {
        ...s.cart,
        items:
          quantity <= 0
            ? s.cart.items.filter((i) => i.uuid !== itemUuid)
            : s.cart.items.map((i) =>
                i.uuid === itemUuid
                  ? { ...i, quantity, total_price: i.unit_price * quantity }
                  : i
              ),
      },
    })),

  setOrderType: (order_type) => set((s) => ({ cart: { ...s.cart, order_type } })),

  // Lightweight deselect — just removes table_id without touching slots
  setTable: (table_id) => set((s) => ({ cart: { ...s.cart, table_id } })),

  switchTable: (newTableId) => {
    const { cart, tableCartMap } = get();
    const oldTableId = cart.table_id;

    // No-op if already on this table
    if (newTableId === oldTableId) return;

    const newMap = { ...tableCartMap };

    // ── 1. Save current cart into the old table's slot ──────────────────────
    if (oldTableId != null) {
      newMap[oldTableId] = { ...cart };
    }

    // ── 2. Load the new table's cart or start fresh ──────────────────────────
    let newCart: Cart;
    if (newTableId != null && newMap[newTableId]) {
      // Restore saved cart for this table (keep its table_id correct)
      newCart = { ...newMap[newTableId], table_id: newTableId };
      // Remove from map — it's now the active cart
      delete newMap[newTableId];
    } else {
      // Fresh cart for this table (or no-table for takeaway)
      newCart = { ...emptyCart(), table_id: newTableId };
    }

    set({ cart: newCart, tableCartMap: newMap });
  },

  setCustomer: (customer_id, customer_name, customer_phone) =>
    set((s) => ({ cart: { ...s.cart, customer_id, customer_name, customer_phone } })),

  setWaiter: (waiter_id, waiter_name) =>
    set((s) => ({ cart: { ...s.cart, waiter_id, waiter_name } })),

  setDiscount: (discount_amount) => set((s) => ({ cart: { ...s.cart, discount_amount } })),

  setCoupon: (coupon_code, coupon_discount) =>
    set((s) => ({ cart: { ...s.cart, coupon_code, coupon_discount: coupon_discount ?? 0 } })),

  setNotes: (notes) => set((s) => ({ cart: { ...s.cart, notes } })),

  setKotPrinted: (kot_printed) => set((s) => ({ cart: { ...s.cart, kot_printed } })),

  setDraft: (is_draft) => set((s) => ({ cart: { ...s.cart, is_draft } })),

  clearCart: () => {
    const { cart, tableCartMap } = get();
    // Remove the just-placed table's slot so it starts fresh next time
    const newMap = { ...tableCartMap };
    if (cart.table_id != null) {
      delete newMap[cart.table_id];
    }
    set({ cart: emptyCart(), tableCartMap: newMap });
  },

  getSubtotal: () => get().cart.items.reduce((sum, i) => sum + i.total_price, 0),

  getTaxAmount: (rate) =>
    parseFloat(((get().getSubtotal() * rate) / 100).toFixed(2)),

  getTotal: (taxRate = 0) => {
    const sub  = get().getSubtotal();
    const tax  = get().getTaxAmount(taxRate);
    const disc = (get().cart.discount_amount ?? 0) + (get().cart.coupon_discount ?? 0);
    return Math.max(0, sub + tax - disc);
  },
}));
