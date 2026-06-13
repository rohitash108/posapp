import client from './client';

export interface CouponPayload {
  code: string;
  discount_type: 'percentage' | 'fixed';
  /** maps to DB column discount_amount */
  discount_amount: number;
  valid_from?: string;
  valid_to?: string;
  max_uses?: number;
  is_active?: boolean;
}

export const couponsApi = {
  list: () => client.get('/coupons'),
  show: (id: number) => client.get(`/coupons/${id}`),
  create: (payload: CouponPayload) => client.post('/coupons', payload),
  update: (id: number, payload: Partial<CouponPayload>) => client.put(`/coupons/${id}`, payload),
  delete: (id: number) => client.delete(`/coupons/${id}`),
  toggle: (id: number) => client.patch(`/coupons/${id}/toggle`),
  /** Validate a coupon code against an order total for POS checkout */
  validate: (code: string, order_total: number) =>
    client.post('/coupons/validate', { code, order_total }),
};
