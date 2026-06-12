import client from './client';

export const couponsApi = {
  list: (params?: { page?: number; per_page?: number; is_active?: boolean }) =>
    client.get('/coupons', { params }),
  show: (id: number) => client.get(`/coupons/${id}`),
  create: (payload: any) => client.post('/coupons', payload),
  update: (id: number, payload: any) => client.put(`/coupons/${id}`, payload),
  delete: (id: number) => client.delete(`/coupons/${id}`),
  toggle: (id: number) => client.patch(`/coupons/${id}/toggle`),
  validate: (code: string, order_total: number) =>
    client.post('/coupons/validate', { code, order_total }),
};
