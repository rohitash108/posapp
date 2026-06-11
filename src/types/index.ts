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
  image?: string;
  sort_order: number;
  is_active: boolean;
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
  updated_at?: string;
}

export interface Tax {
  id: number;
  name: string;
  rate: number;
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'pending';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'other';

export interface OrderItem {
  id?: number;
  item_id?: number;
  name: string;
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
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  restaurant_table_id?: number;
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  received_amount: number;
  notes?: string;
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
  order_type: OrderType;
  items: CartItem[];
  discount_amount: number;
  notes?: string;
}

export type SyncQueueAction = 'create_order' | 'update_status' | 'update_payment';

export interface SyncQueueItem {
  id: string;
  action: SyncQueueAction;
  payload: string;
  created_at: string;
  retries: number;
}
