import client from './client';

export const paymentsApi = {
  list: (params?: {
    page?: number;
    per_page?: number;
    payment_method?: string;
    payment_status?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
  }) => client.get('/payments', { params }),

  summary: (params?: { date_from?: string; date_to?: string }) =>
    client.get('/payments/summary', { params }),
};
