import client from './client';

export const ordersApi = {
  list: (page = 1) => client.get('/orders', { params: { page } }),
  show: (id: number) => client.get(`/orders/${id}`),
  create: (payload: any) => client.post('/orders', payload),
  updateStatus: (id: number, status: string) =>
    client.patch(`/orders/${id}/status`, { status }),
  updatePayment: (id: number, payload: any) =>
    client.patch(`/orders/${id}/payment`, payload),
};
