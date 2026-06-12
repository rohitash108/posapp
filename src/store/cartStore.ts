import { create } from 'zustand';
import uuid from 'react-native-uuid';
import type { Cart, CartItem, OrderType } from '../types';

interface CartState {
  cart: Cart;
  addItem: (item: Omit<CartItem, 'uuid'>) => void;
  removeItem: (uuid: string) => void;
  updateQuantity: (uuid: string, quantity: number) => void;
  setOrderType: (type: OrderType) => void;
  setTable: (tableId?: number) => void;
  setCustomer: (id?: number, name?: string, phone?: string) => void;
  setWaiter: (id?: number, name?: string) => void;
  setDiscount: (amount: number) => void;
  setCoupon: (code?: string, discount?: number) => void;
  setNotes: (notes: string) => void;
  setKotPrinted: (v: boolean) => void;
  setDraft: (v: boolean) => void;
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
  addItem: (item) =>
    set((s) => ({ cart: { ...s.cart, items: [...s.cart.items, { ...item, uuid: uuid.v4() as string }] } })),
  removeItem: (itemUuid) =>
    set((s) => ({ cart: { ...s.cart, items: s.cart.items.filter((i) => i.uuid !== itemUuid) } })),
  updateQuantity: (itemUuid, quantity) =>
    set((s) => ({
      cart: {
        ...s.cart,
        items: quantity <= 0
          ? s.cart.items.filter((i) => i.uuid !== itemUuid)
          : s.cart.items.map((i) =>
              i.uuid === itemUuid ? { ...i, quantity, total_price: i.unit_price * quantity } : i
            ),
      },
    })),
  setOrderType: (order_type) => set((s) => ({ cart: { ...s.cart, order_type } })),
  setTable: (table_id) => set((s) => ({ cart: { ...s.cart, table_id } })),
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
  clearCart: () => set({ cart: emptyCart() }),
  getSubtotal: () => get().cart.items.reduce((sum, i) => sum + i.total_price, 0),
  getTaxAmount: (rate) => parseFloat(((get().getSubtotal() * rate) / 100).toFixed(2)),
  getTotal: (taxRate = 0) => {
    const sub = get().getSubtotal();
    const tax = get().getTaxAmount(taxRate);
    const disc = (get().cart.discount_amount ?? 0) + (get().cart.coupon_discount ?? 0);
    return Math.max(0, sub + tax - disc);
  },
}));
