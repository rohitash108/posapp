import client from './client';

export const invoicesApi = {
  list: (params?: {
    page?: number;
    per_page?: number;
    search?: string;
    payment_status?: string;
    date_from?: string;
    date_to?: string;
  }) => client.get('/invoices', { params }),

  show: (id: number) => client.get(`/invoices/${id}`),

  print: (id: number) => client.get(`/invoices/${id}/print`),

  updatePaymentStatus: (id: number, payment_status: string, payment_method?: string) =>
    client.patch(`/invoices/${id}/payment-status`, { payment_status, payment_method }),

  markAsPaid: (id: number, payment_method: string) =>
    client.patch(`/invoices/${id}/mark-paid`, { payment_method }),

  delete: (id: number) => client.delete(`/invoices/${id}`),
};
