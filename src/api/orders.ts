import client from './client';
import type { Order, PaymentMethod } from '../types';
import { applyOfflineCreatedAt } from '@/utils/offlineOrderTimes';

/** CSPos parity: aggregator + completed orders count as paid in the app UI. */
export function normalizeOrder(o: Order): Order {
  const withTime = applyOfflineCreatedAt(o);
  if ((withTime.source === 'zomato' || withTime.source === 'swiggy') && withTime.payment_status !== 'paid') {
    return { ...withTime, payment_status: 'paid' };
  }
  if (withTime.status === 'completed' && withTime.payment_status !== 'paid') {
    return { ...withTime, payment_status: 'paid' };
  }
  return withTime;
}

export const ordersApi = {
  list: (params?: {
    page?: number; status?: string; source?: string;
    per_page?: number; from?: string; to?: string;
    customer_id?: number | string;
    payment_method?: string;
    payment_status?: string;
    sort?: 'asc' | 'desc';
  }) => client.get('/orders', { params }),
  show:          (id: number) => client.get(`/orders/${id}`),
  create:        (payload: any) => client.post('/orders', payload),
  updateStatus:  (id: number, status: string) =>
    client.patch(`/orders/${id}/status`, { status }),
  updatePayment: (id: number, payload: any) =>
    client.patch(`/orders/${id}/payment`, payload),
  /** Mark order completed and paid — matches CSPos web behaviour. */
  complete: async (id: number, paymentMethod?: PaymentMethod | string) => {
    await client.patch(`/orders/${id}/status`, { status: 'completed' });
    await client.patch(`/orders/${id}/payment`, {
      payment_status: 'paid',
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    });
  },
};
