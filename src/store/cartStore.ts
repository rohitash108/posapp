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
  setDiscount: (amount: number) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTaxAmount: (rate: number) => number;
  getTotal: (taxRate?: number) => number;
}

const emptyCart = (): Cart => ({ order_type: 'dine_in', items: [], discount_amount: 0 });

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
  setDiscount: (discount_amount) => set((s) => ({ cart: { ...s.cart, discount_amount } })),
  setNotes: (notes) => set((s) => ({ cart: { ...s.cart, notes } })),
  clearCart: () => set({ cart: emptyCart() }),
  getSubtotal: () => get().cart.items.reduce((sum, i) => sum + i.total_price, 0),
  getTaxAmount: (rate) => parseFloat(((get().getSubtotal() * rate) / 100).toFixed(2)),
  getTotal: (taxRate = 0) => Math.max(0, get().getSubtotal() + get().getTaxAmount(taxRate) - get().cart.discount_amount),
}));
