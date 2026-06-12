/**
 * Orders Screen — Master-Detail Layout
 * Desktop: side-by-side list + detail panel
 * Mobile: list + slide-up modal detail
 * Features: status advance, mark paid, real-time polling, search, receipt print
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
  useWindowDimensions, ScrollView, TextInput, Modal, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import { getOrders, updateLocalOrderStatus, addToSyncQueue } from '@/database/repositories';
import { webGetOrders, webUpdateOrderStatus, webAddSyncQueue } from '@/utils/webDb';
import { ordersApi } from '@/api/orders';
import { syncService } from '@/sync/SyncService';
import { useAppStore } from '@/store/appStore';
import client from '@/api/client';
import type { Order } from '@/types';

// ── Config ──────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; border: string; icon: string; label: string; dot: string }> = {
  pending:   { color: '#d97706', bg: '#fef9ec', border: '#fcd34d', icon: 'time-outline',             label: 'Pending',   dot: '#f59e0b' },
  confirmed: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', icon: 'checkmark-outline',        label: 'Confirmed', dot: '#3b82f6' },
  preparing: { color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: 'flame-outline',            label: 'Preparing', dot: '#8b5cf6' },
  ready:     { color: '#0891b2', bg: '#ecfeff', border: '#67e8f9', icon: 'restaurant-outline',       label: 'Ready',     dot: '#06b6d4' },
  served:    { color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', icon: 'checkmark-done-outline',   label: 'Served',    dot: '#10b981' },
  completed: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: 'checkmark-circle-outline', label: 'Completed', dot: '#22c55e' },
  cancelled: { color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', icon: 'close-circle-outline',    label: 'Cancelled', dot: '#ef4444' },
};
const NEXT_STATUS: Record<string, string> = {
  pending: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'served', served: 'completed',
};
const NEXT_LABEL: Record<string, string> = {
  pending: 'Confirm', confirmed: 'Start Cooking', preparing: 'Mark Ready', ready: 'Mark Served', served: 'Complete',
};
const NEXT_ICON: Record<string, string> = {
  pending: 'checkmark-circle-outline', confirmed: 'flame-outline', preparing: 'restaurant-outline',
  ready: 'checkmark-done-outline', served: 'checkmark-circle',
};
const SOURCE_CFG: Record<string, { color: string; bg: string }> = {
  zomato: { color: '#d00000', bg: '#fff0f0' },
  swiggy: { color: '#fc8019', bg: '#fff7ed' },
  qr:     { color: '#7c3aed', bg: '#f5f3ff' },
  pos:    { color: '#1A2B1A', bg: '#f0f2f0' },
};
const FILTER_STATUSES = ['all', 'pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
const POLL_INTERVAL = 30_000; // 30 s

function formatTime(dt?: string) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isToday(d))     return `Today ${format(d, 'hh:mm a')}`;
  if (isYesterday(d)) return `Yesterday ${format(d, 'hh:mm a')}`;
  return format(d, 'dd MMM, hh:mm a');
}

// Receipt printing (web only)
function printReceipt(order: Order, restaurant: any) {
  if (Platform.OS !== 'web') return;
  const rows = (order.items ?? []).map(i =>
    `<tr><td>${i.name}${i.variation ? ` (${i.variation})` : ''}</td><td align="center">${i.quantity}</td><td align="right">₹${Number(i.unit_price).toFixed(2)}</td><td align="right">₹${Number(i.total_price).toFixed(2)}</td></tr>`
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
<div style="font-size:10px;color:#555;margin:3px 0">${order.customer_name ? `Customer: ${order.customer_name}` : 'Walk-in'}${order.restaurant_table?.name ? ` · Table: ${order.restaurant_table.name}` : ''}</div>
<hr/><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead><tbody>${rows}</tbody></table><hr/>
<table><tr><td>Subtotal</td><td align="right">₹${Number(order.subtotal).toFixed(2)}</td></tr>
${Number(order.tax_amount) > 0 ? `<tr><td>Tax</td><td align="right">₹${Number(order.tax_amount).toFixed(2)}</td></tr>` : ''}
${Number(order.discount_amount) > 0 ? `<tr><td>Discount</td><td align="right" style="color:#16a34a">-₹${Number(order.discount_amount).toFixed(2)}</td></tr>` : ''}
<tr><td class="total"><b>TOTAL</b></td><td class="total" align="right"><b>₹${Number(order.total).toFixed(2)}</b></td></tr></table><hr/>
<div style="font-size:10px">Payment: ${(order.payment_method ?? '—').toUpperCase()} | Status: ${order.payment_status?.toUpperCase() ?? '—'}</div>
<div class="footer">Thank you for visiting!</div>
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank', 'width=400,height=560');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Main component ───────────────────────────────────────────────────────────
export default function OrdersScreen() {
  const [orders, setOrders]       = useState<Order[]>([]);
  const [selected, setSelected]   = useState<Order | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all');
  const [search, setSearch]       = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { isOnline, restaurant } = useAppStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  // ── Load orders ──────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (Platform.OS === 'web') {
        const res  = await ordersApi.list();
        const data = res.data?.data ?? res.data ?? [];
        const list = Array.isArray(data) ? data : [];
        setOrders(list);
        // Update selected if it's open
        setSelected(prev => prev ? (list.find(o => o.id === prev.id) ?? prev) : null);
      } else {
        const list = await getOrders(200);
        setOrders(list);
        setSelected(prev => prev ? (list.find(o => o.id === prev.id) ?? prev) : null);
      }
    } catch {
      if (Platform.OS === 'web') setOrders(await webGetOrders(200));
      else setOrders(await getOrders(200));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try { if (isOnline) await syncService.manualSync(); } catch {}
    await load();
    setRefreshing(false);
  }

  // ── Status advance ───────────────────────────────────────────────────────
  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next || advancing) return;
    setAdvancing(true);
    try {
      if (isOnline) {
        await ordersApi.updateStatus(order.id, next);
      } else {
        if (Platform.OS === 'web') {
          await webUpdateOrderStatus(String(order.id), next);
          await webAddSyncQueue({ id: `s-${order.id}-${Date.now()}`, action: 'update_status', payload: JSON.stringify({ order_id: order.id, status: next }), created_at: new Date().toISOString() });
        } else {
          await updateLocalOrderStatus(order.id, next);
          await addToSyncQueue({ id: `s-${order.id}-${Date.now()}`, action: 'update_status', payload: JSON.stringify({ order_id: order.id, status: next }), created_at: new Date().toISOString() });
        }
      }
      await load(true);
    } catch (e) { console.warn(e); }
    finally { setAdvancing(false); }
  }

  // ── Mark paid ────────────────────────────────────────────────────────────
  async function markPaid(order: Order) {
    if (!isOnline) return;
    try {
      await client.patch(`/orders/${order.id}`, { payment_status: 'paid' });
      await load(true);
    } catch (e) { console.warn(e); }
  }

  // ── Select order ─────────────────────────────────────────────────────────
  function selectOrder(o: Order) {
    setSelected(o);
    if (!isDesktop) setShowDetail(true);
  }

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = orders.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const num = (o.order_number ?? '').toLowerCase();
      const cust = (o.customer_name ?? '').toLowerCase();
      if (!num.includes(q) && !cust.includes(q)) return false;
    }
    return true;
  });

  // Status counts
  const counts: Record<string, number> = { all: orders.length };
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;

  // ── Detail Panel ─────────────────────────────────────────────────────────
  function DetailPanel({ order, onClose }: { order: Order; onClose?: () => void }) {
    const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
    const nextStatus = NEXT_STATUS[order.status];
    const isPaid = order.payment_status === 'paid';
    return (
      <View style={dp.wrap}>
        {/* Header */}
        <View style={[dp.header, { backgroundColor: cfg.color }]}>
          <View style={{ flex: 1 }}>
            <Text style={dp.orderNum}>#{order.order_number ?? '—'}</Text>
            <Text style={dp.headerSub}>
              {(order.order_type ?? '').replace('_', ' ').toUpperCase()}
              {order.restaurant_table?.name ? ` · Table ${order.restaurant_table.name}` : ''}
            </Text>
          </View>
          <View style={dp.headerRight}>
            <View style={[dp.statusPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name={cfg.icon as any} size={12} color="#fff" />
              <Text style={dp.statusPillText}>{cfg.label}</Text>
            </View>
            {onClose && (
              <TouchableOpacity onPress={onClose} style={dp.closeBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Customer + time */}
          <View style={dp.section}>
            <View style={dp.infoRow}>
              <View style={dp.infoItem}>
                <Text style={dp.infoLabel}>Customer</Text>
                <Text style={dp.infoVal}>{order.customer_name || 'Walk-in'}</Text>
              </View>
              {order.customer_phone ? (
                <View style={dp.infoItem}>
                  <Text style={dp.infoLabel}>Phone</Text>
                  <Text style={dp.infoVal}>{order.customer_phone}</Text>
                </View>
              ) : null}
              <View style={dp.infoItem}>
                <Text style={dp.infoLabel}>Placed</Text>
                <Text style={dp.infoVal}>{formatTime(order.created_at)}</Text>
              </View>
              <View style={dp.infoItem}>
                <Text style={dp.infoLabel}>Source</Text>
                <View style={[dp.srcBadge, { backgroundColor: SOURCE_CFG[order.source ?? 'pos']?.bg ?? '#f0f2f0' }]}>
                  <Text style={[dp.srcBadgeText, { color: SOURCE_CFG[order.source ?? 'pos']?.color ?? '#1A2B1A' }]}>
                    {(order.source ?? 'POS').toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Items */}
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>Items</Text>
            {order.items?.map((item, idx) => (
              <View key={idx} style={dp.itemRow}>
                <View style={[dp.qtyBox, { backgroundColor: cfg.bg }]}>
                  <Text style={[dp.qtyBoxText, { color: cfg.color }]}>{item.quantity}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={dp.itemName}>{item.name}</Text>
                  {item.variation && <Text style={dp.itemVar}>{item.variation}</Text>}
                </View>
                <Text style={dp.itemPrice}>₹{Number(item.total_price).toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>Summary</Text>
            <View style={dp.sumRow}>
              <Text style={dp.sumLabel}>Subtotal</Text>
              <Text style={dp.sumVal}>₹{Number(order.subtotal ?? 0).toFixed(2)}</Text>
            </View>
            {Number(order.tax_amount) > 0 && (
              <View style={dp.sumRow}>
                <Text style={dp.sumLabel}>Tax</Text>
                <Text style={dp.sumVal}>₹{Number(order.tax_amount).toFixed(2)}</Text>
              </View>
            )}
            {Number(order.discount_amount) > 0 && (
              <View style={dp.sumRow}>
                <Text style={[dp.sumLabel, { color: '#16a34a' }]}>Discount</Text>
                <Text style={[dp.sumVal, { color: '#16a34a' }]}>-₹{Number(order.discount_amount).toFixed(2)}</Text>
              </View>
            )}
            <View style={[dp.sumRow, { paddingTop: 10, borderTopWidth: 1.5, borderTopColor: '#1A2B1A', marginTop: 6 }]}>
              <Text style={[dp.sumLabel, { fontSize: 16, fontWeight: '800', color: '#1A2B1A' }]}>TOTAL</Text>
              <Text style={[dp.sumVal, { fontSize: 18, fontWeight: '800', color: '#0D76E1' }]}>₹{Number(order.total ?? 0).toFixed(2)}</Text>
            </View>
          </View>

          {/* Payment */}
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>Payment</Text>
            <View style={dp.payRow}>
              <View style={dp.payItem}>
                <Text style={dp.infoLabel}>Method</Text>
                <Text style={dp.infoVal}>{(order.payment_method ?? '—').toUpperCase()}</Text>
              </View>
              <View style={dp.payItem}>
                <Text style={dp.infoLabel}>Status</Text>
                <View style={[dp.payStatusPill, isPaid ? dp.paidPill : dp.unpaidPill]}>
                  <View style={[dp.payStatusDot, { backgroundColor: isPaid ? '#16a34a' : '#d97706' }]} />
                  <Text style={[dp.payStatusText, { color: isPaid ? '#16a34a' : '#d97706' }]}>
                    {isPaid ? 'Paid' : 'Unpaid'}
                  </Text>
                </View>
              </View>
              {Number(order.received_amount) > 0 && (
                <View style={dp.payItem}>
                  <Text style={dp.infoLabel}>Received</Text>
                  <Text style={dp.infoVal}>₹{Number(order.received_amount).toFixed(2)}</Text>
                </View>
              )}
            </View>
          </View>

          {order.notes ? (
            <View style={dp.section}>
              <Text style={dp.sectionTitle}>Notes</Text>
              <View style={dp.notesBox}>
                <Ionicons name="document-text-outline" size={14} color="#9ca3af" />
                <Text style={dp.notesText}>{order.notes}</Text>
              </View>
            </View>
          ) : null}

          {/* Action buttons */}
          <View style={dp.actions}>
            {nextStatus && (
              <TouchableOpacity
                style={[dp.advBtn, { backgroundColor: STATUS_CFG[nextStatus]?.color ?? '#1A2B1A' }, advancing && { opacity: 0.6 }]}
                onPress={() => advanceStatus(order)}
                disabled={advancing}
              >
                {advancing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name={NEXT_ICON[order.status] as any} size={16} color="#fff" />
                      <Text style={dp.advBtnText}>{NEXT_LABEL[order.status]}</Text>
                    </>
                }
              </TouchableOpacity>
            )}
            {!isPaid && isOnline && (
              <TouchableOpacity style={dp.paidBtn} onPress={() => markPaid(order)}>
                <Ionicons name="cash-outline" size={16} color="#fff" />
                <Text style={dp.paidBtnText}>Mark Paid</Text>
              </TouchableOpacity>
            )}
            {Platform.OS === 'web' && (
              <TouchableOpacity style={dp.printBtn} onPress={() => printReceipt(order, restaurant)}>
                <Ionicons name="print-outline" size={16} color="#1A2B1A" />
                <Text style={dp.printBtnText}>Print</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Order row card (compact, for the list) ───────────────────────────────
  function OrderRow({ o }: { o: Order }) {
    const cfg    = STATUS_CFG[o.status] ?? STATUS_CFG.pending;
    const src    = o.source ?? 'pos';
    const srcCfg = SOURCE_CFG[src] ?? SOURCE_CFG.pos;
    const isPaid = o.payment_status === 'paid';
    const isActive = selected?.id === o.id;

    return (
      <TouchableOpacity
        style={[oc.row, isActive && oc.rowActive, { borderLeftColor: cfg.dot }]}
        onPress={() => selectOrder(o)}
        activeOpacity={0.8}
      >
        <View style={oc.rowLeft}>
          <View style={[oc.statusDot, { backgroundColor: cfg.dot }]} />
          <View style={{ flex: 1 }}>
            <View style={oc.topLine}>
              <Text style={oc.num}>#{o.order_number ?? '—'}</Text>
              {src !== 'pos' && (
                <View style={[oc.srcTag, { backgroundColor: srcCfg.bg }]}>
                  <Text style={[oc.srcTagText, { color: srcCfg.color }]}>{src.toUpperCase()}</Text>
                </View>
              )}
            </View>
            <Text style={oc.customer} numberOfLines={1}>
              {o.customer_name || 'Walk-in'}{o.restaurant_table?.name ? ` · ${o.restaurant_table.name}` : ''}
            </Text>
            <Text style={oc.itemSummary} numberOfLines={1}>
              {o.items?.map(i => `${i.quantity}× ${i.name}`).join(', ') || 'No items'}
            </Text>
            <Text style={oc.time}>{formatTime(o.created_at)}</Text>
          </View>
        </View>
        <View style={oc.rowRight}>
          <Text style={oc.total}>₹{Number(o.total ?? 0).toFixed(2)}</Text>
          <View style={[oc.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[oc.statusChipText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {!isPaid && (
            <View style={oc.unpaidTag}>
              <Text style={oc.unpaidText}>Unpaid</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ── Filter bar ──────────────────────────────────────────────────────────
  const FilterBar = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fb.bar} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 7 }}>
      {FILTER_STATUSES.map(s => {
        const count   = counts[s] ?? 0;
        const isActive = filter === s;
        const cfg     = STATUS_CFG[s];
        return (
          <TouchableOpacity
            key={s}
            style={[fb.chip, isActive && { backgroundColor: cfg ? cfg.color : '#1A2B1A', borderColor: cfg ? cfg.color : '#1A2B1A' }]}
            onPress={() => setFilter(s)}
          >
            {cfg && <View style={[fb.dot, { backgroundColor: isActive ? '#fff' : cfg.dot }]} />}
            <Text style={[fb.label, isActive && { color: '#fff', fontWeight: '700' }]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
            <View style={[fb.badge, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={[fb.badgeText, isActive && { color: '#fff' }]}>{count}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // ── Main render ─────────────────────────────────────────────────────────
  return (
    <View style={s.shell}>
      {/* Left panel: list */}
      <View style={[s.listPanel, isDesktop && selected && { maxWidth: 420 }]}>
        {/* Search bar */}
        <View style={s.searchBar}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput
            style={s.searchInput}
            placeholder="Search order # or customer..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#9ca3af"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
        </View>
        <FilterBar />

        {loading && orders.length === 0 ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color="#C9A52A" size="large" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={o => String(o.id)}
            contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, paddingBottom: 32, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#C9A52A" />}
            renderItem={({ item }) => <OrderRow o={item} />}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="receipt-outline" size={38} color="#e5e7eb" />
                <Text style={s.emptyTitle}>No orders</Text>
                <Text style={s.emptySub}>{search ? 'No results for "' + search + '"' : filter === 'all' ? 'Pull to refresh' : `No ${filter} orders`}</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Right panel: detail (desktop only) */}
      {isDesktop && (
        <View style={s.detailPanel}>
          {selected
            ? <DetailPanel order={selected} />
            : (
              <View style={s.noSelection}>
                <Ionicons name="receipt-outline" size={50} color="#e5e7eb" />
                <Text style={s.noSelTitle}>Select an Order</Text>
                <Text style={s.noSelSub}>Tap any order on the left to view details, update status, or print receipt</Text>
              </View>
            )
          }
        </View>
      )}

      {/* Mobile detail modal */}
      {!isDesktop && (
        <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDetail(false)}>
          <View style={{ flex: 1 }}>
            {selected && <DetailPanel order={selected} onClose={() => setShowDetail(false)} />}
          </View>
        </Modal>
      )}
    </View>
  );
}

// ── StyleSheets ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  shell:      { flex: 1, flexDirection: 'row', backgroundColor: '#f0f2f7' },
  listPanel:  { flex: 1, flexDirection: 'column', backgroundColor: '#f0f2f7' },
  detailPanel:{ flex: 1, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', backgroundColor: '#fff' },
  searchBar:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', marginHorizontal: 10, marginTop: 10, marginBottom: 2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  searchInput:{ flex: 1, fontSize: 13.5, color: '#111827' },
  loadingWrap:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  empty:      { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#9ca3af' },
  emptySub:   { fontSize: 12.5, color: '#d1d5db', textAlign: 'center' },
  noSelection:{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 },
  noSelTitle: { fontSize: 18, fontWeight: '700', color: '#9ca3af' },
  noSelSub:   { fontSize: 13, color: '#d1d5db', textAlign: 'center', lineHeight: 20 },
});

const fb = StyleSheet.create({
  bar:       { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  dot:       { width: 6, height: 6, borderRadius: 3 },
  label:     { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  badge:     { backgroundColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 10.5, fontWeight: '700', color: '#6b7280' },
});

const oc = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  rowActive: { borderColor: '#93c5fd', shadowOpacity: 0.12 },
  rowLeft:   { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginRight: 10 },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  topLine:   { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  num:       { fontSize: 16, fontWeight: '800', color: '#111827' },
  srcTag:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  srcTagText:{ fontSize: 9.5, fontWeight: '800' },
  customer:  { fontSize: 12.5, fontWeight: '600', color: '#374151', marginBottom: 2 },
  itemSummary: { fontSize: 11.5, color: '#9ca3af', marginBottom: 3 },
  time:      { fontSize: 11, color: '#d1d5db' },
  rowRight:  { alignItems: 'flex-end', gap: 5 },
  total:     { fontSize: 16, fontWeight: '800', color: '#C9A52A' },
  statusChip:{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusChipText: { fontSize: 10.5, fontWeight: '700' },
  unpaidTag: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  unpaidText:{ fontSize: 9.5, fontWeight: '700', color: '#d97706' },
});

const dp = StyleSheet.create({
  wrap:      { flex: 1, flexDirection: 'column', backgroundColor: '#fff' },
  header:    { flexDirection: 'row', alignItems: 'flex-start', padding: 20, gap: 10 },
  orderNum:  { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  headerRight:{ alignItems: 'flex-end', gap: 8 },
  statusPill:{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  closeBtn:  { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },

  section:   { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sectionTitle: { fontSize: 10.5, fontWeight: '800', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },

  infoRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  infoItem:  { minWidth: 130 },
  infoLabel: { fontSize: 10.5, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  infoVal:   { fontSize: 14, fontWeight: '600', color: '#111827' },
  srcBadge:  { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  srcBadgeText: { fontSize: 11, fontWeight: '800' },

  itemRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  qtyBox:    { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  qtyBoxText:{ fontSize: 12, fontWeight: '800' },
  itemName:  { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemVar:   { fontSize: 11.5, color: '#C9A52A', marginTop: 1 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: '#374151' },

  sumRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  sumLabel:  { fontSize: 13.5, color: '#6b7280' },
  sumVal:    { fontSize: 13.5, fontWeight: '600', color: '#374151' },

  payRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  payItem:   { minWidth: 100 },
  payStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', marginTop: 4 },
  paidPill:  { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  unpaidPill:{ backgroundColor: '#fef9ec', borderColor: '#fcd34d' },
  payStatusDot: { width: 6, height: 6, borderRadius: 3 },
  payStatusText: { fontSize: 12, fontWeight: '700' },

  notesBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#f8f9fb', borderRadius: 10, padding: 12 },
  notesText: { flex: 1, fontSize: 13.5, color: '#374151', lineHeight: 20 },

  actions:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 18, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  advBtn:    { flex: 1, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 10 },
  advBtnText:{ color: '#fff', fontSize: 13.5, fontWeight: '800' },
  paidBtn:   { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: '#16a34a' },
  paidBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  printBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#f0f2f7', borderWidth: 1, borderColor: '#e5e7eb' },
  printBtnText: { fontSize: 13, fontWeight: '700', color: '#1A2B1A' },
});
