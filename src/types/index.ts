export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  restaurant_id: number;
}

export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  currency: string;
  logo?: string;
  phone?: string;
  address?: string;
  gst_number?: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  image?: string;
  image_url?: string;
  color?: string;
  sort_order: number;
  is_active: boolean;
  items_count?: number;
  updated_at?: string;
}

export interface Addon {
  id: number;
  name: string;
  price: number;
}

export interface Variation {
  id: number;
  name: string;
  price: number;
}

export interface Item {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  image?: string;
  price: number;
  food_type?: 'veg' | 'non_veg' | 'egg';
  is_available: boolean;
  is_open_item: boolean;
  sort_order: number;
  tax_rate?: number;
  tax_name?: string;
  addons: Addon[];
  variations: Variation[];
  updated_at?: string;
}

export interface RestaurantTable {
  id: number;
  name: string;
  floor?: string;
  capacity?: number;
  status: 'available' | 'occupied' | 'reserved';
  updated_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  balance?: number;
  notes?: string;
  orders_count?: number;
  last_order_at?: string;
  updated_at?: string;
}

export interface Reservation {
  id: number;
  customer_name: string;
  customer_phone?: string;
  guest_count: number;
  restaurant_table_id?: number;
  table_name?: string;
  reserved_at: string;
  status: 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Expense {
  id: number;
  title: string;
  amount: number;
  category_id?: number;
  category_name?: string;
  expense_date: string;
  notes?: string;
  created_at?: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
}

export interface Tax {
  id: number;
  name: string;
  rate: number;
}

export type OrderSource = 'pos' | 'zomato' | 'swiggy' | 'qr';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'pending';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'other';

export interface OrderItem {
  id?: number;
  item_id?: number;
  item_name?: string;   // DB column name from API responses
  name?: string;        // used locally in cart/POS
  variation?: string;
  addons?: Addon[];
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
}

export interface Order {
  id: number;
  order_number: string;
  order_type: OrderType;
  source?: OrderSource;
  external_id?: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  restaurant_table_id?: number;
  table_name?: string;
  restaurant_table?: { id: number; name: string };
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  waiter_id?: number;
  waiter_name?: string;
  delivery_address?: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  received_amount: number;
  coupon_code?: string;
  coupon_discount?: number;
  notes?: string;
  kot_printed?: boolean;
  is_draft?: boolean;
  items: OrderItem[];
  created_at?: string;
  updated_at?: string;
}

export interface CartItem {
  uuid: string;
  item_id: number;
  name: string;
  variation?: string;
  variation_id?: number;
  addons: Addon[];
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
}

export interface Cart {
  table_id?: number;
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  waiter_id?: number;
  waiter_name?: string;
  order_type: OrderType;
  items: CartItem[];
  discount_amount: number;
  coupon_code?: string;
  coupon_discount?: number;
  notes?: string;
  kot_printed?: boolean;
  is_draft?: boolean;
}

export type SyncQueueAction = 'create_order' | 'update_status' | 'update_payment';

export interface SyncQueueItem {
  id: string;
  action: SyncQueueAction;
  payload: string;
  created_at: string;
  retries: number;
}

// Aggregator action codes (DynoAPIs / DAMS protocol)
export type AggregatorAction = 'accept' | 'reject' | 'ready';
export const AGGREGATOR_STATUS_CODES: Record<AggregatorAction, number> = {
  accept: 1,
  reject: 2,
  ready:  3,
};

export interface DashboardStats {
  today_sales: number;
  today_orders: number;
  pending_orders: number;
  preparing_orders: number;
  zomato_orders: number;
  swiggy_orders: number;
}

export interface StaffMember {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  is_active: boolean;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  order_id: number;
  order_number?: string;
  customer_name?: string;
  customer_phone?: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  items?: OrderItem[];
  notes?: string;
  created_at?: string;
}

export interface Payment {
  id: number;
  order_id?: number;
  order_number?: string;
  customer_name?: string;
  amount: number;
  payment_method?: PaymentMethod;
  method?: PaymentMethod;          // alias
  reference_number?: string;
  reference?: string;              // alias
  status?: 'completed' | 'pending' | 'failed' | 'refunded';
  notes?: string;
  created_at?: string;
}

export interface Ingredient {
  id: number;
  name: string;
  sku?: string;
  unit?: string;
  low_stock_threshold: number;
  reorder_point: number;
  on_hand: number;
}

export interface ExpiringBatch {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  quantity_remaining: number;
  expiry_date: string;
}

export interface StockMovement {
  id: number;
  type: string;
  quantity_change: number;
  notes?: string;
  created_at?: string;
  ingredient_id?: number;
  ingredient_name: string;
  ingredient_unit: string;
}

export interface InventoryData {
  ingredients: Ingredient[];
  low_stock: Ingredient[];
  expiring: ExpiringBatch[];
  recent_movements: StockMovement[];
}

// Legacy alias kept for any existing references
export type InventoryItem = Ingredient;

export interface MenuItem {
  id: number;
  category_id?: number;
  category_name?: string;
  is_master?: boolean;
  name: string;
  description?: string;
  image?: string;
  price: number;
  net_price?: number | null;
  food_type?: 'veg' | 'non_veg' | 'egg';
  is_available: boolean;
  is_open_item?: boolean;
  sort_order?: number;
  tax_rate?: number | null;
  tax_name?: string | null;
  variations?: Variation[];
  addons?: Addon[];
  updated_at?: string;
  /** @deprecated use food_type instead */
  is_veg?: boolean;
}

export interface Coupon {
  id: number;
  code: string;
  name?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount?: number;
  minimum_order?: number;   // alias
  max_uses?: number;
  usage_limit?: number;     // alias
  used_count?: number;
  usage_count?: number;     // alias
  is_active: boolean;
  expires_at?: string;
  created_at?: string;
}

export interface ExpenseReport {
  category: string;
  total: number;
  count: number;
}

export interface SalesReport {
  date: string;
  total_sales: number;
  total_orders: number;
  cash: number;
  card: number;
  upi: number;
}

// ── Support Tickets ────────────────────────────────────────────────────────────
export type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'general' | 'billing' | 'technical' | 'feature_request';

export interface TicketReply {
  id: number;
  ticket_id: number;
  message: string;
  user_name?: string;
  user_id?: number;
  is_staff?: boolean;         // true = support agent, false = restaurant admin
  created_at?: string;
}

export interface Ticket {
  id: number;
  ticket_number?: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category?: TicketCategory | string;
  assigned_to?: number;
  assignee_name?: string;
  reporter_name?: string;
  replies?: TicketReply[];
  replies_count?: number;
  created_at?: string;
  updated_at?: string;
}
