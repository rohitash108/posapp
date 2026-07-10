import client from './client';

export const stockApi = {
  /** GET /stock/alerts — menu + supply dashboard alerts */
  alerts: () => client.get('/stock/alerts'),

  /** GET /stock — menu item stock dashboard */
  index: (params?: {
    category_id?: number;
    tracking?: 'all' | 'on' | 'off';
    stock_status?: 'all' | 'low' | 'out';
    q?: string;
    item_id?: number;
  }) => client.get('/stock', { params }),

  /** GET /stock/items/{id} */
  show: (itemId: number) => client.get(`/stock/items/${itemId}`),

  /** PUT /stock/items/{id} — stock-in (add) or set quantity + tracking */
  update: (itemId: number, payload: {
    mode: 'add' | 'set';
    quantity: number;
    track_stock?: boolean;
    low_stock_threshold?: number;
    notes?: string;
    reference?: string;
  }) => client.put(`/stock/items/${itemId}`, payload),

  /** POST /stock/items/{id}/adjust */
  adjust: (itemId: number, payload: { quantity_change: number; notes?: string }) =>
    client.post(`/stock/items/${itemId}/adjust`, payload),

  /** POST /stock/items/{id}/waste */
  waste: (itemId: number, payload: { quantity: number; notes?: string }) =>
    client.post(`/stock/items/${itemId}/waste`, payload),

  /** GET /stock/history — paginated menu stock audit trail */
  history: (params?: {
    item_id?: number;
    type?: string;
    page?: number;
  }) => client.get('/stock/history', { params }),
};
