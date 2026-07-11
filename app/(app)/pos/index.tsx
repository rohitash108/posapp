/**
 * POS Screen — Professional Restaurant Point of Sale
 * 3-column desktop layout: Category Rail | Item Grid | Order Panel
 * Features: discount, notes, customer/waiter picker, table selector,
 *           payment methods, variation modal, offline save, print receipt,
 *           KOT print, add custom item, draft/void, coupon, recent orders strip
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Image,
  TextInput, ScrollView, Modal, Alert, ActivityIndicator, Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';
import { getCategories, getItems, upsertCategories, upsertItems, addToSyncQueue, createLocalOrder } from '@/database/repositories';
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
import { useThemedScreen } from '@/theme/useThemedScreen';
import type { ThemeColors as _TC } from '@/theme/tokens';
import { ThemeToggle } from '@/components/ThemeToggle';

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
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;line-height:1.3;color:#000;background:#fff;padding:0 2mm 4mm;max-width:320px;margin:0 auto;print-color-adjust:exact;-webkit-print-color-adjust:exact}
@media print{body{padding:0 1mm 0;max-width:100%}.item{page-break-inside:avoid;break-inside:avoid}}
.c{text-align:center}.b{font-weight:800}.sm{font-size:9px}
.hr{border:none;border-top:1px dashed #000;margin:4px 0}
.hrd{border:none;border-top:2px solid #000;margin:4px 0}
.row{display:flex;justify-content:space-between;gap:4px;margin:2px 0}
.shop-name{font-size:12px;font-weight:800;margin-bottom:2px}
.kot-heading{font-size:22px;font-weight:900;letter-spacing:4px;text-transform:uppercase;border:3px solid #000;padding:3px 12px;margin:4px auto;display:inline-block}
.item{display:flex;justify-content:space-between;gap:6px;margin:3px 0;font-size:12px;font-weight:700}
.item .nm{flex:1;min-width:0;word-break:break-word}
.item .qty{flex-shrink:0;font-size:13px;font-weight:900;min-width:28px;text-align:right}
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
<script>(function(){function doPrint(){window.print();window.onafterprint=function(){window.close();};}if(document.readyState==='complete'){setTimeout(doPrint,300)}else{window.addEventListener('load',function(){setTimeout(doPrint,300)})}})();</script>
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
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;line-height:1.25;color:#000;background:#fff;padding:0 2mm 4mm;max-width:320px;margin:0 auto;print-color-adjust:exact;-webkit-print-color-adjust:exact}
@media print{body{padding:0 1mm 0;max-width:100%;font-size:10px}}
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
${restaurant?.payment_qr ? `<div class="hr"></div><div class="c" style="margin:4px 0"><div class="sm b" style="margin-bottom:3px;letter-spacing:0.3px;">&#x25A3; Scan &amp; Pay via UPI</div><img src="${String(restaurant.payment_qr).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" alt="Payment QR" style="width:40mm;height:40mm;object-fit:contain;display:block;margin:0 auto;"><div class="sm" style="margin-top:2px;color:#444;">Google Pay &bull; PhonePe &bull; Paytm</div></div><div class="hr"></div>` : ''}
<div class="c sm" style="margin-top:4px">Thank you, visit again!</div>
<script>(function(){function doPrint(){window.print();window.onafterprint=function(){window.close();};}if(document.readyState==='complete'){setTimeout(doPrint,300)}else{window.addEventListener('load',function(){setTimeout(doPrint,300)})}})();</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=400,height=620');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Sync status dot (replicates _layout SyncDot for standalone use) ───────────
function SyncStatusDot() {
  const { isSyncing, isOnline } = useAppStore();
  const { colors } = useThemedScreen();
  const color = isSyncing ? colors.warning : isOnline ? colors.success : colors.danger;
  return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function POSScreen() {
  const t      = useThemedScreen();
  const insets = useSafeAreaInsets();
  const sh  = useMemo(() => mkSh(t.colors),  [t.colors]);
  const ic  = useMemo(() => mkIc(t.colors),  [t.colors]);
  const cp  = useMemo(() => mkCp(t.colors),  [t.colors]);
  const vm  = useMemo(() => mkVm(t.colors),  [t.colors]);
  const cpm = useMemo(() => mkCpm(t.colors), [t.colors]);
  const mb  = useMemo(() => mkMb(t.colors),  [t.colors]);
  const mc  = useMemo(() => mkMc(t.colors),  [t.colors]);
  const su  = useMemo(() => mkSu(t.colors),  [t.colors]);
  const tam = useMemo(() => mkTam(t.colors), [t.colors]);
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
  const [showTableAlert, setShowTableAlert] = useState(false);
  const [showCart, setShowCart]           = useState(false);
  const [showCustPicker, setShowCustPicker] = useState(false);
  const custFieldRef = React.useRef<View>(null);
  const [custDropPos, setCustDropPos] = useState({ top: 200, left: 0, width: 300 });
  const [showWaiterPicker, setShowWaiterPicker] = useState(false);
  const waiterFieldRef = React.useRef<View>(null);
  const [waiterDropPos, setWaiterDropPos] = useState({ top: 200, left: 0, width: 300 });
  const [showTablePicker, setShowTablePicker] = useState(false);
  const tableFieldRef = React.useRef<View>(null);
  const [tableDropPos, setTableDropPos] = useState({ top: 200, left: 0, width: 300 });
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [placing, setPlacing]             = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [focusPriceUuid, setFocusPriceUuid] = useState<string | null>(null);
  // Tracks live-typed price per cart item uuid so Amount/Total update as user types
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  // Restored from cartStore on mount so values survive navigation away and back
  const [walkInName, setWalkInName]       = useState(() => {
    const c = useCartStore.getState().cart;
    return !c.customer_id && c.customer_name && c.customer_name !== 'Walk-in'
      ? c.customer_name : '';
  });
  const [custSearch, setCustSearch]       = useState('');
  const [waiterSearch, setWaiterSearch]   = useState('');
  const [tableSearch, setTableSearch]     = useState('');
  const [discountInput, setDiscountInput] = useState(() => {
    const d = useCartStore.getState().cart.discount_amount ?? 0;
    return d > 0 ? String(d) : '';
  });
  const [couponInput, setCouponInput]     = useState(
    () => useCartStore.getState().cart.coupon_code ?? ''
  );
  const [couponLoading, setCouponLoading] = useState(false);
  const [notesInput, setNotesInput]       = useState(
    () => useCartStore.getState().cart.notes ?? ''
  );
  const [receivedInput, setReceivedInput] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty]   = useState('1');
  const [lastOrderNum, setLastOrderNum]   = useState<string | null>(null);
  const [lastOrderData, setLastOrderData] = useState<any>(null);
  const [lastOrderId, setLastOrderId]     = useState<number | null>(null);
  const [customPctInput, setCustomPctInput] = useState('');
  const [quickPct, setQuickPct]           = useState<number | null>(null);
  const [showDiscountSection, setShowDiscountSection] = useState(false);

  const {
    cart, addItem, updateQuantity, updateUnitPrice, clearCart, getSubtotal, getTotal, getTaxAmount,
    setOrderType, setTable, switchTable, setCustomer, setWaiter, setDiscount, setNotes,
    setCoupon, setKotPrinted,
  } = useCartStore();
  // Subscribe to tableCartMap so the table picker re-renders when slots change
  const tableCartMap = useCartStore(s => s.tableCartMap);

  /**
   * After switchTable() replaces the active cart in the store, this helper
   * reads the new cart and syncs the local mirror state (the TextInput values
   * that drive discount / notes / coupon / walkInName in the UI).
   * Must be called immediately after every switchTable() call.
   */
  function syncLocalFromCart() {
    const c = useCartStore.getState().cart;
    const d = c.discount_amount ?? 0;
    setDiscountInput(d > 0 ? String(d) : '');
    setNotesInput(c.notes ?? '');
    setCouponInput(c.coupon_code ?? '');
    setWalkInName(
      !c.customer_id && c.customer_name && c.customer_name !== 'Walk-in'
        ? c.customer_name
        : ''
    );
    setQuickPct(null);
    setCustomPctInput('');
  }
  /** Reliable field measurement for web (uses getBoundingClientRect) + native fallback */
  function measureFieldPos(
    ref: React.RefObject<View>,
    onResult: (top: number, left: number, width: number) => void
  ) {
    if (!ref.current) return;
    const el = ref.current as any;
    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      // width > 0 means the element has been laid out and is visible
      if (rect.width > 0) {
        onResult(rect.bottom + 4, rect.left, Math.max(rect.width, 280));
        return;
      }
    }
    // Native fallback: measure() gives pageX/pageY which are always window-relative
    if (typeof (ref.current as any).measure === 'function') {
      (ref.current as any).measure((_x: number, _y: number, w: number, h: number, pageX: number, pageY: number) => {
        onResult(pageY + h + 4, pageX, Math.max(w, 280));
      });
    }
  }
  const openCustPicker = useCallback(() => {
    if (Platform.OS !== 'web') { setShowCustPicker(true); return; }
    measureFieldPos(custFieldRef, (top, left, width) => {
      setCustDropPos({ top, left, width });
      setShowCustPicker(true);
    });
  }, []);
  const openWaiterPicker = useCallback(() => {
    if (Platform.OS !== 'web') { setShowWaiterPicker(true); return; }
    measureFieldPos(waiterFieldRef, (top, left, width) => {
      setWaiterDropPos({ top, left, width });
      setShowWaiterPicker(true);
    });
  }, []);
  const openTablePicker = useCallback(() => {
    if (Platform.OS === 'web') {
      // On web: use document.getElementById for reliable coords
      const el = (typeof document !== 'undefined')
        ? document.getElementById('pos-table-field')
        : null;
      if (el) {
        const rect = el.getBoundingClientRect();
        setTableDropPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
      } else {
        measureFieldPos(tableFieldRef, (top, left, width) => {
          setTableDropPos({ top, left, width });
        });
      }
    }
    // On mobile: bottom-sheet, no position needed
    setShowTablePicker(true);
  }, []);
  const { isOnline, taxes, restaurant } = useAppStore();
  const taxRate = taxes[0]?.rate ?? 0;
  const taxType: 'inclusive' | 'exclusive' = taxes[0]?.type ?? 'exclusive';
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const cols = width >= 1500 ? 5 : width >= 1200 ? 4 : width >= 900 ? 3 : 2;

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    // ── Phase 1: Load menu/sync data (critical — needed immediately) ──────────
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
      // Native: try server sync first, fallback to SQLite cache
      try {
        const res = await client.get('/sync/pull');
        const cats: Category[]       = res.data.categories ?? [];
        const items: Item[]           = res.data.items ?? [];
        const tbls: RestaurantTable[] = res.data.tables ?? [];
        // Persist to SQLite for offline use
        await upsertCategories(cats);
        await upsertItems(items);
        useAppStore.getState().setTaxes(res.data.taxes ?? []);
        setCategories(cats);
        setAllItems(items);
        setTables(tbls);
      } catch {
        // Offline fallback: read from SQLite
        const cats  = await getCategories();
        const items = await getItems(undefined);
        setCategories(cats);
        setAllItems(items);
      }
    }

    // ── Phase 2: Load secondary data in parallel (non-blocking) ──────────────
    const [custRes, staffRes, ordersRes, tablesRes] = await Promise.allSettled([
      client.get('/customers'),
      client.get('/staff'),
      ordersApi.list({ per_page: 10 }),
      client.get('/tables'),
    ]);
    if (custRes.status === 'fulfilled') {
      const data = custRes.value.data?.data ?? custRes.value.data ?? [];
      setCustomers(Array.isArray(data) ? data : []);
    }
    if (staffRes.status === 'fulfilled') {
      const data = staffRes.value.data?.data ?? staffRes.value.data ?? [];
      setStaff(Array.isArray(data) ? data : []);
    }
    if (ordersRes.status === 'fulfilled') {
      const data = ordersRes.value.data?.data ?? ordersRes.value.data ?? [];
      setRecentOrders(Array.isArray(data) ? data.slice(0, 8) : []);
    }
    if (tablesRes.status === 'fulfilled') {
      const data = tablesRes.value.data?.data ?? tablesRes.value.data ?? [];
      setTables(Array.isArray(data) ? data : []);
    }
  }, []);

  const loadItems = useCallback(async () => {
    // On native, filter already-loaded items by category (no extra DB call needed
    // since loadData sets allItems from server). Only re-query SQLite as fallback.
    if (Platform.OS !== 'web' && activeCatId !== null) {
      const items = await getItems(activeCatId ?? undefined);
      if (items.length > 0) setAllItems(items);
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
  // Items (or the selected variation) with no fixed price are added at ₹0 —
  // the cart row renders an inline price input so the cashier fills it in
  // after the item lands in the cart, instead of being blocked at add-time.
  function addToCart(item: Item, variation?: Variation) {
    const price = variation ? variation.price : (item.price || 0);
    const varName = variation?.name;
    const existing = cart.items.find(i => i.item_id === item.id && i.variation === varName);
    if (existing) {
      updateQuantity(existing.uuid, existing.quantity + 1);
      // If already in cart and still has no price, re-focus the input
      if (!(existing.unit_price > 0)) setFocusPriceUuid(existing.uuid);
    } else {
      const newItem = { item_id: item.id, name: item.name, food_type: item.food_type, variation: varName, addons: [], quantity: 1, unit_price: price, total_price: price };
      addItem(newItem);
      // Auto-focus price input for 0-price items
      if (!(price > 0)) {
        // uuid is assigned inside addItem — grab it from the store after state update
        setTimeout(() => {
          const items = useCartStore.getState().cart.items;
          const added = items.find(i => i.item_id === item.id && i.variation === varName);
          if (added) setFocusPriceUuid(added.uuid);
        }, 50);
      }
    }
  }

  function handleAdd(item: Item) {
    if (cart.order_type === 'dine_in' && !cart.table_id) {
      setShowTableAlert(true);
      return;
    }
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
    if (cart.order_type === 'dine_in' && !cart.table_id) {
      setShowTableAlert(true);
      return;
    }
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
  async function handlePlaceOrder(asDraft = false, autoPrint = false) {
    if (cart.items.length === 0) {
      Alert.alert('Empty Cart', 'Add items before placing an order.');
      return;
    }

    // Flush any live-typed prices into the store before validation / API call
    Object.entries(priceInputs).forEach(([itemUuid, val]) => {
      const v = parseFloat(val);
      if (!isNaN(v) && v > 0) updateUnitPrice(itemUuid, v);
    });
    setPriceInputs({});

    // Re-read items from store after flush
    const latestItems = useCartStore.getState().cart.items;
    const zeroPriceItem = latestItems.find(i => !(i.unit_price > 0));
    if (zeroPriceItem) {
      Alert.alert('Price Required', `Enter a price for "${zeroPriceItem.name}" before placing the order.`);
      return;
    }
    setPlacing(true);
    try {
      const localUuid  = uuid.v4() as string;
      const subtotal   = getSubtotal();
      const taxAmount  = getTaxAmount(taxRate, taxType);
      const discount   = (cart.discount_amount ?? 0) + (cart.coupon_discount ?? 0);
      const total      = getTotal(taxRate, taxType);
      const custName   = walkInName.trim() || cart.customer_name || 'Walk-in';
      const received   = parseFloat(receivedInput) || 0;
      const orderCreatedAt = new Date().toISOString();

      const payload: any = {
        local_uuid:           localUuid,
        order_type:           cart.order_type,
        status:               asDraft ? 'draft' : 'pending',
        is_draft:             asDraft,
        created_at:           orderCreatedAt,
        updated_at:           orderCreatedAt,
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
          food_type:   i.food_type ?? 'veg',
          variation:   i.variation ?? null,
          quantity:    i.quantity,
          unit_price:  i.unit_price,
          total_price: i.total_price,
        })),
      };

      if (isOnline) {
        try {
          const res = await ordersApi.create(payload);
          const orderNum   = res.data?.order_number ?? res.data?.data?.order_number ?? localUuid.slice(0, 8);
          const orderId    = res.data?.id ?? res.data?.data?.id ?? null;
          const tableName  = tables.find(t => t.id === cart.table_id)?.name ?? null;
          const orderData  = { ...payload, order_number: orderNum, table_name: tableName };
          // Auto-print receipt immediately if requested (skips the success modal prompt)
          if (autoPrint) printOrderReceipt(orderData, restaurant, taxRate);
          setLastOrderNum(orderNum);
          setLastOrderId(orderId);
          setLastOrderData(orderData);
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
      const { rememberOfflineOrderTime } = await import('@/utils/offlineOrderTimes');
      await rememberOfflineOrderTime(localUuid, orderCreatedAt);

      if (Platform.OS === 'web') {
        await webSaveOrder({ ...payload, local_uuid: localUuid });
        await webAddSyncQueue({ id: localUuid, action: 'create_order', payload: JSON.stringify(payload), created_at: orderCreatedAt });
      } else {
        await createLocalOrder({ ...payload, items: payload.items as any } as any);
        await addToSyncQueue({ id: localUuid, action: 'create_order', payload: JSON.stringify(payload), created_at: orderCreatedAt });
      }
      const tableNameOffline = tables.find(t => t.id === cart.table_id)?.name ?? null;
      const offlineOrderData = { ...payload, order_number: localUuid.slice(0, 8), table_name: tableNameOffline };
      if (autoPrint) printOrderReceipt(offlineOrderData, restaurant, taxRate);
      setLastOrderNum(localUuid.slice(0, 8));
      setLastOrderData(offlineOrderData);
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
      try {
        await ordersApi.complete(lastOrderId, lastOrderData?.payment_method ?? 'cash');
      } catch { /* ignore */ }
    }
    handleNewOrder();
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);

  // Live subtotal: uses priceInputs overrides so Payment Summary updates as user types
  const liveSubtotal = cart.items.reduce((sum, i) => {
    const typed = priceInputs[i.uuid];
    const price = typed !== undefined ? (parseFloat(typed) || 0) : i.unit_price;
    return sum + price * i.quantity;
  }, 0);
  const liveTaxAmount = taxType === 'inclusive'
    ? parseFloat((liveSubtotal * taxRate / (100 + taxRate)).toFixed(2))
    : parseFloat((liveSubtotal * taxRate / 100).toFixed(2));
  const discount  = (cart.discount_amount ?? 0) + (cart.coupon_discount ?? 0);
  const liveBase  = taxType === 'inclusive' ? liveSubtotal : liveSubtotal + liveTaxAmount;
  const liveTotal = Math.max(0, liveBase - discount);

  // Keep store-based values for API calls (only finalised after onEndEditing)
  const subtotal  = getSubtotal();
  const taxAmount = getTaxAmount(taxRate, taxType);
  const total     = getTotal(taxRate, taxType);

  const received  = parseFloat(receivedInput) || 0;
  const change    = received > 0 ? Math.max(0, received - liveTotal) : 0;

  const filteredCustomers = customers.filter(c =>
    c.is_registered !== false &&
    (!custSearch
    || c.name.toLowerCase().includes(custSearch.toLowerCase())
    || (c.phone ?? '').includes(custSearch))
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
          <Pressable
            style={({ pressed }) => [su.kotBtn, pressed && { opacity: 0.8 }]}
            onPress={() => lastOrderData && printKOT(
              lastOrderData.items, lastOrderData.order_type,
              lastOrderData.restaurant_table_id, tables,
              lastOrderNum ?? undefined, lastOrderData.notes, restaurant?.name
            )}
          >
            <Ionicons name="print-outline" size={16} color={t.colors.brandDark} />
            <Text style={[su.kotText, { color: t.colors.brandDark }]}>Print KOT</Text>
            <Text style={su.kotSub}>(Kitchen)</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [su.billBtn, t.chromeBtn, pressed && { opacity: 0.85 }]}
            onPress={() => lastOrderData && printOrderReceipt(lastOrderData, restaurant, taxRate)}
          >
            <Ionicons name="print" size={16} color="#fff" />
            <Text style={su.billText}>Print Bill</Text>
            <Text style={su.billSub}>(Customer)</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [su.completeBtn, pressed && { opacity: 0.85 }]} onPress={handleCompleteOrder}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={su.completeText}>Complete Order</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [su.closeBtn, pressed && { opacity: 0.85 }]} onPress={handleNewOrder}>
            <Text style={su.closeText}>× Close</Text>
          </Pressable>
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
          <Pressable
            key={t.key}
            style={({ pressed }) => [cp.typeBtn, cart.order_type === t.key && cp.typeBtnActive, pressed && { opacity: 0.8 }]}
            onPress={() => setOrderType(t.key as any)}
          >
            <Ionicons name={t.icon} size={13} color={cart.order_type === t.key ? '#fff' : '#6b7280'} />
            <Text style={[cp.typeBtnText, cart.order_type === t.key && cp.typeBtnTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Customer selector ── */}
      <View ref={custFieldRef} style={cp.selectorSection}>
        <View style={cp.selectorLabelRow}>
          <Ionicons name="person-outline" size={11} color="#9ca3af" />
          <Text style={cp.selectorLabel}>CUSTOMER</Text>
        </View>
        {cart.customer_id ? (
          /* ── Selected customer pill ── */
          <View style={cp.fieldRow}>
            <Pressable
              style={({ pressed }) => [cp.selectedPill, { flex: 1 }, pressed && { opacity: 0.85 }]}
              onPress={() => openCustPicker()}
            >
              <View style={cp.selectedAvatar}>
                <Text style={cp.selectedAvatarText}>{(cart.customer_name ?? 'C').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cp.selectedName} numberOfLines={1}>{cart.customer_name}</Text>
                {cart.customer_phone ? <Text style={cp.selectedSub}>{cart.customer_phone}</Text> : null}
              </View>
              <Ionicons name="swap-horizontal-outline" size={13} color="#6b7280" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [cp.clearBtn, pressed && { opacity: 0.7 }]}
              onPress={() => { setWalkInName(''); setCustomer(undefined, undefined, undefined); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close" size={13} color="#dc2626" />
            </Pressable>
          </View>
        ) : (
          /* ── Walk-in input + picker button ── */
          <View style={cp.fieldRow}>
            <View style={[cp.fieldBox, { flex: 1 }]}>
              <Ionicons name="walk-outline" size={13} color={walkInName ? '#374151' : '#9ca3af'} />
              <TextInput
                style={[cp.fieldBoxText, { flex: 1 }, walkInName ? { color: '#111827', fontWeight: '600' as const } : undefined]}
                placeholder="Walk-in name (optional)"
                value={walkInName}
                onChangeText={setWalkInName}
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
              />
              {walkInName ? (
                <Pressable onPress={() => setWalkInName('')} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                  <Ionicons name="close-circle" size={14} color="#9ca3af" />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              style={({ pressed }) => [cp.selectorBtn, t.chromeBtn, pressed && { opacity: 0.85 }]}
              onPress={() => openCustPicker()}
            >
              <Ionicons name="people-outline" size={14} color="#C9A52A" />
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Waiter selector ── */}
      <View ref={waiterFieldRef} style={[cp.selectorSection, { borderBottomWidth: 1, borderBottomColor: t.colors.border }]}>
        <View style={cp.selectorLabelRow}>
          <Ionicons name="person-circle-outline" size={11} color="#9ca3af" />
          <Text style={cp.selectorLabel}>WAITER</Text>
        </View>
        {cart.waiter_id ? (
          <View style={cp.fieldRow}>
            <Pressable
              style={({ pressed }) => [cp.selectedPill, { flex: 1, borderColor: '#e9d5ff' }, pressed && { opacity: 0.85 }]}
              onPress={() => openWaiterPicker()}
            >
              <View style={[cp.selectedAvatar, { backgroundColor: '#7c3aed' }]}>
                <Text style={cp.selectedAvatarText}>{(cart.waiter_name ?? 'W').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cp.selectedName} numberOfLines={1}>{cart.waiter_name}</Text>
                <Text style={cp.selectedSub}>Waiter</Text>
              </View>
              <Ionicons name="swap-horizontal-outline" size={13} color="#6b7280" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [cp.clearBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setWaiter(undefined, undefined)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close" size={13} color="#dc2626" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [cp.fieldBox, pressed && { opacity: 0.85 }]}
            onPress={() => openWaiterPicker()}
          >
            <Ionicons name="person-circle-outline" size={14} color="#9ca3af" />
            <Text style={[cp.fieldBoxText, { flex: 1 }]}>Select waiter (optional)</Text>
            <Ionicons name="chevron-down" size={13} color="#9ca3af" />
          </Pressable>
        )}
      </View>

      {/* ── Table selector (searchable picker — scales to 50+ tables) ── */}
      {cart.order_type === 'dine_in' && tables.length > 0 && (
        <View ref={tableFieldRef} nativeID="pos-table-field" collapsable={false} style={[cp.selectorSection, { borderBottomWidth: 1, borderBottomColor: t.colors.border }]}>
          <View style={cp.selectorLabelRow}>
            <Ionicons name="grid-outline" size={11} color="#9ca3af" />
            <Text style={cp.selectorLabel}>TABLE</Text>
            <View style={cp.requiredDot}><Text style={[cp.requiredStar, { color: t.colors.danger }]}>*</Text></View>
          </View>
          {cart.table_id ? (
            <View style={cp.fieldRow}>
              <Pressable
                style={({ pressed }) => [cp.selectedPill, { flex: 1, borderColor: '#bfdbfe' }, pressed && { opacity: 0.85 }]}
                onPress={openTablePicker}
              >
                <View style={[cp.selectedAvatar, { backgroundColor: '#0D76E1' }]}>
                  <Ionicons name="grid-outline" size={14} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={cp.selectedName} numberOfLines={1}>
                    {tables.find(tb => tb.id === cart.table_id)?.name ?? `Table ${cart.table_id}`}
                  </Text>
                  <Text style={cp.selectedSub}>Dine-in table selected</Text>
                </View>
                <Ionicons name="swap-horizontal-outline" size={13} color="#6b7280" />
              </Pressable>
              <Pressable
                style={({ pressed }) => [cp.clearBtn, pressed && { opacity: 0.75 }]}
                onPress={() => { switchTable(undefined); syncLocalFromCart(); }}
              >
                <Ionicons name="close" size={13} color="#dc2626" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [cp.fieldBox, cp.tableEmpty, pressed && { opacity: 0.85 }]}
              onPress={openTablePicker}
            >
              <Ionicons name="grid-outline" size={14} color="#d97706" />
              <Text style={[cp.fieldBoxText, { flex: 1, color: '#d97706', fontWeight: '600' as const }]}>Select table...</Text>
              <View style={cp.tableRequiredBadge}><Text style={cp.tableRequiredText}>Required</Text></View>
              <Ionicons name="chevron-down" size={13} color="#d97706" />
            </Pressable>
          )}
        </View>
      )}

      {/* ── Ordered Menus header ── */}
      <View style={cp.orderedHeader}>
        <Text style={cp.orderedTitle}>Ordered Menus</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable style={cp.addCustomBtn} onPress={() => setShowCustomItem(true)}>
            <Ionicons name="add" size={13} color="#374151" />
            <Text style={cp.addCustomText}>Add custom item</Text>
          </Pressable>
          <Text style={cp.totalMenus}>Total Menus : {cart.items.length}</Text>
        </View>
      </View>

      {/* ── Cart items + summary + buttons (single scroll so Place Order is always reachable) ── */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Cart items */}
        {cart.items.length === 0 ? (
          <View style={cp.emptyCart}>
            <Ionicons name="cart-outline" size={32} color="#d1d5db" />
            <Text style={cp.emptyCartText}>Cart is empty</Text>
            <Text style={cp.emptyCartSub}>Tap items to add them</Text>
          </View>
        ) : cart.items.map(item => {
          // Items with no fixed price land in the cart at ₹0 — the rate
          // column becomes an inline input so the cashier can fill it in
          // right there instead of being blocked when adding the item.
          const needsPrice = !(item.unit_price > 0);
          // Live price: what user has typed (or stored price if not editing)
          const inputVal  = priceInputs[item.uuid] ?? (needsPrice ? '' : item.unit_price.toFixed(2));
          const livePrice = parseFloat(inputVal) || item.unit_price;
          const liveTotal = livePrice * item.quantity;
          return (
          <View key={item.uuid} style={[cp.cartItemBox, needsPrice && cp.cartItemBoxWarn]}>
            {/* Name + qty controls + remove */}
            <View style={cp.cartItemRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cp.cartName} numberOfLines={2}>{item.name}</Text>
                {item.variation && <Text style={cp.cartVar}>{item.variation}</Text>}
                {needsPrice && <Text style={cp.cartNeedsPriceBadge}>Enter price</Text>}
              </View>
              <View style={cp.qtyRow}>
                <Pressable style={cp.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity - 1)}>
                  <Ionicons name="remove" size={11} color="#374151" />
                </Pressable>
                <Text style={cp.qtyNum}>{item.quantity}</Text>
                <Pressable style={cp.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity + 1)}>
                  <Ionicons name="add" size={11} color="#374151" />
                </Pressable>
              </View>
              <Pressable style={cp.removeBtn} onPress={() => updateQuantity(item.uuid, 0)}>
                <Ionicons name="close" size={13} color="#6b7280" />
              </Pressable>
            </View>
            {/* Item Rate | Amount | Total */}
            <View style={cp.cartItemMeta}>
              <View style={cp.cartMetaCol}>
                <Text style={cp.cartMetaLabel}>Item Rate</Text>
                {/* Every line's rate is editable, not just ₹0 ones — lets the
                    cashier override any item's price per order. */}
                <TextInput
                  style={[cp.cartPriceInput, !needsPrice && cp.cartPriceInputSet]}
                  placeholder="Enter price"
                  placeholderTextColor="#d97706"
                  keyboardType="decimal-pad"
                  value={inputVal}
                  autoFocus={focusPriceUuid === item.uuid}
                  onFocus={() => { if (focusPriceUuid === item.uuid) setFocusPriceUuid(null); }}
                  onChangeText={(v) => {
                    // Allow only valid numeric input (digits + single decimal point)
                    if (/^\d*\.?\d*$/.test(v)) {
                      setPriceInputs(p => ({ ...p, [item.uuid]: v }));
                    }
                  }}
                  onEndEditing={() => {
                    const v = parseFloat(inputVal);
                    if (!isNaN(v) && v > 0) {
                      updateUnitPrice(item.uuid, v);
                      setPriceInputs(p => { const n = { ...p }; delete n[item.uuid]; return n; });
                    }
                  }}
                />
              </View>
              <View style={[cp.cartMetaCol, { alignItems: 'center' }]}>
                <Text style={cp.cartMetaLabel}>Amount</Text>
                <Text style={cp.cartMetaVal}>₹{liveTotal.toFixed(2)}</Text>
              </View>
              <View style={[cp.cartMetaCol, { alignItems: 'flex-end' }]}>
                <Text style={cp.cartMetaLabel}>Total</Text>
                <Text style={[cp.cartMetaVal, { fontWeight: '800', color: t.colors.heading }]}>₹{liveTotal.toFixed(2)}</Text>
              </View>
            </View>
          </View>
          );
        })}

      {/* ── Payment Summary ── */}
      <View style={cp.paymentSummary}>
        <Text style={cp.sectionTitle}>Payment Summary</Text>

        {/* Subtotal / Tax / Discount rows */}
        <View style={cp.sumRow}>
          <Text style={cp.sumLabel}>Sub Total</Text>
          <Text style={cp.sumVal}>₹{liveSubtotal.toFixed(2)}</Text>
        </View>
        <View style={cp.sumRow}>
          <Text style={cp.sumLabel}>Tax ({taxRate}%)</Text>
          <Text style={cp.sumVal}>₹{liveTaxAmount.toFixed(2)}</Text>
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
            <Pressable onPress={handleRemoveCoupon}>
              <Ionicons name="close-circle" size={15} color="#16a34a" />
            </Pressable>
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
            <Pressable
              style={[cp.couponApplyBtn, (!couponInput.trim() || couponLoading) && { opacity: 0.5 }]}
              onPress={handleApplyCoupon}
              disabled={couponLoading || !couponInput.trim()}
            >
              {couponLoading
                ? <ActivityIndicator size={11} color="#fff" />
                : <Text style={cp.couponApplyText}>Apply</Text>}
            </Pressable>
          </View>
        )}

        {/* Quick Discount % */}
        <View style={cp.divider} />
        <Text style={cp.quickDiscLabel}>Quick Discount %</Text>
        <View style={cp.quickDiscRow}>
          {[5, 10, 15, 20].map(pct => (
            <Pressable key={pct}
              style={[cp.quickDiscBtn, quickPct === pct && cp.quickDiscBtnActive]}
              onPress={() => handleQuickDiscount(pct)}>
              <Text style={[cp.quickDiscText, quickPct === pct && cp.quickDiscTextActive]}>{pct}%</Text>
            </Pressable>
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
          <Pressable style={[cp.customApplyBtn, t.chromeBtn]} onPress={handleCustomPctApply}>
            <Text style={cp.customApplyText}>Apply</Text>
          </Pressable>
          <Pressable style={cp.customClearBtn} onPress={handleDiscountClear}>
            <Text style={cp.customClearText}>Clear</Text>
          </Pressable>
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
          <Text style={cp.amountToPayVal}>₹{liveTotal.toFixed(2)}</Text>
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
          <Text style={[cp.changeDueVal, { color: received > 0 && change >= 0 ? t.colors.success : t.colors.danger }]}>
            ₹{received > 0 ? change.toFixed(2) : liveTotal.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* ── Payment Method ── */}
      <View style={cp.payMethodSection}>
        <Text style={cp.sectionTitle}>Payment Method</Text>
        <View style={cp.payRow}>
          {PAYMENT_METHODS.map(pm => (
            <Pressable key={pm.key}
              style={[cp.payBtn, paymentMethod === pm.key && t.chromeBtn, paymentMethod === pm.key && { borderColor: t.colors.sidebar }]}
              onPress={() => setPaymentMethod(pm.key)}>
              <Ionicons name={pm.icon} size={14} color={paymentMethod === pm.key ? '#fff' : '#374151'} />
              <Text style={[cp.payText, paymentMethod === pm.key && cp.payTextActive]}>{pm.label}</Text>
            </Pressable>
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
        <Pressable
          style={({ pressed }) => [cp.placeBtn, t.chromeBtn, (placing || cartCount === 0) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
          onPress={() => handlePlaceOrder(false)}
          disabled={placing || cartCount === 0}
        >
          {placing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={cp.placeBtnLabel}>{isOnline ? 'Place an Order' : 'Save Offline'}</Text>
          }
        </Pressable>

        {/* Print KOT */}
        <Pressable
          style={[cp.kotBtn, cartCount === 0 && { opacity: 0.4 }]}
          onPress={handleKOTPrint}
          disabled={cartCount === 0}
        >
          <Ionicons name="print-outline" size={15} color="#16a34a" />
          <Text style={cp.kotBtnText}>Print KOT</Text>
          {cart.kot_printed && <View style={cp.kotDot} />}
        </Pressable>

        {/* Row 1: Print | Invoice | Draft */}
        <View style={cp.btnRow3}>
          <Pressable style={cp.btn3} onPress={() => handlePlaceOrder(false, true)} disabled={placing || cartCount === 0}>
            <Ionicons name="print-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Print</Text>
          </Pressable>
          <Pressable style={cp.btn3} onPress={() => printOrderReceipt(lastOrderData ?? { ...cart, order_number: 'DRAFT', items: cart.items, total, table_name: tables.find(t => t.id === cart.table_id)?.name ?? null }, restaurant, taxRate)}>
            <Ionicons name="document-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Invoice</Text>
          </Pressable>
          <Pressable style={cp.btn3}
            onPress={() => handlePlaceOrder(true)}
            disabled={placing || cartCount === 0}>
            <Ionicons name="save-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Draft</Text>
          </Pressable>
        </View>

        {/* Row 2: × Cancel | Void | Transactions */}
        <View style={cp.btnRow3}>
          <Pressable style={[cp.btn3, cp.btn3Danger]}
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
          </Pressable>
          <Pressable style={cp.btn3}
            onPress={() => Alert.alert('Void', 'Void is available for placed orders in the Orders screen.')}>
            <Ionicons name="flash-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Void</Text>
          </Pressable>
          <Pressable style={cp.btn3}
            onPress={() => Alert.alert('Transactions', 'View all transactions in the Orders screen.')}>
            <Ionicons name="document-text-outline" size={14} color="#374151" />
            <Text style={cp.btn3Text}>Transactions</Text>
          </Pressable>
        </View>
      </View>
      </ScrollView>
    </View>
  );

  // ── Item card renderer ─────────────────────────────────────────────────────
  function renderItemCard({ item }: { item: Item | null }) {
    // Spacer — fills empty cells in the last row so cards don't stretch
    if (!item) return <View style={{ flex: 1 }} />;
    const qty    = getCartQty(item);
    const imgUrl = itemImageUrl(item.image);
    const ft     = item.food_type;
    const imgErr = imgErrors.has(item.id);
    return (
      <Pressable
        style={({ pressed }) => [ic.card, qty > 0 && ic.cardActive, !item.is_available && ic.cardUnavail, pressed && { opacity: 0.82 }]}
        onPress={() => item.is_available !== false && handleAdd(item)}
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
      </Pressable>
    );
  }

  // ── Modals ─────────────────────────────────────────────────────────────────

  // SweetAlert-style table-required warning — replaces Alert.alert (which is
  // silently suppressed by Electron/browsers in some contexts).
  const tableAlertModal = (
    <Modal visible={showTableAlert} transparent animationType="fade" onRequestClose={() => setShowTableAlert(false)}>
      <View style={tam.overlay}>
        <View style={tam.card}>
          <View style={tam.iconWrap}>
            <Ionicons name="warning" size={36} color="#f97316" />
          </View>
          <Text style={tam.title}>Table Selection Required</Text>
          <Text style={tam.msg}>Please select a table before adding items to the cart.</Text>
          <Pressable
            style={({ pressed }) => [tam.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={() => { setShowTableAlert(false); openTablePicker(); }}
          >
            <Ionicons name="grid-outline" size={16} color="#fff" />
            <Text style={tam.primaryBtnTxt}>Select Table</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [tam.ghostBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setShowTableAlert(false)}
          >
            <Text style={tam.ghostBtnTxt}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  const variationModal = (
    <Modal visible={!!variationItem} transparent animationType="fade" onRequestClose={() => setVariationItem(null)}>
      <View style={vm.overlay}>
        <View style={vm.sheet}>
          <View style={[vm.header, t.chrome]}>
            <View style={{ flex: 1 }}>
              <Text style={vm.title}>{variationItem?.name}</Text>
              <Text style={vm.sub}>Select a variation</Text>
            </View>
            <Pressable onPress={() => setVariationItem(null)} style={vm.closeBtn}>
              <Ionicons name="close" size={18} color="#6b7280" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
            {variationItem?.variations.map(v => (
              <Pressable
                key={v.id}
                style={vm.row}
                onPress={() => { addToCart(variationItem!, v); setVariationItem(null); }}
              >
                <View style={vm.dot} />
                <Text style={vm.varName}>{v.name}</Text>
                <Text style={vm.varPrice}>₹{v.price.toFixed(2)}</Text>
                <Ionicons name="add-circle" size={22} color="#0D76E1" />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const custPickerModal = (
    <Modal
      visible={showCustPicker}
      transparent
      animationType={Platform.OS !== 'web' ? 'slide' : 'fade'}
      onRequestClose={() => { setShowCustPicker(false); setCustSearch(''); }}
    >
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Platform.OS !== 'web' ? 'rgba(0,0,0,0.45)' : 'transparent' }}
        onPress={() => { setShowCustPicker(false); setCustSearch(''); }}
      />
      <View style={Platform.OS !== 'web'
        ? { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '85%', backgroundColor: t.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, elevation: 24 }
        : [cpm.dropPanel, { top: custDropPos.top, left: custDropPos.left, width: custDropPos.width }]}>
        {/* Compact header */}
        <View style={cpm.dropHeader}>
          <Ionicons name="person-outline" size={13} color="#C9A52A" />
          <Text style={[cpm.title, { fontSize: 13, flex: 1 }]}>Select Customer</Text>
          <Pressable
            style={({ pressed }) => [cpm.closeBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { setShowCustPicker(false); setCustSearch(''); }}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </View>
        {/* Search */}
        <View style={cpm.search}>
          <Ionicons name="search" size={14} color="#1A2B1A" />
          <TextInput
            style={cpm.searchInput}
            placeholder="Search by name or phone..."
            value={custSearch}
            onChangeText={setCustSearch}
            placeholderTextColor="#9ca3af"
            autoFocus
          />
          {custSearch ? (
            <Pressable onPress={() => setCustSearch('')}>
              <Ionicons name="close-circle" size={14} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
        {/* Walk-in section */}
        <View style={[cpm.walkInSection, { marginHorizontal: 8, marginBottom: 6 }]}>
          <Text style={cpm.walkInLabel}>Walk-in Name (optional)</Text>
          <View style={cpm.walkInRow}>
            <TextInput
              style={[cpm.walkInInput, { fontSize: 13 }]}
              placeholder="Enter name for this order..."
              value={walkInName}
              onChangeText={setWalkInName}
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              onSubmitEditing={() => { setCustomer(undefined, undefined, undefined); setShowCustPicker(false); setCustSearch(''); }}
            />
            {walkInName ? (
              <Pressable
                style={cpm.walkInConfirm}
                onPress={() => { setCustomer(undefined, undefined, undefined); setShowCustPicker(false); setCustSearch(''); }}
              >
                <Ionicons name="checkmark" size={14} color="#fff" />
                <Text style={cpm.walkInConfirmText}>Use</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[cpm.walkInConfirm, { backgroundColor: '#6b7280' }]}
                onPress={() => { setWalkInName(''); setCustomer(undefined, undefined, undefined); setShowCustPicker(false); setCustSearch(''); }}
              >
                <Ionicons name="person-outline" size={13} color="#fff" />
                <Text style={cpm.walkInConfirmText}>Walk-in</Text>
              </Pressable>
            )}
          </View>
        </View>
        {/* Divider */}
        {customers.length > 0 && (
          <View style={[cpm.dividerRow, { marginHorizontal: 8, marginBottom: 2 }]}>
            <View style={cpm.dividerLine} />
            <Text style={cpm.dividerText}>existing customers</Text>
            <View style={cpm.dividerLine} />
          </View>
        )}
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 280 }}>
          {filteredCustomers.map(c => (
            <Pressable
              key={String(c.id)}
              style={({ pressed }) => [cpm.row, cart.customer_id === c.id && cpm.rowSelected, pressed && { backgroundColor: '#f0f4ff' }]}
              onPress={() => { setCustomer(c.id as number, c.name, c.phone); setWalkInName(''); setShowCustPicker(false); setCustSearch(''); }}
            >
              <View style={[cpm.avatar, { width: 34, height: 34, borderRadius: 17 }]}>
                <Text style={[cpm.avatarText, { fontSize: 14 }]}>{c.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[cpm.name, { fontSize: 13.5 }]}>{c.name}</Text>
                <Text style={[cpm.phone, { fontSize: 11.5 }]}>{c.phone || 'No phone'}</Text>
              </View>
              {cart.customer_id === c.id
                ? <Ionicons name="checkmark-circle" size={19} color="#0D76E1" />
                : <Ionicons name="chevron-forward" size={14} color="#d1d5db" />}
            </Pressable>
          ))}
          {filteredCustomers.length === 0 && custSearch.length > 0 && (
            <View style={[cpm.emptyState, { paddingTop: 20 }]}>
              <Ionicons name="person-add-outline" size={28} color="#d1d5db" />
              <Text style={cpm.emptyTitle}>No customers found</Text>
              <Pressable
                style={[cpm.useBtn, { marginTop: 8 }]}
                onPress={() => { setWalkInName(custSearch); setCustomer(undefined, undefined, undefined); setShowCustPicker(false); setCustSearch(''); }}
              >
                <Ionicons name="add-circle-outline" size={14} color="#fff" />
                <Text style={cpm.useBtnText}>Use "{custSearch}" as walk-in</Text>
              </Pressable>
            </View>
          )}
          {filteredCustomers.length === 0 && !custSearch && customers.length === 0 && (
            <View style={[cpm.emptyState, { paddingTop: 20 }]}>
              <Ionicons name="people-outline" size={28} color="#d1d5db" />
              <Text style={cpm.emptyTitle}>No customers yet</Text>
              <Text style={cpm.emptyText}>Add in the Customers module</Text>
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
    <Modal
      visible={showWaiterPicker}
      transparent
      animationType={Platform.OS !== 'web' ? 'slide' : 'fade'}
      onRequestClose={() => { setShowWaiterPicker(false); setWaiterSearch(''); }}
    >
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Platform.OS !== 'web' ? 'rgba(0,0,0,0.45)' : 'transparent' }}
        onPress={() => { setShowWaiterPicker(false); setWaiterSearch(''); }}
      />
      <View style={Platform.OS !== 'web'
        ? { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '80%', backgroundColor: t.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, elevation: 24 }
        : [cpm.dropPanel, { top: waiterDropPos.top, left: waiterDropPos.left, width: waiterDropPos.width }]}>
        {/* Compact header */}
        <View style={cpm.dropHeader}>
          <Ionicons name="person-circle-outline" size={13} color="#C9A52A" />
          <Text style={[cpm.title, { fontSize: 13, flex: 1 }]}>Select Waiter</Text>
          <Pressable
            style={({ pressed }) => [cpm.closeBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { setShowWaiterPicker(false); setWaiterSearch(''); }}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </View>
        {/* Search */}
        <View style={cpm.search}>
          <Ionicons name="search" size={14} color="#1A2B1A" />
          <TextInput
            style={cpm.searchInput}
            placeholder="Search staff..."
            value={waiterSearch}
            onChangeText={setWaiterSearch}
            placeholderTextColor="#9ca3af"
            autoFocus
          />
          {waiterSearch ? (
            <Pressable onPress={() => setWaiterSearch('')}>
              <Ionicons name="close-circle" size={14} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
          {/* No waiter option */}
          <Pressable
            style={({ pressed }) => [cpm.row, !cart.waiter_id && cpm.rowSelected, pressed && { backgroundColor: '#f5f6f8' }]}
            onPress={() => { setWaiter(undefined, undefined); setShowWaiterPicker(false); setWaiterSearch(''); }}
          >
            <View style={[cpm.avatar, { width: 34, height: 34, borderRadius: 17, backgroundColor: '#6b7280' }]}>
              <Ionicons name="person-outline" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[cpm.name, { fontSize: 13.5 }]}>No Waiter</Text>
              <Text style={[cpm.phone, { fontSize: 11.5 }]}>Remove assignment</Text>
            </View>
            {!cart.waiter_id && <Ionicons name="checkmark-circle" size={19} color="#10b981" />}
          </Pressable>
          {filteredStaff.map(s => (
            <Pressable
              key={s.id}
              style={({ pressed }) => [cpm.row, cart.waiter_id === s.id && cpm.rowSelected, pressed && { backgroundColor: '#f5f0ff' }]}
              onPress={() => { setWaiter(s.id, s.name); setShowWaiterPicker(false); setWaiterSearch(''); }}
            >
              <View style={[cpm.avatar, { width: 34, height: 34, borderRadius: 17, backgroundColor: '#7c3aed' }]}>
                <Text style={[cpm.avatarText, { fontSize: 14 }]}>{s.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[cpm.name, { fontSize: 13.5 }]}>{s.name}</Text>
                <Text style={[cpm.phone, { fontSize: 11.5 }]}>{s.role}</Text>
              </View>
              {cart.waiter_id === s.id
                ? <Ionicons name="checkmark-circle" size={19} color="#7c3aed" />
                : <Ionicons name="chevron-forward" size={14} color="#d1d5db" />}
            </Pressable>
          ))}
          {filteredStaff.length === 0 && (
            <View style={[cpm.emptyState, { paddingTop: 20 }]}>
              <Ionicons name="people-outline" size={28} color="#d1d5db" />
              <Text style={cpm.emptyTitle}>{waiterSearch ? 'No staff found' : 'No staff members'}</Text>
              <Text style={cpm.emptyText}>Add staff in More → Staff or Settings → Staff</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Table picker modal ────────────────────────────────────────────────────
  const filteredTables = tables.filter(tb =>
    !tableSearch || tb.name.toLowerCase().includes(tableSearch.toLowerCase())
  );
  const tablePickerModal = (
    <Modal
      visible={showTablePicker}
      transparent
      animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
      onRequestClose={() => { setShowTablePicker(false); setTableSearch(''); }}
    >
      {/* Tap-outside backdrop */}
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
        onPress={() => { setShowTablePicker(false); setTableSearch(''); }}
      />
      {/* On web: anchored dropdown. On mobile: centered bottom sheet */}
      <View style={Platform.OS === 'web'
        ? [cpm.dropPanel, { top: tableDropPos.top, left: tableDropPos.left, width: tableDropPos.width }]
        : { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: t.colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '80%', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 24 }
      }>
        {/* Compact header */}
        <View style={cpm.dropHeader}>
          <Ionicons name="grid-outline" size={13} color="#C9A52A" />
          <View style={{ flex: 1 }}>
            <Text style={[cpm.title, { fontSize: 13 }]}>Select Table</Text>
          </View>
          {Object.keys(tableCartMap).length > 0 && (
            <View style={[cpm.pendingBadge, { marginRight: 6 }]}>
              <Text style={cpm.pendingBadgeText}>{Object.keys(tableCartMap).length}</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [cpm.closeBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { setShowTablePicker(false); setTableSearch(''); }}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </View>
        {/* Search */}
        <View style={cpm.search}>
          <Ionicons name="search" size={14} color="#1A2B1A" />
          <TextInput
            style={cpm.searchInput}
            placeholder={`Search ${tables.length} tables...`}
            value={tableSearch}
            onChangeText={setTableSearch}
            placeholderTextColor="#9ca3af"
            autoFocus
          />
          {tableSearch ? (
            <Pressable onPress={() => setTableSearch('')}>
              <Ionicons name="close-circle" size={14} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
        {/* Pending-items legend */}
        {Object.keys(tableCartMap).length > 0 && (
          <View style={[cpm.legendRow, { paddingVertical: 5 }]}>
            <View style={cpm.legendDot} />
            <Text style={[cpm.legendText, { fontSize: 11 }]}>Amber = pending items</Text>
          </View>
        )}
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
          {/* No table option */}
          <Pressable
            style={({ pressed }) => [cpm.row, !cart.table_id && cpm.rowSelected, pressed && { backgroundColor: '#f5f6f8' }]}
            onPress={() => { switchTable(undefined); syncLocalFromCart(); setShowTablePicker(false); setTableSearch(''); }}
          >
            <View style={[cpm.avatar, { width: 34, height: 34, borderRadius: 17, backgroundColor: '#6b7280' }]}>
              <Ionicons name="walk-outline" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[cpm.name, { fontSize: 13.5 }]}>No Table</Text>
              <Text style={[cpm.phone, { fontSize: 11.5 }]}>Walk-in / Takeaway</Text>
            </View>
            {!cart.table_id && <Ionicons name="checkmark-circle" size={19} color="#0D76E1" />}
          </Pressable>
          {filteredTables.map(tb => {
            const isActive   = cart.table_id === tb.id;
            const hasPending = !!tableCartMap[tb.id] && tableCartMap[tb.id].items.length > 0;
            const pendingQty = hasPending
              ? tableCartMap[tb.id].items.reduce((s, i) => s + i.quantity, 0)
              : 0;
            return (
              <Pressable
                key={tb.id}
                style={({ pressed }) => [cpm.row, isActive && cpm.rowSelected, pressed && { backgroundColor: '#eff6ff' }]}
                onPress={() => { switchTable(tb.id); syncLocalFromCart(); setShowTablePicker(false); setTableSearch(''); }}
              >
                <View style={[cpm.avatar, { width: 34, height: 34, borderRadius: 17, backgroundColor: isActive ? '#0D76E1' : hasPending ? '#f59e0b' : '#e5e7eb' }]}>
                  <Text style={[cpm.avatarText, { fontSize: 14, color: isActive || hasPending ? '#fff' : '#374151' }]}>
                    {tb.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[cpm.name, { fontSize: 13.5 }]}>{tb.name}</Text>
                  <Text style={[cpm.phone, { fontSize: 11.5 }]}>
                    {hasPending
                      ? `${pendingQty} item${pendingQty > 1 ? 's' : ''} pending`
                      : (tb as any).capacity
                        ? `Capacity: ${(tb as any).capacity}`
                        : 'Available'}
                  </Text>
                </View>
                {hasPending && !isActive && (
                  <View style={cpm.pendingBadge}>
                    <Text style={cpm.pendingBadgeText}>{pendingQty}</Text>
                  </View>
                )}
                {isActive
                  ? <Ionicons name="checkmark-circle" size={19} color="#0D76E1" />
                  : <Ionicons name="chevron-forward" size={14} color="#d1d5db" />}
              </Pressable>
            );
          })}
          {filteredTables.length === 0 && tableSearch.length > 0 && (
            <View style={[cpm.emptyState, { paddingTop: 24 }]}>
              <Ionicons name="search-outline" size={28} color="#d1d5db" />
              <Text style={cpm.emptyTitle}>No match for "{tableSearch}"</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Custom item modal ──────────────────────────────────────────────────────
  const customItemModal = (
    <Modal visible={showCustomItem} transparent animationType="fade" onRequestClose={() => setShowCustomItem(false)}>
      <View style={vm.overlay}>
        <View style={vm.sheet}>
          <View style={[vm.header, t.chrome]}>
            <View style={{ flex: 1 }}>
              <Text style={vm.title}>Add Custom Item</Text>
              <Text style={vm.sub}>Enter item details manually</Text>
            </View>
            <Pressable onPress={() => setShowCustomItem(false)} style={vm.closeBtn}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
          <View style={{ padding: 16, gap: 10 }}>
            <View style={[cp.extraInput, { borderRadius: 10, padding: 10, borderWidth: 1, borderColor: t.colors.border }]}>
              <Ionicons name="text-outline" size={14} color={t.colors.textMuted} />
              <TextInput style={[cp.extraInputText, { flex: 1 }]} placeholder="Item name *" value={customItemName} onChangeText={setCustomItemName} placeholderTextColor={t.colors.textMuted} autoFocus />
            </View>
            <View style={cp.extraRow}>
              <View style={[cp.extraInput, { flex: 1, marginRight: 8, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: t.colors.border }]}>
                <Ionicons name="cash-outline" size={14} color={t.colors.textMuted} />
                <TextInput style={[cp.extraInputText, { flex: 1 }]} placeholder="Price (₹) *" value={customItemPrice} onChangeText={setCustomItemPrice} keyboardType="decimal-pad" placeholderTextColor={t.colors.textMuted} />
              </View>
              <View style={[cp.extraInput, { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: t.colors.border }]}>
                <Ionicons name="layers-outline" size={14} color={t.colors.textMuted} />
                <TextInput style={[cp.extraInputText, { flex: 1 }]} placeholder="Qty" value={customItemQty} onChangeText={setCustomItemQty} keyboardType="number-pad" placeholderTextColor={t.colors.textMuted} />
              </View>
            </View>
            <Pressable style={[cp.placeBtn, t.chromeBtn, { paddingVertical: 14 }]} onPress={handleAddCustomItem}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <View style={{ marginLeft: 8 }}>
                <Text style={cp.placeBtnLabel}>Add to Order</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ── Desktop (3-col) layout ─────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={[sh.shell, t.shell]}>
        {tableAlertModal}
        {successModal}
        {variationModal}
        {custPickerModal}
        {waiterPickerModal}
        {tablePickerModal}
        {customItemModal}

        {/* Top header bar */}
        <View style={sh.posHeader}>
          <Pressable style={sh.posBackBtn} onPress={() => router.replace('/(app)/dashboard')}>
            <Ionicons name="arrow-back" size={15} color={t.colors.text} />
            <Text style={sh.posBackText}>Dashboard</Text>
          </Pressable>
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
                <Pressable
                  key={String(c.id ?? 'all')}
                  style={({ pressed }) => [sh.railItem, active && sh.railItemActive, pressed && { opacity: 0.75 }]}
                  onPress={() => setActiveCatId(c.id)}
                >
                  {active && <View style={sh.railActiveBar} />}
                  <View style={[sh.railIcon, active && sh.railIconActive]}>
                    <Ionicons name={c.id === null ? 'grid-outline' : 'pricetag-outline'} size={13} color={active ? '#0D76E1' : '#9ca3af'} />
                  </View>
                  <Text style={[sh.railLabel, active && sh.railLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Column 2: Item grid */}
        <View style={sh.grid}>
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
              {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={15} color="#9ca3af" /></Pressable> : null}
            </View>
            <View style={sh.foodFilters}>
              {(['veg', 'non_veg', 'egg'] as const).map(ft => (
                <Pressable
                  key={ft}
                  style={[sh.foodChip, foodFilter[ft] && sh.foodChipActive]}
                  onPress={() => setFoodFilter(p => ({ ...p, [ft]: !p[ft] }))}
                >
                  <View style={[sh.foodDot, { backgroundColor: FOOD_COLORS[ft] }]} />
                  <Text style={[sh.foodChipText, foodFilter[ft] && sh.foodChipTextActive]}>
                    {ft === 'veg' ? 'Veg' : ft === 'non_veg' ? 'Non-Veg' : 'Egg'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={sh.itemCountText}>{displayItems.length} items</Text>

          <FlatList
            data={(() => {
              const rem = displayItems.length % cols;
              if (rem === 0) return displayItems as (Item | null)[];
              return [...displayItems, ...Array(cols - rem).fill(null)] as (Item | null)[];
            })()}
            keyExtractor={(i, idx) => i ? String(i.id) : `__sp${idx}`}
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
          <View style={[sh.cartHeader, t.chrome]}>
            <Ionicons name="receipt-outline" size={16} color="#C9A52A" />
            <Text style={sh.cartHeaderTitle}>Current Order</Text>
            {cartCount > 0 && (
              <View style={sh.cartBadge}>
                <Text style={[sh.cartBadgeText, { color: t.colors.brandDark }]}>{cartCount}</Text>
              </View>
            )}
          </View>
          {cartPanel}
        </View>
        </View>{/* end sh.cols */}
      </View>
    );
  }

  // ── Mobile cart content (Android-optimised, replaces cartPanel in mobile modal) ─
  const mobileCartContent = (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>

      {/* Scrollable body — starts immediately below the sticky header */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Items header */}
        <View style={mc.itemsHeader}>
          <Text style={mc.itemsHeaderTitle}>Items ({cart.items.length})</Text>
          <Pressable style={mc.addCustomMiniBtn} onPress={() => setShowCustomItem(true)}>
            <Ionicons name="add" size={13} color={t.colors.text} />
            <Text style={mc.addCustomMiniText}>Custom</Text>
          </Pressable>
        </View>

        {cart.items.length === 0 ? (
          <View style={mc.emptyCart}>
            <Ionicons name="cart-outline" size={40} color="#d1d5db" />
            <Text style={mc.emptyCartText}>Cart is empty</Text>
            <Text style={mc.emptyCartSub}>Go back and tap items to add</Text>
          </View>
        ) : cart.items.map(item => {
          const needsPrice = !(item.unit_price > 0);
          const inputVal   = priceInputs[item.uuid] ?? (needsPrice ? '' : item.unit_price.toFixed(2));
          const livePrice  = parseFloat(inputVal) || item.unit_price;
          const itemTotal  = livePrice * item.quantity;
          return (
            <View key={item.uuid} style={[mc.cartItem, needsPrice && mc.cartItemWarn]}>
              <View style={mc.cartItemTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={mc.cartItemName} numberOfLines={1}>{item.name}</Text>
                  {item.variation && <Text style={mc.cartItemVar}>{item.variation}</Text>}
                </View>
                <View style={mc.qtyControl}>
                  <Pressable style={mc.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity - 1)}>
                    <Ionicons name="remove" size={12} color="#374151" />
                  </Pressable>
                  <Text style={mc.qtyText}>{item.quantity}</Text>
                  <Pressable style={mc.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity + 1)}>
                    <Ionicons name="add" size={12} color="#374151" />
                  </Pressable>
                </View>
                <Text style={mc.cartItemTotal}>₹{itemTotal.toFixed(0)}</Text>
                <Pressable style={mc.removeBtn} onPress={() => updateQuantity(item.uuid, 0)}>
                  <Ionicons name="close" size={14} color="#9ca3af" />
                </Pressable>
              </View>
              {needsPrice && (
                <View style={mc.priceInputRow}>
                  <Ionicons name="warning-outline" size={12} color="#d97706" />
                  <TextInput
                    style={mc.priceInput}
                    placeholder="Enter price ₹"
                    placeholderTextColor="#d97706"
                    keyboardType="decimal-pad"
                    value={inputVal}
                    onChangeText={(v) => { if (/^\d*\.?\d*$/.test(v)) setPriceInputs(p => ({ ...p, [item.uuid]: v })); }}
                    onEndEditing={() => {
                      const v = parseFloat(inputVal);
                      if (!isNaN(v) && v > 0) {
                        updateUnitPrice(item.uuid, v);
                        setPriceInputs(p => { const n = { ...p }; delete n[item.uuid]; return n; });
                      }
                    }}
                  />
                </View>
              )}
            </View>
          );
        })}

        {/* Payment method */}
        {cart.items.length > 0 && (
          <View style={mc.section}>
            <Text style={mc.sectionLabel}>Payment Method</Text>
            <View style={mc.payRow}>
              {PAYMENT_METHODS.map(pm => (
                <Pressable key={pm.key}
                  style={[mc.payBtn, paymentMethod === pm.key && mc.payBtnActive]}
                  onPress={() => setPaymentMethod(pm.key)}
                >
                  <Ionicons name={pm.icon} size={14} color={paymentMethod === pm.key ? '#fff' : '#6b7280'} />
                  <Text style={[mc.payBtnText, paymentMethod === pm.key && mc.payBtnTextActive]}>{pm.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Condensed payment summary */}
        {cart.items.length > 0 && (
          <View style={mc.summarySection}>
            <View style={mc.summaryRow}>
              <Text style={mc.summaryLabel}>Subtotal</Text>
              <Text style={mc.summaryVal}>₹{liveSubtotal.toFixed(2)}</Text>
            </View>
            {taxRate > 0 && (
              <View style={mc.summaryRow}>
                <Text style={mc.summaryLabel}>Tax ({taxRate}%)</Text>
                <Text style={mc.summaryVal}>₹{liveTaxAmount.toFixed(2)}</Text>
              </View>
            )}
            {(cart.discount_amount ?? 0) > 0 && (
              <View style={mc.summaryRow}>
                <Text style={mc.summaryLabel}>Discount</Text>
                <Text style={[mc.summaryVal, { color: '#16a34a' }]}>-₹{(cart.discount_amount ?? 0).toFixed(2)}</Text>
              </View>
            )}
            {(cart.coupon_discount ?? 0) > 0 && (
              <View style={mc.summaryRow}>
                <Text style={mc.summaryLabel}>Coupon ({cart.coupon_code})</Text>
                <Text style={[mc.summaryVal, { color: '#16a34a' }]}>-₹{(cart.coupon_discount ?? 0).toFixed(2)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Coupon & Discount accordion */}
        {cart.items.length > 0 && (
          <Pressable style={mc.accordionHeader} onPress={() => setShowDiscountSection(v => !v)}>
            <Ionicons name={showDiscountSection ? 'chevron-up' : 'chevron-down'} size={14} color={t.colors.textMuted} />
            <Text style={mc.accordionLabel}>
              {showDiscountSection ? 'Hide' : 'Add'} Coupon & Discount
              {(discount > 0 || (cart.coupon_discount ?? 0) > 0) ? '  ✓' : ''}
            </Text>
          </Pressable>
        )}
        {showDiscountSection && (
          <View style={mc.accordionBody}>
            {cart.coupon_code ? (
              <View style={mc.couponActive}>
                <Ionicons name="ticket-outline" size={13} color="#16a34a" />
                <Text style={mc.couponActiveText}>{cart.coupon_code} (-₹{(cart.coupon_discount ?? 0).toFixed(2)})</Text>
                <Pressable onPress={handleRemoveCoupon}><Ionicons name="close-circle" size={15} color="#16a34a" /></Pressable>
              </View>
            ) : (
              <View style={mc.couponRow}>
                <View style={mc.couponInput}>
                  <TextInput style={mc.couponInputText} placeholder="Coupon code" value={couponInput} onChangeText={setCouponInput} autoCapitalize="characters" placeholderTextColor="#9ca3af" />
                </View>
                <Pressable style={[mc.couponApplyBtn, (!couponInput.trim() || couponLoading) && { opacity: 0.5 }]} onPress={handleApplyCoupon} disabled={couponLoading || !couponInput.trim()}>
                  {couponLoading ? <ActivityIndicator size={11} color="#fff" /> : <Text style={mc.couponApplyText}>Apply</Text>}
                </Pressable>
              </View>
            )}
            <Text style={mc.discLabel}>Quick Discount</Text>
            <View style={mc.quickDiscRow}>
              {[5, 10, 15, 20].map(pct => (
                <Pressable key={pct} style={[mc.quickDiscBtn, quickPct === pct && mc.quickDiscBtnActive]} onPress={() => handleQuickDiscount(pct)}>
                  <Text style={[mc.quickDiscText, quickPct === pct && mc.quickDiscTextActive]}>{pct}%</Text>
                </Pressable>
              ))}
            </View>
            <View style={mc.discInputRow}>
              <View style={mc.discInputBox}>
                <TextInput style={mc.discInputText} placeholder="Custom %" value={customPctInput} onChangeText={setCustomPctInput} keyboardType="decimal-pad" placeholderTextColor="#9ca3af" />
                <Text style={mc.discInputSuffix}>%</Text>
              </View>
              <Pressable style={[mc.discApplyBtn, t.chromeBtn]} onPress={handleCustomPctApply}>
                <Text style={mc.discApplyText}>Apply</Text>
              </Pressable>
              <Pressable style={mc.discClearBtn} onPress={handleDiscountClear}>
                <Text style={mc.discClearText}>Clear</Text>
              </Pressable>
            </View>
            <View style={mc.discInputRow}>
              <Text style={[mc.discLabel, { flex: 1 }]}>Discount (₹)</Text>
              <View style={[mc.discInputBox, { flex: 0, minWidth: 90 }]}>
                <TextInput
                  style={[mc.discInputText, { textAlign: 'right' }]}
                  value={discountInput}
                  onChangeText={v => { setDiscountInput(v); setQuickPct(null); setCustomPctInput(''); }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>
          </View>
        )}

        {/* Cash received + change */}
        {cart.items.length > 0 && (
          <View style={mc.receivedSection}>
            <Text style={mc.sectionLabel}>Cash Received</Text>
            <View style={mc.receivedInput}>
              <Text style={mc.receivedPrefix}>₹</Text>
              <TextInput style={mc.receivedText} placeholder="0.00" value={receivedInput} onChangeText={setReceivedInput} keyboardType="decimal-pad" placeholderTextColor="#9ca3af" />
            </View>
            {received > 0 && (
              <Text style={[mc.changeText, { color: change >= 0 ? '#16a34a' : '#dc2626' }]}>
                {change >= 0 ? `Change: ₹${change.toFixed(2)}` : `Balance due: ₹${(liveTotal - received).toFixed(2)}`}
              </Text>
            )}
          </View>
        )}

        {/* Kitchen notes */}
        <View style={mc.notesSection}>
          <Text style={mc.sectionLabel}>Kitchen Notes</Text>
          <TextInput
            style={mc.notesInput}
            placeholder="E.g. less spicy, no onion, allergies..."
            value={notesInput}
            onChangeText={setNotesInput}
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
        </View>

        {/* Draft + Cancel row */}
        {cart.items.length > 0 && (
          <View style={mc.secondaryBtnRow}>
            <Pressable style={mc.draftBtn} onPress={() => handlePlaceOrder(true)} disabled={placing || cartCount === 0}>
              <Ionicons name="save-outline" size={14} color={t.colors.textMuted} />
              <Text style={mc.draftBtnText}>Save Draft</Text>
            </Pressable>
            <Pressable style={mc.cancelOrderBtn} onPress={() => {
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
              <Text style={mc.cancelOrderBtnText}>Cancel Order</Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={[mc.stickyBottom, { paddingBottom: insets.bottom + 8 }]}>
        <View style={mc.stickyTotalRow}>
          <Text style={mc.stickyTotalLabel}>Amount to Pay</Text>
          <Text style={mc.stickyTotalVal}>₹{liveTotal.toFixed(2)}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [mc.placeOrderBtn, t.chromeBtn, (placing || cartCount === 0) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
          onPress={() => handlePlaceOrder(false)}
          disabled={placing || cartCount === 0}
        >
          {placing
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Text style={mc.placeOrderBtnText}>{isOnline ? 'Place Order' : 'Save Offline'}</Text>
                <Ionicons name="arrow-forward" size={16} color="#C9A52A" />
              </>
          }
        </Pressable>
      </View>
    </View>
  );

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <View style={[mb.shell, t.shell]}>
      {tableAlertModal}
      {successModal}
      {variationModal}
      {custPickerModal}
      {waiterPickerModal}
      {tablePickerModal}
      {customItemModal}

      {/* Top bar */}
      <View style={[mb.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable style={mb.backBtn} onPress={() => router.replace('/(app)/dashboard')}>
          <Ionicons name="arrow-back" size={18} color={t.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={mb.topTitle}>Point of Sale</Text>
          {categories.length > 0 && (
            <Text style={mb.topSub}>{displayItems.length} items</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemeToggle variant="header" size={16} />
          <SyncStatusDot />
        </View>
      </View>

      {/* Search bar */}
      <View style={mb.searchRow}>
        <Ionicons name="search" size={15} color="#9ca3af" />
        <TextInput
          style={mb.searchInput}
          placeholder="Search items..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#9ca3af"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </Pressable>
        )}
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={mb.catBar}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, alignItems: 'center' }}
      >
        {[{ id: null as null, name: 'All' }, ...categories.map(c => ({ id: c.id, name: c.name }))].map(c => (
          <Pressable
            key={String(c.id ?? 'all')}
            style={[mb.catChip, activeCatId === c.id && mb.catChipActive]}
            onPress={() => setActiveCatId(c.id)}
          >
            <Text style={[mb.catChipText, activeCatId === c.id && mb.catChipTextActive]}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

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
        <Pressable style={[mb.fab, t.chromeBtn]} onPress={() => setShowCart(true)}>
          <Ionicons name="cart" size={20} color="#fff" />
          <View style={mb.fabBadge}><Text style={[mb.fabBadgeText, { color: t.colors.brandDark }]}>{cartCount}</Text></View>
          <Text style={mb.fabTotal}>₹{total.toFixed(2)}</Text>
          <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' }} />
        </Pressable>
      )}

      <Modal visible={showCart} animationType="slide" onRequestClose={() => setShowCart(false)}>
        <View style={{ flex: 1, flexDirection: 'column', backgroundColor: t.colors.surface }}>

          {/* ── STICKY HEADER (never scrolls) ── */}
          <View style={[t.chrome, { paddingTop: insets.top, elevation: 8, zIndex: 100 }]}>

            {/* Drag handle */}
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>

            {/* Row 1: close btn | title + item count | total */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 12 }}>
              <Pressable
                onPress={() => setShowCart(false)}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-down" size={20} color="#fff" />
              </Pressable>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.3 }}>New Order</Text>
                <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                  {cartCount > 0 ? `${cartCount} item${cartCount !== 1 ? 's' : ''} in cart` : 'No items yet'}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.7, textTransform: 'uppercase' }}>Total</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#C9A52A' }}>₹{liveTotal.toFixed(0)}</Text>
              </View>
            </View>

            {/* Row 2: order type switcher pills */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
              {ORDER_TYPES.map(ot => {
                const active = cart.order_type === ot.key;
                return (
                  <Pressable
                    key={ot.key}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 22, borderWidth: 1, backgroundColor: active ? '#C9A52A' : 'rgba(255,255,255,0.08)', borderColor: active ? '#C9A52A' : 'rgba(255,255,255,0.18)' }}
                    onPress={() => setOrderType(ot.key as any)}
                  >
                    <Ionicons name={ot.icon} size={12} color={active ? '#1A2B1A' : 'rgba(255,255,255,0.65)'} />
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: active ? '#1A2B1A' : 'rgba(255,255,255,0.65)' }}>{ot.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Row 3: context chips — table / waiter / customer */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 14, gap: 6 }}>
              {/* Table chip (dine-in only) */}
              {cart.order_type === 'dine_in' && (
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: cart.table_id ? 'rgba(13,118,225,0.25)' : 'rgba(253,230,138,0.12)', borderColor: cart.table_id ? 'rgba(147,197,253,0.45)' : 'rgba(253,230,138,0.45)' }}
                  onPress={openTablePicker}
                >
                  <Ionicons name="grid-outline" size={12} color={cart.table_id ? '#93c5fd' : '#fde68a'} />
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: cart.table_id ? '#93c5fd' : '#fde68a' }}>
                    {cart.table_id ? (tables.find(tb => tb.id === cart.table_id)?.name ?? 'Table') : 'Select Table *'}
                  </Text>
                  {!!cart.table_id && (
                    <Pressable hitSlop={10} onPress={() => { switchTable(undefined); syncLocalFromCart(); }}>
                      <Ionicons name="close-circle" size={14} color="#93c5fd" />
                    </Pressable>
                  )}
                </Pressable>
              )}

              {/* Waiter chip */}
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: cart.waiter_id ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.07)', borderColor: cart.waiter_id ? 'rgba(196,181,253,0.45)' : 'rgba(255,255,255,0.18)' }}
                onPress={() => openWaiterPicker()}
              >
                <Ionicons name="person-circle-outline" size={12} color={cart.waiter_id ? '#c4b5fd' : 'rgba(255,255,255,0.5)'} />
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: cart.waiter_id ? '#c4b5fd' : 'rgba(255,255,255,0.5)' }} numberOfLines={1}>
                  {cart.waiter_id ? cart.waiter_name : 'Waiter'}
                </Text>
                {!!cart.waiter_id && (
                  <Pressable hitSlop={10} onPress={() => setWaiter(undefined, undefined)}>
                    <Ionicons name="close-circle" size={14} color="#c4b5fd" />
                  </Pressable>
                )}
              </Pressable>

              {/* Customer chip */}
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: cart.customer_id ? 'rgba(201,165,42,0.2)' : 'rgba(255,255,255,0.07)', borderColor: cart.customer_id ? 'rgba(201,165,42,0.45)' : 'rgba(255,255,255,0.18)' }}
                onPress={() => openCustPicker()}
              >
                <Ionicons name="person-outline" size={12} color={cart.customer_id ? '#C9A52A' : 'rgba(255,255,255,0.5)'} />
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: cart.customer_id ? '#C9A52A' : 'rgba(255,255,255,0.5)' }} numberOfLines={1}>
                  {cart.customer_id ? cart.customer_name : (walkInName || 'Customer')}
                </Text>
                {!!cart.customer_id && (
                  <Pressable hitSlop={10} onPress={() => { setWalkInName(''); setCustomer(undefined, undefined, undefined); }}>
                    <Ionicons name="close-circle" size={14} color="#C9A52A" />
                  </Pressable>
                )}
              </Pressable>
            </View>
          </View>

          {/* ── SCROLLABLE CONTENT (fills remaining space below header) ── */}
          <View style={{ flex: 1 }}>
            {mobileCartContent}
          </View>

        </View>
      </Modal>
    </View>
  );
}

// ── StyleSheets ────────────────────────────────────────────────────────────────

// Shell / overall layout
function mkSh(c: _TC) { return StyleSheet.create({
  shell:      { flex: 1, flexDirection: 'column', backgroundColor: c.background },
  cols:       { flex: 1, flexDirection: 'row' },
  posHeader:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, gap: 12 },
  posBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  posBackText:{ fontSize: 13, fontWeight: '600', color: c.text },
  posTitle:   { fontSize: 28, fontWeight: '800', color: c.heading, letterSpacing: 0.2 },

  rail:       { width: 200, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.border },
  railHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  backBtn:    { width: 28, height: 28, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  railTitle:  { flex: 1, fontSize: 14, fontWeight: '800', color: c.text, letterSpacing: 1, textTransform: 'uppercase' },
  railCount:  { fontSize: 14, color: c.textMuted, fontWeight: '600' },
  railItem:   { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 10, marginHorizontal: 6, marginBottom: 1, borderRadius: 9, position: 'relative', overflow: 'hidden' },
  railItemActive: { backgroundColor: 'rgba(13,118,225,0.08)' },
  railActiveBar:  { position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, backgroundColor: '#0D76E1', borderRadius: 2 },
  railIcon:       { width: 26, height: 26, borderRadius: 7, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  railIconActive: { backgroundColor: 'rgba(13,118,225,0.12)' },
  railLabel:      { flex: 1, fontSize: 11, fontWeight: '500', color: c.text },
  railLabelActive:{ color: '#0D76E1', fontWeight: '700' },
  railBadge:      { backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  railBadgeActive:{ backgroundColor: 'rgba(13,118,225,0.12)' },
  railBadgeText:  { fontSize: 9.5, color: c.textMuted, fontWeight: '600' },
  railBadgeTextActive: { color: '#0D76E1' },

  grid:       { flex: 1, flexDirection: 'column' },
  posTopBar:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.sidebar, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  navBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.06)' },
  navBtnText: { fontSize: 16, fontWeight: '600', color: c.brandMuted },
  toolbar:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' },
  searchBox:  { flex: 1, minWidth: 140, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput:{ flex: 1, fontSize: 16, color: c.heading },
  foodFilters:{ flexDirection: 'row', gap: 5 },
  foodChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  foodChipActive: { backgroundColor: 'rgba(13,118,225,0.1)', borderColor: '#93c5fd' },
  foodDot:    { width: 7, height: 7, borderRadius: 4 },
  foodChipText: { fontSize: 12.5, fontWeight: '500', color: c.text },
  foodChipTextActive: { color: '#1d4ed8' },
  itemCountText: { fontSize: 14, color: c.textMuted, fontWeight: '500', paddingHorizontal: 14, marginBottom: 2 },
  emptyGrid:  { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyGridText: { color: c.textMuted, fontSize: 14 },

  cartPanel:  { width: 340, backgroundColor: c.surface, borderLeftWidth: 1, borderLeftColor: c.border, flexDirection: 'column' },
  cartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: c.sidebar },
  cartHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1 },
  cartBadge:  { backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  cartBadgeText: { color: c.brandDark, fontSize: 11, fontWeight: '800' },

  recentStrip:  { borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface },
  recentLabel:  { fontSize: 9.5, fontWeight: '800', color: c.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  recentCard:   { backgroundColor: c.surfaceAlt, borderRadius: 8, padding: 8, minWidth: 110, borderTopWidth: 3, borderWidth: 1, borderColor: c.border },
  recentNum:    { fontSize: 12, fontWeight: '800', color: c.heading, marginBottom: 2 },
  recentCust:   { fontSize: 14, color: c.textMuted, marginBottom: 2 },
  recentStatus: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize', marginBottom: 2 },
  recentAmt:    { fontSize: 12, fontWeight: '800', color: c.brand },
}); }

// Item cards
function mkIc(c: _TC) { return StyleSheet.create({
  card:       { flex: 1, backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 8, overflow: 'hidden', position: 'relative' },
  cardActive: { borderColor: '#93c5fd', shadowColor: '#0D76E1', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  cardUnavail:{ opacity: 0.6 },
  badge:      { position: 'absolute', top: 7, left: 7, zIndex: 4, backgroundColor: '#0D76E1', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText:  { color: '#fff', fontSize: 10, fontWeight: '800' },
  foodDot:    { position: 'absolute', top: 9, right: 9, zIndex: 4, width: 16, height: 16, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  foodDotLabel: { color: '#fff', fontSize: 10, fontWeight: '800' },
  imgWrap:    { aspectRatio: 4 / 3, backgroundColor: c.surfaceAlt, borderRadius: 7, marginBottom: 7, overflow: 'hidden' },
  img:        { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name:       { fontSize: 12.5, fontWeight: '600', color: c.heading, marginBottom: 5, lineHeight: 16 },
  bottom:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price:      { fontSize: 16, fontWeight: '800', color: '#0D76E1' },
  varTag:     { fontSize: 9.5, color: c.textMuted, backgroundColor: c.surfaceAlt, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  unavailOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  unavailText: { fontSize: 10, fontWeight: '700', color: '#fca5a5' },
}); }

// Cart panel
function mkCp(c: _TC) { return StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'column' },

  // ── Order type tabs ──────────────────────────────────────────────────────
  orderTypes:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surfaceAlt },
  typeBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9 },
  typeBtnActive:    { backgroundColor: '#0D76E1', borderRadius: 0 },
  typeBtnText:      { fontSize: 16, fontWeight: '600', color: c.textMuted },
  typeBtnTextActive:{ color: '#fff', fontWeight: '700' },

  // ── Selector rows (Customer / Waiter / Table) ─────────────────────────────
  selectorSection:  { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  selectorLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  selectorLabel:    { fontSize: 14, fontWeight: '800', color: c.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
  fieldLabel:       { fontSize: 14, fontWeight: '700', color: c.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  fieldRow:         { flexDirection: 'row', gap: 6, alignItems: 'center' },
  fieldBox:         { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surfaceAlt, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: c.border, flex: 1 },
  fieldBoxText:     { fontSize: 16, color: c.textMuted },
  iconSmBtn:        { width: 30, height: 30, borderRadius: 8, backgroundColor: c.sidebar, alignItems: 'center', justifyContent: 'center' },
  iconBtn:          { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(13,118,225,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#93c5fd' },
  // Selected state pill
  selectedPill:     { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: c.surface, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1.5, borderColor: '#bfdbfe', flex: 1 },
  selectedAvatar:   { width: 30, height: 30, borderRadius: 15, backgroundColor: '#0D76E1', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  selectedAvatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  selectedName:     { fontSize: 16, fontWeight: '700', color: c.heading },
  selectedSub:      { fontSize: 14, color: c.textMuted, marginTop: 1 },
  // Clear X button
  clearBtn:         { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', alignItems: 'center', justifyContent: 'center' },
  // Picker open button
  selectorBtn:      { width: 36, height: 36, borderRadius: 9, backgroundColor: c.sidebar, alignItems: 'center', justifyContent: 'center' },
  // Table required empty state
  tableEmpty:       { borderColor: '#fde68a', backgroundColor: 'rgba(253,230,138,0.12)' },
  tableRequiredBadge: { backgroundColor: 'rgba(253,230,138,0.2)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  tableRequiredText:  { fontSize: 12, fontWeight: '700', color: '#d97706' },
  // Required star
  requiredDot:      { width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center' },
  requiredStar:     { fontSize: 11, color: '#ef4444', fontWeight: '800' },
  // Legacy — kept for compatibility
  twoColSection:    { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  halfField:        { flex: 1, gap: 3 },
  tableSection:     { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  tableLabelRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  tableChip:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  tableChipActive:     { backgroundColor: 'rgba(13,118,225,0.1)', borderColor: '#93c5fd' },
  tableChipText:       { fontSize: 14, color: c.text, fontWeight: '500' },
  tableChipTextActive: { color: '#0D76E1', fontWeight: '700' },

  // ── Ordered Menus header ─────────────────────────────────────────────────
  orderedHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: c.surfaceAlt, borderBottomWidth: 1, borderBottomColor: c.border },
  orderedTitle:   { fontSize: 16, fontWeight: '800', color: c.heading, textTransform: 'uppercase', letterSpacing: 0.5 },
  addCustomBtn:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  addCustomText:  { fontSize: 14, fontWeight: '600', color: c.text },
  totalMenus:     { fontSize: 16, fontWeight: '700', color: '#0D76E1' },

  // ── Cart items ───────────────────────────────────────────────────────────
  itemList:       { flex: 1 },
  emptyCart:      { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyCartText:  { fontSize: 16, fontWeight: '600', color: c.text },
  emptyCartSub:   { fontSize: 14, color: c.textMuted },
  cartItemBox:    { paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.border },
  cartItemBoxWarn: { backgroundColor: 'rgba(217,119,6,0.10)', borderLeftWidth: 2, borderLeftColor: '#d97706' },
  cartItemRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  cartName:       { fontSize: 16, fontWeight: '600', color: c.heading, lineHeight: 21 },
  cartVar:        { fontSize: 10.5, color: c.brand, marginTop: 1 },
  cartNeedsPriceBadge: { fontSize: 10, fontWeight: '700', color: '#d97706', marginTop: 1 },
  qtyRow:         { flexDirection: 'row', alignItems: 'center', gap: 2 },
  qtyBtn:         { width: 22, height: 22, backgroundColor: c.surfaceAlt, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  qtyNum:         { fontSize: 12, fontWeight: '700', color: c.heading, minWidth: 18, textAlign: 'center' },
  removeBtn:      { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  cartItemMeta:   { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  cartMetaCol:    { flex: 1 },
  cartMetaLabel:  { fontSize: 14, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  cartMetaVal:    { fontSize: 14, fontWeight: '700', color: c.text, marginTop: 1 },
  cartPriceInput: {
    fontSize: 12, fontWeight: '700', color: '#d97706', marginTop: 1, padding: 0,
    borderBottomWidth: 1, borderBottomColor: '#d97706', minWidth: 50,
  },
  cartPriceInputSet: { color: c.text, borderBottomColor: c.border },

  // ── Payment Summary ──────────────────────────────────────────────────────
  paymentSummary: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: c.border, gap: 5 },
  sectionTitle:   { fontSize: 16, fontWeight: '800', color: c.heading, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  sumRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel:       { fontSize: 14, color: c.textMuted },
  sumVal:         { fontSize: 14, fontWeight: '600', color: c.text },
  divider:        { height: 1, backgroundColor: c.border, marginVertical: 4 },

  // Coupon
  couponActive:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#86efac' },
  couponActiveText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#16a34a' },
  couponRow:        { flexDirection: 'row', gap: 6 },
  couponInput:      { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: c.border },
  couponInputText:  { flex: 1, fontSize: 16, color: c.heading },
  couponApplyBtn:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#0D76E1', alignItems: 'center', justifyContent: 'center' },
  couponApplyText:  { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Quick discount %
  quickDiscLabel:    { fontSize: 10.5, fontWeight: '700', color: c.textMuted },
  quickDiscRow:      { flexDirection: 'row', gap: 5 },
  quickDiscBtn:      { flex: 1, paddingVertical: 7, borderRadius: 7, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  quickDiscBtnActive:{ backgroundColor: '#0D76E1', borderColor: '#0D76E1' },
  quickDiscText:     { fontSize: 12, fontWeight: '700', color: c.text },
  quickDiscTextActive:{ color: '#fff' },

  // Custom %
  customPctRow:    { flexDirection: 'row', gap: 5 },
  customPctInput:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: c.border },
  customPctText:   { flex: 1, fontSize: 12.5, color: c.heading },
  customPctSymbol: { fontSize: 13, fontWeight: '700', color: c.textMuted },
  customApplyBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7, backgroundColor: c.sidebar, alignItems: 'center', justifyContent: 'center' },
  customApplyText: { fontSize: 12, fontWeight: '700', color: c.brand },
  customClearBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  customClearText: { fontSize: 12, fontWeight: '600', color: c.textMuted },

  // Discount ₹ row
  discRupeeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  discRupeeLabel: { fontSize: 16, color: c.textMuted },
  discRupeeInput: { backgroundColor: c.surfaceAlt, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: c.border, minWidth: 80, alignItems: 'flex-end' },
  discRupeeText:  { fontSize: 16, fontWeight: '600', color: c.heading, textAlign: 'right' },

  // Amount to Pay
  amountToPayRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  amountToPayLabel: { fontSize: 14, fontWeight: '800', color: c.heading },
  amountToPayVal:   { fontSize: 16, fontWeight: '800', color: '#0D76E1' },

  // Received
  receivedRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  receivedLabel: { fontSize: 12.5, color: c.textMuted },
  receivedInput: { backgroundColor: c.surfaceAlt, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: c.border, minWidth: 80, alignItems: 'flex-end' },
  receivedText:  { fontSize: 12.5, fontWeight: '600', color: c.heading, textAlign: 'right' },

  // Change / Balance due
  changeDueRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeDueLabel: { fontSize: 14, color: c.textMuted },
  changeDueVal:   { fontSize: 14, fontWeight: '800' },

  // ── Payment Method ───────────────────────────────────────────────────────
  payMethodSection: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: c.border, gap: 6 },
  payRow:     { flexDirection: 'row', gap: 5 },
  payBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  payBtnActive:  { backgroundColor: c.sidebar, borderColor: c.sidebar },
  payText:       { fontSize: 14, fontWeight: '600', color: c.text },
  payTextActive: { color: c.brand, fontWeight: '700' },

  // ── Order Notes ──────────────────────────────────────────────────────────
  notesSection:   { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: c.border, gap: 5 },
  notesLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  notesMeta:      { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },
  notesInput:     { backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: c.border, fontSize: 16, color: c.heading, minHeight: 50 },

  // ── Bottom action buttons ────────────────────────────────────────────────
  btnSection:    { padding: 8, gap: 6, borderTopWidth: 1, borderTopColor: c.border },
  placeBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: c.sidebar, gap: 8 },
  placeBtnLabel: { fontSize: 16, fontWeight: '800', color: c.brand },
  kotBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)', gap: 6, position: 'relative' },
  kotBtnText:    { fontSize: 16, fontWeight: '700', color: '#16a34a' },
  kotDot:        { position: 'absolute', top: 4, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: '#7c3aed' },
  btnRow3:       { flexDirection: 'row', gap: 5 },
  btn3:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  btn3Text:      { fontSize: 11.5, fontWeight: '600', color: c.text },
  btn3Danger:    { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },

  // ── Custom item modal (shared field styles) ──────────────────────────────
  extraRow:      { flexDirection: 'row', gap: 6 },
  extraInput:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: c.border },
  extraInputText:{ flex: 1, fontSize: 12.5, color: c.heading },
}); }

// Variation modal
function mkVm(c: _TC) { return StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:    { backgroundColor: c.surface, borderRadius: 18, width: '100%', maxWidth: 380, maxHeight: '70%', overflow: 'hidden' },
  header:   { flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: c.sidebar, gap: 10 },
  title:    { fontSize: 24, fontWeight: '800', color: c.brand },
  sub:      { fontSize: 14, color: 'rgba(201,165,42,0.7)', marginTop: 2 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand },
  varName:  { flex: 1, fontSize: 16, fontWeight: '600', color: c.heading },
  varPrice: { fontSize: 15, fontWeight: '800', color: '#0D76E1', marginRight: 6 },
}); }

// Customer / Waiter / Table picker modals
function mkCpm(c: _TC) { return StyleSheet.create({
  // ── Anchored dropdown panel (table picker on desktop) ─────────────────────
  dropPanel:  { position: 'absolute', backgroundColor: c.surface, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 24, overflow: 'hidden', borderWidth: 1, borderColor: c.border, zIndex: 999 },
  dropHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.sidebar },

  // ── Header (forest-green chrome with white text) ──────────────────────────
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: c.sidebar },
  title:      { fontSize: 24, fontWeight: '800', color: c.brand },
  subtitle:   { fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  closeBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  // ── Search ────────────────────────────────────────────────────────────────
  search:     { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 10, marginVertical: 8, backgroundColor: c.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput:{ flex: 1, fontSize: 16, color: c.heading },

  // ── Walk-in name entry (customer picker) ──────────────────────────────────
  walkInSection: { marginHorizontal: 12, marginBottom: 4, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border },
  walkInLabel:   { fontSize: 10.5, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  walkInRow:     { flexDirection: 'row', gap: 8, alignItems: 'center' },
  walkInInput:   { flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.heading, borderWidth: 1, borderColor: c.border },
  walkInConfirm: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0D76E1', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  walkInConfirmText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // ── Divider ───────────────────────────────────────────────────────────────
  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
  dividerText: { fontSize: 11, color: c.textMuted, fontWeight: '600' },

  // ── Legend (pending indicator) ────────────────────────────────────────────
  legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(245,158,11,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.3)' },
  legendDot:   { width: 9, height: 9, borderRadius: 5, backgroundColor: '#f59e0b' },
  legendText:  { fontSize: 11.5, color: '#d97706', flex: 1 },

  // ── List rows ─────────────────────────────────────────────────────────────
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
  rowSelected: { backgroundColor: 'rgba(13,118,225,0.1)', borderLeftWidth: 3, borderLeftColor: '#0D76E1', paddingLeft: 13 },
  avatar:      { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0D76E1', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  name:        { fontSize: 15, fontWeight: '700', color: c.heading },
  phone:       { fontSize: 12.5, color: c.textMuted, marginTop: 2 },

  // ── Pending badge (table picker) ──────────────────────────────────────────
  pendingBadge:     { backgroundColor: '#f59e0b', borderRadius: 12, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  pendingBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 30, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  emptyText:  { fontSize: 13, color: c.textMuted, textAlign: 'center' },

  // ── Use as walk-in button ─────────────────────────────────────────────────
  useBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0D76E1', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, marginTop: 4 },
  useBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
}); }

// Mobile layout
function mkMb(c: _TC) { return StyleSheet.create({
  shell:      { flex: 1, backgroundColor: c.background },

  // Top bar
  topBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, paddingHorizontal: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  backBtn:    { width: 34, height: 34, borderRadius: 9, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  topTitle:   { fontSize: 16, fontWeight: '800', color: c.heading, lineHeight: 20 },
  topSub:     { fontSize: 11, color: c.textMuted, marginTop: 1 },

  // Search bar — sits between topBar and catBar
  searchRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, marginHorizontal: 12, marginVertical: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: c.border, elevation: 1 },
  searchInput:{ flex: 1, fontSize: 13.5, color: c.heading, padding: 0 },

  // Category chip bar — NO fixed height so chips never clip
  catBar:     { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  catChip:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  catChipActive:    { backgroundColor: '#0D76E1', borderColor: '#0D76E1' },
  catChipText:      { fontSize: 12.5, fontWeight: '600', color: c.text },
  catChipTextActive:{ fontSize: 12.5, fontWeight: '700', color: '#fff' },

  // Cart FAB
  fab:        { position: 'absolute', bottom: 14, left: 12, right: 12, backgroundColor: c.sidebar, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 10 },
  fabBadge:   { backgroundColor: c.brand, borderRadius: 999, minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  fabBadgeText: { color: c.brandDark, fontSize: 11, fontWeight: '800' },
  fabTotal:   { color: c.brand, fontWeight: '800', fontSize: 15 },
}); }

// SweetAlert-style table-required modal styles
function mkTam(c: _TC) { return StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:          { backgroundColor: c.surface, borderRadius: 18, padding: 28, width: '100%', maxWidth: 380, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 18 },
  iconWrap:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(249,115,22,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: 'rgba(249,115,22,0.3)' },
  title:         { fontSize: 19, fontWeight: '800', color: c.heading, textAlign: 'center', marginBottom: 10 },
  msg:           { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 22 },
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f97316', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 28, width: '100%', marginBottom: 10 },
  primaryBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ghostBtn:      { paddingVertical: 10, paddingHorizontal: 20 },
  ghostBtnTxt:   { color: c.textMuted, fontSize: 14, fontWeight: '600' },
}); }

// Mobile cart (Android-optimised layout)
function mkMc(c: _TC) { return StyleSheet.create({
  contextStrip:         { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 8 },
  orderTypePills:       { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 8, gap: 6 },
  orderTypePill:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  orderTypePillActive:  { backgroundColor: '#0D76E1', borderColor: '#0D76E1' },
  orderTypePillText:    { fontSize: 11.5, fontWeight: '600', color: c.textMuted },
  orderTypePillTextActive: { color: '#fff', fontWeight: '700' },
  ctxChipsRow:          { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingTop: 6, gap: 6 },
  ctxChip:              { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, maxWidth: 150 },
  ctxChipRequired:      { backgroundColor: 'rgba(253,230,138,0.15)', borderColor: '#fde68a' },
  ctxChipTable:         { backgroundColor: 'rgba(13,118,225,0.08)', borderColor: '#93c5fd' },
  ctxChipWaiter:        { backgroundColor: 'rgba(124,58,237,0.08)', borderColor: '#c4b5fd' },
  ctxChipCustomer:      { backgroundColor: 'rgba(13,118,225,0.08)', borderColor: '#93c5fd' },
  ctxChipText:          { fontSize: 11.5, fontWeight: '500', color: c.textMuted, maxWidth: 100 },
  ctxChipTextTable:     { color: '#0D76E1', fontWeight: '600' },
  ctxChipTextWaiter:    { color: '#7c3aed', fontWeight: '600' },
  ctxChipTextRequired:  { color: '#d97706', fontWeight: '600' },
  itemsHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surfaceAlt, borderBottomWidth: 1, borderBottomColor: c.border },
  itemsHeaderTitle:     { fontSize: 11.5, fontWeight: '800', color: c.heading, textTransform: 'uppercase', letterSpacing: 0.5 },
  addCustomMiniBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  addCustomMiniText:    { fontSize: 11, fontWeight: '600', color: c.text },
  emptyCart:            { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyCartText:        { fontSize: 15, fontWeight: '700', color: c.text },
  emptyCartSub:         { fontSize: 12.5, color: c.textMuted },
  cartItem:             { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  cartItemWarn:         { backgroundColor: 'rgba(217,119,6,0.06)', borderLeftWidth: 2, borderLeftColor: '#d97706' },
  cartItemTop:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartItemName:         { fontSize: 13, fontWeight: '600', color: c.heading },
  cartItemVar:          { fontSize: 10.5, color: c.brand, marginTop: 1 },
  qtyControl:           { flexDirection: 'row', alignItems: 'center', gap: 2 },
  qtyBtn:               { width: 26, height: 26, backgroundColor: c.surfaceAlt, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
  qtyText:              { fontSize: 13, fontWeight: '700', color: c.heading, minWidth: 24, textAlign: 'center' },
  cartItemTotal:        { fontSize: 13, fontWeight: '800', color: '#0D76E1', minWidth: 52, textAlign: 'right' },
  removeBtn:            { width: 28, height: 28, borderRadius: 6, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  priceInputRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: 'rgba(253,230,138,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  priceInput:           { flex: 1, fontSize: 13, fontWeight: '600', color: '#d97706', borderBottomWidth: 1, borderBottomColor: '#d97706', padding: 0 },
  section:              { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
  sectionLabel:         { fontSize: 11, fontWeight: '800', color: c.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 7 },
  payRow:               { flexDirection: 'row', gap: 6 },
  payBtn:               { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 9, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  payBtnActive:         { backgroundColor: c.sidebar, borderColor: c.sidebar },
  payBtnText:           { fontSize: 12, fontWeight: '600', color: c.text },
  payBtnTextActive:     { color: c.brand, fontWeight: '700' },
  summarySection:       { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: c.border, gap: 5 },
  summaryRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel:         { fontSize: 12.5, color: c.textMuted },
  summaryVal:           { fontSize: 12.5, fontWeight: '600', color: c.text },
  accordionHeader:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
  accordionLabel:       { fontSize: 12.5, fontWeight: '600', color: c.textMuted },
  accordionBody:        { paddingHorizontal: 12, paddingBottom: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  couponActive:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#86efac' },
  couponActiveText:     { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#16a34a' },
  couponRow:            { flexDirection: 'row', gap: 6 },
  couponInput:          { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: c.border },
  couponInputText:      { flex: 1, fontSize: 12.5, color: c.heading },
  couponApplyBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#0D76E1', alignItems: 'center', justifyContent: 'center' },
  couponApplyText:      { fontSize: 12, fontWeight: '700', color: '#fff' },
  discLabel:            { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5 },
  quickDiscRow:         { flexDirection: 'row', gap: 5 },
  quickDiscBtn:         { flex: 1, paddingVertical: 8, borderRadius: 7, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  quickDiscBtnActive:   { backgroundColor: '#0D76E1', borderColor: '#0D76E1' },
  quickDiscText:        { fontSize: 13, fontWeight: '700', color: c.text },
  quickDiscTextActive:  { color: '#fff' },
  discInputRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  discInputBox:         { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: c.border },
  discInputText:        { flex: 1, fontSize: 12.5, color: c.heading },
  discInputSuffix:      { fontSize: 13, fontWeight: '700', color: c.textMuted },
  discApplyBtn:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  discApplyText:        { fontSize: 12, fontWeight: '700', color: c.brand },
  discClearBtn:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  discClearText:        { fontSize: 12, fontWeight: '600', color: c.textMuted },
  receivedSection:      { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, gap: 7 },
  receivedInput:        { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: c.border },
  receivedPrefix:       { fontSize: 15, fontWeight: '700', color: c.textMuted, marginRight: 4 },
  receivedText:         { flex: 1, fontSize: 15, fontWeight: '600', color: c.heading },
  changeText:           { fontSize: 13, fontWeight: '700' },
  notesSection:         { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: c.border, gap: 7 },
  notesInput:           { backgroundColor: c.surfaceAlt, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: c.border, fontSize: 12.5, color: c.heading, minHeight: 56 },
  secondaryBtnRow:      { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
  draftBtn:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 9, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  draftBtnText:         { fontSize: 12.5, fontWeight: '600', color: c.textMuted },
  cancelOrderBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 9, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' },
  cancelOrderBtnText:   { fontSize: 12.5, fontWeight: '600', color: '#dc2626' },
  stickyBottom:         { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  stickyTotalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stickyTotalLabel:     { fontSize: 13, fontWeight: '700', color: c.heading },
  stickyTotalVal:       { fontSize: 20, fontWeight: '800', color: '#0D76E1' },
  placeOrderBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  placeOrderBtnText:    { fontSize: 15, fontWeight: '800', color: c.brand },
}); }

// Order placed success modal
function mkSu(c: _TC) { return StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:        { backgroundColor: c.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 16 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title:       { fontSize: 22, fontWeight: '800', color: c.heading },
  orderNum:    { fontSize: 15, fontWeight: '700', color: c.brand, marginBottom: 8 },
  hint:        { fontSize: 13.5, color: '#d97706', lineHeight: 20, marginBottom: 16 },
  changePill:  { backgroundColor: 'rgba(22,163,74,0.1)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 14, alignSelf: 'stretch' },
  changeText:  { fontSize: 13.5, fontWeight: '700', color: '#16a34a', textAlign: 'center' },
  kotBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, marginBottom: 10 },
  kotText:     { fontSize: 14, fontWeight: '700', color: c.heading },
  kotSub:      { fontSize: 12, color: c.textMuted },
  billBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, backgroundColor: c.sidebar, marginBottom: 10 },
  billText:    { fontSize: 14, fontWeight: '700', color: '#fff' },
  billSub:     { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, backgroundColor: '#16a34a', marginBottom: 10 },
  completeText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  closeBtn:    { paddingVertical: 13, borderRadius: 10, backgroundColor: '#FFA80B', alignItems: 'center' },
  closeText:   { fontSize: 14, fontWeight: '800', color: '#fff' },
}); }
