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
  payment_qr?: string;
}

export interface Category {
  id: number;
  name: string;
  image?: string;
  sort_order: number;
  is_active: boolean;
  items_count?: number;
  created_at?: string;
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
  table_number?: number | null;
  slug?: string;
  floor?: string;
  capacity?: number;
  status: 'available' | 'occupied' | 'reserved';
  has_active_order?: boolean;
  qr_url?: string;
  qr_image_url?: string;
  updated_at?: string;
}

export interface Customer {
  id: number | null;       // null for order-derived customers (no record in customers table)
  is_registered: boolean;  // true = in customers table; false = from orders only
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  date_of_birth?: string;
  gender?: 'Male' | 'Female' | 'Other';
  status?: 'active' | 'disabled';
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
  tax_amount?: number;
  total?: number;
  payment_method?: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'other';
  category_id?: number;
  category_name?: string;
  vendor_name?: string;
  vendor_contact?: string;
  receipt_number?: string;
  is_recurring?: boolean;
  expense_date: string;
  notes?: string;
  created_at?: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  color?: string;
  icon?: string;
}

export interface Tax {
  id: number;
  name: string;
  rate: number;
  type: 'inclusive' | 'exclusive';
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
  food_type?: 'veg' | 'non_veg' | 'egg';
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
  rider_name?: string;
  rider_phone?: string;
  rider_status?: string;
  delivery_partner?: string;
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
  food_type?: 'veg' | 'non_veg' | 'egg';
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
  table_name?: string;
  waiter_name?: string;
  order_type?: OrderType;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  coupon_code?: string;
  coupon_discount?: number;
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
  master_price?: number | null;
  price_override?: number | null;
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
  discount_type: 'percentage' | 'fixed';
  /** canonical DB column */
  discount_amount: number;
  /** alias — same value as discount_amount, returned by API for compatibility */
  discount_value: number;
  /** coupon becomes active from this date (nullable) */
  valid_from?: string;
  /** coupon expires after this date (nullable) */
  valid_to?: string;
  /** alias for valid_to */
  expires_at?: string;
  is_active: boolean;
  /** null = unlimited */
  max_uses?: number;
  /** alias for max_uses */
  usage_limit?: number;
  /** canonical DB column */
  times_used: number;
  /** alias for times_used */
  used_count?: number;
  /** alias for times_used */
  usage_count?: number;
  /** computed by API: is_active && not expired && within valid_from && under max_uses */
  is_valid?: boolean;
  is_expired?: boolean;
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
