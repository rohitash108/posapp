/**
 * Orders Screen
 * Three-dot menus use positioned context-menu dropdowns (getBoundingClientRect)
 * instead of modal sheets — fixes bottom-left corner bug on web.
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ScrollView,
  TextInput, Modal, ActivityIndicator, Platform, Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { format, isToday, isYesterday, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { ordersApi } from '@/api/orders';
import { useAppStore } from '@/store/appStore';
import { useOrderBadgeStore } from '@/store/orderBadgeStore';
import type { Order, OrderStatus } from '@/types';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

// Play a short two-tone beep via Web Audio API (no package needed).
function playNewOrderBeep() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx  = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };

    play(880, 0,    0.18);   // high note
    play(660, 0.22, 0.25);   // lower note
  } catch { /* ignore — audio permission denied or unsupported */ }
}

// ── Food-type dot colors (veg=green, non_veg=red, egg=amber) ─────────────────
const FOOD_DOT_COLOR: Record<string, string> = {
  veg:     '#16a34a',
  non_veg: '#dc2626',
  egg:     '#d97706',
};

// ── Status / source config ────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:   { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', dot: '#3b82f6', label: 'Pending',   next: 'confirmed', nextLabel: 'Confirm'       },
  confirmed: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', dot: '#3b82f6', label: 'Confirmed', next: 'preparing', nextLabel: 'Start Cooking' },
  preparing: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', dot: '#f97316', label: 'Preparing', next: 'ready',     nextLabel: 'Mark Ready'    },
  ready:     { bg: '#fdf4ff', text: '#7c3aed', border: '#e9d5ff', dot: '#8b5cf6', label: 'Ready',     next: 'served',    nextLabel: 'Mark Served'   },
  served:    { bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc', dot: '#06b6d4', label: 'Served',    next: 'completed', nextLabel: 'Complete'      },
  completed: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', dot: '#22c55e', label: 'Completed', next: null,        nextLabel: null            },
  cancelled: { bg: '#fff1f2', text: '#dc2626', border: '#fecaca', dot: '#ef4444', label: 'Cancelled', next: null,        nextLabel: null            },
} as const;

const SOURCE_CFG = {
  pos:    { label: 'POS',    color: '#374151', bg: '#f1f5f9', dot: '#94a3b8' },
  zomato: { label: 'Zomato', color: '#dc2626', bg: '#fff1f2', dot: '#ef4444' },
  swiggy: { label: 'Swiggy', color: '#ea580c', bg: '#fff7ed', dot: '#f97316' },
  qr:     { label: 'QR',     color: '#7c3aed', bg: '#f5f3ff', dot: '#8b5cf6' },
} as const;

const STAT_CARDS = [
  { key: 'pending',   label: 'Pending',    icon: 'time-outline'           as const, color: '#2563eb', bg: '#eff6ff' },
  { key: 'confirmed', label: 'Confirmed',  icon: 'bookmark-outline'       as const, color: '#0891b2', bg: '#ecfeff' },
  { key: 'preparing', label: 'In Kitchen', icon: 'flame-outline'          as const, color: '#c2410c', bg: '#fff7ed' },
  { key: 'ready',     label: 'Ready',      icon: 'alarm-outline'          as const, color: '#7c3aed', bg: '#fdf4ff' },
  { key: 'completed', label: 'Completed',  icon: 'checkmark-done-outline' as const, color: '#16a34a', bg: '#f0fdf4' },
  { key: 'cancelled', label: 'Cancelled',  icon: 'close-circle-outline'   as const, color: '#dc2626', bg: '#fff1f2' },
] as const;

type TabKey = 'all' | 'pending' | 'inprogress' | 'completed' | 'cancelled' | 'paid' | 'unpaid';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',        label: 'All'         },
  { key: 'pending',    label: 'Pending'     },
  { key: 'inprogress', label: 'In Progress' },
  { key: 'completed',  label: 'Completed'   },
  { key: 'cancelled',  label: 'Cancelled'   },
  { key: 'paid',       label: 'Paid'        },
  { key: 'unpaid',     label: 'Unpaid'      },
];

const DATE_PRESETS = [
  { key: 'all',       label: 'All Time'  },
  { key: 'today',     label: 'Today'     },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week',      label: 'This Week' },
  { key: 'month',     label: 'Month'     },
];

const SOURCES = [
  { key: 'all',    label: 'All Sources' },
  { key: 'pos',    label: 'POS'         },
  { key: 'zomato', label: 'Zomato'      },
  { key: 'swiggy', label: 'Swiggy'      },
  { key: 'qr',     label: 'QR'          },
] as const;

const IN_PROGRESS = ['confirmed', 'preparing', 'ready', 'served'];
const POLL_MS     = 15_000; // 15s — fast enough to catch QR orders quickly

// ── Helpers ───────────────────────────────────────────────────────────────────
function sCfg(s: string) { return STATUS_CFG[s as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending; }
function srcLabel(source?: string | null): string | null {
  if (!source || source === 'pos') return null;
  return SOURCE_CFG[source as keyof typeof SOURCE_CFG]?.label ?? source.toUpperCase();
}
function isAgg(o: Order) { return o.source === 'zomato' || o.source === 'swiggy'; }

function fmtTime(dt?: string) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isToday(d))     return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'dd MMM, h:mm a');
}

