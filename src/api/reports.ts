import client from './client';

export const reportsApi = {
  sales: (params?: { date_from?: string; date_to?: string; group_by?: 'day' | 'week' | 'month' }) =>
    client.get('/reports/sales', { params }),
  expenses: (params?: { date_from?: string; date_to?: string }) =>
    client.get('/reports/expenses', { params }),
  topItems: (params?: { date_from?: string; date_to?: string; limit?: number }) =>
    client.get('/reports/top-items', { params }),
  paymentMethods: (params?: { date_from?: string; date_to?: string }) =>
    client.get('/reports/payment-methods', { params }),
  summary: (params?: { date?: string }) =>
    client.get('/reports/summary', { params }),
};
