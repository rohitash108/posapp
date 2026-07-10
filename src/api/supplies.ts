import client from './client';

export const suppliesApi = {
  /** GET /supplies */
  index: (params?: {
    category?: string;
    stock_status?: 'all' | 'low' | 'out';
    q?: string;
  }) => client.get('/supplies', { params }),

  /** POST /supplies */
  create: (payload: {
    name: string;
    sku_code?: string;
    category: string;
    unit: string;
    track_stock?: boolean;
    low_stock_threshold?: number;
    is_active?: boolean;
    notes?: string;
    initial_quantity?: number;
  }) => client.post('/supplies', payload),

  /** GET /supplies/{id} */
  show: (supplyId: number) => client.get(`/supplies/${supplyId}`),

  /** PUT /supplies/{id} */
  update: (supplyId: number, payload: {
    name: string;
    sku_code?: string;
    category: string;
    unit: string;
    track_stock?: boolean;
    low_stock_threshold?: number;
    is_active?: boolean;
    notes?: string;
    stock_mode?: 'add' | 'set';
    quantity?: number;
    stock_notes?: string;
    reference?: string;
  }) => client.put(`/supplies/${supplyId}`, payload),

  /** POST /supplies/{id}/adjust */
  adjust: (supplyId: number, payload: { quantity_change: number; notes?: string }) =>
    client.post(`/supplies/${supplyId}/adjust`, payload),

  /** POST /supplies/{id}/waste */
  waste: (supplyId: number, payload: { quantity: number; notes?: string }) =>
    client.post(`/supplies/${supplyId}/waste`, payload),

  /** GET /supplies/rules/list */
  rules: () => client.get('/supplies/rules/list'),

  /** POST /supplies/rules */
  createRule: (payload: {
    inventory_sku_id: number;
    menu_item_id?: number;
    order_type?: string;
    quantity_per_unit: number;
    notes?: string;
    is_active?: boolean;
  }) => client.post('/supplies/rules', payload),

  /** PUT /supplies/rules/{id} */
  updateRule: (ruleId: number, payload: {
    inventory_sku_id: number;
    menu_item_id?: number;
    order_type?: string;
    quantity_per_unit: number;
    notes?: string;
    is_active?: boolean;
  }) => client.put(`/supplies/rules/${ruleId}`, payload),

  /** DELETE /supplies/rules/{id} */
  deleteRule: (ruleId: number) => client.delete(`/supplies/rules/${ruleId}`),

  /** GET /supplies/history — paginated supply movement audit trail */
  history: (params?: {
    inventory_sku_id?: number;
    type?: string;
    page?: number;
  }) => client.get('/supplies/history', { params }),
};
