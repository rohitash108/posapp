import client from './client';

export const reportsApi = {
  summary: (params?: { date_from?: string; date_to?: string }) =>
    client.get('/reports/summary', { params }),
  sales: (params?: { date_from?: string; date_to?: string; group_by?: 'day' | 'week' | 'month' }) =>
    client.get('/reports/sales', { params }),
  topItems: (params?: { date_from?: string; date_to?: string }) =>
    client.get('/reports/top-items', { params }),
  paymentMethods: (params?: { date_from?: string; date_to?: string }) =>
    client.get('/reports/payment-methods', { params }),
  expenses: (params?: { date_from?: string; date_to?: string }) =>
    client.get('/reports/expenses', { params }),
};
