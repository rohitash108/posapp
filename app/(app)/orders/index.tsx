/**
 * Orders Screen — matches csPos Admin Orders page
 * Status cards · Tab navigation · Grid/List toggle · Date filter
 * Aggregator Accept/Reject · Payment method selector · Status advance
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, RefreshControl, ScrollView,
  TextInput, Modal, ActivityIndicator, Platform, Alert, Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { ordersApi } from '@/api/orders';
import { useAppStore } from '@/store/appStore';
import type { Order, OrderStatus } from '@/types';

// ── Color system (maps to csPos badge-soft-* classes) ────────────────────────
const STATUS_CFG = {
  pending:   { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', dot: '#3b82f6', label: 'Pending',   icon: 'time-outline',              next: 'confirmed', nextLabel: 'Confirm'       },
  confirmed: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', dot: '#3b82f6', label: 'Confirmed', icon: 'checkmark-circle-outline',  next: 'preparing', nextLabel: 'Start Cooking' },
  preparing: { bg: '#fff7ed', text: '#d97706', border: '#fde68a', dot: '#f59e0b', label: 'Preparing', icon: 'flame-outline',             next: 'ready',     nextLabel: 'Mark Ready'    },
  ready:     { bg: '#fff7ed', text: '#d97706', border: '#fde68a', dot: '#f59e0b', label: 'Ready',     icon: 'restaurant-outline',        next: 'served',    nextLabel: 'Mark Served'   },
  served:    { bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc', dot: '#06b6d4', label: 'Served',    icon: 'checkmark-done-outline',    next: 'completed', nextLabel: 'Complete'      },
  completed: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', dot: '#22c55e', label: 'Completed', icon: 'checkmark-circle-outline',  next: null,        nextLabel: null            },
  cancelled: { bg: '#fff1f2', text: '#dc2626', border: '#fecaca', dot: '#ef4444', label: 'Cancelled', icon: 'close-circle-outline',      next: null,        nextLabel: null            },
} as const;

const SOURCE_CFG = {
  zomato: { bg: '#fff1f2', text: '#dc2626' },
  swiggy: { bg: '#fff7ed', text: '#ea580c' },
  qr:     { bg: '#f5f3ff', text: '#7c3aed' },
  pos:    { bg: '#f1f5f9', text: '#64748b' },
} as const;

const STATUS_CARDS = [
  { key: 'confirmed', label: 'Confirmed',  icon: 'bookmark-outline',       bg: '#f1f5f9', color: '#64748b' },
  { key: 'pending',   label: 'Pending',    icon: 'time-outline',           bg: '#eff6ff', color: '#2563eb' },
  { key: 'preparing', label: 'Processing', icon: 'reload-outline',         bg: '#fff7ed', color: '#ea580c' },
  { key: 'ready',     label: 'Ready',      icon: 'bicycle-outline',        bg: '#f5f3ff', color: '#7c3aed' },
  { key: 'completed', label: 'Completed',  icon: 'paper-plane-outline',    bg: '#f0fdf4', color: '#16a34a' },
  { key: 'cancelled', label: 'Cancelled',  icon: 'person-remove-outline',  bg: '#fff1f2', color: '#dc2626' },
] as const;

type TabKey = 'all' | 'pending' | 'inprogress' | 'completed' | 'cancelled' | 'paid' | 'unpaid';

const TABS: { key: TabKey; label: string; icon?: any }[] = [
  { key: 'all',        label: 'All Orders'   },
  { key: 'pending',    label: 'Pending'      },
  { key: 'inprogress', label: 'In Progress'  },
  { key: 'completed',  label: 'Completed'    },
  { key: 'cancelled',  label: 'Cancelled'    },
  { key: 'paid',       label: 'Paid'         },
  { key: 'unpaid',     label: 'Unpaid'       },
];

const DATE_RANGES = [
  { key: 'all',       label: 'All Time'   },
  { key: 'today',     label: 'Today'      },
  { key: 'yesterday', label: 'Yesterday'  },
  { key: 'week',      label: 'This Week'  },
  { key: 'month',     label: 'This Month' },
];

const IN_PROGRESS = ['confirmed', 'preparing', 'ready', 'served'];
const POLL_MS     = 30_000;
const PRIMARY     = '#2563eb';
const GOLD        = '#C9A52A';

// ── Helpers ───────────────────────────────────────────────────────────────────
function sCfg(status: string) {
  return STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
}
function srcCfg(source?: string) {
  return SOURCE_CFG[(source ?? 'pos') as keyof typeof SOURCE_CFG] ?? SOURCE_CFG.pos;
}
function isAgg(o: Order) { return o.source === 'zomato' || o.source === 'swiggy'; }

function fmtTime(dt?: string) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isToday(d))     return format(d, 'hh:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'hh:mm a')}`;
  return format(d, 'dd MMM, hh:mm a');
}

function getDateRange(key: string) {
  const now   = new Date();
  const fmt   = (d: Date) => format(d, 'yyyy-MM-dd');
  const today = fmt(now);
  if (key === 'today')     return { from: today, to: today };
  if (key === 'yesterday') { const y = fmt(subDays(now, 1)); return { from: y, to: y }; }
  if (key === 'week')      return { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: today };
  if (key === 'month')     return { from: fmt(startOfMonth(now)), to: today };
  return null;
}

function matchTab(o: Order, t: TabKey) {
  if (t === 'all')        return true;
  if (t === 'pending')    return o.status === 'pending';
  if (t === 'inprogress') return IN_PROGRESS.includes(o.status);
  if (t === 'completed')  return o.status === 'completed';
  if (t === 'cancelled')  return o.status === 'cancelled';
  if (t === 'paid')       return o.payment_status === 'paid';
  if (t === 'unpaid')     return o.payment_status !== 'paid' && o.status !== 'cancelled';
  return true;
}

function srcLabel(source?: string | null): string | null {
  if (!source || source === 'pos') return null;
  if (source === 'zomato') return 'Zomato';
  if (source === 'swiggy') return 'Swiggy';
  if (source === 'qr')     return 'QR';
  return source.toUpperCase();
}

function printReceipt(order: Order, restaurant: any) {
  if (Platform.OS !== 'web') return;
  const rows = (order.items ?? []).map(i =>
    `<tr><td>${i.item_name ?? i.name}${i.variation ? ` (${i.variation})` : ''}</td><td align="center">${i.quantity}</td><td align="right">₹${Number(i.unit_price).toFixed(2)}</td><td align="right">₹${Number(i.total_price).toFixed(2)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Order ${order.order_number}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;max-width:360px;margin:0 auto;padding:12px}
h2{text-align:center;font-size:15px;letter-spacing:2px;margin-bottom:2px}
.sub{text-align:center;font-size:10px;color:#555;line-height:1.4;margin-bottom:10px}
hr{border:none;border-top:1px dashed #aaa;margin:6px 0}
table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;font-size:9px;text-transform:uppercase;color:#777;padding:3px 0;border-bottom:1px solid #ddd}
td{padding:4px 0;vertical-align:top}.ttl{font-size:15px;font-weight:bold}.ft{text-align:center;font-size:10px;color:#999;margin-top:10px}
@media print{body{max-width:100%}}</style></head><body>
<h2>${restaurant?.name ?? 'RESTAURANT'}</h2>
<div class="sub">${restaurant?.address ?? ''}${restaurant?.phone ? '<br>'+restaurant.phone : ''}</div>
<hr/><div style="font-size:11px"><b>#${order.order_number}</b> | ${(order.order_type ?? '').replace(/_/g,' ').toUpperCase()}</div>
<div style="font-size:10px;color:#555;margin:3px 0">${order.customer_name ? `Customer: ${order.customer_name}` : 'Walk-in'}${order.table_name ? ` · Table: ${order.table_name}` : ''}</div>
<hr/><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead><tbody>${rows}</tbody></table><hr/>
<table>
<tr><td>Subtotal</td><td align="right">₹${Number(order.subtotal).toFixed(2)}</td></tr>
${Number(order.tax_amount) > 0 ? `<tr><td>Tax</td><td align="right">₹${Number(order.tax_amount).toFixed(2)}</td></tr>` : ''}
${Number(order.discount_amount) > 0 ? `<tr><td>Discount</td><td align="right" style="color:green">-₹${Number(order.discount_amount).toFixed(2)}</td></tr>` : ''}
<tr><td class="ttl"><b>TOTAL</b></td><td class="ttl" align="right"><b>₹${Number(order.total).toFixed(2)}</b></td></tr>
</table><hr/>
<div style="font-size:10px">Payment: ${(order.payment_method ?? '—').toUpperCase()} | ${(order.payment_status ?? '—').toUpperCase()}</div>
<div class="ft">Thank you for visiting!</div>
<script>window.onload=function(){window.print()}<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=420,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Shared action props ───────────────────────────────────────────────────────
interface ActionProps {
  onStatusChange:  (id: number, status: string) => void;
  onPaymentChange: (id: number, method: string) => void;
  onMarkPaid:      (id: number, paid: boolean) => void;
  onPrint:         (order: Order) => void;
  isUpdating:      boolean;
}

// ── Overlay modals ────────────────────────────────────────────────────────────
function StatusMenu({ order, visible, onClose, onSelect }: {
  order: Order; visible: boolean; onClose: () => void; onSelect: (s: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ovl.backdrop} onPress={onClose}>
        <View style={ovl.menu}>
          <Text style={ovl.title}>Change Status — Order {order.order_number}</Text>
          {(['pending','confirmed','preparing','ready','served','completed'] as OrderStatus[]).map(s => {
            const c = sCfg(s);
            const active = order.status === s;
            return (
              <TouchableOpacity key={s} style={[ovl.item, active && ovl.itemActive]}
                onPress={() => { onClose(); onSelect(s); }}>
                <View style={[ovl.dot, { backgroundColor: c.dot }]} />
                <Text style={[ovl.itemText, active && { fontWeight: '800', color: c.text }]}>{c.label}</Text>
                {active && <Ionicons name="checkmark" size={14} color={c.text} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

function MoreMenu({ order, visible, onClose, onStatusChange, onMarkPaid, onPrint, onShowStatusMenu }: {
  order: Order; visible: boolean; onClose: () => void;
  onStatusChange: (id: number, s: string) => void;
  onMarkPaid: (id: number, paid: boolean) => void;
  onPrint: (o: Order) => void;
  onShowStatusMenu: () => void;
}) {
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ovl.backdrop} onPress={onClose}>
        <View style={ovl.menu}>
          <Text style={ovl.title}>Order {order.order_number}</Text>
          <TouchableOpacity style={ovl.item} onPress={() => { onClose(); onShowStatusMenu(); }}>
            <Ionicons name="swap-horizontal-outline" size={16} color="#374151" />
            <Text style={ovl.itemText}>Change Status</Text>
          </TouchableOpacity>
          {!agg && (
            <TouchableOpacity style={ovl.item} onPress={() => { onClose(); onMarkPaid(order.id, !isPaid); }}>
              <Ionicons name={isPaid ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={16}
                color={isPaid ? '#d97706' : '#16a34a'} />
              <Text style={ovl.itemText}>{isPaid ? 'Mark Unpaid' : 'Mark Paid'}</Text>
            </TouchableOpacity>
          )}
          {order.status !== 'completed' && (
            <TouchableOpacity style={ovl.item} onPress={() => { onClose(); onStatusChange(order.id, 'completed'); }}>
              <Ionicons name="checkmark-done-outline" size={16} color="#16a34a" />
              <Text style={ovl.itemText}>Mark Completed</Text>
            </TouchableOpacity>
          )}
          {order.status !== 'completed' && order.status !== 'cancelled' && (
            <TouchableOpacity style={ovl.item} onPress={() => {
              onClose();
              Alert.alert('Cancel Order', `Cancel order ${order.order_number}?`, [
                { text: 'No', style: 'cancel' },
                { text: 'Cancel', style: 'destructive', onPress: () => onStatusChange(order.id, 'cancelled') },
              ]);
            }}>
              <Ionicons name="close-circle-outline" size={16} color="#d97706" />
              <Text style={[ovl.itemText, { color: '#d97706' }]}>Cancel Order</Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'web' && (
            <TouchableOpacity style={ovl.item} onPress={() => { onClose(); onPrint(order); }}>
              <Ionicons name="print-outline" size={16} color="#374151" />
              <Text style={ovl.itemText}>Print Receipt</Text>
            </TouchableOpacity>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Order Card (Grid View) ────────────────────────────────────────────────────
function OrderCard({ order, onStatusChange, onPaymentChange, onMarkPaid, onPrint, isUpdating }: { order: Order } & ActionProps) {
  const [showMore,   setShowMore]   = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  const cfg    = sCfg(order.status);
  const sc     = srcCfg(order.source);
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const items  = order.items ?? [];
  const visible = items.slice(0, 4);
  const more    = Math.max(0, items.length - 4);

  return (
    <View style={card.wrap}>
      {/* ── Header ── */}
      <View style={card.header}>
        <View style={card.avatar}>
          <Ionicons name="bag-outline" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={card.numRow}>
            <Text style={card.num} numberOfLines={1}>Order {order.order_number}</Text>
            {srcLabel(order.source) && (
              <View style={[card.srcBadge, { backgroundColor: sc.bg }]}>
                <Text style={[card.srcText, { color: sc.text }]}>{srcLabel(order.source)}</Text>
              </View>
            )}
          </View>
          {agg && order.external_id ? (
            <Text style={card.extId} numberOfLines={1}>{order.source} ID: {order.external_id}</Text>
          ) : null}
          <Text style={card.typeText} numberOfLines={1}>
            {(order.order_type ?? 'dine_in').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            {order.table_name ? ` · Table: ${order.table_name}` : ''}
          </Text>
        </View>
        <TouchableOpacity style={card.menuBtn} onPress={() => setShowMore(true)}>
          <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* ── Total & time ── */}
      <View style={card.totalRow}>
        <Text style={card.total}>
          <Text style={card.totalLabel}>Total: </Text>
          ₹{Number(order.total ?? 0).toFixed(2)}
        </Text>
        <View style={card.timeRow}>
          <Ionicons name="time-outline" size={12} color="#6b7280" />
          <Text style={card.time}>{fmtTime(order.created_at)}</Text>
        </View>
      </View>

      {/* ── Items list ── */}
      <View style={card.itemsWrap}>
        {visible.length > 0 ? visible.map((oi, i) => (
          <View key={i} style={card.itemLine}>
            <View style={card.itemDot} />
            <Text style={card.itemName} numberOfLines={1}>{oi.item_name ?? oi.name}</Text>
            <Text style={card.itemQty} numberOfLines={1}>
              ×{oi.quantity}{Number(oi.unit_price) > 0 ? ` · ₹${Number(oi.unit_price).toFixed(2)}` : ''}
            </Text>
          </View>
        )) : agg ? (
          <Text style={card.noItems}>Items not loaded from {order.source}</Text>
        ) : null}
        {order.notes ? (
          <View style={card.notesBox}>
            <Ionicons name="information-circle-outline" size={12} color="#6b7280" />
            <Text style={card.notesText} numberOfLines={2}>Notes: {order.notes}</Text>
          </View>
        ) : null}
        {more > 0 && <Text style={card.more}>+{more} More</Text>}
      </View>

      {/* ── Action buttons: Receipt | Print | KOT ── */}
      <View style={card.btnRow}>
        <TouchableOpacity style={[card.btn, card.receiptBtn]} onPress={() => onPrint(order)}>
          <Ionicons name="document-text-outline" size={12} color="#4f46e5" />
          <Text style={[card.btnText, { color: '#4f46e5' }]}>Receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[card.btn, card.printBtn]} onPress={() => onPrint(order)}>
          <Ionicons name="print-outline" size={12} color="#fff" />
          <Text style={[card.btnText, { color: '#fff' }]}>Print</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[card.btn, card.kotBtn]}>
          <Ionicons name="restaurant-outline" size={12} color="#1A2B1A" />
          <Text style={[card.btnText, { color: '#1A2B1A' }]}>KOT</Text>
        </TouchableOpacity>
      </View>

      {/* ── Payment method selector ── */}
      {!agg && (
        <View style={card.payMethodRow}>
          <Text style={card.payMethodLabel}>Payment:</Text>
          {(['cash', 'card', 'upi'] as const).map(m => {
            const active = (order.payment_method ?? '') === m;
            return (
              <TouchableOpacity key={m} disabled={isUpdating}
                style={[card.payMethodBtn, active && card.payMethodBtnActive]}
                onPress={() => onPaymentChange(order.id, m)}>
                <Text style={[card.payMethodText, active && { color: '#fff' }]}>
                  {m === 'upi' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Footer: payment badge + status actions ── */}
      <View style={card.footer}>
        {/* Payment status badge */}
        <View style={[card.payBadge, isPaid ? card.paidBadge : card.unpaidBadge]}>
          <Ionicons name={isPaid ? 'checkmark-circle' : 'alert-circle'} size={11}
            color={isPaid ? '#16a34a' : '#d97706'} />
          <Text style={[card.payBadgeText, { color: isPaid ? '#16a34a' : '#d97706' }]}>
            {isPaid ? 'Paid' : 'Unpaid'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          {/* Status badge */}
          <View style={[card.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <View style={[card.statusDot, { backgroundColor: cfg.dot }]} />
            <Text style={[card.statusText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>

          {/* Aggregator: Accept/Reject */}
          {agg && order.status === 'pending' ? (
            <>
              <TouchableOpacity style={card.acceptBtn} disabled={isUpdating}
                onPress={() => onStatusChange(order.id, 'confirmed')}>
                <Text style={card.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={card.rejectBtn} disabled={isUpdating}
                onPress={() => Alert.alert('Reject Order', `Reject this ${order.source} order?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reject', style: 'destructive', onPress: () => onStatusChange(order.id, 'cancelled') },
                ])}>
                <Text style={card.rejectText}>Reject</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* Status dropdown button */
            <TouchableOpacity style={card.statusDropBtn} onPress={() => setShowStatus(true)}>
              <Text style={card.statusDropText}>{cfg.label}</Text>
              <Ionicons name="chevron-down" size={11} color="#374151" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <StatusMenu order={order} visible={showStatus} onClose={() => setShowStatus(false)}
        onSelect={(s) => onStatusChange(order.id, s)} />
      <MoreMenu order={order} visible={showMore} onClose={() => setShowMore(false)}
        onStatusChange={onStatusChange} onMarkPaid={onMarkPaid} onPrint={onPrint}
        onShowStatusMenu={() => setShowStatus(true)} />
    </View>
  );
}

// ── Order List Row (Table View) ───────────────────────────────────────────────
function OrderListRow({ order, onStatusChange, onPaymentChange, onMarkPaid, onPrint, isUpdating }: { order: Order } & ActionProps) {
  const [showMore,   setShowMore]   = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  const cfg    = sCfg(order.status);
  const sc     = srcCfg(order.source);
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);

  return (
    <View style={row.wrap}>
      {/* Order */}
      <View style={row.c1}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Text style={row.orderNum}>Order {order.order_number}</Text>
          {srcLabel(order.source) && (
            <View style={[row.srcBadge, { backgroundColor: sc.bg }]}>
              <Text style={[row.srcText, { color: sc.text }]}>{srcLabel(order.source)}</Text>
            </View>
          )}
        </View>
        <Text style={row.subText}>{order.created_at ? format(new Date(order.created_at), 'dd MMM, hh:mm a') : '—'}</Text>
        {agg && order.external_id ? <Text style={row.subText}>{order.source} ID: {order.external_id}</Text> : null}
      </View>
      {/* Customer */}
      <View style={row.c2}>
        <Text style={row.custName}>{order.customer_name || '—'}</Text>
        {order.customer_phone ? <Text style={row.subText}>{order.customer_phone}</Text> : null}
      </View>
      {/* Type */}
      <View style={row.c3}>
        <Text style={row.typeText}>
          {(order.order_type ?? 'dine_in').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </Text>
        {order.table_name ? <Text style={row.subText}>Table: {order.table_name}</Text> : null}
      </View>
      {/* Items */}
      <View style={[row.c4, { alignItems: 'center' }]}>
        <View style={row.itemsBadge}>
          <Text style={row.itemsBadgeText}>{order.items?.length ?? 0}</Text>
        </View>
      </View>
      {/* Total */}
      <View style={[row.c5, { alignItems: 'flex-end' }]}>
        <Text style={row.total}>₹{Number(order.total ?? 0).toFixed(2)}</Text>
      </View>
      {/* Status */}
      <View style={row.c6}>
        <View style={[row.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[row.statusText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>
      {/* Payment */}
      <View style={row.c7}>
        <View style={[row.payBadge, isPaid ? row.paidBadge : row.unpaidBadge]}>
          <Ionicons name={isPaid ? 'checkmark-circle' : 'alert-circle'} size={10}
            color={isPaid ? '#16a34a' : '#d97706'} />
          <Text style={[row.payBadgeText, { color: isPaid ? '#16a34a' : '#d97706' }]}>
            {isPaid ? 'Paid' : 'Unpaid'}
          </Text>
        </View>
        {!agg && (
          <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
            {(['cash','card','upi'] as const).map(m => {
              const active = (order.payment_method ?? '') === m;
              return (
                <TouchableOpacity key={m} disabled={isUpdating}
                  style={[row.pmBtn, active && row.pmBtnActive]}
                  onPress={() => onPaymentChange(order.id, m)}>
                  <Text style={[row.pmText, active && { color: '#fff' }]}>
                    {m === 'upi' ? 'UPI' : m.charAt(0).toUpperCase()+m.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
      {/* Actions */}
      <View style={[row.c8, { alignItems: 'flex-end' }]}>
        {agg && order.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
            <TouchableOpacity style={row.acceptBtn} disabled={isUpdating}
              onPress={() => onStatusChange(order.id, 'confirmed')}>
              <Text style={row.acceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={row.rejectBtn} disabled={isUpdating}
              onPress={() => Alert.alert('Reject', `Reject this ${order.source} order?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reject', style: 'destructive', onPress: () => onStatusChange(order.id, 'cancelled') },
              ])}>
              <Text style={row.rejectText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={row.iconGroup}>
          <TouchableOpacity style={[row.iconBtn, row.receiptIconBtn]} onPress={() => onPrint(order)}>
            <Ionicons name="document-text-outline" size={14} color="#4f46e5" />
          </TouchableOpacity>
          <TouchableOpacity style={[row.iconBtn, row.printIconBtn]} onPress={() => onPrint(order)}>
            <Ionicons name="print-outline" size={14} color="#0891b2" />
          </TouchableOpacity>
          <TouchableOpacity style={[row.iconBtn, row.kotIconBtn]}>
            <Ionicons name="restaurant-outline" size={14} color="#7c3aed" />
          </TouchableOpacity>
          <TouchableOpacity style={[row.iconBtn, row.moreIconBtn]} onPress={() => setShowMore(true)}>
            <Ionicons name="ellipsis-vertical" size={14} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      <StatusMenu order={order} visible={showStatus} onClose={() => setShowStatus(false)}
        onSelect={(s) => onStatusChange(order.id, s)} />
      <MoreMenu order={order} visible={showMore} onClose={() => setShowMore(false)}
        onStatusChange={onStatusChange} onMarkPaid={onMarkPaid} onPrint={onPrint}
        onShowStatusMenu={() => setShowStatus(true)} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OrdersScreen() {
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [tab,         setTab]         = useState<TabKey>('all');
  const [search,      setSearch]      = useState('');
  const [dateRange,   setDateRange]   = useState('all');
  const [viewMode,    setViewMode]    = useState<'grid' | 'list'>('grid');
  const [isUpdating,  setIsUpdating]  = useState(false);
  const [showDateDrop, setShowDateDrop] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { restaurant } = useAppStore();
  const { width }  = useWindowDimensions();
  const isDesktop  = width >= 1024;
  // Subtract sidebar (220px) so columns fill only the content pane
  const contentW   = isDesktop ? width - 220 : width;
  const numCols    = contentW >= 2200 ? 5 : contentW >= 1700 ? 4 : contentW >= 1200 ? 3 : contentW >= 700 ? 2 : 1;

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const range  = getDateRange(dateRange);
      const params: any = { per_page: 300 };
      if (range) { params.from = range.from; params.to = range.to; }
      const res  = await ordersApi.list(params);
      const data = res.data?.data ?? res.data ?? [];
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Orders load:', e);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: number, status: string) => {
    setIsUpdating(true);
    try {
      await ordersApi.updateStatus(id, status);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as OrderStatus } : o));
    } catch (e: any) {
      Alert.alert('Update Failed', e?.response?.data?.message ?? 'Could not update status');
    } finally { setIsUpdating(false); }
  }, []);

  const handlePaymentChange = useCallback(async (id: number, method: string) => {
    setIsUpdating(true);
    try {
      await ordersApi.updatePaymentMethod(id, method);
      setOrders(prev => prev.map(o =>
        o.id === id ? { ...o, payment_method: method as any, payment_status: 'paid' } : o
      ));
    } catch (e: any) {
      Alert.alert('Update Failed', e?.response?.data?.message ?? 'Could not update payment');
    } finally { setIsUpdating(false); }
  }, []);

  const handleMarkPaid = useCallback(async (id: number, paid: boolean) => {
    setIsUpdating(true);
    try {
      await ordersApi.updatePayment(id, { payment_status: paid ? 'paid' : 'unpaid' });
      setOrders(prev => prev.map(o =>
        o.id === id ? { ...o, payment_status: paid ? 'paid' : 'unpaid' } : o
      ));
    } catch (e: any) {
      Alert.alert('Update Failed', e?.response?.data?.message ?? 'Could not update payment status');
    } finally { setIsUpdating(false); }
  }, []);

  const handlePrint = useCallback((order: Order) => {
    printReceipt(order, restaurant);
  }, [restaurant]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => orders.filter(o => {
    if (!matchTab(o, tab)) return false;
    if (search) {
      const q  = search.toLowerCase();
      const n  = (o.order_number ?? '').toLowerCase();
      const c  = (o.customer_name ?? '').toLowerCase();
      if (!n.includes(q) && !c.includes(q)) return false;
    }
    return true;
  }), [orders, tab, search]);

  const tabCounts = useMemo(() => {
    const c: Record<TabKey, number> = { all: 0, pending: 0, inprogress: 0, completed: 0, cancelled: 0, paid: 0, unpaid: 0 };
    for (const o of orders) {
      c.all++;
      if (o.status === 'pending')              c.pending++;
      if (IN_PROGRESS.includes(o.status))      c.inprogress++;
      if (o.status === 'completed')            c.completed++;
      if (o.status === 'cancelled')            c.cancelled++;
      if (o.payment_status === 'paid')         c.paid++;
      if (o.payment_status !== 'paid' && o.status !== 'cancelled') c.unpaid++;
    }
    return c;
  }, [orders]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const dateLabel = DATE_RANGES.find(r => r.key === dateRange)?.label ?? 'All Time';

  const actionProps: ActionProps = {
    onStatusChange:  handleStatusChange,
    onPaymentChange: handlePaymentChange,
    onMarkPaid:      handleMarkPaid,
    onPrint:         handlePrint,
    isUpdating,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.shell}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={GOLD} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status summary cards ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.cardsScroll}
          contentContainerStyle={[s.cardsRow, isDesktop && { minWidth: '100%' }]}
        >
          {STATUS_CARDS.map(cfg => (
            <View key={cfg.key} style={[s.statCard, isDesktop && { flex: 1, minWidth: 140 }]}>
              <View>
                <Text style={s.statLabel}>{cfg.label}</Text>
                <Text style={s.statCount}>{statusCounts[cfg.key] ?? 0}</Text>
              </View>
              <View style={[s.statIcon, { backgroundColor: cfg.bg }]}>
                <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
              </View>
            </View>
          ))}
        </ScrollView>

        {/* ── Tab bar ── */}
        <View style={s.tabSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
            {TABS.map(t => {
              const active = tab === t.key;
              const accentColor = t.key === 'paid' ? '#16a34a' : t.key === 'unpaid' ? '#d97706' : PRIMARY;
              return (
                <TouchableOpacity key={t.key}
                  style={[s.tab, active && { ...s.tabActive, borderBottomColor: accentColor }]}
                  onPress={() => setTab(t.key)}
                >
                  <Text style={[s.tabText, active && { ...s.tabTextActive, color: accentColor }]}>
                    {t.label}
                    {tabCounts[t.key] > 0 && (
                      <Text style={{ fontWeight: '600' }}> ({tabCounts[t.key]})</Text>
                    )}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Toolbar: view toggle + date + search */}
          <View style={s.toolbar}>
            {/* View toggle */}
            <View style={s.viewToggle}>
              <TouchableOpacity
                style={[s.viewBtn, viewMode === 'grid' && s.viewBtnActive]}
                onPress={() => setViewMode('grid')}
              >
                <Ionicons name="grid-outline" size={14} color={viewMode === 'grid' ? '#fff' : '#64748b'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.viewBtn, viewMode === 'list' && s.viewBtnActive]}
                onPress={() => setViewMode('list')}
              >
                <Ionicons name="list-outline" size={14} color={viewMode === 'list' ? '#fff' : '#64748b'} />
              </TouchableOpacity>
            </View>

            {/* Date range button */}
            <TouchableOpacity style={s.dateBtn} onPress={() => setShowDateDrop(true)}>
              <Ionicons name="calendar-outline" size={13} color="#374151" />
              <Text style={s.dateBtnText}>{dateLabel}</Text>
              <Ionicons name="chevron-down" size={12} color="#374151" />
            </TouchableOpacity>

            {/* Search */}
            <View style={s.searchBox}>
              <Ionicons name="search" size={13} color="#9ca3af" />
              <TextInput
                style={s.searchInput}
                placeholder="Search order # or customer..."
                value={search}
                onChangeText={setSearch}
                placeholderTextColor="#9ca3af"
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={14} color="#9ca3af" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Content ── */}
        {loading ? (
          <View style={s.loadWrap}>
            <ActivityIndicator color={GOLD} size="large" />
            <Text style={s.loadText}>Loading orders...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="bag-outline" size={52} color="#e5e7eb" />
            <Text style={s.emptyTitle}>No orders found</Text>
            <Text style={s.emptySub}>
              {search
                ? `No results for "${search}"`
                : `No ${tab === 'all' ? '' : tab + ' '}orders${dateRange !== 'all' ? ` for ${dateLabel}` : ''}`
              }
            </Text>
          </View>
        ) : viewMode === 'grid' ? (
          <View style={[s.grid, numCols > 1 && s.gridRow]}>
            {filtered.map(o => (
              <View key={o.id} style={{ width: `${100 / numCols}%` as any, padding: 6 }}>
                <OrderCard order={o} {...actionProps} />
              </View>
            ))}
          </View>
        ) : (
          // List view
          <View style={s.listWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: isDesktop ? '100%' : 900 }}>
                {/* Table header */}
                <View style={row.header}>
                  <Text style={[row.hCell, row.c1]}>Order</Text>
                  <Text style={[row.hCell, row.c2]}>Customer</Text>
                  <Text style={[row.hCell, row.c3]}>Type</Text>
                  <Text style={[row.hCell, row.c4, { textAlign: 'center' }]}>Items</Text>
                  <Text style={[row.hCell, row.c5, { textAlign: 'right' }]}>Total</Text>
                  <Text style={[row.hCell, row.c6]}>Status</Text>
                  <Text style={[row.hCell, row.c7]}>Payment</Text>
                  <Text style={[row.hCell, row.c8, { textAlign: 'right' }]}>Actions</Text>
                </View>
                {filtered.map((o, idx) => (
                  <View key={o.id} style={idx % 2 === 1 ? { backgroundColor: '#f9fafb' } : {}}>
                    <OrderListRow order={o} {...actionProps} />
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* Date range dropdown */}
      <Modal visible={showDateDrop} transparent animationType="fade" onRequestClose={() => setShowDateDrop(false)}>
        <Pressable style={ovl.backdrop} onPress={() => setShowDateDrop(false)}>
          <View style={[ovl.menu, { position: 'absolute', top: 170, right: 16 }]}>
            <Text style={ovl.title}>Date Range</Text>
            {DATE_RANGES.map(r => (
              <TouchableOpacity key={r.key} style={ovl.item}
                onPress={() => { setDateRange(r.key); setShowDateDrop(false); }}>
                <Ionicons name="calendar-outline" size={14} color={dateRange === r.key ? PRIMARY : '#374151'} />
                <Text style={[ovl.itemText, dateRange === r.key && { color: PRIMARY, fontWeight: '700' }]}>{r.label}</Text>
                {dateRange === r.key && <Ionicons name="checkmark" size={13} color={PRIMARY} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── StyleSheets ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell:      { flex: 1, backgroundColor: '#f0f2f7' },

  // Status cards
  cardsScroll:{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  cardsRow:   { flexDirection: 'row', padding: 12, gap: 10 },
  statCard:   { minWidth: 140, backgroundColor: '#fff', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  statLabel:  { fontSize: 12.5, fontWeight: '500', color: '#64748b', marginBottom: 3 },
  statCount:  { fontSize: 24, fontWeight: '800', color: '#111827' },
  statIcon:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Tabs
  tabSection: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 10 },
  tabsRow:    { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 14, gap: 4 },
  tab:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:  { borderBottomColor: PRIMARY },
  tabText:    { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: PRIMARY, fontWeight: '700' },

  // Toolbar
  toolbar:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10, flexWrap: 'wrap' },
  viewToggle: { flexDirection: 'row', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff', padding: 2, gap: 2 },
  viewBtn:    { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  viewBtnActive: { backgroundColor: PRIMARY },
  dateBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  dateBtnText:{ fontSize: 12.5, fontWeight: '600', color: '#374151' },
  searchBox:  { flex: 1, minWidth: 160, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput:{ flex: 1, fontSize: 13, color: '#111827', minWidth: 0 },

  // Content states
  loadWrap:   { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadText:   { fontSize: 14, color: '#9ca3af' },
  emptyWrap:  { paddingTop: 80, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#9ca3af' },
  emptySub:   { fontSize: 12.5, color: '#d1d5db', textAlign: 'center', paddingHorizontal: 40 },

  // Grid — fills full content width, columns determined by contentW
  grid:    { padding: 6, width: '100%' },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', width: '100%' },

  // List
  listWrap:   { margin: 12, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
});

const card = StyleSheet.create({
  wrap:       { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, marginBottom: 2 },
  header:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, paddingBottom: 10 },
  avatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  numRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  num:        { fontSize: 14, fontWeight: '700', color: '#111827' },
  srcBadge:   { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  srcText:    { fontSize: 9.5, fontWeight: '800' },
  extId:      { fontSize: 10.5, color: '#6b7280', marginTop: 1 },
  typeText:   { fontSize: 11.5, color: '#6b7280', marginTop: 2 },
  menuBtn:    { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0', flexShrink: 0 },

  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10 },
  total:      { fontSize: 14, fontWeight: '600', color: '#111827' },
  totalLabel: { fontWeight: '400', color: '#6b7280' },
  timeRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  time:       { fontSize: 12, fontWeight: '600', color: '#374151' },

  itemsWrap:  { paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemLine:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  itemDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: '#9ca3af', flexShrink: 0 },
  itemName:   { flex: 1, fontSize: 12.5, color: '#374151' },
  itemQty:    { fontSize: 12, color: '#374151', fontWeight: '600' },
  noItems:    { fontSize: 12, color: '#f59e0b', fontStyle: 'italic' },
  notesBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: '#fefce8', borderRadius: 6, padding: 7, marginTop: 5 },
  notesText:  { flex: 1, fontSize: 11.5, color: '#713f12' },
  more:       { fontSize: 12.5, fontWeight: '700', color: PRIMARY, marginTop: 5 },

  btnRow:     { flexDirection: 'row', gap: 6, padding: 12, paddingTop: 10 },
  btn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 7, borderWidth: 1 },
  btnText:    { fontSize: 12, fontWeight: '600' },
  receiptBtn: { backgroundColor: '#eef2ff', borderColor: '#e0e7ff' },
  printBtn:   { backgroundColor: PRIMARY, borderColor: PRIMARY },
  kotBtn:     { backgroundColor: '#fff', borderColor: '#d1d5db' },

  payMethodRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 10, flexWrap: 'wrap' },
  payMethodLabel: { fontSize: 11.5, color: '#6b7280', fontWeight: '500' },
  payMethodBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  payMethodBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  payMethodText: { fontSize: 11.5, fontWeight: '600', color: '#374151' },

  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingTop: 8, gap: 8, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  payBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  paidBadge:  { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  unpaidBadge:{ backgroundColor: '#fff7ed', borderColor: '#fde68a' },
  payBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusDot:    { width: 5, height: 5, borderRadius: 3 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  statusDropBtn:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  statusDropText:{ fontSize: 11.5, fontWeight: '600', color: '#374151' },
  acceptBtn:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, backgroundColor: '#16a34a' },
  acceptText: { fontSize: 11.5, fontWeight: '700', color: '#fff' },
  rejectBtn:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, borderWidth: 1, borderColor: '#dc2626', backgroundColor: '#fff' },
  rejectText: { fontSize: 11.5, fontWeight: '700', color: '#dc2626' },
});

const row = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  hCell:    { fontSize: 11.5, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  wrap:     { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },

  c1: { width: 160, paddingRight: 8 },
  c2: { width: 130, paddingRight: 8 },
  c3: { width: 110, paddingRight: 8 },
  c4: { width: 60,  paddingRight: 8 },
  c5: { width: 80,  paddingRight: 8 },
  c6: { width: 100, paddingRight: 8 },
  c7: { width: 130, paddingRight: 8 },
  c8: { width: 170 },

  orderNum:  { fontSize: 13, fontWeight: '700', color: PRIMARY },
  srcBadge:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  srcText:   { fontSize: 9, fontWeight: '800' },
  subText:   { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  extId:     { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  custName:  { fontSize: 13, fontWeight: '600', color: '#111827' },
  typeText:  { fontSize: 12.5, color: '#374151', fontWeight: '500' },
  tableText: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  itemsBadge:{ backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'center' },
  itemsBadgeText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  total:     { fontSize: 13.5, fontWeight: '800', color: '#111827' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  statusText:  { fontSize: 11.5, fontWeight: '700' },
  payBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  paidBadge:   { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  unpaidBadge: { backgroundColor: '#fff7ed', borderColor: '#fde68a' },
  payBadgeText: { fontSize: 10.5, fontWeight: '700' },
  payMethods:  { flexDirection: 'row', gap: 2 },
  pmBtn:     { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  pmBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  pmText:    { fontSize: 10, fontWeight: '700', color: '#374151' },
  acceptBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5, backgroundColor: '#16a34a' },
  acceptText:{ fontSize: 11, fontWeight: '700', color: '#fff' },
  rejectBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#dc2626', backgroundColor: '#fff' },
  rejectText:{ fontSize: 11, fontWeight: '700', color: '#dc2626' },
  iconGroup: { flexDirection: 'row', gap: 5, justifyContent: 'flex-end' },
  iconBtn:   { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  receiptIconBtn: { backgroundColor: '#eef2ff', borderColor: '#e0e7ff' },
  printIconBtn:   { backgroundColor: '#ecfeff', borderColor: '#cffafe' },
  kotIconBtn:     { backgroundColor: '#f5f3ff', borderColor: '#ede9fe' },
  moreIconBtn:    { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
});

const ovl = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  menu:     { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 8, minWidth: 230, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12, marginTop: 'auto', marginBottom: 'auto', alignSelf: 'center' },
  title:    { fontSize: 12, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  item:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, marginHorizontal: 4 },
  itemActive: { backgroundColor: '#f0f9ff' },
  itemText: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
  dot:      { width: 8, height: 8, borderRadius: 4 },
});
