import client from './client';

export const inventoryApi = {
  list: (params?: { page?: number; per_page?: number; search?: string }) =>
    client.get('/inventory', { params }),
  show: (id: number) => client.get(`/inventory/${id}`),
  create: (payload: any) => client.post('/inventory', payload),
  update: (id: number, payload: any) => client.put(`/inventory/${id}`, payload),
  addMovement: (id: number, payload: { type: 'in' | 'out' | 'adjustment'; quantity: number; notes?: string }) =>
    client.post(`/inventory/${id}/movements`, payload),
  movements: (id: number) => client.get(`/inventory/${id}/movements`),
};
