import client from './client';

export const invoicesApi = {
  list: (params?: { page?: number; per_page?: number; search?: string; payment_status?: string; date_from?: string; date_to?: string }) =>
    client.get('/invoices', { params }),
  show: (id: number) => client.get(`/invoices/${id}`),
  print: (id: number) => client.get(`/invoices/${id}/print`),
};
