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
import { router } from 'expo-router';
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
function printKOT(items: any[], orderType: string, tableId?: number, tables?: RestaurantTable[], orderNum?: string, notes?: string, restaurantName?: string) {
  if (Platform.OS !== 'web') return;
  const tableName = tables?.find(t => t.id === tableId)?.name ?? '';
  const rows = items.map(i =>
    `<div class="item"><span class="nm">${i.name || i.item_name || ''}${i.variation ? ` (${i.variation})` : ''}</span><span class="qty">x${i.quantity}</span></div>`
  ).join('');
  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const typeLabel = (orderType || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>KOT</title>
<style>
@page{size:auto;margin:3mm 2mm}
html{-webkit-text-size-adjust:100%}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%}
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;line-height:1.3;color:#000;background:#fff;padding:0 2mm 70px;max-width:320px;margin:0 auto;print-color-adjust:exact;-webkit-print-color-adjust:exact}
@media print{body{padding:0 1mm 0;max-width:100%}.no-print{display:none!important}.item{page-break-inside:avoid;break-inside:avoid}}
.c{text-align:center}.b{font-weight:800}.sm{font-size:9px}
.hr{border:none;border-top:1px dashed #000;margin:4px 0}
.hrd{border:none;border-top:2px solid #000;margin:4px 0}
.row{display:flex;justify-content:space-between;gap:4px;margin:2px 0}
.shop-name{font-size:12px;font-weight:800;margin-bottom:2px}
.kot-heading{font-size:22px;font-weight:900;letter-spacing:4px;text-transform:uppercase;border:3px solid #000;padding:3px 12px;margin:4px auto;display:inline-block}
.item{display:flex;justify-content:space-between;gap:6px;margin:3px 0;font-size:12px;font-weight:700}
.item .nm{flex:1;min-width:0;word-break:break-word}
.item .qty{flex-shrink:0;font-size:13px;font-weight:900;min-width:28px;text-align:right}
.print-actions{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:rgba(255,255,255,.97);border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:center;z-index:10}
.print-actions button{flex:1;max-width:260px;padding:10px 14px;font-size:15px;font-weight:600;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer}
.print-actions .btn-close{flex:0;background:#f3f4f6;color:#111}
</style></head><body>
<div class="c">
  <div class="shop-name">${restaurantName || 'Restaurant'}</div>
  <div><span class="kot-heading">KOT</span></div>
</div>
<div class="hrd"></div>
<div class="row"><span>Date &amp; Time</span><span>${dateStr}</span></div>
${tableName ? `<div class="row"><span>Table No.</span><span class="b">${tableName}</span></div>` : orderType === 'dine_in' ? `<div class="row"><span>Table No.</span><span class="b">—</span></div>` : ''}
${orderNum ? `<div class="row"><span>Order #</span><span class="b">${orderNum}</span></div>` : ''}
<div class="row"><span>Type</span><span class="b">${typeLabel}</span></div>
<div class="hrd"></div>
<div class="row sm b"><span>Item</span><span>Qty</span></div>
<div class="hr"></div>
${rows}
${notes ? `<div class="hr"></div><div style="font-size:10px;margin:3px 0"><span class="b">Note:</span> <span style="font-weight:400;font-style:italic">${notes}</span></div>` : ''}
<div class="hrd"></div>
<div class="c sm" style="margin-top:3px">Total Items: ${totalQty}</div>
<div class="print-actions no-print">
  <button type="button" class="btn-close" onclick="window.close()">Close</button>
  <button type="button" onclick="window.print()">Print KOT</button>
</div>
<script>(function(){if(window.self===window.top){if(document.readyState==='complete'){setTimeout(function(){window.print()},400)}else{window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})}}})();</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=380,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Print receipt on web ───────────────────────────────────────────────────────
function printOrderReceipt(order: any, restaurant: any, taxRate = 0) {
  if (Platform.OS !== 'web') return;
  const logoUrl = typeof window !== 'undefined' ? window.location.origin + '/global-tea-cafe-logo.png' : '';
  const currency = restaurant?.currency || '₹';
  const taxRateN = Number(taxRate) || 0;
  const cgstRate = taxRateN / 2;
  const sgstRate = taxRateN / 2;
  const totalTax = Number(order.tax_amount || 0);
  const cgstAmt  = (totalTax / 2).toFixed(2);
  const sgstAmt  = (totalTax / 2).toFixed(2);
  const subtotal = Number(order.subtotal || 0);
  const total    = Number(order.total || 0);
  const discAmt  = Number(order.discount_amount || 0);
  const tableLabel = order.table_name || (order.restaurant_table_id ? `Table ${order.restaurant_table_id}` : '');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const typeLabel = (order.order_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  const itemRows = (order.items ?? []).map((i: any) => {
    const lineTotal = Number(i.total_price || (Number(i.unit_price) * Number(i.quantity)) || 0);
    return `<div class="item"><span class="nm">${i.name || i.item_name || ''} &times;${i.quantity}${i.variation ? ` <em>(${i.variation})</em>` : ''}</span><span class="pr">${currency}${lineTotal.toFixed(2)}</span></div>`;
  }).join('');
  const receivedAmt = Number(order.received_amount || 0);
  const changeAmt   = receivedAmt > total ? (receivedAmt - total) : 0;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Receipt – ${restaurant?.name ?? 'Restaurant'}</title>
<style>
@page{size:auto;margin:3mm 2mm}
html{-webkit-text-size-adjust:100%}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%}
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;line-height:1.25;color:#000;background:#fff;padding:0 2mm 70px;max-width:320px;margin:0 auto;print-color-adjust:exact;-webkit-print-color-adjust:exact}
@media print{body{padding:0 1mm 0;max-width:100%;font-size:10px}.no-print{display:none!important}}
.c{text-align:center}.b{font-weight:700}.sm{font-size:9px}
.hr{border:none;border-top:1px dashed #000;margin:3px 0}
.hrd{border:none;border-top:2px solid #000;margin:3px 0}
.row{display:flex;justify-content:space-between;gap:4px;margin:1px 0}
.row span:last-child{flex-shrink:0}
.logo img{width:14mm;height:14mm;object-fit:contain;display:block;margin:0 auto 1mm}
.shop-name{font-size:13px;font-weight:800;margin-bottom:1px}
.shop-info{font-size:9px;color:#000;line-height:1.3}
.item{display:flex;justify-content:space-between;gap:4px;margin:1px 0}
.item .nm{flex:1;min-width:0;word-break:break-word}
.item .pr{flex-shrink:0}
.tot-row{display:flex;justify-content:space-between;gap:4px;margin:1px 0}
.grand{font-size:12px;font-weight:800}
.print-actions{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:rgba(255,255,255,.97);border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:center;z-index:10}
.print-actions button{flex:1;max-width:260px;padding:10px 14px;font-size:15px;font-weight:600;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer}
.print-actions .btn-close{flex:0;background:#f3f4f6;color:#111}
</style></head><body>
<div class="c">
  <div class="logo"><img src="${logoUrl}" alt="${restaurant?.name ?? ''}" onerror="this.style.display='none'"></div>
  <div class="shop-name">${restaurant?.name ?? 'Restaurant'}</div>
  ${restaurant?.address ? `<div class="shop-info">${restaurant.address}</div>` : ''}
  ${restaurant?.phone ? `<div class="shop-info">Ph: ${restaurant.phone}</div>` : ''}
  ${restaurant?.gst_number ? `<div class="shop-info">GSTIN: ${restaurant.gst_number}</div>` : ''}
</div>
<div class="hrd"></div>
<div class="row"><span>Date</span><span>${dateStr}</span></div>
${tableLabel ? `<div class="row"><span>Table</span><span class="b">${tableLabel}</span></div>` : ''}
<div class="row"><span>Type</span><span>${typeLabel}</span></div>
${order.order_number ? `<div class="row"><span>Order #</span><span class="b">${order.order_number}</span></div>` : ''}
${order.customer_name && order.customer_name !== 'Walk-in' ? `<div class="row"><span>Customer</span><span>${order.customer_name}</span></div>` : ''}
<div class="hr"></div>
<div class="row sm b"><span>Item</span><span>Amt</span></div>
<div class="hr"></div>
${itemRows}
<div class="hr"></div>
<div class="tot-row"><span>Sub Total</span><span>${currency}${subtotal.toFixed(2)}</span></div>
${taxRateN > 0 ? `<div class="tot-row"><span>CGST ${cgstRate.toFixed(1)}%</span><span>${currency}${cgstAmt}</span></div><div class="tot-row"><span>SGST ${sgstRate.toFixed(1)}%</span><span>${currency}${sgstAmt}</span></div>` : totalTax > 0 ? `<div class="tot-row"><span>Tax</span><span>${currency}${totalTax.toFixed(2)}</span></div>` : ''}
${discAmt > 0 ? `<div class="tot-row"><span>Discount</span><span>-${currency}${discAmt.toFixed(2)}</span></div>` : ''}
<div class="hrd"></div>
<div class="tot-row grand"><span>TOTAL</span><span>${currency}${total.toFixed(2)}</span></div>
<div class="hrd"></div>
${order.payment_method ? `<div class="row"><span>Payment</span><span class="b">${(order.payment_method || '').toUpperCase()}</span></div>` : ''}
${receivedAmt > 0 ? `<div class="row"><span>Received</span><span>${currency}${receivedAmt.toFixed(2)}</span></div>${changeAmt > 0 ? `<div class="row"><span>Change</span><span>${currency}${changeAmt.toFixed(2)}</span></div>` : ''}` : ''}
<div class="c sm" style="margin-top:4px">Thank you, visit again!<br>Powered by IT Softwar | softwar.in</div>
<div class="print-actions no-print">
  <button type="button" class="btn-close" onclick="window.history.length>1?history.back():window.close()">Close</button>
  <button type="button" id="receipt-print-btn">Print</button>
</div>
<script>(function(){var btn=document.getElementById('receipt-print-btn');function doPrint(){try{window.print()}catch(e){}}if(btn)btn.addEventListener('click',doPrint);function afterReady(){setTimeout(doPrint,400)}if(document.readyState==='complete'){afterReady()}else{window.addEventListener('load',afterReady)}})();</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=400,height=620');
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
  const [imgErrors, setImgErrors]         = useState<Set<number>>(new Set());
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
  const [lastOrderId, setLastOrderId]     = useState<number | null>(null);
  const [customPctInput, setCustomPctInput] = useState('');
  const [quickPct, setQuickPct]           = useState<number | null>(null);

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

  // Auto-refresh recent orders every 30s
  useEffect(() => {
    loadData();
    const t = setInterval(() => {
      ordersApi.list({ per_page: 8 }).then(r => {
        const d = r.data?.data ?? r.data ?? [];
        setRecentOrders(Array.isArray(d) ? d.slice(0, 8) : []);
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);
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

  function handleQuickDiscount(pct: number) {
    const disc = parseFloat(((getSubtotal() * pct) / 100).toFixed(2));
    setDiscountInput(String(disc));
    setDiscount(disc);
    setQuickPct(pct);
    setCustomPctInput('');
  }

  function handleCustomPctApply() {
    const pct = parseFloat(customPctInput);
    if (isNaN(pct) || pct <= 0) return;
    const disc = parseFloat(((getSubtotal() * pct) / 100).toFixed(2));
    setDiscountInput(String(disc));
    setDiscount(disc);
    setQuickPct(null);
  }

  function handleDiscountClear() {
    setDiscountInput('');
    setCustomPctInput('');
    setQuickPct(null);
    setDiscount(0);
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
    printKOT(cart.items, cart.order_type, cart.table_id, tables, 'NEW', cart.notes, restaurant?.name);
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
          item_name:   i.name,
          name:        i.name,
          variation:   i.variation ?? null,
          quantity:    i.quantity,
          unit_price:  i.unit_price,
          total_price: i.total_price,
        })),
      };

      if (isOnline) {
        try {
          console.log('[POS] Placing order online...', { total, items: payload.items.length });
          const res = await ordersApi.create(payload);
          console.log('[POS] Order API response:', JSON.stringify(res.data));
          const orderNum   = res.data?.order_number ?? res.data?.data?.order_number ?? localUuid.slice(0, 8);
          const orderId    = res.data?.id ?? res.data?.data?.id ?? null;
          const tableName  = tables.find(t => t.id === cart.table_id)?.name ?? null;
          setLastOrderNum(orderNum);
          setLastOrderId(orderId);
          setLastOrderData({ ...payload, order_number: orderNum, table_name: tableName });
          clearCart();
          setWalkInName('');
          setDiscountInput('');
          setCustomPctInput('');
          setQuickPct(null);
          setCouponInput('');
          setNotesInput('');
          setReceivedInput('');
          setShowCart(false);
          // Immediately add new order to recent strip (optimistic)
          const newOrderPreview: any = {
            id: Date.now(),
            order_number: orderNum,
            customer_name: cart.customer_name || walkInName || null,
            status: 'pending',
            total,
          };
          setRecentOrders(prev => [newOrderPreview, ...prev].slice(0, 8));
          // Then refresh from API for accurate data
          setTimeout(() => {
            ordersApi.list({ per_page: 8 }).then(r => {
              const d = r.data?.data ?? r.data ?? [];
              setRecentOrders(Array.isArray(d) ? d.slice(0, 8) : []);
            }).catch(() => {});
          }, 1500);
          return;
        } catch (apiErr: any) {
          const status  = apiErr?.response?.status;
          const message = apiErr?.response?.data?.message ?? apiErr?.response?.data?.error ?? (apiErr?.message || 'Network error');
          console.error('[POS] Order API error:', status, message, apiErr?.response?.data);
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
      const tableNameOffline = tables.find(t => t.id === cart.table_id)?.name ?? null;
      setLastOrderNum(localUuid.slice(0, 8));
      setLastOrderData({ ...payload, order_number: localUuid.slice(0, 8), table_name: tableNameOffline });
      clearCart();
      setWalkInName('');
      setDiscountInput('');
      setCustomPctInput('');
      setQuickPct(null);
      setCouponInput('');
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
    setLastOrderId(null);
  }

  async function handleCompleteOrder() {
    if (lastOrderId) {
      try { await ordersApi.updateStatus(lastOrderId, 'completed'); } catch { /* ignore */ }
    }
    handleNewOrder();
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal  = getSubtotal();
  const taxAmount = parseFloat(((subtotal * taxRate) / 100).toFixed(2));
  const discount  = (cart.discount_amount ?? 0) + (cart.coupon_discount ?? 0);
  const total     = getTotal(taxRate);
  const received  = parseFloat(receivedInput) || 0;
  const change    = received > 0 ? Math.max(0, received - total) : 0;

  const filteredCustomers = customers.filter(c =>
    !custSearch
    || c.name.toLowerCase().includes(custSearch.toLowerCase())
    || (c.phone ?? '').includes(custSearch)
  );

  // ── "Order Placed!" modal — matches csPos style ────────────────────────────
  const successModal = (
    <Modal visible={!!(lastOrderNum && lastOrderData)} transparent animationType="fade" onRequestClose={handleNewOrder}>
      <View style={su.overlay}>
        <View style={su.card}>
          {/* Title row */}
          <View style={su.titleRow}>
            <Ionicons name="checkmark-circle" size={28} color="#16a34a" />
            <Text style={su.title}>Order Placed!</Text>
          </View>
          {/* Order number */}
          <Text style={su.orderNum}>Order #{lastOrderNum}</Text>
          {/* Hint text */}
          <Text style={su.hint}>
            Print KOT for kitchen, Print Bill for customer, or mark the order complete.
          </Text>
          {/* Change due */}
          {change > 0 && (
            <View style={su.changePill}>
              <Text style={su.changeText}>Change to return: ₹{change.toFixed(2)}</Text>
            </View>
          )}
          {/* Action buttons */}
          <TouchableOpacity style={su.kotBtn}
            onPress={() => lastOrderData && printKOT(
              lastOrderData.items, lastOrderData.order_type,
              lastOrderData.restaurant_table_id, tables,
              lastOrderNum ?? undefined, lastOrderData.notes, restaurant?.name
            )}
          >
            <Ionicons name="print-outline" size={16} color="#1A2B1A" />
            <Text style={su.kotText}>Print KOT</Text>
            <Text style={su.kotSub}>(Kitchen)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={su.billBtn}
            onPress={() => lastOrderData && printOrderReceipt(lastOrderData, restaurant, taxRate)}
          >
            <Ionicons name="print" size={16} color="#fff" />
            <Text style={su.billText}>Print Bill</Text>
            <Text style={su.billSub}>(Customer)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={su.completeBtn} onPress={handleCompleteOrder}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={su.completeText}>Complete Order</Text>
          </TouchableOpacity>
          <TouchableOpacity style={su.closeBtn} onPress={handleNewOrder}>
            <Text style={su.closeText}>× Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ── Cart panel content (reused in desktop sidebar and mobile modal) ─────────
  const cartPanel = (
    <View style={cp.wrap}>
      {/* ── Order type tabs ── */}
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

      {/* ── Waiter + Customer rows ── */}
      <View style={cp.twoColSection}>
        {/* Waiter */}
        <View style={cp.halfField}>
          <Text style={cp.fieldLabel}>Waiter</Text>
          <TouchableOpacity style={cp.fieldBox} onPress={() => setShowWaiterPicker(true)}>
            <Ionicons name="person-circle-outline" size={13} color="#9ca3af" />
            <Text style={[cp.fieldBoxText, cart.waiter_name && { color: '#111827' }]} numberOfLines={1}>
              {cart.waiter_name || 'Waiter'}
            </Text>
            {cart.waiter_name ? (
              <TouchableOpacity onPress={() => setWaiter(undefined, undefined)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={13} color="#9ca3af" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Customer */}
        <View style={cp.halfField}>
          <Text style={cp.fieldLabel}>Customer</Text>
          <View style={cp.fieldRow}>
            <View style={[cp.fieldBox, { flex: 1 }]}>
              <TextInput
                style={[cp.fieldBoxText, { flex: 1 }]}
                placeholder={cart.customer_name || 'Walk-in'}
                value={walkInName}
                onChangeText={setWalkInName}
                placeholderTextColor="#9ca3af"
              />
              {(walkInName || cart.customer_name) ? (
                <TouchableOpacity onPress={() => { setWalkInName(''); setCustomer(undefined, undefined, undefined); }}>
                  <Ionicons name="close-circle" size={13} color="#9ca3af" />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={cp.iconSmBtn} onPress={() => setShowCustPicker(true)}>
              <Ionicons name="add" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Table selector ── */}
      {cart.order_type === 'dine_in' && tables.length > 0 && (
        <View style={cp.tableSection}>
          <View style={cp.tableLabelRow}>
            <Text style={cp.fieldLabel}>Table</Text>
            <View style={cp.requiredDot}><Text style={cp.requiredStar}>*</Text></View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TouchableOpacity style={[cp.tableChip, !cart.table_id && cp.tableChipActive]} onPress={() => setTable(undefined)}>
              <Text style={[cp.tableChipText, !cart.table_id && cp.tableChipTextActive]}>—</Text>
            </TouchableOpacity>
            {tables.map(t => (
              <TouchableOpacity key={t.id}
                style={[cp.tableChip, cart.table_id === t.id && cp.tableChipActive]}
                onPress={() => setTable(t.id)}>
                <Text style={[cp.tableChipText, cart.table_id === t.id && cp.tableChipTextActive]}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Ordered Menus header ── */}
      <View style={cp.orderedHeader}>
        <Text style={cp.orderedTitle}>Ordered Menus</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={cp.addCustomBtn} onPress={() => setShowCustomItem(true)}>
            <Ionicons name="add" size={13} color="#374151" />
            <Text style={cp.addCustomText}>Add custom item</Text>
          </TouchableOpacity>
          <Text style={cp.totalMenus}>Total Menus : {cart.items.length}</Text>
        </View>
      </View>

      {/* ── Cart items ── */}
      <ScrollView style={cp.itemList} showsVerticalScrollIndicator={false}>
        {cart.items.length === 0 ? (
          <View style={cp.emptyCart}>
            <Ionicons name="cart-outline" size={32} color="#d1d5db" />
            <Text style={cp.emptyCartText}>Cart is empty</Text>
            <Text style={cp.emptyCartSub}>Tap items to add them</Text>
          </View>
        ) : cart.items.map(item => (
          <View key={item.uuid} style={cp.cartItemBox}>
            {/* Name + qty controls + remove */}
            <View style={cp.cartItemRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cp.cartName} numberOfLines={2}>{item.name}</Text>
                {item.variation && <Text style={cp.cartVar}>{item.variation}</Text>}
              </View>
              <View style={cp.qtyRow}>
                <TouchableOpacity style={cp.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity - 1)}>
                  <Ionicons name="remove" size={11} color="#374151" />
                </TouchableOpacity>
                <Text style={cp.qtyNum}>{item.quantity}</Text>
                <TouchableOpacity style={cp.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity + 1)}>
                  <Ionicons name="add" size={11} color="#374151" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={cp.removeBtn} onPress={() => updateQuantity(item.uuid, 0)}>
                <Ionicons name="close" size={13} color="#6b7280" />
              </TouchableOpacity>
            </View>
            {/* Item Rate | Amount | Total */}
            <View style={cp.cartItemMeta}>
              <View style={cp.cartMetaCol}>
                <Text style={cp.cartMetaLabel}>Item Rate</Text>
                <Text style={cp.cartMetaVal}>₹{item.unit_price.toFixed(2)}</Text>
              </View>
              <View style={[cp.cartMetaCol, { alignItems: 'center' }]}>
                <Text style={cp.cartMetaLabel}>Amount</Text>
                <Text style={cp.cartMetaVal}>₹{(item.unit_price * item.quantity).toFixed(2)}</Text>
              </View>
              <View style={[cp.cartMetaCol, { alignItems: 'flex-end' }]}>
                <Text style={cp.cartMetaLabel}>Total</Text>
                <Text style={[cp.cartMetaVal, { fontWeight: '800', color: '#111827' }]}>₹{item.total_price.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ── Payment Summary ── */}
      <View style={cp.paymentSummary}>
        <Text style={cp.sectionTitle}>Payment Summary</Text>

        {/* Subtotal / Tax / Discount rows */}
        <View style={cp.sumRow}>
          <Text style={cp.sumLabel}>Sub Total</Text>
          <Text style={cp.sumVal}>₹{subtotal.toFixed(2)}</Text>
        </View>
        <View style={cp.sumRow}>
          <Text style={cp.sumLabel}>Tax ({taxRate}%)</Text>
          <Text style={cp.sumVal}>₹{taxAmount.toFixed(2)}</Text>
        </View>
        <View style={cp.sumRow}>
          <Text style={cp.sumLabel}>Discount</Text>
          <Text style={[cp.sumVal, discount > 0 && { color: '#16a34a' }]}>
            {discount > 0 ? `-₹${discount.toFixed(2)}` : '₹0.00'}
          </Text>
        </View>

        {/* Coupon row */}
        <View style={cp.divider} />
        {cart.coupon_code ? (
          <View style={[cp.couponActive]}>
            <Ionicons name="ticket-outline" size={13} color="#16a34a" />
            <Text style={cp.couponActiveText}>{cart.coupon_code} (−₹{(cart.coupon_discount ?? 0).toFixed(2)})</Text>
            <TouchableOpacity onPress={handleRemoveCoupon}>
              <Ionicons name="close-circle" size={15} color="#16a34a" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={cp.couponRow}>
            <View style={cp.couponInput}>
              <TextInput
                style={cp.couponInputText}
                placeholder="Coupon code"
                value={couponInput}
                onChangeText={setCouponInput}
                autoCapitalize="characters"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <TouchableOpacity
              style={[cp.couponApplyBtn, (!couponInput.trim() || couponLoading) && { opacity: 0.5 }]}
              onPress={handleApplyCoupon}
              disabled={couponLoading || !couponInput.trim()}
            >
              {couponLoading
                ? <ActivityIndicator size={11} color="#fff" />
                : <Text style={cp.couponApplyText}>Apply</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Discount % */}
        <View style={cp.divider} />
        <Text style={cp.quickDiscLabel}>Quick Discount %</Text>
        <View style={cp.quickDiscRow}>
          {[5, 10, 15, 20].map(pct => (
            <TouchableOpacity key={pct}
              style={[cp.quickDiscBtn, quickPct === pct && cp.quickDiscBtnActive]}
              onPress={() => handleQuickDiscount(pct)}>
              <Text style={[cp.quickDiscText, quickPct === pct && cp.quickDiscTextActive]}>{pct}%</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom % */}
        <View style={cp.customPctRow}>
          <View style={cp.customPctInput}>
            <TextInput
              style={cp.customPctText}
              placeholder="Custom %"
              value={customPctInput}
              onChangeText={setCustomPctInput}
              keyboardType="decimal-pad"
              placeholderTextColor="#9ca3af"
            />
            <Text style={cp.customPctSymbol}>%</Text>
          </View>
          <TouchableOpacity style={cp.customApplyBtn} onPress={handleCustomPctApply}>
            <Text style={cp.customApplyText}>Apply</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cp.customClearBtn} onPress={handleDiscountClear}>
            <Text style={cp.customClearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Discount ₹ manual input */}
        <View style={cp.discRupeeRow}>
          <Text style={cp.discRupeeLabel}>Discount (₹)</Text>
          <View style={cp.discRupeeInput}>
            <TextInput
              style={cp.discRupeeText}
              value={discountInput}
              onChangeText={v => { setDiscountInput(v); setQuickPct(null); setCustomPctInput(''); }}
              keyboardType="decimal-pad"
              placeholderTextColor="#9ca3af"
              placeholder="0"
            />
          </View>
        </View>

        {/* Amount to Pay */}
        <View style={cp.divider} />
        <View style={cp.amountToPayRow}>
          <Text style={cp.amountToPayLabel}>Amount to Pay</Text>
          <Text style={cp.amountToPayVal}>₹{total.toFixed(2)}</Text>
        </View>

        {/* Received */}
        <View style={cp.receivedRow}>
          <Text style={cp.receivedLabel}>Received (₹)</Text>
          <View style={cp.receivedInput}>
            <TextInput
              style={cp.receivedText}
              placeholder="0"
              value={receivedInput}
              onChangeText={setReceivedInput}
              keyboardType="decimal-pad"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* Change / Balance due */}
        <View style={cp.changeDueRow}>
          <Text style={cp.changeDueLabel}>Change / Balance due</Text>
          <Text style={[cp.changeDueVal, { color: received > 0 && change >= 0 ? '#16a34a' : '#ef4444' }]}>
            ₹{received > 0 ? change.toFixed(2) : total.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* ── Payment Method ── */}
      <View style={cp.payMethodSection}>
        <Text style={cp.sectionTitle}>Payment Method</Text>
        <View style={cp.payRow}>
          {PAYMENT_METHODS.map(pm => (
            <TouchableOpacity key={pm.key}
              style={[cp.payBtn, paymentMethod === pm.key && cp.payBtnActive]}
              onPress={() => setPaymentMethod(pm.key)}>
              <Ionicons name={pm.icon} size={14} color={paymentMethod === pm.key ? '#fff' : '#374151'} />
              <Text style={[cp.payText, paymentMethod === pm.key && cp.payTextActive]}>{pm.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Order Notes (for kitchen) ── */}
      <View style={cp.notesSection}>
        <View style={cp.notesLabelRow}>
          <Ionicons name="receipt-outline" size={13} color="#C9A52A" />
          <Text style={cp.sectionTitle}>Order Notes</Text>
          <Text style={cp.notesMeta}>(for kitchen)</Text>
        </View>
        <TextInput
          style={cp.notesInput}
          placeholder="E.g. less spicy, no onion, allergies..."
          value={notesInput}
          onChangeText={setNotesInput}
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />
      </View>

      {/* ── Primary: Place an Order ── */}
      <View style={cp.btnSection}>
        <TouchableOpacity
          style={[cp.placeBtn, (placing || cartCount === 0) && { opacity: 0.5 }]}
          onPress={() => handlePlaceOrder(false)}
          disabled={placing || cartCount === 0}
        >
          {placing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={cp.placeBtnLabel}>{isOnline ? 'Place an Order' : 'Save Offline'}</Text>
          }
        </TouchableOpacity>

        {/* Print KOT */}
        <TouchableOpacity
          style={[cp.kotBtn, cartCount === 0 && { opacity: 0.4 }]}
          onPress={handleKOTPrint}
          disabled={cartCount === 0}
        >
          <Ionicons name="print-outline" size={15} color="#16a34a" />
          <Text style={cp.kotBtnText}>Print KOT</Text>
          {cart.kot_printed && <View style={cp.kotDot} />}
        </TouchableOpacity>

        {/* Row 1: Print | Invoice | Draft */}
        <View style={cp.btnRow3}>
          <TouchableOpacity style={cp.btn3} onPress={() => handlePlaceOrder(false)}>
            <Ionicons name="print-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Print</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cp.btn3} onPress={() => printOrderReceipt(lastOrderData ?? { ...cart, order_number: 'DRAFT', items: cart.items, total, table_name: tables.find(t => t.id === cart.table_id)?.name ?? null }, restaurant, taxRate)}>
            <Ionicons name="document-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cp.btn3}
            onPress={() => handlePlaceOrder(true)}
            disabled={placing || cartCount === 0}>
            <Ionicons name="save-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Draft</Text>
          </TouchableOpacity>
        </View>

        {/* Row 2: × Cancel | Void | Transactions */}
        <View style={cp.btnRow3}>
          <TouchableOpacity style={[cp.btn3, cp.btn3Danger]}
            onPress={() => {
              if (cartCount === 0) return;
              Alert.alert('Cancel Order', 'Clear all items from this order?', [
                { text: 'No', style: 'cancel' },
                { text: 'Yes, Cancel', style: 'destructive', onPress: () => {
                    clearCart(); setWalkInName(''); setDiscountInput(''); setCustomPctInput('');
                    setQuickPct(null); setCouponInput(''); setNotesInput(''); setReceivedInput('');
                  }
                },
              ]);
            }}>
            <Ionicons name="close" size={14} color="#dc2626" />
            <Text style={[cp.btn3Text, { color: '#dc2626' }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cp.btn3}
            onPress={() => Alert.alert('Void', 'Void is available for placed orders in the Orders screen.')}>
            <Ionicons name="flash-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Void</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cp.btn3}
            onPress={() => Alert.alert('Transactions', 'View all transactions in the Orders screen.')}>
            <Ionicons name="document-text-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Transactions</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── Item card renderer ─────────────────────────────────────────────────────
  function renderItemCard({ item }: { item: Item }) {
    const qty    = getCartQty(item);
    const imgUrl = itemImageUrl(item.image);
    const ft     = item.food_type;
    const imgErr = imgErrors.has(item.id);
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
          {imgUrl && !imgErr
            ? <Image source={{ uri: imgUrl }} style={ic.img} resizeMode="cover" onError={() => setImgErrors(prev => new Set(prev).add(item.id))} />
            : <View style={[ic.imgPlaceholder, { backgroundColor: ft === 'veg' ? '#f0fdf4' : ft === 'non_veg' ? '#fef2f2' : '#f8f9fa' }]}>
                <Ionicons name="restaurant-outline" size={24} color={ft === 'veg' ? '#86efac' : ft === 'non_veg' ? '#fca5a5' : '#d1d5db'} />
              </View>
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
        {successModal}
        {variationModal}
        {custPickerModal}
        {waiterPickerModal}
        {customItemModal}

        {/* Top header bar */}
        <View style={sh.posHeader}>
          <TouchableOpacity style={sh.posBackBtn} onPress={() => router.replace('/(app)/dashboard')}>
            <Ionicons name="arrow-back" size={15} color="#fff" />
            <Text style={sh.posBackText}>Dashboard</Text>
          </TouchableOpacity>
          <Text style={sh.posTitle}>Point of Sale</Text>
        </View>

        <View style={sh.cols}>
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
          {/* Top nav bar */}
          <View style={sh.posTopBar}>
            <TouchableOpacity style={sh.navBtn} onPress={() => router.push('/(app)/dashboard' as any)}>
              <Ionicons name="home-outline" size={16} color="#5A7A5A" />
            </TouchableOpacity>
            <TouchableOpacity style={sh.navBtn} onPress={() => router.push('/(app)/orders' as any)}>
              <Ionicons name="receipt-outline" size={16} color="#5A7A5A" />
              <Text style={sh.navBtnText}>Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sh.navBtn} onPress={() => router.push('/(app)/kitchen' as any)}>
              <Ionicons name="flame-outline" size={16} color="#5A7A5A" />
              <Text style={sh.navBtnText}>Kitchen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sh.navBtn} onPress={() => router.push('/(app)/tables' as any)}>
              <Ionicons name="grid-outline" size={16} color="#5A7A5A" />
              <Text style={sh.navBtnText}>Tables</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sh.navBtn} onPress={() => router.push('/(app)/reports' as any)}>
              <Ionicons name="bar-chart-outline" size={16} color="#5A7A5A" />
              <Text style={sh.navBtnText}>Reports</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sh.navBtn} onPress={() => router.push('/(app)/settings' as any)}>
              <Ionicons name="settings-outline" size={16} color="#5A7A5A" />
              <Text style={sh.navBtnText}>Settings</Text>
            </TouchableOpacity>
          </View>
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
        </View>{/* end sh.cols */}
      </View>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <View style={mb.shell}>
      {successModal}
      {variationModal}
      {custPickerModal}
      {waiterPickerModal}
      {customItemModal}

      <View style={mb.topBar}>
        <TouchableOpacity style={mb.backBtn} onPress={() => router.replace('/(app)/dashboard')}>
          <Ionicons name="arrow-back" size={18} color="#374151" />
        </TouchableOpacity>
        <Text style={mb.topTitle}>POS</Text>
      </View>
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
  shell:      { flex: 1, flexDirection: 'column', backgroundColor: '#f0f2f7' },
  cols:       { flex: 1, flexDirection: 'row' },
  posHeader:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#1A2B1A', borderBottomWidth: 1, borderBottomColor: '#243a24', gap: 12 },
  posBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  posBackText:{ fontSize: 13, fontWeight: '600', color: '#fff' },
  posTitle:   { fontSize: 15, fontWeight: '800', color: '#C9A52A', letterSpacing: 0.5 },

  rail:       { width: 170, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  railHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  backBtn:    { width: 28, height: 28, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  railTitle:  { flex: 1, fontSize: 11, fontWeight: '800', color: '#374151', letterSpacing: 1, textTransform: 'uppercase' },
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
  posTopBar:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1A2B1A', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  navBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.06)' },
  navBtnText: { fontSize: 11.5, fontWeight: '600', color: '#7A9A7A' },
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
  wrap: { flex: 1, flexDirection: 'column' },

  // ── Order type tabs ──────────────────────────────────────────────────────
  orderTypes:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f8f9fb' },
  typeBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9 },
  typeBtnActive:    { backgroundColor: '#0D76E1', borderRadius: 0 },
  typeBtnText:      { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  typeBtnTextActive:{ color: '#fff', fontWeight: '700' },

  // ── Waiter + Customer two-column row ─────────────────────────────────────
  twoColSection: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  halfField:     { flex: 1, gap: 3 },
  fieldLabel:    { fontSize: 10, fontWeight: '700', color: '#6b7280', letterSpacing: 0.4, textTransform: 'uppercase' },
  fieldRow:      { flexDirection: 'row', gap: 4, alignItems: 'center' },
  fieldBox:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f5f6f8', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#e5e7eb', flex: 1 },
  fieldBoxText:  { fontSize: 12.5, color: '#9ca3af' },
  iconSmBtn:     { width: 28, height: 28, borderRadius: 7, backgroundColor: '#1A2B1A', alignItems: 'center', justifyContent: 'center' },
  iconBtn:       { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(13,118,225,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#93c5fd' },

  // ── Table ────────────────────────────────────────────────────────────────
  tableSection:  { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tableLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  requiredDot:   { width: 14, height: 14, borderRadius: 7, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  requiredStar:  { fontSize: 11, color: '#ef4444', fontWeight: '800' },
  tableChip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  tableChipActive:    { backgroundColor: 'rgba(13,118,225,0.1)', borderColor: '#93c5fd' },
  tableChipText:      { fontSize: 11.5, color: '#374151', fontWeight: '500' },
  tableChipTextActive:{ color: '#0D76E1', fontWeight: '700' },

  // ── Ordered Menus header ─────────────────────────────────────────────────
  orderedHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#f8f9fb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  orderedTitle:   { fontSize: 11.5, fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: 0.5 },
  addCustomBtn:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  addCustomText:  { fontSize: 11, fontWeight: '600', color: '#374151' },
  totalMenus:     { fontSize: 11, fontWeight: '700', color: '#0D76E1' },

  // ── Cart items ───────────────────────────────────────────────────────────
  itemList:       { flex: 1 },
  emptyCart:      { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyCartText:  { fontSize: 13.5, fontWeight: '600', color: '#374151' },
  emptyCartSub:   { fontSize: 11.5, color: '#9ca3af' },
  cartItemBox:    { paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  cartItemRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  cartName:       { fontSize: 12.5, fontWeight: '600', color: '#111827', lineHeight: 16 },
  cartVar:        { fontSize: 10.5, color: '#C9A52A', marginTop: 1 },
  qtyRow:         { flexDirection: 'row', alignItems: 'center', gap: 2 },
  qtyBtn:         { width: 22, height: 22, backgroundColor: '#f3f4f6', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  qtyNum:         { fontSize: 12, fontWeight: '700', color: '#111827', minWidth: 18, textAlign: 'center' },
  removeBtn:      { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  cartItemMeta:   { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f8f9fb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  cartMetaCol:    { flex: 1 },
  cartMetaLabel:  { fontSize: 9.5, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  cartMetaVal:    { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 1 },

  // ── Payment Summary ──────────────────────────────────────────────────────
  paymentSummary: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 5 },
  sectionTitle:   { fontSize: 11, fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  sumRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel:       { fontSize: 12.5, color: '#6b7280' },
  sumVal:         { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  divider:        { height: 1, backgroundColor: '#f3f4f6', marginVertical: 4 },

  // Coupon
  couponActive:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#86efac' },
  couponActiveText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#16a34a' },
  couponRow:        { flexDirection: 'row', gap: 6 },
  couponInput:      { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f6f8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#e5e7eb' },
  couponInputText:  { flex: 1, fontSize: 12.5, color: '#111827' },
  couponApplyBtn:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#0D76E1', alignItems: 'center', justifyContent: 'center' },
  couponApplyText:  { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Quick discount %
  quickDiscLabel:    { fontSize: 10.5, fontWeight: '700', color: '#6b7280' },
  quickDiscRow:      { flexDirection: 'row', gap: 5 },
  quickDiscBtn:      { flex: 1, paddingVertical: 7, borderRadius: 7, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  quickDiscBtnActive:{ backgroundColor: '#0D76E1', borderColor: '#0D76E1' },
  quickDiscText:     { fontSize: 12, fontWeight: '700', color: '#374151' },
  quickDiscTextActive:{ color: '#fff' },

  // Custom %
  customPctRow:    { flexDirection: 'row', gap: 5 },
  customPctInput:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f6f8', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  customPctText:   { flex: 1, fontSize: 12.5, color: '#111827' },
  customPctSymbol: { fontSize: 13, fontWeight: '700', color: '#9ca3af' },
  customApplyBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7, backgroundColor: '#1A2B1A', alignItems: 'center', justifyContent: 'center' },
  customApplyText: { fontSize: 12, fontWeight: '700', color: '#C9A52A' },
  customClearBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  customClearText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },

  // Discount ₹ row
  discRupeeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  discRupeeLabel: { fontSize: 12.5, color: '#6b7280' },
  discRupeeInput: { backgroundColor: '#f5f6f8', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#e5e7eb', minWidth: 80, alignItems: 'flex-end' },
  discRupeeText:  { fontSize: 12.5, fontWeight: '600', color: '#111827', textAlign: 'right' },

  // Amount to Pay
  amountToPayRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  amountToPayLabel: { fontSize: 14, fontWeight: '800', color: '#111827' },
  amountToPayVal:   { fontSize: 16, fontWeight: '800', color: '#0D76E1' },

  // Received
  receivedRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  receivedLabel: { fontSize: 12.5, color: '#6b7280' },
  receivedInput: { backgroundColor: '#f5f6f8', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#e5e7eb', minWidth: 80, alignItems: 'flex-end' },
  receivedText:  { fontSize: 12.5, fontWeight: '600', color: '#111827', textAlign: 'right' },

  // Change / Balance due
  changeDueRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeDueLabel: { fontSize: 12.5, color: '#6b7280' },
  changeDueVal:   { fontSize: 13, fontWeight: '800' },

  // ── Payment Method ───────────────────────────────────────────────────────
  payMethodSection: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 6 },
  payRow:     { flexDirection: 'row', gap: 5 },
  payBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  payBtnActive:  { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' },
  payText:       { fontSize: 11.5, fontWeight: '600', color: '#374151' },
  payTextActive: { color: '#C9A52A', fontWeight: '700' },

  // ── Order Notes ──────────────────────────────────────────────────────────
  notesSection:   { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 5 },
  notesLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  notesMeta:      { fontSize: 10.5, color: '#9ca3af', fontStyle: 'italic' },
  notesInput:     { backgroundColor: '#f5f6f8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e5e7eb', fontSize: 12.5, color: '#111827', minHeight: 50 },

  // ── Bottom action buttons ────────────────────────────────────────────────
  btnSection:    { padding: 8, gap: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  placeBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: '#1A2B1A', gap: 8 },
  placeBtnLabel: { fontSize: 14, fontWeight: '800', color: '#C9A52A' },
  kotBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#16a34a', backgroundColor: '#f0fdf4', gap: 6, position: 'relative' },
  kotBtnText:    { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  kotDot:        { position: 'absolute', top: 4, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: '#7c3aed' },
  btnRow3:       { flexDirection: 'row', gap: 5 },
  btn3:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f5f6f8', borderWidth: 1, borderColor: '#e5e7eb' },
  btn3Text:      { fontSize: 11.5, fontWeight: '600', color: '#374151' },
  btn3Danger:    { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },

  // ── Custom item modal (shared field styles) ──────────────────────────────
  extraRow:      { flexDirection: 'row', gap: 6 },
  extraInput:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: '#e5e7eb' },
  extraInputText:{ flex: 1, fontSize: 12.5, color: '#111827' },
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
  topBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  topTitle:   { fontSize: 16, fontWeight: '800', color: '#111827' },
});

// Order placed success modal — csPos style
const su = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:        { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 16 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title:       { fontSize: 22, fontWeight: '800', color: '#111827' },
  orderNum:    { fontSize: 15, fontWeight: '700', color: '#C9A52A', marginBottom: 8 },
  hint:        { fontSize: 13.5, color: '#d97706', lineHeight: 20, marginBottom: 16 },
  changePill:  { backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 14, alignSelf: 'stretch' },
  changeText:  { fontSize: 13.5, fontWeight: '700', color: '#16a34a', textAlign: 'center' },
  kotBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#fff', marginBottom: 10 },
  kotText:     { fontSize: 14, fontWeight: '700', color: '#1A2B1A' },
  kotSub:      { fontSize: 12, color: '#6b7280' },
  billBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, backgroundColor: '#1A2B1A', marginBottom: 10 },
  billText:    { fontSize: 14, fontWeight: '700', color: '#fff' },
  billSub:     { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, backgroundColor: '#16a34a', marginBottom: 10 },
  completeText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  closeBtn:    { paddingVertical: 13, borderRadius: 10, backgroundColor: '#FFA80B', alignItems: 'center' },
  closeText:   { fontSize: 14, fontWeight: '800', color: '#fff' },
});
