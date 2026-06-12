import client from './client';

export const categoriesApi = {
  list: () => client.get('/categories'),
  show: (id: number) => client.get(`/categories/${id}`),
  create: (payload: any) => client.post('/categories', payload),
  update: (id: number, payload: any) => client.put(`/categories/${id}`, payload),
  delete: (id: number) => client.delete(`/categories/${id}`),
  toggle: (id: number) => client.patch(`/categories/${id}/toggle`),
};
