import client from './client';

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
};
