/**
 * POS Screen — Professional Restaurant Point of Sale
 * 3-column desktop layout: Category Rail | Item Grid | Order Panel
 * Features: discount, notes, customer/waiter picker, table selector,
 *           payment methods, variation modal, offline save, print receipt,
 *           KOT print, add custom item, draft/void, coupon, recent orders strip
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  TextInput, ScrollView, Modal, Alert, ActivityIndicator, Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import { getCategories, getItems, addToSyncQueue, createLocalOrder } from '@/database/repositories';
import {
  webGetItems, webSaveOrder, webAddSyncQueue, webHasData,
  webSaveCategories, webSaveItems, webGetCategories, webSaveTables,
} from '@/utils/webDb';
import { useCartStore } from '@/store/cartStore';
import { useAppStore } from '@/store/appStore';
import { ordersApi } from '@/api/orders';
import { couponsApi } from '@/api/coupons';
import client, { API_BASE_URL } from '@/api/client';
import type { Category, Item, Variation, RestaurantTable, Customer, StaffMember, Order } from '@/types';

const SERVER_URL = API_BASE_URL.replace('/api/mobile', '');

const FOOD_COLORS: Record<string, string> = {
  veg: '#16a34a', non_veg: '#dc2626', egg: '#d97706',
};
const FOOD_LABELS: Record<string, string> = {
  veg: 'V', non_veg: 'N', egg: 'E',
};

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash',   icon: 'cash-outline'     as const },
  { key: 'card', label: 'Card',   icon: 'card-outline'     as const },
  { key: 'upi',  label: 'UPI',    icon: 'qr-code-outline'  as const },
];
const ORDER_TYPES = [
  { key: 'dine_in',  label: 'Dine In',  icon: 'restaurant-outline'  as const },
  { key: 'takeaway', label: 'Takeaway', icon: 'bag-handle-outline'   as const },
  { key: 'delivery', label: 'Delivery', icon: 'bicycle-outline'      as const },
];

function itemImageUrl(img?: string) {
  if (!img) return null;
  if (img.startsWith('http')) return img;
  return `${SERVER_URL}/storage/${img}`;
}

function getDisplayPrice(item: Item): string {
  if (item.variations?.length) {
    const prices = item.variations.map(v => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `₹${min.toFixed(2)}` : `from ₹${min.toFixed(2)}`;
  }
  return `₹${(item.price || 0).toFixed(2)}`;
}

// ── KOT Print ─────────────────────────────────────────────────────────────────
function printKOT(items: any[], orderType: string, tableId?: number, tables?: RestaurantTable[], orderNum?: string, notes?: string) {
  if (Platform.OS !== 'web') return;
  const tableName = tables?.find(t => t.id === tableId)?.name ?? '';
  const rows = items.map(i =>
    `<tr><td style="font-size:16px;font-weight:bold;padding:4px 0">${i.name}${i.variation ? ` (${i.variation})` : ''}</td><td align="center" style="font-size:18px;font-weight:900;padding:4px 8px">${i.quantity}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>KOT</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;max-width:300px;margin:0 auto;padding:10px}
h2{text-align:center;font-size:18px;letter-spacing:3px;border:3px solid #000;padding:6px;margin-bottom:8px}
.info{font-size:11px;margin-bottom:8px;border-bottom:2px dashed #000;padding-bottom:6px}
table{width:100%;border-collapse:collapse}th{font-size:10px;text-transform:uppercase;padding:4px 0;border-bottom:2px solid #000}
.footer{text-align:center;font-size:10px;margin-top:10px;border-top:2px dashed #000;padding-top:6px}
@media print{body{max-width:100%}}</style></head><body>
<h2>KITCHEN ORDER</h2>
<div class="info">
  <b>Order:</b> #${orderNum ?? '—'}<br/>
  <b>Type:</b> ${orderType.replace('_',' ').toUpperCase()}${tableName ? ` · Table: ${tableName}` : ''}<br/>
  <b>Time:</b> ${new Date().toLocaleTimeString()}
  ${notes ? `<br/><b>Note:</b> ${notes}` : ''}
</div>
<table><thead><tr><th align="left">ITEM</th><th>QTY</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer">— KOT —</div>
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank', 'width=350,height=500');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Print receipt on web ───────────────────────────────────────────────────────
function printOrderReceipt(order: any, restaurant: any) {
  if (Platform.OS !== 'web') return;
  const items = (order.items ?? []).map((i: any) =>
    `<tr>
      <td>${i.name}${i.variation ? ` <em>(${i.variation})</em>` : ''}</td>
      <td align="center">${i.quantity}</td>
      <td align="right">₹${Number(i.unit_price).toFixed(2)}</td>
      <td align="right">₹${Number(i.total_price).toFixed(2)}</td>
    </tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;max-width:360px;margin:0 auto;padding:12px}
h2{text-align:center;font-size:16px;letter-spacing:2px;margin-bottom:2px}.sub{text-align:center;font-size:10px;color:#555;margin-bottom:10px;line-height:1.4}
hr{border:none;border-top:1px dashed #aaa;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;font-size:9px;text-transform:uppercase;color:#777;padding:3px 0;border-bottom:1px solid #ddd}
td{padding:4px 0;vertical-align:top}.total{font-size:15px;font-weight:bold}.footer{text-align:center;font-size:10px;color:#999;margin-top:10px}
@media print{body{max-width:100%}}</style></head><body>
<h2>${restaurant?.name ?? 'RESTAURANT'}</h2>
<div class="sub">${restaurant?.address ?? ''}${restaurant?.phone ? '<br>'+restaurant.phone : ''}</div>
<hr/><div style="font-size:11px"><b>#${order.order_number ?? '—'}</b> &nbsp;|&nbsp; ${(order.order_type ?? '').replace('_',' ').toUpperCase()}</div>
<div style="font-size:10px;color:#555;margin:3px 0">${order.customer_name ? `Customer: ${order.customer_name}` : 'Walk-in'}</div>
<hr/><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead><tbody>${items}</tbody></table><hr/>
<table><tr><td>Subtotal</td><td align="right">₹${Number(order.subtotal).toFixed(2)}</td></tr>
${order.tax_amount > 0 ? `<tr><td>Tax</td><td align="right">₹${Number(order.tax_amount).toFixed(2)}</td></tr>` : ''}
${order.discount_amount > 0 ? `<tr><td>Discount</td><td align="right" style="color:#16a34a">-₹${Number(order.discount_amount).toFixed(2)}</td></tr>` : ''}
<tr><td class="total"><b>TOTAL</b></td><td class="total" align="right"><b>₹${Number(order.total).toFixed(2)}</b></td></tr>
</table><hr/>
<div style="font-size:10px">Payment: ${order.payment_method?.toUpperCase() ?? '—'}</div>
<div class="footer">Thank you for visiting!</div>
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank', 'width=400,height=560');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function POSScreen() {
  const [categories, setCategories]       = useState<Category[]>([]);
  const [allItems, setAllItems]           = useState<Item[]>([]);
  const [tables, setTables]               = useState<RestaurantTable[]>([]);
  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [staff, setStaff]                 = useState<StaffMember[]>([]);
  const [recentOrders, setRecentOrders]   = useState<Order[]>([]);
  const [activeCatId, setActiveCatId]     = useState<number | null>(null);
  const [search, setSearch]               = useState('');
  const [foodFilter, setFoodFilter]       = useState<Record<string, boolean>>({ veg: true, non_veg: true, egg: true });
  const [variationItem, setVariationItem] = useState<Item | null>(null);
  const [showCart, setShowCart]           = useState(false);
  const [showCustPicker, setShowCustPicker] = useState(false);
  const [showWaiterPicker, setShowWaiterPicker] = useState(false);
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [placing, setPlacing]             = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [walkInName, setWalkInName]       = useState('');
  const [custSearch, setCustSearch]       = useState('');
  const [waiterSearch, setWaiterSearch]   = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [couponInput, setCouponInput]     = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [notesInput, setNotesInput]       = useState('');
  const [receivedInput, setReceivedInput] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty]   = useState('1');
  const [lastOrderNum, setLastOrderNum]   = useState<string | null>(null);
  const [lastOrderData, setLastOrderData] = useState<any>(null);

  const {
    cart, addItem, updateQuantity, clearCart, getSubtotal, getTotal,
    setOrderType, setTable, setCustomer, setWaiter, setDiscount, setNotes,
    setCoupon, setKotPrinted,
  } = useCartStore();
  const { isOnline, taxes, restaurant } = useAppStore();
  const taxRate = taxes[0]?.rate ?? 0;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const cols = width >= 1500 ? 5 : width >= 1200 ? 4 : width >= 900 ? 3 : 2;

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        const res = await client.get('/sync/pull');
        const cats: Category[]         = res.data.categories ?? [];
        const items: Item[]             = res.data.items ?? [];
        const tbls: RestaurantTable[]   = res.data.tables ?? [];
        webSaveCategories(cats).catch(console.warn);
        webSaveItems(items).catch(console.warn);
        webSaveTables(tbls).catch(console.warn);
        setCategories(cats);
        setAllItems(items);
        setTables(tbls);
        useAppStore.getState().setTaxes(res.data.taxes ?? []);
      } catch {
        const hasData = await webHasData();
        if (hasData) {
          const cats  = await webGetCategories();
          const items = await webGetItems();
          setCategories(cats);
          setAllItems(items);
        } else {
          Alert.alert('Offline', 'No cached menu data. Connect to internet to load the menu.');
        }
      }
    } else {
      const cats = await getCategories();
      setCategories(cats);
    }
    try {
      const res = await client.get('/customers');
      const data = res.data?.data ?? res.data ?? [];
      setCustomers(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    try {
      const res = await client.get('/staff');
      const data = res.data?.data ?? res.data ?? [];
      setStaff(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    try {
      const res = await ordersApi.list({ per_page: 10 });
      const data = res.data?.data ?? res.data ?? [];
      setRecentOrders(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch { /* offline */ }
  }, []);

  const loadItems = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const items = await getItems(activeCatId ?? undefined);
      setAllItems(items);
    }
  }, [activeCatId]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadItems(); }, [activeCatId]);

  // Sync discount/notes from inputs to cart store
  useEffect(() => {
    const d = parseFloat(discountInput) || 0;
    setDiscount(d);
  }, [discountInput]);
  useEffect(() => {
    setNotes(notesInput);
  }, [notesInput]);

  // ── Filtered items ─────────────────────────────────────────────────────────
  const displayItems = useMemo(() => {
    let items = Platform.OS === 'web'
      ? allItems.filter(i => activeCatId === null || i.category_id === activeCatId)
      : allItems;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    items = items.filter(i => foodFilter[i.food_type || 'veg'] !== false);
    return items;
  }, [allItems, activeCatId, search, foodFilter]);

  // ── Cart helpers ───────────────────────────────────────────────────────────
  function addToCart(item: Item, variation?: Variation) {
    const price   = variation ? variation.price : (item.price || 0);
    const varName = variation?.name;
    const existing = cart.items.find(i => i.item_id === item.id && i.variation === varName);
    if (existing) {
      updateQuantity(existing.uuid, existing.quantity + 1);
    } else {
      addItem({ item_id: item.id, name: item.name, variation: varName, addons: [], quantity: 1, unit_price: price, total_price: price });
    }
  }

  function handleAdd(item: Item) {
    if (item.variations?.length) setVariationItem(item);
    else addToCart(item);
  }

  function getCartQty(item: Item) {
    return cart.items.filter(c => c.item_id === item.id).reduce((s, c) => s + c.quantity, 0);
  }

  // ── Apply coupon ───────────────────────────────────────────────────────────
  async function handleApplyCoupon() {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    try {
      const res = await couponsApi.validate(couponInput.trim(), getSubtotal());
      const d = res.data;
      const disc = d.discount_amount ?? d.discount ?? 0;
      setCoupon(couponInput.trim(), disc);
      Alert.alert('Coupon Applied!', `Discount: ₹${disc.toFixed(2)}`);
    } catch (e: any) {
      Alert.alert('Invalid Coupon', e?.response?.data?.message ?? 'Coupon not valid or expired.');
      setCoupon(undefined, 0);
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    setCoupon(undefined, 0);
    setCouponInput('');
  }

  // ── Add custom item ────────────────────────────────────────────────────────
  function handleAddCustomItem() {
    const name  = customItemName.trim();
    const price = parseFloat(customItemPrice) || 0;
    const qty   = parseInt(customItemQty) || 1;
    if (!name) { Alert.alert('Name required'); return; }
    if (price <= 0) { Alert.alert('Enter a valid price'); return; }
    addItem({ item_id: 0, name, variation: undefined, addons: [], quantity: qty, unit_price: price, total_price: price * qty });
    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty('1');
    setShowCustomItem(false);
  }

  // ── KOT print ──────────────────────────────────────────────────────────────
  function handleKOTPrint() {
    if (cart.items.length === 0) { Alert.alert('Empty cart'); return; }
    printKOT(cart.items, cart.order_type, cart.table_id, tables, 'NEW', cart.notes);
    setKotPrinted(true);
  }

  // ── Place order ────────────────────────────────────────────────────────────
  async function handlePlaceOrder(asDraft = false) {
    if (cart.items.length === 0) {
      Alert.alert('Empty Cart', 'Add items before placing an order.');
      return;
    }
    setPlacing(true);
    try {
      const localUuid  = uuid.v4() as string;
      const subtotal   = getSubtotal();
      const taxAmount  = parseFloat(((subtotal * taxRate) / 100).toFixed(2));
      const discount   = (cart.discount_amount ?? 0) + (cart.coupon_discount ?? 0);
      const total      = getTotal(taxRate);
      const custName   = walkInName.trim() || cart.customer_name || 'Walk-in';
      const received   = parseFloat(receivedInput) || 0;

      const payload: any = {
        local_uuid:           localUuid,
        order_type:           cart.order_type,
        status:               asDraft ? 'draft' : 'pending',
        is_draft:             asDraft,
        payment_status:       received >= total ? 'paid' : 'unpaid',
        payment_method:       paymentMethod,
        restaurant_table_id:  cart.table_id ?? null,
        customer_id:          cart.customer_id ?? null,
        customer_name:        custName,
        customer_phone:       cart.customer_phone ?? null,
        waiter_id:            cart.waiter_id ?? null,
        waiter_name:          cart.waiter_name ?? null,
        coupon_code:          cart.coupon_code ?? null,
        coupon_discount:      cart.coupon_discount ?? 0,
        subtotal,
        tax_amount:           taxAmount,
        discount_amount:      discount,
        total,
        received_amount:      received,
        kot_printed:          cart.kot_printed ?? false,
        notes:                notesInput.trim() || null,
        items: cart.items.map(i => ({
          item_id:     i.item_id || null,
          name:        i.name,
          variation:   i.variation ?? null,
          quantity:    i.quantity,
          unit_price:  i.unit_price,
          total_price: i.total_price,
        })),
      };

      if (isOnline) {
        try {
          const res = await ordersApi.create(payload);
          const orderNum = res.data?.order_number ?? res.data?.data?.order_number ?? localUuid.slice(0, 8);
          setLastOrderNum(orderNum);
          setLastOrderData({ ...payload, order_number: orderNum });
          clearCart();
          setWalkInName('');
          setDiscountInput('');
          setCouponInput('');
          setNotesInput('');
          setReceivedInput('');
          setShowCart(false);
          // Refresh recent orders
          ordersApi.list({ per_page: 8 }).then(r => setRecentOrders(r.data?.data ?? r.data ?? [])).catch(() => {});
          return;
        } catch (apiErr: any) {
          const status  = apiErr?.response?.status;
          const message = apiErr?.response?.data?.message ?? apiErr?.response?.data?.error ?? (apiErr?.message || 'Network error');
          if (status) {
            Alert.alert(`Order Failed (${status})`, message);
            return;
          }
          Alert.alert('Network Issue', 'Could not reach server. Saving offline — will sync when online.', [{ text: 'OK' }]);
        }
      }

      // Offline save
      if (Platform.OS === 'web') {
        await webSaveOrder({ ...payload });
        await webAddSyncQueue({ id: localUuid, action: 'create_order', payload: JSON.stringify(payload), created_at: new Date().toISOString() });
      } else {
        await createLocalOrder({ ...payload, items: payload.items as any } as any);
        await addToSyncQueue({ id: localUuid, action: 'create_order', payload: JSON.stringify(payload), created_at: new Date().toISOString() });
      }
      setLastOrderNum(localUuid.slice(0, 8));
      setLastOrderData({ ...payload, order_number: localUuid.slice(0, 8) });
      clearCart();
      setWalkInName('');
      setDiscountInput('');
      setNotesInput('');
      setReceivedInput('');
      setShowCart(false);

    } catch (e: any) {
      Alert.alert('Error', e?.message || 'An unexpected error occurred.');
    } finally {
      setPlacing(false);
    }
  }

  function handleNewOrder() {
    setLastOrderNum(null);
    setLastOrderData(null);
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal  = getSubtotal();
  const taxAmount = parseFloat(((subtotal * taxRate) / 100).toFixed(2));
  const discount  = cart.discount_amount ?? 0;
  const total     = getTotal(taxRate);
  const received  = parseFloat(receivedInput) || 0;
  const change    = received > 0 ? Math.max(0, received - total) : 0;

  const filteredCustomers = customers.filter(c =>
    !custSearch
    || c.name.toLowerCase().includes(custSearch.toLowerCase())
    || (c.phone ?? '').includes(custSearch)
  );

  // ── Success screen after placing order ─────────────────────────────────────
  if (lastOrderNum && lastOrderData) {
    return (
      <View style={su.shell}>
        <View style={su.card}>
          <View style={su.iconCircle}>
            <Ionicons name="checkmark-circle" size={56} color="#16a34a" />
          </View>
          <Text style={su.title}>Order Placed!</Text>
          <Text style={su.orderNum}>#{lastOrderNum}</Text>
          <Text style={su.sub}>
            {lastOrderData.customer_name} · {(lastOrderData.order_type ?? '').replace('_', ' ').toUpperCase()}
          </Text>
          <View style={su.amountRow}>
            <Text style={su.amountLabel}>Total</Text>
            <Text style={su.amountVal}>₹{Number(lastOrderData.total).toFixed(2)}</Text>
          </View>
          {change > 0 && (
            <View style={[su.amountRow, { backgroundColor: '#f0fdf4' }]}>
              <Text style={[su.amountLabel, { color: '#16a34a' }]}>Change</Text>
              <Text style={[su.amountVal, { color: '#16a34a' }]}>₹{change.toFixed(2)}</Text>
            </View>
          )}
          <View style={su.actions}>
            {Platform.OS === 'web' && (
              <TouchableOpacity style={su.printBtn} onPress={() => printOrderReceipt(lastOrderData, restaurant)}>
                <Ionicons name="print-outline" size={18} color="#fff" />
                <Text style={su.printBtnText}>Print Receipt</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={su.newBtn} onPress={handleNewOrder}>
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={su.newBtnText}>New Order</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Cart panel content (reused in desktop sidebar and mobile modal) ─────────
  const cartPanel = (
    <View style={cp.wrap}>
      {/* Order type */}
      <View style={cp.orderTypes}>
        {ORDER_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[cp.typeBtn, cart.order_type === t.key && cp.typeBtnActive]}
            onPress={() => setOrderType(t.key as any)}
          >
            <Ionicons name={t.icon} size={13} color={cart.order_type === t.key ? '#fff' : '#6b7280'} />
            <Text style={[cp.typeBtnText, cart.order_type === t.key && cp.typeBtnTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Customer row */}
      <View style={cp.section}>
        <View style={cp.fieldRow}>
          <View style={cp.fieldInner}>
            <Ionicons name="person-outline" size={14} color="#9ca3af" />
            <TextInput
              style={cp.fieldInput}
              placeholder={cart.customer_name || 'Walk-in customer'}
              value={walkInName}
              onChangeText={setWalkInName}
              placeholderTextColor="#9ca3af"
            />
            {(walkInName || cart.customer_name) ? (
              <TouchableOpacity onPress={() => { setWalkInName(''); setCustomer(undefined, undefined, undefined); }}>
                <Ionicons name="close-circle" size={15} color="#9ca3af" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={cp.iconBtn} onPress={() => setShowCustPicker(true)}>
            <Ionicons name="people" size={16} color="#0D76E1" />
          </TouchableOpacity>
        </View>
        {cart.customer_name && !walkInName && (
          <Text style={cp.selectedText}>✓ {cart.customer_name}</Text>
        )}
      </View>

      {/* Waiter row */}
      {staff.length > 0 && (
        <View style={cp.section}>
          <TouchableOpacity style={cp.fieldRow} onPress={() => setShowWaiterPicker(true)}>
            <View style={[cp.fieldInner, { flex: 1 }]}>
              <Ionicons name="person-circle-outline" size={14} color="#9ca3af" />
              <Text style={[cp.fieldInput, { color: cart.waiter_name ? '#111827' : '#9ca3af' }]}>
                {cart.waiter_name || 'Select waiter (optional)'}
              </Text>
            </View>
            {cart.waiter_name && (
              <TouchableOpacity style={cp.iconBtn} onPress={() => setWaiter(undefined, undefined)}>
                <Ionicons name="close" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Table selector (dine_in) */}
      {cart.order_type === 'dine_in' && tables.length > 0 && (
        <View style={cp.section}>
          <Text style={cp.sectionLabel}>Table</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TouchableOpacity
              style={[cp.tableChip, !cart.table_id && cp.tableChipActive]}
              onPress={() => setTable(undefined)}
            >
              <Text style={[cp.tableChipText, !cart.table_id && cp.tableChipTextActive]}>—</Text>
            </TouchableOpacity>
            {tables.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[cp.tableChip, cart.table_id === t.id && cp.tableChipActive]}
                onPress={() => setTable(t.id)}
              >
                <Text style={[cp.tableChipText, cart.table_id === t.id && cp.tableChipTextActive]}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Cart items */}
      <View style={cp.colHeader}>
        <Text style={[cp.colText, { flex: 1 }]}>ITEM</Text>
        <Text style={[cp.colText, { width: 80, textAlign: 'center' }]}>QTY</Text>
        <Text style={[cp.colText, { width: 68, textAlign: 'right' }]}>TOTAL</Text>
      </View>
      <ScrollView style={cp.itemList} showsVerticalScrollIndicator={false}>
        {cart.items.length === 0 ? (
          <View style={cp.emptyCart}>
            <Ionicons name="cart-outline" size={32} color="#d1d5db" />
            <Text style={cp.emptyCartText}>Cart is empty</Text>
            <Text style={cp.emptyCartSub}>Tap items to add them</Text>
          </View>
        ) : cart.items.map(item => (
          <View key={item.uuid} style={cp.cartRow}>
            <View style={{ flex: 1, marginRight: 4 }}>
              <Text style={cp.cartName} numberOfLines={2}>{item.name}</Text>
              {item.variation && <Text style={cp.cartVar}>{item.variation}</Text>}
            </View>
            <View style={cp.qtyRow}>
              <TouchableOpacity style={cp.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity - 1)}>
                <Ionicons name="remove" size={12} color="#374151" />
              </TouchableOpacity>
              <Text style={cp.qtyNum}>{item.quantity}</Text>
              <TouchableOpacity style={cp.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity + 1)}>
                <Ionicons name="add" size={12} color="#374151" />
              </TouchableOpacity>
            </View>
            <Text style={cp.cartPrice}>₹{item.total_price.toFixed(2)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Discount + Notes */}
      {cart.items.length > 0 && (
        <View style={cp.extraFields}>
          <View style={cp.extraRow}>
            <View style={[cp.extraInput, { flex: 1, marginRight: 6 }]}>
              <Ionicons name="pricetag-outline" size={13} color="#9ca3af" />
              <TextInput
                style={cp.extraInputText}
                placeholder="Discount (₹)"
                value={discountInput}
                onChangeText={setDiscountInput}
                keyboardType="decimal-pad"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={[cp.extraInput, { flex: 1 }]}>
              <Ionicons name="cash-outline" size={13} color="#9ca3af" />
              <TextInput
                style={cp.extraInputText}
                placeholder="Received (₹)"
                value={receivedInput}
                onChangeText={setReceivedInput}
                keyboardType="decimal-pad"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          {/* Coupon row */}
          {cart.coupon_code ? (
            <View style={[cp.extraInput, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}>
              <Ionicons name="ticket-outline" size={13} color="#16a34a" />
              <Text style={[cp.extraInputText, { color: '#16a34a', fontWeight: '700' }]}>{cart.coupon_code} (-₹{(cart.coupon_discount ?? 0).toFixed(2)})</Text>
              <TouchableOpacity onPress={handleRemoveCoupon}>
                <Ionicons name="close-circle" size={15} color="#16a34a" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={cp.extraRow}>
              <View style={[cp.extraInput, { flex: 1 }]}>
                <Ionicons name="ticket-outline" size={13} color="#9ca3af" />
                <TextInput
                  style={cp.extraInputText}
                  placeholder="Coupon code"
                  value={couponInput}
                  onChangeText={setCouponInput}
                  autoCapitalize="characters"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <TouchableOpacity
                style={[cp.iconBtn, { backgroundColor: '#0D76E1', borderColor: '#0D76E1' }, couponLoading && { opacity: 0.5 }]}
                onPress={handleApplyCoupon}
                disabled={couponLoading || !couponInput.trim()}
              >
                {couponLoading ? <ActivityIndicator size={12} color="#fff" /> : <Ionicons name="checkmark" size={16} color="#fff" />}
              </TouchableOpacity>
            </View>
          )}
          <View style={cp.extraInput}>
            <Ionicons name="document-text-outline" size={13} color="#9ca3af" />
            <TextInput
              style={cp.extraInputText}
              placeholder="Order notes (optional)"
              value={notesInput}
              onChangeText={setNotesInput}
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>
      )}

      {/* Summary */}
      <View style={cp.summary}>
        <View style={cp.sumRow}>
          <Text style={cp.sumLabel}>Subtotal</Text>
          <Text style={cp.sumVal}>₹{subtotal.toFixed(2)}</Text>
        </View>
        {taxRate > 0 && (
          <View style={cp.sumRow}>
            <Text style={cp.sumLabel}>Tax ({taxRate}%)</Text>
            <Text style={cp.sumVal}>₹{taxAmount.toFixed(2)}</Text>
          </View>
        )}
        {discount > 0 && (
          <View style={cp.sumRow}>
            <Text style={[cp.sumLabel, { color: '#16a34a' }]}>Discount</Text>
            <Text style={[cp.sumVal, { color: '#16a34a' }]}>-₹{discount.toFixed(2)}</Text>
          </View>
        )}
        <View style={cp.totalRow}>
          <Text style={cp.totalLabel}>TOTAL</Text>
          <Text style={cp.totalVal}>₹{total.toFixed(2)}</Text>
        </View>
        {received > 0 && (
          <View style={[cp.sumRow, change >= 0 ? {} : { opacity: 0.5 }]}>
            <Text style={[cp.sumLabel, { color: '#16a34a' }]}>Change</Text>
            <Text style={[cp.sumVal, { color: '#16a34a' }]}>₹{change.toFixed(2)}</Text>
          </View>
        )}
      </View>

      {/* Payment method */}
      <View style={cp.payRow}>
        {PAYMENT_METHODS.map(pm => (
          <TouchableOpacity
            key={pm.key}
            style={[cp.payBtn, paymentMethod === pm.key && cp.payBtnActive]}
            onPress={() => setPaymentMethod(pm.key)}
          >
            <Ionicons name={pm.icon} size={14} color={paymentMethod === pm.key ? '#fff' : '#374151'} />
            <Text style={[cp.payText, paymentMethod === pm.key && cp.payTextActive]}>{pm.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Secondary action buttons */}
      <View style={cp.secondaryRow}>
        <TouchableOpacity
          style={[cp.secBtn, { borderColor: '#7c3aed' }, cartCount === 0 && { opacity: 0.4 }]}
          onPress={handleKOTPrint}
          disabled={cartCount === 0}
        >
          <Ionicons name="print-outline" size={14} color="#7c3aed" />
          <Text style={[cp.secBtnText, { color: '#7c3aed' }]}>KOT</Text>
          {cart.kot_printed && <View style={cp.kotDot} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[cp.secBtn, { borderColor: '#f59e0b' }, cartCount === 0 && { opacity: 0.4 }]}
          onPress={() => handlePlaceOrder(true)}
          disabled={placing || cartCount === 0}
        >
          <Ionicons name="save-outline" size={14} color="#f59e0b" />
          <Text style={[cp.secBtnText, { color: '#f59e0b' }]}>Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cp.secBtn, { borderColor: '#0D76E1' }]} onPress={() => setShowCustomItem(true)}>
          <Ionicons name="add-circle-outline" size={14} color="#0D76E1" />
          <Text style={[cp.secBtnText, { color: '#0D76E1' }]}>Custom</Text>
        </TouchableOpacity>
      </View>

      {/* Main action buttons */}
      <View style={cp.checkoutRow}>
        <TouchableOpacity
          style={[cp.placeBtn, (placing || cartCount === 0) && { opacity: 0.5 }]}
          onPress={() => handlePlaceOrder(false)}
          disabled={placing || cartCount === 0}
        >
          {placing
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={cp.placeBtnLabel}>{isOnline ? 'Place Order' : 'Save Offline'}</Text>
                  {cartCount > 0 && <Text style={cp.placeBtnTotal}>₹{total.toFixed(2)}</Text>}
                </View>
              </>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[cp.clearBtn, cartCount === 0 && { opacity: 0.4 }]}
          onPress={() => { clearCart(); setWalkInName(''); setDiscountInput(''); setCouponInput(''); setNotesInput(''); setReceivedInput(''); }}
          disabled={cartCount === 0}
        >
          <Ionicons name="trash-outline" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Item card renderer ─────────────────────────────────────────────────────
  function renderItemCard({ item }: { item: Item }) {
    const qty    = getCartQty(item);
    const imgUrl = itemImageUrl(item.image);
    const ft     = item.food_type;
    return (
      <TouchableOpacity
        style={[ic.card, qty > 0 && ic.cardActive, !item.is_available && ic.cardUnavail]}
        onPress={() => item.is_available !== false && handleAdd(item)}
        activeOpacity={0.82}
      >
        {qty > 0 && <View style={ic.badge}><Text style={ic.badgeText}>×{qty}</Text></View>}
        {ft && (
          <View style={[ic.foodDot, { backgroundColor: FOOD_COLORS[ft] }]}>
            <Text style={ic.foodDotLabel}>{FOOD_LABELS[ft]}</Text>
          </View>
        )}
        <View style={ic.imgWrap}>
          {imgUrl
            ? <Image source={{ uri: imgUrl }} style={ic.img} resizeMode="cover" />
            : <View style={ic.imgPlaceholder}><Ionicons name="restaurant-outline" size={20} color="#d1d5db" /></View>
          }
        </View>
        <Text style={ic.name} numberOfLines={2}>{item.name}</Text>
        <View style={ic.bottom}>
          <Text style={ic.price}>{getDisplayPrice(item)}</Text>
          {item.variations?.length ? <Text style={ic.varTag}>{item.variations.length} var</Text> : null}
        </View>
        {!item.is_available && (
          <View style={ic.unavailOverlay}><Text style={ic.unavailText}>Unavailable</Text></View>
        )}
      </TouchableOpacity>
    );
  }

  // ── Modals ─────────────────────────────────────────────────────────────────
  const variationModal = (
    <Modal visible={!!variationItem} transparent animationType="fade" onRequestClose={() => setVariationItem(null)}>
      <View style={vm.overlay}>
        <View style={vm.sheet}>
          <View style={vm.header}>
            <View style={{ flex: 1 }}>
              <Text style={vm.title}>{variationItem?.name}</Text>
              <Text style={vm.sub}>Select a variation</Text>
            </View>
            <TouchableOpacity onPress={() => setVariationItem(null)} style={vm.closeBtn}>
              <Ionicons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
            {variationItem?.variations.map(v => (
              <TouchableOpacity
                key={v.id}
                style={vm.row}
                onPress={() => { addToCart(variationItem!, v); setVariationItem(null); }}
              >
                <View style={vm.dot} />
                <Text style={vm.varName}>{v.name}</Text>
                <Text style={vm.varPrice}>₹{v.price.toFixed(2)}</Text>
                <Ionicons name="add-circle" size={22} color="#0D76E1" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const custPickerModal = (
    <Modal visible={showCustPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCustPicker(false)}>
      <View style={{ flex: 1, backgroundColor: '#f5f6f8' }}>
        <View style={cpm.header}>
          <Text style={cpm.title}>Select Customer</Text>
          <TouchableOpacity onPress={() => setShowCustPicker(false)}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        <View style={cpm.search}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            style={cpm.searchInput}
            placeholder="Search name or phone..."
            value={custSearch}
            onChangeText={setCustSearch}
            placeholderTextColor="#9ca3af"
            autoFocus
          />
        </View>
        <TouchableOpacity
          style={cpm.row}
          onPress={() => { setCustomer(undefined, undefined, undefined); setWalkInName(''); setShowCustPicker(false); setCustSearch(''); }}
        >
          <View style={[cpm.avatar, { backgroundColor: '#6b7280' }]}>
            <Ionicons name="person-outline" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cpm.name}>Walk-in Customer</Text>
            <Text style={cpm.phone}>No account</Text>
          </View>
        </TouchableOpacity>
        <ScrollView>
          {filteredCustomers.map(c => (
            <TouchableOpacity
              key={c.id}
              style={cpm.row}
              onPress={() => { setCustomer(c.id, c.name, c.phone); setWalkInName(''); setShowCustPicker(false); setCustSearch(''); }}
            >
              <View style={cpm.avatar}>
                <Text style={cpm.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={cpm.name}>{c.name}</Text>
                {c.phone && <Text style={cpm.phone}>{c.phone}</Text>}
              </View>
              {cart.customer_id === c.id && <Ionicons name="checkmark-circle" size={20} color="#10b981" />}
            </TouchableOpacity>
          ))}
          {filteredCustomers.length === 0 && custSearch.length > 0 && (
            <View style={{ padding: 30, alignItems: 'center', gap: 12 }}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>No customers found</Text>
              <TouchableOpacity style={cpm.useBtn} onPress={() => { setWalkInName(custSearch); setShowCustPicker(false); setCustSearch(''); }}>
                <Text style={cpm.useBtnText}>Use "{custSearch}" as walk-in name</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Waiter picker modal ────────────────────────────────────────────────────
  const filteredStaff = staff.filter(s =>
    !waiterSearch || s.name.toLowerCase().includes(waiterSearch.toLowerCase())
  );
  const waiterPickerModal = (
    <Modal visible={showWaiterPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowWaiterPicker(false)}>
      <View style={{ flex: 1, backgroundColor: '#f5f6f8' }}>
        <View style={cpm.header}>
          <Text style={cpm.title}>Select Waiter</Text>
          <TouchableOpacity onPress={() => setShowWaiterPicker(false)}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        <View style={cpm.search}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput style={cpm.searchInput} placeholder="Search staff..." value={waiterSearch} onChangeText={setWaiterSearch} placeholderTextColor="#9ca3af" autoFocus />
        </View>
        <TouchableOpacity style={cpm.row} onPress={() => { setWaiter(undefined, undefined); setShowWaiterPicker(false); }}>
          <View style={[cpm.avatar, { backgroundColor: '#6b7280' }]}><Ionicons name="person-outline" size={18} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={cpm.name}>No Waiter</Text>
            <Text style={cpm.phone}>Remove selection</Text>
          </View>
        </TouchableOpacity>
        <ScrollView>
          {filteredStaff.map(s => (
            <TouchableOpacity key={s.id} style={cpm.row} onPress={() => { setWaiter(s.id, s.name); setShowWaiterPicker(false); setWaiterSearch(''); }}>
              <View style={[cpm.avatar, { backgroundColor: '#7c3aed' }]}>
                <Text style={cpm.avatarText}>{s.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={cpm.name}>{s.name}</Text>
                <Text style={cpm.phone}>{s.role}</Text>
              </View>
              {cart.waiter_id === s.id && <Ionicons name="checkmark-circle" size={20} color="#7c3aed" />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Custom item modal ──────────────────────────────────────────────────────
  const customItemModal = (
    <Modal visible={showCustomItem} transparent animationType="fade" onRequestClose={() => setShowCustomItem(false)}>
      <View style={vm.overlay}>
        <View style={vm.sheet}>
          <View style={vm.header}>
            <View style={{ flex: 1 }}>
              <Text style={vm.title}>Add Custom Item</Text>
              <Text style={vm.sub}>Enter item details manually</Text>
            </View>
            <TouchableOpacity onPress={() => setShowCustomItem(false)} style={vm.closeBtn}>
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16, gap: 10 }}>
            <View style={[cp.extraInput, { borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' }]}>
              <Ionicons name="text-outline" size={14} color="#9ca3af" />
              <TextInput style={[cp.extraInputText, { flex: 1 }]} placeholder="Item name *" value={customItemName} onChangeText={setCustomItemName} placeholderTextColor="#9ca3af" autoFocus />
            </View>
            <View style={cp.extraRow}>
              <View style={[cp.extraInput, { flex: 1, marginRight: 8, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' }]}>
                <Ionicons name="cash-outline" size={14} color="#9ca3af" />
                <TextInput style={[cp.extraInputText, { flex: 1 }]} placeholder="Price (₹) *" value={customItemPrice} onChangeText={setCustomItemPrice} keyboardType="decimal-pad" placeholderTextColor="#9ca3af" />
              </View>
              <View style={[cp.extraInput, { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' }]}>
                <Ionicons name="layers-outline" size={14} color="#9ca3af" />
                <TextInput style={[cp.extraInputText, { flex: 1 }]} placeholder="Qty" value={customItemQty} onChangeText={setCustomItemQty} keyboardType="number-pad" placeholderTextColor="#9ca3af" />
              </View>
            </View>
            <TouchableOpacity style={[cp.placeBtn, { paddingVertical: 14 }]} onPress={handleAddCustomItem}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <View style={{ marginLeft: 8 }}>
                <Text style={cp.placeBtnLabel}>Add to Order</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ── Desktop (3-col) layout ─────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={sh.shell}>
        {variationModal}
        {custPickerModal}
        {waiterPickerModal}
        {customItemModal}

        {/* Column 1: Category rail */}
        <View style={sh.rail}>
          <View style={sh.railHeader}>
            <Text style={sh.railTitle}>Menu</Text>
            <Text style={sh.railCount}>{categories.length} cats</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[{ id: null as null, name: 'All Items', count: allItems.length },
              ...categories.map(c => ({
                id: c.id, name: c.name,
                count: allItems.filter(i => i.category_id === c.id).length,
              }))
            ].map(c => {
              const active = activeCatId === c.id;
              return (
                <TouchableOpacity
                  key={String(c.id ?? 'all')}
                  style={[sh.railItem, active && sh.railItemActive]}
                  onPress={() => setActiveCatId(c.id)}
                  activeOpacity={0.75}
                >
                  {active && <View style={sh.railActiveBar} />}
                  <View style={[sh.railIcon, active && sh.railIconActive]}>
                    <Ionicons name={c.id === null ? 'grid-outline' : 'pricetag-outline'} size={13} color={active ? '#0D76E1' : '#9ca3af'} />
                  </View>
                  <Text style={[sh.railLabel, active && sh.railLabelActive]} numberOfLines={1}>{c.name}</Text>
                  <View style={[sh.railBadge, active && sh.railBadgeActive]}>
                    <Text style={[sh.railBadgeText, active && sh.railBadgeTextActive]}>{c.count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Column 2: Item grid */}
        <View style={sh.grid}>
          {/* Recent orders strip */}
          {recentOrders.length > 0 && (
            <View style={sh.recentStrip}>
              <Text style={sh.recentLabel}>Recent Orders</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {recentOrders.map(o => {
                  const scfg: Record<string, string> = { pending: '#f59e0b', confirmed: '#3b82f6', preparing: '#7c3aed', ready: '#0891b2', completed: '#16a34a', cancelled: '#dc2626' };
                  const clr = scfg[o.status] ?? '#6b7280';
                  return (
                    <View key={o.id} style={[sh.recentCard, { borderTopColor: clr }]}>
                      <Text style={sh.recentNum}>#{o.order_number}</Text>
                      <Text style={sh.recentCust} numberOfLines={1}>{o.customer_name || 'Walk-in'}</Text>
                      <Text style={[sh.recentStatus, { color: clr }]}>{o.status}</Text>
                      <Text style={sh.recentAmt}>₹{Number(o.total).toFixed(0)}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {/* Toolbar */}
          <View style={sh.toolbar}>
            <View style={sh.searchBox}>
              <Ionicons name="search" size={15} color="#9ca3af" />
              <TextInput
                style={sh.searchInput}
                placeholder="Search items..."
                value={search}
                onChangeText={setSearch}
                placeholderTextColor="#9ca3af"
              />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={15} color="#9ca3af" /></TouchableOpacity> : null}
            </View>
            <View style={sh.foodFilters}>
              {(['veg', 'non_veg', 'egg'] as const).map(ft => (
                <TouchableOpacity
                  key={ft}
                  style={[sh.foodChip, foodFilter[ft] && sh.foodChipActive]}
                  onPress={() => setFoodFilter(p => ({ ...p, [ft]: !p[ft] }))}
                >
                  <View style={[sh.foodDot, { backgroundColor: FOOD_COLORS[ft] }]} />
                  <Text style={[sh.foodChipText, foodFilter[ft] && sh.foodChipTextActive]}>
                    {ft === 'veg' ? 'Veg' : ft === 'non_veg' ? 'Non-Veg' : 'Egg'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Text style={sh.itemCountText}>{displayItems.length} items</Text>

          <FlatList
            data={displayItems}
            keyExtractor={i => String(i.id)}
            numColumns={cols}
            key={`grid-${cols}`}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingBottom: 24 }}
            renderItem={renderItemCard}
            ListEmptyComponent={
              <View style={sh.emptyGrid}>
                <Ionicons name="restaurant-outline" size={40} color="#e5e7eb" />
                <Text style={sh.emptyGridText}>No items found</Text>
              </View>
            }
          />
        </View>

        {/* Column 3: Cart / Order panel */}
        <View style={sh.cartPanel}>
          <View style={sh.cartHeader}>
            <Ionicons name="receipt-outline" size={16} color="#C9A52A" />
            <Text style={sh.cartHeaderTitle}>Current Order</Text>
            {cartCount > 0 && (
              <View style={sh.cartBadge}>
                <Text style={sh.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </View>
          {cartPanel}
        </View>
      </View>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <View style={mb.shell}>
      {variationModal}
      {custPickerModal}
      {waiterPickerModal}
      {customItemModal}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={mb.catBar} contentContainerStyle={{ paddingHorizontal: 10, gap: 7 }}>
        {[{ id: null as null, name: 'All' }, ...categories.map(c => ({ id: c.id, name: c.name }))].map(c => (
          <TouchableOpacity
            key={String(c.id ?? 'all')}
            style={[mb.catChip, activeCatId === c.id && mb.catChipActive]}
            onPress={() => setActiveCatId(c.id)}
          >
            <Text style={[mb.catChipText, activeCatId === c.id && mb.catChipTextActive]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={mb.searchRow}>
        <Ionicons name="search" size={14} color="#9ca3af" />
        <TextInput style={mb.searchInput} placeholder="Search..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
      </View>

      <FlatList
        data={displayItems}
        keyExtractor={i => String(i.id)}
        numColumns={2}
        key="m2"
        columnWrapperStyle={{ gap: 8, paddingHorizontal: 10 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 10, paddingBottom: 100, paddingTop: 6 }}
        renderItem={renderItemCard}
      />

      {cartCount > 0 && (
        <TouchableOpacity style={mb.fab} onPress={() => setShowCart(true)}>
          <Ionicons name="cart" size={20} color="#fff" />
          <View style={mb.fabBadge}><Text style={mb.fabBadgeText}>{cartCount}</Text></View>
          <Text style={mb.fabTotal}>₹{total.toFixed(2)}</Text>
          <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      )}

      <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={sh.cartHeader}>
            <Ionicons name="receipt-outline" size={16} color="#C9A52A" />
            <Text style={sh.cartHeaderTitle}>Order Summary</Text>
            {cartCount > 0 && <View style={sh.cartBadge}><Text style={sh.cartBadgeText}>{cartCount}</Text></View>}
            <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => setShowCart(false)}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          {cartPanel}
        </View>
      </Modal>
    </View>
  );
}

// ── StyleSheets ────────────────────────────────────────────────────────────────

// Shell / overall layout
const sh = StyleSheet.create({
  shell:      { flex: 1, flexDirection: 'row', backgroundColor: '#f0f2f7' },

  rail:       { width: 170, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  railHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  railTitle:  { fontSize: 11, fontWeight: '800', color: '#374151', letterSpacing: 1, textTransform: 'uppercase' },
  railCount:  { fontSize: 10, color: '#9ca3af', fontWeight: '600' },
  railItem:   { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 10, marginHorizontal: 6, marginBottom: 1, borderRadius: 9, position: 'relative', overflow: 'hidden' },
  railItemActive: { backgroundColor: 'rgba(13,118,225,0.08)' },
  railActiveBar:  { position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, backgroundColor: '#0D76E1', borderRadius: 2 },
  railIcon:       { width: 26, height: 26, borderRadius: 7, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  railIconActive: { backgroundColor: 'rgba(13,118,225,0.12)' },
  railLabel:      { flex: 1, fontSize: 12.5, fontWeight: '500', color: '#374151' },
  railLabelActive:{ color: '#0D76E1', fontWeight: '700' },
  railBadge:      { backgroundColor: '#f3f4f6', borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  railBadgeActive:{ backgroundColor: 'rgba(13,118,225,0.12)' },
  railBadgeText:  { fontSize: 9.5, color: '#6b7280', fontWeight: '600' },
  railBadgeTextActive: { color: '#0D76E1' },

  grid:       { flex: 1, flexDirection: 'column' },
  toolbar:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' },
  searchBox:  { flex: 1, minWidth: 140, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput:{ flex: 1, fontSize: 13.5, color: '#111827' },
  foodFilters:{ flexDirection: 'row', gap: 5 },
  foodChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  foodChipActive: { backgroundColor: '#f0f4ff', borderColor: '#93c5fd' },
  foodDot:    { width: 7, height: 7, borderRadius: 4 },
  foodChipText: { fontSize: 11.5, fontWeight: '500', color: '#374151' },
  foodChipTextActive: { color: '#1d4ed8' },
  itemCountText: { fontSize: 11, color: '#9ca3af', fontWeight: '500', paddingHorizontal: 14, marginBottom: 2 },
  emptyGrid:  { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyGridText: { color: '#d1d5db', fontSize: 14 },

  cartPanel:  { width: 340, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#e5e7eb', flexDirection: 'column' },
  cartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#1A2B1A' },
  cartHeaderTitle: { fontSize: 13.5, fontWeight: '700', color: '#fff', flex: 1 },
  cartBadge:  { backgroundColor: '#C9A52A', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  cartBadgeText: { color: '#1A2B1A', fontSize: 11, fontWeight: '800' },

  recentStrip:  { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  recentLabel:  { fontSize: 9.5, fontWeight: '800', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  recentCard:   { backgroundColor: '#f8f9fb', borderRadius: 8, padding: 8, minWidth: 110, borderTopWidth: 3, borderWidth: 1, borderColor: '#e5e7eb' },
  recentNum:    { fontSize: 12, fontWeight: '800', color: '#111827', marginBottom: 2 },
  recentCust:   { fontSize: 10.5, color: '#6b7280', marginBottom: 2 },
  recentStatus: { fontSize: 9.5, fontWeight: '700', textTransform: 'capitalize', marginBottom: 2 },
  recentAmt:    { fontSize: 12, fontWeight: '800', color: '#C9A52A' },
});

// Item cards
const ic = StyleSheet.create({
  card:       { flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', padding: 8, overflow: 'hidden', position: 'relative' },
  cardActive: { borderColor: '#93c5fd', shadowColor: '#0D76E1', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  cardUnavail:{ opacity: 0.6 },
  badge:      { position: 'absolute', top: 7, left: 7, zIndex: 4, backgroundColor: '#0D76E1', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText:  { color: '#fff', fontSize: 10, fontWeight: '800' },
  foodDot:    { position: 'absolute', top: 9, right: 9, zIndex: 4, width: 16, height: 16, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  foodDotLabel: { color: '#fff', fontSize: 8, fontWeight: '800' },
  imgWrap:    { aspectRatio: 4 / 3, backgroundColor: '#f3f4f6', borderRadius: 7, marginBottom: 7, overflow: 'hidden' },
  img:        { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name:       { fontSize: 12.5, fontWeight: '600', color: '#111827', marginBottom: 5, lineHeight: 16 },
  bottom:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price:      { fontSize: 13, fontWeight: '800', color: '#0D76E1' },
  varTag:     { fontSize: 9.5, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  unavailOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  unavailText: { fontSize: 10, fontWeight: '700', color: '#dc2626' },
});

// Cart panel
const cp = StyleSheet.create({
  wrap:       { flex: 1, flexDirection: 'column' },

  orderTypes: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f8f9fb' },
  typeBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9 },
  typeBtnActive: { backgroundColor: '#0D76E1', borderRadius: 0 },
  typeBtnText:   { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  typeBtnTextActive: { color: '#fff', fontWeight: '700' },

  section:    { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sectionLabel: { fontSize: 10, color: '#6b7280', fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 },
  fieldRow:   { flexDirection: 'row', gap: 6, alignItems: 'center' },
  fieldInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#f5f6f8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#e5e7eb' },
  fieldInput: { flex: 1, fontSize: 13, color: '#111827' },
  iconBtn:    { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(13,118,225,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#93c5fd' },
  selectedText: { fontSize: 11, color: '#10b981', fontWeight: '600', marginTop: 4 },

  tableChip:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  tableChipActive: { backgroundColor: 'rgba(13,118,225,0.1)', borderColor: '#93c5fd' },
  tableChipText:   { fontSize: 11.5, color: '#374151', fontWeight: '500' },
  tableChipTextActive: { color: '#0D76E1', fontWeight: '700' },

  colHeader:  { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f8f9fb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  colText:    { fontSize: 9.5, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  itemList:   { flex: 1 },
  emptyCart:  { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyCartText: { fontSize: 13.5, fontWeight: '600', color: '#374151' },
  emptyCartSub:  { fontSize: 11.5, color: '#9ca3af' },

  cartRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 4 },
  cartName:   { fontSize: 12.5, fontWeight: '600', color: '#111827', lineHeight: 16 },
  cartVar:    { fontSize: 10.5, color: '#C9A52A', marginTop: 1 },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', width: 80, justifyContent: 'center', gap: 3 },
  qtyBtn:     { width: 24, height: 24, backgroundColor: '#f3f4f6', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  qtyNum:     { fontSize: 13, fontWeight: '700', color: '#111827', minWidth: 20, textAlign: 'center' },
  cartPrice:  { fontSize: 12.5, fontWeight: '700', color: '#111827', width: 68, textAlign: 'right' },

  extraFields:{ padding: 8, gap: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fafbfc' },
  extraRow:   { flexDirection: 'row', gap: 6 },
  extraInput: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: '#e5e7eb' },
  extraInputText: { flex: 1, fontSize: 12.5, color: '#111827' },

  summary:    { padding: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#f8f9fb', gap: 4 },
  sumRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  sumLabel:   { fontSize: 12.5, color: '#6b7280' },
  sumVal:     { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1.5, borderTopColor: '#1A2B1A', marginTop: 4 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: '#1A2B1A' },
  totalVal:   { fontSize: 17, fontWeight: '800', color: '#0D76E1' },

  payRow:     { flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  payBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  payBtnActive: { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' },
  payText:    { fontSize: 11.5, fontWeight: '600', color: '#374151' },
  payTextActive: { color: '#C9A52A', fontWeight: '700' },

  secondaryRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2 },
  secBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f8f9fb', borderWidth: 1.5, position: 'relative' },
  secBtnText:  { fontSize: 11, fontWeight: '700' },
  kotDot:      { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: '#7c3aed' },
  checkoutRow: { flexDirection: 'row', gap: 7, padding: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  placeBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: '#C9A52A', shadowColor: '#C9A52A', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  placeBtnLabel: { fontSize: 13, fontWeight: '800', color: '#fff' },
  placeBtnTotal: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  clearBtn:   { width: 44, height: 44, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
});

// Variation modal
const vm = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:    { backgroundColor: '#fff', borderRadius: 18, width: '100%', maxWidth: 380, maxHeight: '70%', overflow: 'hidden' },
  header:   { flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: '#1A2B1A', gap: 10 },
  title:    { fontSize: 16, fontWeight: '800', color: '#C9A52A' },
  sub:      { fontSize: 11.5, color: 'rgba(201,165,42,0.7)', marginTop: 2 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A52A' },
  varName:  { flex: 1, fontSize: 14.5, fontWeight: '600', color: '#111827' },
  varPrice: { fontSize: 15, fontWeight: '800', color: '#0D76E1', marginRight: 6 },
});

// Customer picker modal
const cpm = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title:      { fontSize: 17, fontWeight: '800', color: '#111827' },
  search:     { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput:{ flex: 1, fontSize: 15, color: '#111827' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  avatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D76E1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  name:       { fontSize: 15, fontWeight: '700', color: '#111827' },
  phone:      { fontSize: 12.5, color: '#6b7280', marginTop: 2 },
  useBtn:     { backgroundColor: '#0D76E1', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  useBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

// Mobile layout
const mb = StyleSheet.create({
  shell:      { flex: 1, backgroundColor: '#f0f2f7' },
  catBar:     { maxHeight: 46, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  catChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', alignSelf: 'center' },
  catChipActive: { backgroundColor: '#0D76E1', borderColor: '#0D76E1' },
  catChipText:   { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  catChipTextActive: { color: '#fff' },
  searchRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', marginHorizontal: 10, marginTop: 8, marginBottom: 2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput:{ flex: 1, fontSize: 13.5, color: '#111827' },
  fab:        { position: 'absolute', bottom: 12, left: 12, right: 12, backgroundColor: '#1A2B1A', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  fabBadge:   { backgroundColor: '#C9A52A', borderRadius: 999, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  fabBadgeText: { color: '#1A2B1A', fontSize: 11, fontWeight: '800' },
  fabTotal:   { color: '#C9A52A', fontWeight: '800', fontSize: 15 },
});

// Order placed success screen
const su = StyleSheet.create({
  shell:      { flex: 1, backgroundColor: '#f0f2f7', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:       { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', width: '100%', maxWidth: 420, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  iconCircle: { marginBottom: 16 },
  title:      { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 6 },
  orderNum:   { fontSize: 32, fontWeight: '800', color: '#0D76E1', marginBottom: 6 },
  sub:        { fontSize: 14, color: '#6b7280', marginBottom: 20, textAlign: 'center' },
  amountRow:  { flexDirection: 'row', justifyContent: 'space-between', width: '100%', backgroundColor: '#f8f9fb', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  amountLabel:{ fontSize: 14, fontWeight: '600', color: '#374151' },
  amountVal:  { fontSize: 20, fontWeight: '800', color: '#111827' },
  actions:    { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  printBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#1A2B1A', borderRadius: 12, paddingVertical: 13 },
  printBtnText: { color: '#C9A52A', fontWeight: '800', fontSize: 14 },
  newBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#C9A52A', borderRadius: 12, paddingVertical: 13 },
  newBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