function getDateRange(key: string) {
  const now = new Date(), fmt = (d: Date) => format(d, 'yyyy-MM-dd'), today = fmt(now);
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

function printReceipt(order: Order, restaurant: any) {
  if (Platform.OS !== 'web') return;
  const rows = (order.items ?? []).map(i =>
    `<tr><td>${i.item_name ?? i.name}${i.variation ? ` (${i.variation})` : ''}</td><td align="center">${i.quantity}</td><td align="right">₹${Number(i.unit_price).toFixed(2)}</td><td align="right">₹${Number(i.total_price).toFixed(2)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Order ${order.order_number}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;max-width:360px;margin:0 auto;padding:12px}
h2{text-align:center;font-size:15px;letter-spacing:2px;margin-bottom:2px}.sub{text-align:center;font-size:10px;color:#555;line-height:1.4;margin-bottom:10px}
hr{border:none;border-top:1px dashed #aaa;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;font-size:9px;text-transform:uppercase;color:#777;padding:3px 0;border-bottom:1px solid #ddd}td{padding:4px 0;vertical-align:top}
.ttl{font-size:15px;font-weight:bold}.ft{text-align:center;font-size:10px;color:#999;margin-top:10px}
@media print{body{max-width:100%}}</style></head><body>
<h2>${restaurant?.name ?? 'RESTAURANT'}</h2>
<div class="sub">${restaurant?.address ?? ''}${restaurant?.phone ? '<br>'+restaurant.phone : ''}</div>
<hr/><div style="font-size:11px"><b>#${order.order_number}</b> | ${(order.order_type ?? '').replace(/_/g,' ').toUpperCase()}</div>
<div style="font-size:10px;color:#555;margin:3px 0">${order.customer_name ? `Customer: ${order.customer_name}` : 'Walk-in'}${order.table_name ? ` · Table: ${order.table_name}` : ''}</div>
<hr/><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead><tbody>${rows}</tbody></table><hr/>
<table>
<tr><td>Subtotal</td><td align="right">₹${Number(order.subtotal).toFixed(2)}</td></tr>
${Number(order.tax_amount)>0?`<tr><td>Tax</td><td align="right">₹${Number(order.tax_amount).toFixed(2)}</td></tr>`:''}
${Number(order.discount_amount)>0?`<tr><td>Discount</td><td align="right" style="color:green">-₹${Number(order.discount_amount).toFixed(2)}</td></tr>`:''}
<tr><td class="ttl"><b>TOTAL</b></td><td class="ttl" align="right"><b>₹${Number(order.total).toFixed(2)}</b></td></tr>
</table><hr/>
<div style="font-size:10px">Payment: ${(order.payment_method??'—').toUpperCase()} | ${(order.payment_status??'—').toUpperCase()}</div>
<div class="ft">Thank you for visiting!</div>
<script>window.onload=function(){window.print()}<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=420,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Positioned dropdown engine ────────────────────────────────────────────────
interface DropPos { top: number; left: number; width: number }

/**
 * Measures an element by nativeID and returns coordinates for a dropdown panel.
 * Prefers opening below; flips above if insufficient space.
 */
function measureDrop(nativeId: string, panelW = 220, panelH = 300): DropPos | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const el = document.getElementById(nativeId);
  if (!el) return null;
  const r  = el.getBoundingClientRect();
  if (r.width === 0) return null;
  const sw = window.innerWidth;
  const sh = window.innerHeight;
  // Right-align panel to button, clamped to viewport
  const left = Math.max(8, Math.min(r.right - panelW, sw - panelW - 8));
  // Prefer below; flip above if not enough room
  const top  = sh - r.bottom > panelH ? r.bottom + 6 : Math.max(8, r.top - panelH - 4);
  return { top, left, width: panelW };
}

// ── Shared action props ───────────────────────────────────────────────────────
interface ActionProps {
  onStatusChange:  (id: number, s: string) => void;
  onPaymentChange: (id: number, m: string) => void;
  onMarkPaid:      (id: number, paid: boolean) => void;
  onPrint:         (o: Order) => void;
  isUpdating:      boolean;
}

// ── Dropdown item ─────────────────────────────────────────────────────────────
function DDItem({ icon, label, color, danger, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; color: string; danger?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [dd.item, pressed && { backgroundColor: color + '14' }]}
      onPress={onPress}
    >
      <View style={[dd.itemIcon, { backgroundColor: color + '16' }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={[dd.itemLabel, danger && { color }]}>{label}</Text>
    </Pressable>
  );
}

// ── Action dropdown (three-dot menu) ─────────────────────────────────────────
function ActionDropdown({ order, pos, onClose, onStatusChange, onMarkPaid, onPrint, onShowStatus }: {
  order: Order; pos: DropPos; onClose: () => void;
  onStatusChange: (id: number, s: string) => void;
  onMarkPaid:     (id: number, paid: boolean) => void;
  onPrint:        (o: Order) => void;
  onShowStatus:   () => void;
}) {
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const done   = ['completed', 'cancelled'].includes(order.status);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[dd.panel, { top: pos.top, left: pos.left, width: pos.width }]}>
        <View style={dd.header}>
          <Text style={dd.headerTitle}>Order #{order.order_number}</Text>
          <Text style={dd.headerSub}>
            {(order.order_type ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            {order.table_name ? ` · ${order.table_name}` : ''}
          </Text>
        </View>
        <View style={dd.sep} />
        <DDItem icon="swap-horizontal-outline" label="Change Status" color={PRIMARY}
          onPress={() => { onClose(); onShowStatus(); }} />
        {!agg && (
          <DDItem
            icon={isPaid ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            label={isPaid ? 'Mark as Unpaid' : 'Mark as Paid'}
            color={isPaid ? '#d97706' : '#16a34a'}
            onPress={() => { onClose(); onMarkPaid(order.id, !isPaid); }}
          />
        )}
        {!done && (
          <DDItem icon="checkmark-done-outline" label="Mark Completed" color="#16a34a"
            onPress={() => { onClose(); onStatusChange(order.id, 'completed'); }} />
        )}
        {!done && (
          <DDItem icon="close-circle-outline" label="Cancel Order" color="#dc2626" danger
            onPress={() => { onClose(); onStatusChange(order.id, 'cancelled'); }} />
        )}
        {Platform.OS === 'web' && (
          <>
            <View style={dd.sep} />
            <DDItem icon="print-outline" label="Print Receipt" color="#374151"
              onPress={() => { onClose(); onPrint(order); }} />
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Status dropdown ───────────────────────────────────────────────────────────
function StatusDropdown({ order, pos, onClose, onSelect }: {
  order: Order; pos: DropPos; onClose: () => void; onSelect: (s: string) => void;
}) {
  const FORWARD: OrderStatus[] = ['pending','confirmed','preparing','ready','served','completed'];
  const idx     = FORWARD.indexOf(order.status as OrderStatus);
  const options = idx >= 0 ? FORWARD.slice(idx) : FORWARD;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[dd.panel, { top: pos.top, left: pos.left, width: pos.width }]}>
        <View style={dd.header}>
          <Text style={dd.headerTitle}>Change Status</Text>
          <Text style={dd.headerSub}>Order #{order.order_number}</Text>
        </View>
        <View style={dd.sep} />
        {options.map(s => {
          const c      = sCfg(s);
          const active = order.status === s;
          return (
            <Pressable
              key={s}
              style={({ pressed }) => [
                dd.item,
                active && { backgroundColor: c.bg },
                !active && pressed && { backgroundColor: '#f9fafb' },
              ]}
              onPress={() => { onClose(); onSelect(s); }}
            >
              <View style={[dd.statusDot, { backgroundColor: c.dot }]} />
              <Text style={[dd.itemLabel, active && { color: c.text, fontWeight: '700' }]}>{c.label}</Text>
              {active && <Ionicons name="checkmark-circle" size={15} color={c.dot} />}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

// ── Fallback sheet modals (native) ────────────────────────────────────────────
function ActionSheetModal({ order, visible, onClose, onStatusChange, onMarkPaid, onPrint, onShowStatus }: {
  order: Order; visible: boolean; onClose: () => void;
  onStatusChange: (id: number, s: string) => void;
  onMarkPaid:     (id: number, paid: boolean) => void;
  onPrint:        (o: Order) => void;
  onShowStatus:   () => void;
}) {
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const done   = ['completed', 'cancelled'].includes(order.status);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ms.backdrop} onPress={onClose}>
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <Text style={ms.title}>Order #{order.order_number}</Text>
          <SheetRow icon="swap-horizontal-outline" label="Change Status"   color={PRIMARY}     onPress={() => { onClose(); onShowStatus(); }} />
          {!agg && <SheetRow icon={isPaid ? 'alert-circle-outline' : 'checkmark-circle-outline'} label={isPaid ? 'Mark as Unpaid' : 'Mark as Paid'} color={isPaid ? '#d97706' : '#16a34a'} onPress={() => { onClose(); onMarkPaid(order.id, !isPaid); }} />}
          {!done && <SheetRow icon="checkmark-done-outline" label="Mark Completed" color="#16a34a" onPress={() => { onClose(); onStatusChange(order.id, 'completed'); }} />}
          {!done && <SheetRow icon="close-circle-outline"   label="Cancel Order"   color="#dc2626" onPress={() => { onClose(); onStatusChange(order.id, 'cancelled'); }} />}
          {Platform.OS === 'web' && <SheetRow icon="print-outline" label="Print Receipt" color="#374151" onPress={() => { onClose(); onPrint(order); }} />}
          <View style={{ height: 16 }} />
        </View>
      </Pressable>
    </Modal>
  );
}

function StatusPickerModal({ order, visible, onClose, onSelect }: {
  order: Order; visible: boolean; onClose: () => void; onSelect: (s: string) => void;
}) {
  const FORWARD: OrderStatus[] = ['pending','confirmed','preparing','ready','served','completed'];
  const idx     = FORWARD.indexOf(order.status as OrderStatus);
  const options = idx >= 0 ? FORWARD.slice(idx) : FORWARD;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[ms.backdrop, { justifyContent: 'center', alignItems: 'center' }]} onPress={onClose}>
        <View style={ms.centeredSheet}>
          <View style={ms.handle} />
          <Text style={ms.title}>Change Status</Text>
          <Text style={ms.sub}>Order #{order.order_number}</Text>
          {options.map(s => {
            const c = sCfg(s); const active = order.status === s;
            return (
              <Pressable key={s} style={[ms.item, active && { backgroundColor: c.bg }]}
                onPress={() => { onClose(); onSelect(s); }}>
                <View style={[ms.dot, { backgroundColor: c.dot }]} />
                <Text style={[ms.itemTxt, active && { color: c.text, fontWeight: '700' }]}>{c.label}</Text>
                {active && <Ionicons name="checkmark-circle" size={16} color={c.dot} />}
              </Pressable>
            );
          })}
          <View style={{ height: 8 }} />
        </View>
      </Pressable>
    </Modal>
  );
}

function SheetRow({ icon, label, color, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void;
}) {
  return (
    <Pressable style={ms.item} onPress={onPress}>
      <View style={[ms.itemIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={[ms.itemTxt, { color: '#1f2937' }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
    </Pressable>
  );
}

// ── Order Card (Grid) ─────────────────────────────────────────────────────────
function OrderCard({ order, onStatusChange, onPaymentChange, onMarkPaid, onPrint, isUpdating }: { order: Order } & ActionProps) {
  const [showAction, setShowAction] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [actionPos,  setActionPos]  = useState<DropPos | null>(null);
  const [statusPos,  setStatusPos]  = useState<DropPos | null>(null);

  const menuId   = `ord-act-${order.id}`;
  const statusId = `ord-sts-${order.id}`;

  function openAction() {
    const p = measureDrop(menuId, 228, 280);
    setActionPos(p);
    setShowAction(true);
  }

  function openStatus() {
    const p = measureDrop(statusId, 200, 260);
    setStatusPos(p);
    setShowStatus(true);
  }

  function openStatusFromAction() {
    setShowAction(false);
    // measure after action dropdown closes (next tick)
    setTimeout(() => openStatus(), 50);
  }

  const cfg    = sCfg(order.status);
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const items  = order.items ?? [];
  const shown  = items.slice(0, 3);
  const more   = Math.max(0, items.length - 3);
  const lbl    = srcLabel(order.source);
  const srcC   = SOURCE_CFG[(order.source ?? 'pos') as keyof typeof SOURCE_CFG] ?? SOURCE_CFG.pos;

  return (
    <View style={cd.wrap}>
      {/* ── Dark header ── */}
      <View style={cd.head}>
        <View style={cd.headL}>
          <View style={cd.avatar}>
            <Ionicons name="bag-handle-outline" size={16} color="rgba(255,255,255,0.85)" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={cd.orderNum}>#{order.order_number}</Text>
              {lbl && (
                <View style={[cd.srcBadge, { backgroundColor: srcC.bg }]}>
                  <View style={[cd.srcDot, { backgroundColor: srcC.dot }]} />
                  <Text style={[cd.srcTxt, { color: srcC.color }]}>{lbl}</Text>
                </View>
              )}
            </View>
            <Text style={cd.headSub} numberOfLines={1}>
              {(order.order_type ?? 'dine_in').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
              {order.table_name ? ` · ${order.table_name}` : ''}
            </Text>
          </View>
        </View>
        <View style={cd.headR}>
          <Text style={cd.time}>{fmtTime(order.created_at)}</Text>
          {/* Three-dot menu button — nativeID used by measureDrop */}
          <Pressable nativeID={menuId} style={cd.menuBtn} onPress={openAction}>
            <Ionicons name="ellipsis-vertical" size={14} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      </View>

      {/* ── Customer ── */}
      <View style={cd.customerRow}>
        <Ionicons name="person-outline" size={12} color="#6b7280" />
        <Text style={cd.customerName} numberOfLines={1}>{order.customer_name || 'Walk-in'}</Text>
        {order.external_id && agg && (
          <Text style={cd.extId} numberOfLines={1}>· ID: {order.external_id}</Text>
        )}
      </View>

      {/* ── Items ── */}
      <View style={cd.itemsWrap}>
        {shown.length === 0 ? (
          <Text style={cd.noItems}>{agg ? 'Items not synced' : 'No items'}</Text>
        ) : shown.map((i, idx) => (
          <View key={idx} style={cd.itemRow}>
            <View style={[cd.itemDot, { backgroundColor: FOOD_DOT_COLOR[i.food_type ?? 'veg'] ?? '#16a34a' }]} />
            <Text style={cd.itemName} numberOfLines={1}>
              {i.item_name ?? i.name ?? ''}{i.variation ? ` · ${i.variation}` : ''}
            </Text>
            <Text style={cd.itemQty}>×{i.quantity}</Text>
            {Number(i.unit_price) > 0 && (
              <Text style={cd.itemPrice}>₹{Number(i.unit_price).toFixed(0)}</Text>
            )}
          </View>
        ))}
        {more > 0 && <Text style={cd.moreItems}>+{more} more item{more > 1 ? 's' : ''}</Text>}
        {order.notes ? (
          <View style={cd.notesBox}>
            <Ionicons name="chatbubble-outline" size={11} color="#92400e" />
            <Text style={cd.notesText} numberOfLines={2}>{order.notes}</Text>
          </View>
        ) : null}
        {agg && (order.rider_name || order.rider_status) ? (
          <View style={cd.riderBox}>
            <Ionicons name="bicycle-outline" size={11} color="#0369a1" />
            <Text style={cd.riderText} numberOfLines={1}>
              {order.rider_name ? order.rider_name : 'Rider'}
              {order.rider_phone ? ` · ${order.rider_phone}` : ''}
              {order.rider_status ? ` — ${order.rider_status.replace(/_/g, ' ')}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Total bar ── */}
      <View style={cd.totalBar}>
        <Text style={cd.totalAmt}>₹{Number(order.total ?? 0).toFixed(2)}</Text>
        <View style={{ flex: 1 }} />
        {!agg && (
          <View style={cd.payMethodRow}>
            {(['cash','card','upi'] as const).map(pm => {
              const active = (order.payment_method ?? '') === pm;
              return (
                <Pressable key={pm} disabled={isUpdating}
                  style={[cd.pmBtn, active && cd.pmBtnActive]}
                  onPress={() => onPaymentChange(order.id, pm)}>
                  <Text style={[cd.pmText, active && { color: '#fff' }]}>
                    {pm === 'upi' ? 'UPI' : pm.charAt(0).toUpperCase() + pm.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Footer ── */}
      <View style={cd.footer}>
        <View style={[cd.payPill, isPaid ? cd.paidPill : cd.unpaidPill]}>
          <View style={[cd.payDot, { backgroundColor: isPaid ? '#22c55e' : '#f59e0b' }]} />
          <Text style={[cd.payText, { color: isPaid ? '#16a34a' : '#d97706' }]}>
            {isPaid ? 'Paid' : 'Unpaid'}
          </Text>
        </View>
        {!isPaid && !agg && (
          <Pressable style={({ pressed }) => [cd.markPaidBtn, pressed && { opacity: 0.75 }]}
            onPress={() => onMarkPaid(order.id, true)} disabled={isUpdating}>
            <Ionicons name="checkmark-circle-outline" size={12} color="#fff" />
            <Text style={cd.markPaidTxt}>Mark Paid</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />

        {isUpdating ? (
          <ActivityIndicator size="small" color={PRIMARY} />
        ) : agg && order.status === 'pending' ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable style={cd.acceptBtn} onPress={() => onStatusChange(order.id, 'confirmed')}>
              <Text style={cd.acceptTxt}>Accept</Text>
            </Pressable>
            <Pressable style={cd.rejectBtn} onPress={() => onStatusChange(order.id, 'cancelled')}>
              <Text style={cd.rejectTxt}>Reject</Text>
            </Pressable>
          </View>
        ) : (
          /* Status pill — nativeID used by measureDrop */
          <Pressable nativeID={statusId}
            style={[cd.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
            onPress={openStatus}>
            <View style={[cd.statusDot, { backgroundColor: cfg.dot }]} />
            <Text style={[cd.statusTxt, { color: cfg.text }]}>{cfg.label}</Text>
            <Ionicons name="chevron-down" size={10} color={cfg.text} />
          </Pressable>
        )}

        {Platform.OS === 'web' && (
          <Pressable style={cd.iconBtn} onPress={() => onPrint(order)}>
            <Ionicons name="print-outline" size={14} color="#64748b" />
          </Pressable>
        )}
      </View>

      {/* ── Dropdowns (web positioned) ── */}
      {showAction && actionPos && (
        <ActionDropdown order={order} pos={actionPos}
          onClose={() => setShowAction(false)}
          onStatusChange={onStatusChange} onMarkPaid={onMarkPaid} onPrint={onPrint}
          onShowStatus={openStatusFromAction} />
      )}
      {showStatus && statusPos && (
        <StatusDropdown order={order} pos={statusPos}
          onClose={() => setShowStatus(false)}
          onSelect={(s) => onStatusChange(order.id, s)} />
      )}
      {/* ── Fallback sheets (native / no measurement) ── */}
      {showAction && !actionPos && (
        <ActionSheetModal order={order} visible
          onClose={() => setShowAction(false)}
          onStatusChange={onStatusChange} onMarkPaid={onMarkPaid} onPrint={onPrint}
          onShowStatus={openStatusFromAction} />
      )}
      {showStatus && !statusPos && (
        <StatusPickerModal order={order} visible
          onClose={() => setShowStatus(false)}
          onSelect={(s) => onStatusChange(order.id, s)} />
      )}
    </View>
  );
}

// ── Order List Row ────────────────────────────────────────────────────────────
function OrderListRow({ order, onStatusChange, onPaymentChange, onMarkPaid, onPrint, isUpdating }: { order: Order } & ActionProps) {
  const [showAction, setShowAction] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [actionPos,  setActionPos]  = useState<DropPos | null>(null);
  const [statusPos,  setStatusPos]  = useState<DropPos | null>(null);

  const menuId   = `ord-lact-${order.id}`;
  const statusId = `ord-lsts-${order.id}`;

  function openAction() {
    setActionPos(measureDrop(menuId, 228, 280));
    setShowAction(true);
  }
  function openStatus() {
    setStatusPos(measureDrop(statusId, 200, 260));
    setShowStatus(true);
  }
  function openStatusFromAction() {
    setShowAction(false);
    setTimeout(() => openStatus(), 50);
  }

  const cfg    = sCfg(order.status);
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const srcC   = SOURCE_CFG[(order.source ?? 'pos') as keyof typeof SOURCE_CFG] ?? SOURCE_CFG.pos;

  return (
    <View style={lr.row}>
      <View style={lr.c1}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Text style={lr.orderNum}>#{order.order_number}</Text>
          {srcLabel(order.source) && (
            <View style={[lr.srcChip, { backgroundColor: srcC.bg }]}>
              <View style={[lr.srcDot, { backgroundColor: srcC.dot }]} />
              <Text style={[lr.srcTxt, { color: srcC.color }]}>{srcLabel(order.source)}</Text>
            </View>
          )}
        </View>
        <Text style={lr.sub}>{fmtTime(order.created_at)}</Text>
      </View>
      <View style={lr.c2}>
        <Text style={lr.customer} numberOfLines={1}>{order.customer_name || 'Walk-in'}</Text>
        {order.table_name ? <Text style={lr.sub}>Table {order.table_name}</Text> : null}
      </View>
      <View style={lr.c3}>
        <Text style={lr.type}>
          {(order.order_type ?? 'dine_in').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
        </Text>
      </View>
      <View style={[lr.c4, { alignItems: 'center' }]}>
        <View style={lr.countBadge}>
          <Text style={lr.countTxt}>{order.items?.length ?? 0}</Text>
        </View>
      </View>
      <View style={[lr.c5, { alignItems: 'flex-end' }]}>
        <Text style={lr.total}>₹{Number(order.total ?? 0).toFixed(2)}</Text>
      </View>
      <View style={lr.c6}>
        {/* Status chip — nativeID for measurement */}
        <Pressable nativeID={statusId}
          style={[lr.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
          onPress={openStatus}>
          <View style={[lr.statusDot, { backgroundColor: cfg.dot }]} />
          <Text style={[lr.statusTxt, { color: cfg.text }]}>{cfg.label}</Text>
        </Pressable>
      </View>
      <View style={lr.c7}>
        <View style={[lr.payChip, isPaid ? lr.paidChip : lr.unpaidChip]}>
          <Text style={[lr.payTxt, { color: isPaid ? '#16a34a' : '#d97706' }]}>
            {isPaid ? 'Paid' : 'Unpaid'}
          </Text>
        </View>
        {!agg && (
          <View style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
            {(['cash','card','upi'] as const).map(pm => {
              const active = (order.payment_method ?? '') === pm;
              return (
                <Pressable key={pm} disabled={isUpdating}
                  style={[lr.pmBtn, active && lr.pmBtnActive]}
                  onPress={() => onPaymentChange(order.id, pm)}>
                  <Text style={[lr.pmTxt, active && { color: '#fff' }]}>
                    {pm === 'upi' ? 'UPI' : pm.charAt(0).toUpperCase()+pm.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
      <View style={[lr.c8, { alignItems: 'flex-end', gap: 4 }]}>
        {agg && order.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable style={lr.acceptBtn} disabled={isUpdating}
              onPress={() => onStatusChange(order.id, 'confirmed')}>
              <Text style={lr.acceptTxt}>Accept</Text>
            </Pressable>
            <Pressable style={lr.rejectBtn} disabled={isUpdating}
              onPress={() => onStatusChange(order.id, 'cancelled')}>
              <Text style={lr.rejectTxt}>Reject</Text>
            </Pressable>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {Platform.OS === 'web' && (
            <Pressable style={[lr.iconBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
              onPress={() => onPrint(order)}>
              <Ionicons name="print-outline" size={13} color={PRIMARY} />
            </Pressable>
          )}
          {/* Three-dot button — nativeID for measurement */}
          <Pressable nativeID={menuId}
            style={[lr.iconBtn, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}
            onPress={openAction}>
            <Ionicons name="ellipsis-horizontal" size={13} color="#64748b" />
          </Pressable>
        </View>
      </View>

      {showAction && actionPos && (
        <ActionDropdown order={order} pos={actionPos}
          onClose={() => setShowAction(false)}
          onStatusChange={onStatusChange} onMarkPaid={onMarkPaid} onPrint={onPrint}
          onShowStatus={openStatusFromAction} />
      )}
      {showStatus && statusPos && (
        <StatusDropdown order={order} pos={statusPos}
          onClose={() => setShowStatus(false)}
          onSelect={(s) => onStatusChange(order.id, s)} />
      )}
      {showAction && !actionPos && (
        <ActionSheetModal order={order} visible
          onClose={() => setShowAction(false)}
          onStatusChange={onStatusChange} onMarkPaid={onMarkPaid} onPrint={onPrint}
          onShowStatus={openStatusFromAction} />
      )}
      {showStatus && !statusPos && (
        <StatusPickerModal order={order} visible
          onClose={() => setShowStatus(false)}
          onSelect={(s) => onStatusChange(order.id, s)} />
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OrdersScreen() {
  const [orders,     setOrders]     = useState<Order[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState<TabKey>('all');
  const [srcFilter,  setSrcFilter]  = useState('all');
  const [dateRange,  setDateRange]  = useState('today');
  const [search,     setSearch]     = useState('');
  const [viewMode,   setViewMode]   = useState<'grid' | 'list'>('grid');
  const [isUpdating, setIsUpdating] = useState(false);
  const [toastMsg,   setToastMsg]   = useState('');
  const [aggAlert,   setAggAlert]   = useState<{ source: string; orders: Order[] } | null>(null);
  const [qrAlert,    setQrAlert]    = useState<Order[]>([]);
  const aggAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrAlertTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownOrderIds      = useRef<Set<number>>(new Set());
  const knownOrderStatuses = useRef<Map<number, string>>(new Map());
  const isFirstLoad        = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { restaurant } = useAppStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const contentW  = isDesktop ? width - 220 : width;
  const numCols   = contentW >= 2200 ? 5 : contentW >= 1700 ? 4 : contentW >= 1200 ? 3 : contentW >= 700 ? 2 : 1;

  const showAggAlert = useCallback((source: string, newOrders: Order[]) => {
    if (aggAlertTimer.current) clearTimeout(aggAlertTimer.current);
    setAggAlert({ source, orders: newOrders });
    playNewOrderBeep();
    aggAlertTimer.current = setTimeout(() => setAggAlert(null), 8000);
  }, []);

  const showQRAlert = useCallback((newOrders: Order[]) => {
    if (qrAlertTimer.current) clearTimeout(qrAlertTimer.current);
    setQrAlert(newOrders);
    playNewOrderBeep();
    qrAlertTimer.current = setTimeout(() => setQrAlert([]), 8000);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const range  = getDateRange(dateRange);
      const params: any = { per_page: 300 };
      if (range) { params.from = range.from; params.to = range.to; }
      const res  = await ordersApi.list(params);
      const raw: Order[] = Array.isArray(res.data?.data ?? res.data) ? (res.data?.data ?? res.data) : [];
      // Zomato & Swiggy orders are always pre-paid — force payment_status = 'paid'
      const data = raw.map(o =>
        isAgg(o) && o.payment_status !== 'paid'
          ? { ...o, payment_status: 'paid' as const }
          : o
      );
      setOrders(data);

      // Update shared badge counts so the sidebar doesn't need its own API poll
      const pendingCount = data.filter(o => o.status === 'pending').length;
      const kitchenCount = data.filter(o => ['preparing', 'confirmed'].includes(o.status)).length;
      useOrderBadgeStore.getState().update(pendingCount, kitchenCount);

      // Detect new orders / status changes on background polls (skip first load)
      if (isFirstLoad.current) {
        data.forEach(o => {
          knownOrderIds.current.add(o.id);
          knownOrderStatuses.current.set(o.id, o.status);
        });
        isFirstLoad.current = false;
      } else {
        // Zomato / Swiggy — new order detection
        const newAgg = data.filter(o => isAgg(o) && !knownOrderIds.current.has(o.id));
        if (newAgg.length > 0) {
          const src = newAgg.filter(o => o.source === 'zomato').length >= newAgg.filter(o => o.source === 'swiggy').length
            ? 'zomato' : 'swiggy';
          showAggAlert(src, newAgg);
        }
        // Zomato / Swiggy — status-change detection
        const statusChangedAgg = data.filter(o =>
          isAgg(o) &&
          knownOrderStatuses.current.has(o.id) &&
          knownOrderStatuses.current.get(o.id) !== o.status
        );
        if (statusChangedAgg.length > 0) {
          const o0 = statusChangedAgg[0];
          const msg = statusChangedAgg.length === 1
            ? `Order #${o0.order_number}: ${sCfg(o0.status).label}`
            : `${statusChangedAgg.length} orders updated`;
          setToastMsg(msg);
          setTimeout(() => setToastMsg(''), 3500);
        }
        // QR order detection
        const newQR = data.filter(o => o.source === 'qr' && !knownOrderIds.current.has(o.id));
        if (newQR.length > 0) {
          if (newAgg.length > 0) {
            setTimeout(() => showQRAlert(newQR), 9000);
          } else {
            showQRAlert(newQR);
          }
        }
        // Update known state
        data.forEach(o => {
          knownOrderIds.current.add(o.id);
          knownOrderStatuses.current.set(o.id, o.status);
        });
      }
    } catch (e) { console.warn('Orders load:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [dateRange, showAggAlert]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  useFocusEffect(
    useCallback(() => { load(true); }, [load])
  );

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  }, []);

  const handleStatusChange = useCallback(async (id: number, status: string) => {
    setIsUpdating(true);
    try {
      await ordersApi.updateStatus(id, status);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as OrderStatus } : o));
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Could not update status'); }
    finally { setIsUpdating(false); }
  }, [showToast]);

  const handlePaymentChange = useCallback(async (id: number, method: string) => {
    setIsUpdating(true);
    try {
      await ordersApi.updatePayment(id, { payment_method: method, payment_status: 'paid' });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, payment_method: method as any, payment_status: 'paid' } : o));
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Could not update payment'); }
    finally { setIsUpdating(false); }
  }, [showToast]);

  const handleMarkPaid = useCallback(async (id: number, paid: boolean) => {
    setIsUpdating(true);
    try {
      await ordersApi.updatePayment(id, { payment_status: paid ? 'paid' : 'unpaid' });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, payment_status: paid ? 'paid' : 'unpaid' } : o));
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Could not update payment status'); }
    finally { setIsUpdating(false); }
  }, [showToast]);

  const handlePrint = useCallback((order: Order) => printReceipt(order, restaurant), [restaurant]);

  const filtered = useMemo(() => orders.filter(o => {
    if (!matchTab(o, tab)) return false;
    if (srcFilter !== 'all' && (o.source ?? 'pos') !== srcFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(o.order_number ?? '').toLowerCase().includes(q) &&
          !(o.customer_name ?? '').toLowerCase().includes(q) &&
          !(o.table_name ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [orders, tab, srcFilter, search]);

  const tabCounts = useMemo(() => {
    const c: Record<TabKey, number> = { all: 0, pending: 0, inprogress: 0, completed: 0, cancelled: 0, paid: 0, unpaid: 0 };
    for (const o of orders) {
      c.all++;
      if (o.status === 'pending')           c.pending++;
      if (IN_PROGRESS.includes(o.status))   c.inprogress++;
      if (o.status === 'completed')         c.completed++;
      if (o.status === 'cancelled')         c.cancelled++;
      if (o.payment_status === 'paid')      c.paid++;
      if (o.payment_status !== 'paid' && o.status !== 'cancelled') c.unpaid++;
    }
    return c;
  }, [orders]);

  const statCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const srcCounts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) { const s = o.source ?? 'pos'; c[s] = (c[s] ?? 0) + 1; }
    return c;
  }, [orders]);

  const dateLabel  = DATE_PRESETS.find(r => r.key === dateRange)?.label ?? 'All Time';
  const actionProps: ActionProps = {
    onStatusChange: handleStatusChange, onPaymentChange: handlePaymentChange,
    onMarkPaid: handleMarkPaid, onPrint: handlePrint, isUpdating,
  };

  return (
    <View style={s.shell}>
      {/* ── New Zomato / Swiggy order alert banner ── */}
      {!!aggAlert && (
        <Pressable
          style={[s.aggBanner, aggAlert.source === 'zomato' ? s.aggBannerZomato : s.aggBannerSwiggy]}
          onPress={() => setAggAlert(null)}
        >
          <View style={s.aggBannerIcon}>
            <Ionicons name="bicycle" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.aggBannerTitle}>
              {aggAlert.orders.length === 1
                ? `New ${aggAlert.source === 'zomato' ? 'Zomato' : 'Swiggy'} Order!`
                : `${aggAlert.orders.length} New ${aggAlert.source === 'zomato' ? 'Zomato' : 'Swiggy'} Orders!`}
            </Text>
            <Text style={s.aggBannerSub} numberOfLines={1}>
              {aggAlert.orders.map(o => o.order_number ?? `#${o.id}`).join(' · ')}
            </Text>
          </View>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
        </Pressable>
      )}

      {/* ── New QR order alert banner ── */}
      {qrAlert.length > 0 && (
        <Pressable style={s.qrBanner} onPress={() => setQrAlert([])}>
          <View style={s.qrBannerIcon}>
            <Ionicons name="qr-code-outline" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.aggBannerTitle}>
              {qrAlert.length === 1 ? 'New QR Order!' : `${qrAlert.length} New QR Orders!`}
            </Text>
            <Text style={s.aggBannerSub} numberOfLines={1}>
              {qrAlert.map(o => o.order_number ?? `#${o.id}`).join(' · ')}
            </Text>
          </View>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
        </Pressable>
      )}

      {!!toastMsg && (
        <View style={s.toast}>
          <Ionicons name="alert-circle" size={14} color="#fff" />
          <Text style={s.toastTxt} numberOfLines={2}>{toastMsg}</Text>
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={GOLD} />}
        showsVerticalScrollIndicator={false}>

        {/* ── Stat summary ── */}
        <View style={s.statsScroll}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.statsRow, isDesktop && { minWidth: '100%' }]}>
            {STAT_CARDS.map(sc => (
              <View key={sc.key} style={[s.statCard, isDesktop && { flex: 1 }]}>
                <View>
                  <Text style={s.statLabel}>{sc.label}</Text>
                  <Text style={s.statNum}>{statCounts[sc.key] ?? 0}</Text>
                </View>
                <View style={[s.statIconBox, { backgroundColor: sc.bg }]}>
                  <Ionicons name={sc.icon} size={22} color={sc.color} />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Filters ── */}
        <View style={s.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
            {TABS.map(t => {
              const active = tab === t.key;
              const count  = tabCounts[t.key];
              const accent = t.key === 'paid' ? '#16a34a' : t.key === 'unpaid' ? '#d97706' : FOREST;
              return (
                <Pressable key={t.key} style={[s.tabPill, active && { backgroundColor: accent }]}
                  onPress={() => setTab(t.key)}>
                  <Text style={[s.tabPillTxt, active && { color: '#fff' }]}>{t.label}</Text>
                  {count > 0 && (
                    <View style={[s.tabCount, active ? { backgroundColor: 'rgba(255,255,255,0.25)' } : {}]}>
                      <Text style={[s.tabCountTxt, active && { color: '#fff' }]}>{count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row2}>
            {SOURCES.map(src => {
              const active = srcFilter === src.key;
              const sc     = src.key !== 'all' ? SOURCE_CFG[src.key as keyof typeof SOURCE_CFG] : null;
              const cnt    = srcCounts[src.key] ?? 0;
              if (src.key !== 'all' && cnt === 0) return null;
              return (
                <Pressable key={src.key}
                  style={[s.srcChip, active && (sc ? { backgroundColor: sc.color, borderColor: sc.color } : { backgroundColor: FOREST, borderColor: FOREST })]}
                  onPress={() => setSrcFilter(src.key)}>
                  {sc && !active && <View style={[s.srcDot, { backgroundColor: sc.dot }]} />}
                  <Text style={[s.srcChipTxt, active && { color: '#fff' }]}>{src.label}</Text>
                  {cnt > 0 && src.key !== 'all' && (
                    <View style={[s.srcCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                      <Text style={[s.srcCountTxt, active && { color: '#fff' }]}>{cnt}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
            <View style={s.divider} />
            {DATE_PRESETS.map(dp => {
              const active = dateRange === dp.key;
              return (
                <Pressable key={dp.key} style={[s.datePill, active && s.datePillActive]}
                  onPress={() => setDateRange(dp.key)}>
                  <Ionicons name={dp.key === 'all' ? 'time-outline' : 'calendar-outline'} size={11}
                    color={active ? '#fff' : '#64748b'} />
                  <Text style={[s.datePillTxt, active && { color: '#fff' }]}>{dp.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={s.row3}>
            <View style={s.searchBox}>
              <Ionicons name="search-outline" size={14} color="#9ca3af" />
              <TextInput style={s.searchInput} placeholder="Search by order #, customer, table…"
                value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
              {search ? (
                <Pressable onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={15} color="#9ca3af" />
                </Pressable>
              ) : null}
            </View>
            <View style={s.viewToggle}>
              <Pressable style={[s.viewBtn, viewMode === 'grid' && s.viewBtnActive]} onPress={() => setViewMode('grid')}>
                <Ionicons name="grid-outline" size={15} color={viewMode === 'grid' ? '#fff' : '#64748b'} />
              </Pressable>
              <Pressable style={[s.viewBtn, viewMode === 'list' && s.viewBtnActive]} onPress={() => setViewMode('list')}>
                <Ionicons name="list-outline" size={15} color={viewMode === 'list' ? '#fff' : '#64748b'} />
              </Pressable>
            </View>
          </View>

          {(tab !== 'all' || srcFilter !== 'all' || dateRange !== 'today' || search) && (
            <View style={s.activeFilters}>
              <Ionicons name="funnel" size={12} color="#64748b" />
              <Text style={s.activeFiltersTxt}>
                {[
                  tab !== 'all' && TABS.find(t => t.key === tab)?.label,
                  srcFilter !== 'all' && srcLabel(srcFilter),
                  dateRange !== 'today' && dateLabel,
                  search && `"${search}"`,
                ].filter(Boolean).join('  ·  ')}
              </Text>
              <Pressable onPress={() => { setTab('all'); setSrcFilter('all'); setDateRange('today'); setSearch(''); }}>
                <Text style={s.clearFilters}>Clear all</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Results header ── */}
        <View style={s.resultsBar}>
          <Text style={s.resultsCount}>
            {filtered.length} order{filtered.length !== 1 ? 's' : ''}
          </Text>
          {loading && !refreshing && <ActivityIndicator size="small" color={GOLD} />}
        </View>

        {/* ── Content ── */}
        {loading && !refreshing ? (
          <View style={s.loadWrap}>
            <ActivityIndicator size="large" color={FOREST} />
            <Text style={s.loadTxt}>Loading orders…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="bag-outline" size={36} color="#94a3b8" />
            </View>
            <Text style={s.emptyTitle}>No orders found</Text>
            <Text style={s.emptySub}>
              {search ? `No results for "${search}"` : `No ${tab === 'all' ? '' : tab + ' '}orders for ${dateLabel}`}
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
          <View style={s.listWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: isDesktop ? contentW - 24 : 940 }}>
                <View style={lr.header}>
                  {['Order','Customer','Type','Items','Total','Status','Payment','Actions'].map((h, i) => (
                    <Text key={h} style={[lr.hCell, [lr.c1,lr.c2,lr.c3,lr.c4,lr.c5,lr.c6,lr.c7,lr.c8][i]]}>{h}</Text>
                  ))}
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
    </View>
  );
}

// ── StyleSheets ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell:          { flex: 1, backgroundColor: '#f4f6f9' },
  toast:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#dc2626', paddingHorizontal: 16, paddingVertical: 12, zIndex: 99 },
  toastTxt:       { flex: 1, fontSize: 13, color: '#fff', fontWeight: '600' },
  aggBanner:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, zIndex: 100 },
  aggBannerZomato:{ backgroundColor: '#dc2626' },
  aggBannerSwiggy:{ backgroundColor: '#ea580c' },
  aggBannerIcon:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  aggBannerTitle: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  aggBannerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  qrBanner:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, zIndex: 100, backgroundColor: '#7c3aed' },
  qrBannerIcon:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  // ── Stat summary row ──
  statsScroll:    { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  statsRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  statCard:       {
    minWidth: 152, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#f1f5f9',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statLabel:      { fontSize: 11.5, fontWeight: '600', color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  statNum:        { fontSize: 28, fontWeight: '900', color: '#0f172a', letterSpacing: -1 },
  statIconBox:    { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },

  // ── Filters ──
  filterSection:  { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabRow:         { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 6 },
  tabPill:        {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22,
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: 'transparent',
  },
  tabPillTxt:     { fontSize: 13, fontWeight: '700', color: '#475569' },
  tabCount:       {
    backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 10,
    minWidth: 20, paddingHorizontal: 6, paddingVertical: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  tabCountTxt:    { fontSize: 10.5, fontWeight: '800', color: '#374151' },
  row2:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  srcChip:        {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 18,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  srcDot:         { width: 6, height: 6, borderRadius: 3 },
  srcChipTxt:     { fontSize: 12.5, fontWeight: '700', color: '#374151' },
  srcCount:       { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  srcCountTxt:    { fontSize: 10, fontWeight: '800', color: '#374151' },
  divider:        { width: 1, height: 22, backgroundColor: '#e2e8f0', marginHorizontal: 4 },
  datePill:       {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 18,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  datePillActive: { backgroundColor: FOREST, borderColor: FOREST },
  datePillTxt:    { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  row3:           { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  searchBox:      {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f8fafc', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  searchInput:    { flex: 1, fontSize: 13.5, color: '#111827' },
  viewToggle:     {
    flexDirection: 'row', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 11, overflow: 'hidden', backgroundColor: '#f8fafc',
    padding: 3, gap: 2,
  },
  viewBtn:        { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  viewBtnActive:  { backgroundColor: FOREST },
  activeFilters:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  activeFiltersTxt: { flex: 1, fontSize: 12, color: '#64748b', fontWeight: '500' },
  clearFilters:   { fontSize: 12, fontWeight: '700', color: '#dc2626' },

  // ── Results & content ──
  resultsBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  resultsCount:   { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.7 },
  loadWrap:       { paddingTop: 100, alignItems: 'center', gap: 14 },
  loadTxt:        { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
  emptyWrap:      { paddingTop: 100, alignItems: 'center', gap: 14 },
  emptyIcon:      { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:     { fontSize: 17, fontWeight: '700', color: '#374151' },
  emptySub:       { fontSize: 13.5, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  grid:           { padding: 8, width: '100%' },
  gridRow:        { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  listWrap:       {
    margin: 14, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
});

// Positioned dropdown styles
const dd = StyleSheet.create({
  panel: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 24,
    paddingVertical: 6,
    zIndex: 9999,
  },
  header:      { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  headerTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a' },
  headerSub:   { fontSize: 11.5, color: '#9ca3af', marginTop: 2 },
  sep:         { height: 1, backgroundColor: '#f1f5f9', marginVertical: 5, marginHorizontal: 8 },
  item:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, marginHorizontal: 4, marginVertical: 1 },
  itemIcon:    { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemLabel:   { flex: 1, fontSize: 13.5, fontWeight: '600', color: '#1f2937' },
  statusDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});

// Order card styles
const cd = StyleSheet.create({
  wrap:        {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e8edf2',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  head:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: FOREST, paddingHorizontal: 14, paddingVertical: 13 },
  headL:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  avatar:      {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  orderNum:    { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  srcBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  srcDot:      { width: 5, height: 5, borderRadius: 3 },
  srcTxt:      { fontSize: 10, fontWeight: '800' },
  headSub:     { fontSize: 12, color: 'rgba(255,255,255,0.60)', marginTop: 2 },
  headR:       { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  time:        { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  menuBtn:     { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 2 },
  customerName:{ fontSize: 13, fontWeight: '600', color: '#374151', flex: 1 },
  extId:       { fontSize: 11, color: '#9ca3af' },
  itemsWrap:   { paddingHorizontal: 14, paddingTop: 7, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 3.5 },
  itemDot:     { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  itemName:    { flex: 1, fontSize: 12.5, color: '#374151', lineHeight: 17.5 },
  itemQty:     { fontSize: 12, fontWeight: '700', color: '#64748b' },
  itemPrice:   { fontSize: 12, color: '#374151', fontWeight: '600' },
  moreItems:   { fontSize: 12.5, fontWeight: '700', color: PRIMARY, marginTop: 5 },
  noItems:     { fontSize: 12.5, color: '#f59e0b', fontStyle: 'italic' },
  notesBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fffbeb', borderRadius: 8, padding: 8, marginTop: 7 },
  notesText:   { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },
  riderBox:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0f9ff', borderRadius: 8, padding: 8, marginTop: 7 },
  riderText:   { flex: 1, fontSize: 12, color: '#0369a1', lineHeight: 17 },
  totalBar:    {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11, gap: 8,
    backgroundColor: '#fafbfc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  totalAmt:    { fontSize: 20, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  payMethodRow:{ flexDirection: 'row', gap: 5 },
  pmBtn:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#fff' },
  pmBtnActive: { backgroundColor: FOREST, borderColor: FOREST },
  pmText:      { fontSize: 11.5, fontWeight: '700', color: '#374151' },
  footer:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' },
  payPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  payDot:      { width: 6, height: 6, borderRadius: 3 },
  payText:     { fontSize: 11.5, fontWeight: '700' },
  paidPill:    { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  unpaidPill:  { backgroundColor: '#fff7ed', borderColor: '#fde68a' },
  markPaidBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#16a34a' },
  markPaidTxt: { fontSize: 11.5, fontWeight: '700', color: '#fff' },
  statusPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  statusDot:   { width: 7, height: 7, borderRadius: 4 },
  statusTxt:   { fontSize: 12, fontWeight: '700' },
  acceptBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#16a34a' },
  acceptTxt:   { fontSize: 12, fontWeight: '700', color: '#fff' },
  rejectBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#dc2626' },
  rejectTxt:   { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  iconBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
});

// List row styles
const lr = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  hCell:     { fontSize: 11, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6 },
  row:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  c1: { width: 155, paddingRight: 8 },
  c2: { width: 130, paddingRight: 8 },
  c3: { width: 110, paddingRight: 8 },
  c4: { width: 58,  paddingRight: 8 },
  c5: { width: 80,  paddingRight: 8 },
  c6: { width: 110, paddingRight: 8 },
  c7: { width: 140, paddingRight: 8 },
  c8: { width: 150 },
  orderNum:  { fontSize: 13.5, fontWeight: '800', color: FOREST },
  srcChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  srcDot:    { width: 5, height: 5, borderRadius: 3 },
  srcTxt:    { fontSize: 9.5, fontWeight: '800' },
  sub:       { fontSize: 11.5, color: '#9ca3af', marginTop: 2 },
  customer:  { fontSize: 13, fontWeight: '600', color: '#1f2937' },
  type:      { fontSize: 12, color: '#374151', fontWeight: '600' },
  countBadge:{ backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'center' },
  countTxt:  { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  total:     { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  statusChip:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, borderWidth: 1, alignSelf: 'flex-start' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 12, fontWeight: '700' },
  payChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  paidChip:  { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  unpaidChip:{ backgroundColor: '#fff7ed', borderColor: '#fde68a' },
  payTxt:    { fontSize: 11.5, fontWeight: '700' },
  pmBtn:     { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  pmBtnActive: { backgroundColor: FOREST, borderColor: FOREST },
  pmTxt:     { fontSize: 10.5, fontWeight: '700', color: '#374151' },
  acceptBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: '#16a34a' },
  acceptTxt: { fontSize: 11.5, fontWeight: '700', color: '#fff' },
  rejectBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1.5, borderColor: '#dc2626', backgroundColor: '#fff' },
  rejectTxt: { fontSize: 11.5, fontWeight: '700', color: '#dc2626' },
  iconBtn:   { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

// Fallback sheet modal styles (native)
const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: -8 }, elevation: 20 },
  centeredSheet:{ backgroundColor: '#fff', borderRadius: 22, paddingTop: 8, width: 320, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: 10 }, elevation: 20 },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 8 },
  title:    { fontSize: 16, fontWeight: '800', color: '#0f172a', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 2 },
  sub:      { fontSize: 12.5, color: '#9ca3af', paddingHorizontal: 18, paddingBottom: 8 },
  item:     { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 11, marginHorizontal: 8, marginVertical: 1 },
  itemTxt:  { flex: 1, fontSize: 14, color: '#374151', fontWeight: '600' },
  dot:      { width: 8, height: 8, borderRadius: 4 },
  itemIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
