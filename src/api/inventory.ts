import client from './client';

export const inventoryApi = {
  /** GET /inventory — full dashboard: ingredients, low_stock, expiring, recent_movements */
  dashboard: () => client.get('/inventory'),

  /** POST /inventory/stock-in */
  stockIn: (payload: { ingredient_id: number; quantity: number; notes?: string; expiry_date?: string; unit_cost?: number }) =>
    client.post('/inventory/stock-in', payload),

  /** POST /inventory/waste */
  waste: (payload: { ingredient_id: number; quantity: number; notes?: string }) =>
    client.post('/inventory/waste', payload),

  /** POST /inventory/adjustment */
  adjustment: (payload: { ingredient_id: number; quantity_change: number; notes?: string }) =>
    client.post('/inventory/adjustment', payload),
};
