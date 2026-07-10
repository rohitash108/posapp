import client from './client';

export const inventoryApi = {
  /** GET /inventory — full dashboard: ingredients, low_stock, expiring, recent_movements */
  dashboard: () => client.get('/inventory'),

  /** POST /inventory/ingredients */
  createIngredient: (payload: {
    name: string;
    sku?: string;
    unit: string;
    low_stock_threshold?: number;
    reorder_point?: number;
    track_expiry?: boolean;
    notes?: string;
  }) => client.post('/inventory/ingredients', payload),

  /** PUT /inventory/ingredients/{id} */
  updateIngredient: (id: number, payload: {
    name: string;
    sku?: string;
    unit: string;
    low_stock_threshold?: number;
    reorder_point?: number;
    track_expiry?: boolean;
    is_active?: boolean;
    notes?: string;
  }) => client.put(`/inventory/ingredients/${id}`, payload),

  /** POST /inventory/stock-in */
  stockIn: (payload: { ingredient_id: number; quantity: number; notes?: string; expiry_date?: string; unit_cost?: number; reference?: string }) =>
    client.post('/inventory/stock-in', payload),

  /** POST /inventory/waste */
  waste: (payload: { ingredient_id: number; quantity: number; notes?: string }) =>
    client.post('/inventory/waste', payload),

  /** POST /inventory/adjustment */
  adjustment: (payload: { ingredient_id: number; quantity_change: number; notes?: string }) =>
    client.post('/inventory/adjustment', payload),
};
