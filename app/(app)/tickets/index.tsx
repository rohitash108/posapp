import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Modal, ActivityIndicator, RefreshControl, Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ordersApi } from '@/api/orders';
import { webGetOrders } from '@/utils/webDb';
import { useAppStore } from '@/store/appStore';
import type { Order } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  pending:   '#d97706',
  confirmed: '#2563eb',
  preparing: '#7c3aed',
  ready:     '#0891b2',
  served:    '#059669',
  completed: '#16a34a',
  cancelled: '#dc2626',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card / POS',
  upi:  'UPI',
  other: 'Other',
};

// ── Print receipt as a new browser window ──────────────────────────────────────
function printReceipt(order: Order, restaurant: { name?: string; phone?: string; address?: string; gst_number?: string } | null) {
  if (Platform.OS !== 'web') return;
  const items = (order.items ?? []).map(i =>
    `<tr>
      <td>${i.name}${i.variation ? ` <span style="color:#999;font-size:11px">(${i.variation})</span>` : ''}</td>
      <td style="text-align:center">${i.quantity}</td>
      <td style="text-align:right">₹${i.unit_price.toFixed(2)}</td>
      <td style="text-align:right">₹${i.total_price.toFixed(2)}</td>
    </tr>`
  ).join('');

  const dateStr = order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a') : '—';
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Receipt #${order.order_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 13px; color: #111; max-width: 380px; margin: 0 auto; padding: 16px; }
    h2 { text-align: center; font-size: 18px; letter-spacing: 2px; margin-bottom: 2px; }
    .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 12px; line-height: 1.5; }
    hr { border: none; border-top: 1px dashed #aaa; margin: 8px 0; }
    .label { color: #555; font-size: 11px; }
    .meta { display: flex; justify-content: space-between; margin: 3px 0; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; color: #777; padding: 4px 0; border-bottom: 1px solid #ddd; }
    td { padding: 5px 0; vertical-align: top; }
    .totals { width: 100%; }
    .totals td { padding: 3px 0; font-size: 13px; }
    .total-row td { font-size: 16px; font-weight: bold; padding-top: 6px; }
    .footer { text-align: center; font-size: 11px; color: #777; margin-top: 14px; line-height: 1.6; }
    @media print { body { max-width: 100%; } }
  </style>
</head>
<body>
  <h2>${restaurant?.name?.toUpperCase() ?? 'RESTAURANT'}</h2>
  <div class="sub">
    ${restaurant?.address ? `${restaurant.address}<br>` : ''}
    ${restaurant?.phone ? `Tel: ${restaurant.phone}<br>` : ''}
    ${restaurant?.gst_number ? `GSTIN: ${restaurant.gst_number}` : ''}
  </div>
  <hr/>
  <div class="meta"><span class="label">Receipt #</span><span><b>${order.order_number ?? '—'}</b></span></div>
  <div class="meta"><span class="label">Date</span><span>${dateStr}</span></div>
  <div class="meta"><span class="label">Type</span><span>${(order.order_type ?? 'dine_in').replace('_', ' ').toUpperCase()}</span></div>
  ${order.table_name ? `<div class="meta"><span class="label">Table</span><span>${order.table_name}</span></div>` : ''}
  ${order.customer_name ? `<div class="meta"><span class="label">Customer</span><span>${order.customer_name}</span></div>` : ''}
  <hr/>
  <table>
    <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amt</th></tr></thead>
    <tbody>${items}</tbody>
  </table>
  <hr/>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">₹${order.subtotal?.toFixed(2) ?? '0.00'}</td></tr>
    ${order.tax_amount > 0 ? `<tr><td>Tax</td><td style="text-align:right">₹${order.tax_amount.toFixed(2)}</td></tr>` : ''}
    ${order.discount_amount > 0 ? `<tr><td>Discount</td><td style="text-align:right" style="color:#10b981">-₹${order.discount_amount.toFixed(2)}</td></tr>` : ''}
    <tr class="total-row" style="border-top:2px solid #111"><td><b>TOTAL</b></td><td style="text-align:right"><b>₹${order.total?.toFixed(2) ?? '0.00'}</b></td></tr>
  </table>
  <hr/>
  <div class="meta"><span class="label">Payment</span><span>${PAYMENT_LABELS[order.payment_method ?? ''] ?? (order.payment_method ?? '—')}</span></div>
  <div class="meta"><span class="label">Status</span><span style="text-transform:uppercase;font-weight:bold">${order.payment_status ?? '—'}</span></div>
  <hr/>
  <div class="footer">Thank you for visiting!<br/>Please come again ✦</div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=420,height=600');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ── Receipt preview component ─────────────────────────────────────────────────
function ReceiptPreview({ order, restaurant }: {
  order: Order;
  restaurant: { name?: string; phone?: string; address?: string; gst_number?: string } | null;
}) {
  const dateStr = order.created_at ? format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a') : '—';
  const statusColor = STATUS_COLORS[order.status] ?? '#6b7280';

  return (
    <ScrollView style={rp.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={rp.container}>
      {/* Header */}
      <View style={rp.header}>
        <View style={rp.headerIcon}>
          <Ionicons name="restaurant" size={22} color="#C9A52A" />
        </View>
        <Text style={rp.restName}>{restaurant?.name?.toUpperCase() ?? 'RESTAURANT'}</Text>
        {restaurant?.address ? <Text style={rp.restSub}>{restaurant.address}</Text> : null}
        {restaurant?.phone  ? <Text style={rp.restSub}>Tel: {restaurant.phone}</Text> : null}
        {restaurant?.gst_number ? <Text style={rp.restSub}>GSTIN: {restaurant.gst_number}</Text> : null}
      </View>

      <View style={rp.divider} />

      {/* Order meta */}
      <View style={rp.metaGrid}>
        <View style={rp.metaRow}>
          <Text style={rp.metaLabel}>Receipt #</Text>
          <Text style={rp.metaValue}><Text style={{ fontWeight: '800' }}>{order.order_number ?? '—'}</Text></Text>
        </View>
        <View style={rp.metaRow}>
          <Text style={rp.metaLabel}>Date</Text>
          <Text style={rp.metaValue}>{dateStr}</Text>
        </View>
        <View style={rp.metaRow}>
          <Text style={rp.metaLabel}>Type</Text>
          <Text style={rp.metaValue}>{(order.order_type ?? 'dine_in').replace('_', ' ').toUpperCase()}</Text>
        </View>
        {order.table_name ? (
          <View style={rp.metaRow}>
            <Text style={rp.metaLabel}>Table</Text>
            <Text style={rp.metaValue}>{order.table_name}</Text>
          </View>
        ) : null}
        {order.customer_name ? (
          <View style={rp.metaRow}>
            <Text style={rp.metaLabel}>Customer</Text>
            <Text style={rp.metaValue}>{order.customer_name}</Text>
          </View>
        ) : null}
        <View style={rp.metaRow}>
          <Text style={rp.metaLabel}>Status</Text>
          <View style={[rp.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
            <Text style={[rp.statusText, { color: statusColor }]}>{order.status?.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <View style={rp.divider} />

      {/* Items */}
      <View style={rp.itemsHeader}>
        <Text style={[rp.itemsCol, { flex: 1 }]}>ITEM</Text>
        <Text style={[rp.itemsCol, { width: 36, textAlign: 'center' }]}>QTY</Text>
        <Text style={[rp.itemsCol, { width: 64, textAlign: 'right' }]}>RATE</Text>
        <Text style={[rp.itemsCol, { width: 72, textAlign: 'right' }]}>AMOUNT</Text>
      </View>
      {(order.items ?? []).map((item, idx) => (
        <View key={idx} style={rp.itemRow}>
          <View style={{ flex: 1, marginRight: 4 }}>
            <Text style={rp.itemName}>{item.name}</Text>
            {item.variation ? <Text style={rp.itemVar}>{item.variation}</Text> : null}
          </View>
          <Text style={[rp.itemCell, { width: 36, textAlign: 'center' }]}>{item.quantity}</Text>
          <Text style={[rp.itemCell, { width: 64, textAlign: 'right' }]}>₹{item.unit_price.toFixed(2)}</Text>
          <Text style={[rp.itemCell, { width: 72, textAlign: 'right', fontWeight: '700' }]}>₹{item.total_price.toFixed(2)}</Text>
        </View>
      ))}

      <View style={rp.divider} />

      {/* Totals */}
      <View style={rp.totals}>
        <View style={rp.totRow}>
          <Text style={rp.totLabel}>Subtotal</Text>
          <Text style={rp.totVal}>₹{order.subtotal?.toFixed(2) ?? '0.00'}</Text>
        </View>
        {order.tax_amount > 0 && (
          <View style={rp.totRow}>
            <Text style={rp.totLabel}>Tax</Text>
            <Text style={rp.totVal}>₹{order.tax_amount.toFixed(2)}</Text>
          </View>
        )}
        {order.discount_amount > 0 && (
          <View style={rp.totRow}>
            <Text style={rp.totLabel}>Discount</Text>
            <Text style={[rp.totVal, { color: '#10b981' }]}>-₹{order.discount_amount.toFixed(2)}</Text>
          </View>
        )}
        <View style={[rp.totRow, rp.totTotal]}>
          <Text style={rp.totTotalLabel}>TOTAL</Text>
          <Text style={rp.totTotalVal}>₹{order.total?.toFixed(2) ?? '0.00'}</Text>
        </View>
      </View>

      <View style={rp.divider} />

      {/* Payment */}
      <View style={rp.metaGrid}>
        <View style={rp.metaRow}>
          <Text style={rp.metaLabel}>Payment</Text>
          <Text style={rp.metaValue}>{PAYMENT_LABELS[order.payment_method ?? ''] ?? (order.payment_method ?? '—')}</Text>
        </View>
        <View style={rp.metaRow}>
          <Text style={rp.metaLabel}>Pay Status</Text>
          <Text style={[rp.metaValue, { fontWeight: '700', color: order.payment_status === 'paid' ? '#16a34a' : '#d97706' }]}>
            {(order.payment_status ?? '—').toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={rp.divider} />
      <Text style={rp.thanks}>Thank you for visiting! ✦</Text>
    </ScrollView>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function TicketsScreen() {
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Order | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { isOnline, restaurant } = useAppStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const STATUS_FILTERS = ['all', 'pending', 'preparing', 'ready', 'served', 'completed', 'cancelled'];

  const load = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        try {
          const res = await ordersApi.list({ per_page: 200 });
          const data = res.data?.data ?? res.data ?? [];
          setOrders(Array.isArray(data) ? data : []);
        } catch {
          setOrders(await webGetOrders(200));
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
  }

  function selectOrder(o: Order) {
    setSelected(o);
    if (!isDesktop) setShowModal(true);
  }

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || (o.order_number ?? '').toLowerCase().includes(q)
      || (o.customer_name ?? '').toLowerCase().includes(q)
      || (o.table_name ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const renderOrderRow = ({ item: o }: { item: Order }) => {
    const statusColor = STATUS_COLORS[o.status] ?? '#6b7280';
    const isSelected = selected?.id === o.id;
    const dateStr = o.created_at ? format(new Date(o.created_at), 'dd MMM, hh:mm a') : '';
    return (
      <TouchableOpacity
        style={[ol.row, isSelected && ol.rowSelected, { borderLeftColor: statusColor }]}
        onPress={() => selectOrder(o)}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <Text style={ol.orderNum}>#{o.order_number ?? '—'}</Text>
            <View style={[ol.badge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
              <Text style={[ol.badgeText, { color: statusColor }]}>{o.status?.toUpperCase()}</Text>
            </View>
          </View>
          {o.customer_name ? <Text style={ol.customer} numberOfLines={1}>{o.customer_name}</Text> : null}
          <Text style={ol.meta}>
            {(o.order_type ?? '').replace('_', ' ')}
            {o.table_name ? `  ·  ${o.table_name}` : ''}
            {dateStr ? `  ·  ${dateStr}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={ol.total}>₹{o.total?.toFixed(2) ?? '—'}</Text>
          <Text style={[ol.payStatus, { color: o.payment_status === 'paid' ? '#16a34a' : '#d97706' }]}>
            {(o.payment_status ?? '').toUpperCase()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[sc.shell, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#C9A52A" />
        <Text style={{ color: '#6b7280', marginTop: 10 }}>Loading tickets...</Text>
      </View>
    );
  }

  const listPanel = (
    <View style={isDesktop ? sc.listPanel : { flex: 1 }}>
      {/* Toolbar */}
      <View style={sc.toolbar}>
        <View style={sc.searchBox}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput
            style={sc.searchInput}
            placeholder="Search order # or customer..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#9ca3af"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={sc.countText}>{filtered.length} tickets</Text>
      </View>

      {/* Status filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={sc.filterBar}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 6, gap: 6 }}
      >
        {STATUS_FILTERS.map(s => {
          const active = statusFilter === s;
          const color = s !== 'all' ? STATUS_COLORS[s] : '#374151';
          return (
            <TouchableOpacity
              key={s}
              style={[sc.filterChip, active && { backgroundColor: color + '18', borderColor: color }]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[sc.filterChipText, active && { color, fontWeight: '700' }]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Order list */}
      <FlatList
        data={filtered}
        keyExtractor={o => String(o.id)}
        renderItem={renderOrderRow}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#C9A52A" />}
        ListEmptyComponent={
          <View style={sc.empty}>
            <Ionicons name="receipt-outline" size={40} color="#d1d5db" />
            <Text style={sc.emptyTitle}>No tickets found</Text>
            <Text style={sc.emptyText}>Place an order to see receipts here</Text>
          </View>
        }
      />
    </View>
  );

  const previewPanel = selected ? (
    <View style={isDesktop ? sc.previewPanel : { flex: 1 }}>
      {/* Preview header */}
      <View style={sc.previewHeader}>
        <View style={{ flex: 1 }}>
          <Text style={sc.previewTitle}>Receipt #{selected.order_number}</Text>
          <Text style={sc.previewSub}>{selected.customer_name ?? 'Walk-in'}</Text>
        </View>
        {Platform.OS === 'web' && (
          <TouchableOpacity
            style={sc.printBtn}
            onPress={() => printReceipt(selected, restaurant)}
          >
            <Ionicons name="print-outline" size={16} color="#fff" />
            <Text style={sc.printBtnText}>Print</Text>
          </TouchableOpacity>
        )}
        {!isDesktop && (
          <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => { setShowModal(false); setSelected(null); }}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        )}
      </View>
      <ReceiptPreview order={selected} restaurant={restaurant} />
    </View>
  ) : (
    <View style={[sc.previewPanel, sc.previewEmpty]}>
      <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
      <Text style={sc.previewEmptyText}>Select an order to preview its receipt</Text>
    </View>
  );

  // ── Desktop: side-by-side ─────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={sc.shell}>
        {listPanel}
        {previewPanel}
      </View>
    );
  }

  // ── Mobile: list + modal ──────────────────────────────────────────────────
  return (
    <View style={sc.shell}>
      {listPanel}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowModal(false); setSelected(null); }}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {selected && (
            <>
              <View style={sc.previewHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={sc.previewTitle}>Receipt #{selected.order_number}</Text>
                  <Text style={sc.previewSub}>{selected.customer_name ?? 'Walk-in'}</Text>
                </View>
                {Platform.OS === 'web' && (
                  <TouchableOpacity style={sc.printBtn} onPress={() => printReceipt(selected, restaurant)}>
                    <Ionicons name="print-outline" size={16} color="#fff" />
                    <Text style={sc.printBtnText}>Print</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => { setShowModal(false); setSelected(null); }}>
                  <Ionicons name="close" size={22} color="#374151" />
                </TouchableOpacity>
              </View>
              <ReceiptPreview order={selected} restaurant={restaurant} />
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  shell:          { flex: 1, flexDirection: 'row', backgroundColor: '#f4f6f9' },
  listPanel:      { width: 380, borderRightWidth: 1, borderRightColor: '#e5e7eb', backgroundColor: '#fff', flexDirection: 'column' },
  previewPanel:   { flex: 1, backgroundColor: '#f8f9fb', flexDirection: 'column' },
  previewEmpty:   { alignItems: 'center', justifyContent: 'center', gap: 12 },
  previewEmptyText: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput: { flex: 1, fontSize: 13.5, color: '#111827' },
  countText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },

  filterBar: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  filterChipText: { fontSize: 12, fontWeight: '500', color: '#374151' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#9ca3af' },
  emptyText: { fontSize: 13, color: '#d1d5db', textAlign: 'center' },

  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1A2B1A', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  previewTitle: { fontSize: 15, fontWeight: '800', color: '#C9A52A' },
  previewSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  printBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#C9A52A' },
  printBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

const ol = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', borderLeftWidth: 3, gap: 8 },
  rowSelected: { backgroundColor: 'rgba(201,165,42,0.07)' },
  orderNum: { fontSize: 14, fontWeight: '800', color: '#111827' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3 },
  customer: { fontSize: 12.5, fontWeight: '600', color: '#374151', marginBottom: 2 },
  meta: { fontSize: 11, color: '#9ca3af' },
  total: { fontSize: 15, fontWeight: '800', color: '#111827' },
  payStatus: { fontSize: 10, fontWeight: '700' },
});

const rp = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40, maxWidth: 480, alignSelf: 'center', width: '100%' },

  header: { alignItems: 'center', marginBottom: 12, gap: 4 },
  headerIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1A2B1A', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  restName: { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: 1.5, textAlign: 'center' },
  restSub: { fontSize: 11.5, color: '#6b7280', textAlign: 'center' },

  divider: { height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: '#d1d5db', marginVertical: 10 },

  metaGrid: { gap: 6 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  metaValue: { fontSize: 12.5, color: '#111827', maxWidth: '60%', textAlign: 'right' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 },

  itemsHeader: { flexDirection: 'row', paddingBottom: 6, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  itemsCol: { fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  itemVar: { fontSize: 11, color: '#C9A52A', marginTop: 2 },
  itemCell: { fontSize: 13, color: '#374151' },

  totals: { gap: 5 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totLabel: { fontSize: 13, color: '#6b7280' },
  totVal: { fontSize: 13, fontWeight: '600', color: '#374151' },
  totTotal: { borderTopWidth: 2, borderTopColor: '#111827', marginTop: 6, paddingTop: 8 },
  totTotalLabel: { fontSize: 16, fontWeight: '800', color: '#111827' },
  totTotalVal: { fontSize: 18, fontWeight: '800', color: '#C9A52A' },

  thanks: { textAlign: 'center', fontSize: 12.5, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' },
});
