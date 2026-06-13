import client from './client';

export const itemsApi = {
  list:   (params?: { category_id?: number; page?: number; per_page?: number; search?: string }) =>
    client.get('/items', { params }),
  show:   (id: number) => client.get(`/items/${id}`),
  create: (payload: any) => client.post('/items', payload),
  update: (id: number, payload: any) => client.put(`/items/${id}`, payload),
  delete: (id: number) => client.delete(`/items/${id}`),
  updateAvailability: (id: number, is_available: boolean) =>
    client.patch(`/items/${id}/availability`, { is_available }),
};
