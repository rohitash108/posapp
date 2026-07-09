/**
 * Orders Screen
 * Dropdowns use measureInWindow + fixed positioning on web so menus anchor to the clicked button.
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ScrollView,
  TextInput, Modal, ActivityIndicator, Platform, Pressable,
  useWindowDimensions, AppState, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { format, isToday, isYesterday, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { ordersApi, normalizeOrder } from '@/api/orders';
import { useAppStore } from '@/store/appStore';
import { useOrderBadgeStore } from '@/store/orderBadgeStore';
import type { Order, OrderStatus } from '@/types';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

// ── csPos semantic palette (matches dashboard + tokens.ts) ───────────────────
const S = {
  primary: '#0D76E1',
  success: '#14B51D',
  danger:  '#FF3636',
  warning: '#FDAF22',
  info:    '#2088EE',
  purple:  '#A91CFF',
  orange:  '#E65100',
};

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
  veg:     S.success,
  non_veg: S.danger,
  egg:     S.warning,
};

// ── Status / source config (csPos — light bg + dark bgDark variants) ─────────
const STATUS_CFG = {
  pending:   { bg: '#fef9ec', bgDark: 'rgba(253,175,34,0.15)',  text: S.warning, border: '#fde68a', borderDark: 'rgba(253,175,34,0.35)', dot: S.warning, label: 'Pending',   next: 'confirmed', nextLabel: 'Confirm'       },
  confirmed: { bg: '#eff6ff', bgDark: 'rgba(13,118,225,0.15)',  text: S.primary, border: '#bfdbfe', borderDark: 'rgba(13,118,225,0.35)', dot: S.primary, label: 'Confirmed', next: 'preparing', nextLabel: 'Start Cooking' },
  preparing: { bg: '#f5f3ff', bgDark: 'rgba(169,28,255,0.15)',  text: S.purple,  border: '#e9d5ff', borderDark: 'rgba(169,28,255,0.35)', dot: S.purple,  label: 'Preparing', next: 'ready',     nextLabel: 'Mark Ready'    },
  ready:     { bg: '#ecfeff', bgDark: 'rgba(32,136,238,0.15)',  text: S.info,    border: '#a5f3fc', borderDark: 'rgba(32,136,238,0.35)', dot: S.info,    label: 'Ready',     next: 'served',    nextLabel: 'Mark Served'   },
  served:    { bg: '#ecfdf5', bgDark: 'rgba(20,181,29,0.15)',   text: S.success, border: '#bbf7d0', borderDark: 'rgba(20,181,29,0.35)',  dot: S.success, label: 'Served',    next: 'completed', nextLabel: 'Complete'      },
  completed: { bg: '#f0fdf4', bgDark: 'rgba(20,181,29,0.15)',   text: S.success, border: '#bbf7d0', borderDark: 'rgba(20,181,29,0.35)',  dot: S.success, label: 'Completed', next: null,        nextLabel: null            },
  cancelled: { bg: '#fff1f2', bgDark: 'rgba(255,54,54,0.15)',   text: S.danger,  border: '#fecaca', borderDark: 'rgba(255,54,54,0.35)',  dot: S.danger,  label: 'Cancelled', next: null,        nextLabel: null            },
} as const;

const SOURCE_CFG = {
  pos:    { label: 'POS',    color: '#64748B', bg: '#f1f5f9', bgDark: 'rgba(100,116,139,0.15)', dot: '#94a3b8' },
  zomato: { label: 'Zomato', color: S.danger,  bg: '#fff1f2', bgDark: 'rgba(255,54,54,0.15)',  dot: S.danger  },
  swiggy: { label: 'Swiggy', color: S.orange,  bg: '#fff7ed', bgDark: 'rgba(230,81,0,0.15)',   dot: S.orange  },
  qr:     { label: 'QR',     color: S.purple,  bg: '#f5f3ff', bgDark: 'rgba(169,28,255,0.15)', dot: S.purple  },
} as const;

const STAT_CARDS = [
  { key: 'pending',   label: 'Pending',    icon: 'time-outline'           as const, color: S.warning, bg: '#fef9ec', bgDark: 'rgba(253,175,34,0.15)'  },
  { key: 'confirmed', label: 'Confirmed',  icon: 'bookmark-outline'       as const, color: S.primary, bg: '#eff6ff', bgDark: 'rgba(13,118,225,0.15)'  },
  { key: 'preparing', label: 'In Kitchen', icon: 'flame-outline'          as const, color: S.purple,  bg: '#f5f3ff', bgDark: 'rgba(169,28,255,0.15)'  },
  { key: 'ready',     label: 'Ready',      icon: 'alarm-outline'          as const, color: S.info,    bg: '#ecfeff', bgDark: 'rgba(32,136,238,0.15)'  },
  { key: 'completed', label: 'Completed',  icon: 'checkmark-done-outline' as const, color: S.success, bg: '#f0fdf4', bgDark: 'rgba(20,181,29,0.15)'   },
  { key: 'cancelled', label: 'Cancelled',  icon: 'close-circle-outline'   as const, color: S.danger,  bg: '#fff1f2', bgDark: 'rgba(255,54,54,0.15)'   },
] as const;

type TabKey = 'all' | 'pending' | 'inprogress' | 'completed' | 'cancelled' | 'paid' | 'unpaid';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',        label: 'All Orders'  },
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function sCfg(status: string, isDark: boolean) {
  const raw = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
  return {
    ...raw,
    bg:     isDark ? raw.bgDark : raw.bg,
    border: isDark ? raw.borderDark : raw.border,
  };
}
function srcCfg(source: string, isDark: boolean) {
  const raw = SOURCE_CFG[source as keyof typeof SOURCE_CFG] ?? SOURCE_CFG.pos;
  return { ...raw, bg: isDark ? raw.bgDark : raw.bg };
}
/** csPos order-card status dropdown (ghost outline, not solid fill) */
function statusPillLook(status: string, isDark: boolean, c: ThemeColors) {
  const cfg = sCfg(status, isDark);
  if (isDark) {
    return {
      bg: 'transparent',
      border: 'rgba(255,255,255,0.35)',
      text: '#fff',
      dot: cfg.dot,
      showDot: false,
    };
  }
  if (status === 'completed') {
    return { bg: 'transparent', border: S.success, text: S.success, dot: S.success, showDot: false };
  }
  return { bg: cfg.bg, border: cfg.border, text: cfg.text, dot: cfg.dot, showDot: true };
}
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

/** Full date/time on order cards (csPos parity) */
function fmtCardTime(dt?: string) {
  if (!dt) return '—';
  return format(new Date(dt), 'dd MMM yyyy, hh:mm a');
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

function printKOT(order: Order, restaurant: any) {
  if (Platform.OS !== 'web') return;
  const rows = (order.items ?? []).map(i =>
    `<tr><td style="font-weight:800;font-size:16px">${i.quantity}</td><td>${i.item_name ?? i.name ?? ''}${i.variation ? ` (${i.variation})` : ''}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>KOT ${order.order_number}</title>
<style>body{font-family:Arial,sans-serif;max-width:320px;margin:0 auto;padding:12px}h2{text-align:center;letter-spacing:3px;border:2px solid #000;display:inline-block;padding:2px 10px}
table{width:100%;margin-top:10px;font-size:13px}td{padding:6px 4px;border-bottom:1px dashed #ccc}</style></head><body>
<h2>KOT</h2>
<div style="text-align:center;font-size:12px;margin-top:6px">${restaurant?.name ?? 'KITCHEN'}</div>
<div style="font-size:11px;margin:8px 0"><b>#${order.order_number}</b> · ${(order.order_type ?? '').replace(/_/g,' ').toUpperCase()}${order.table_name ? ` · ${order.table_name}` : ''}</div>
<table>${rows}</table>
<script>window.onload=function(){window.print()}<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=360,height=520');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Positioned dropdown engine ────────────────────────────────────────────────
interface DropPos { top: number; left: number; width: number }

function computeDropPos(
  x: number, y: number, width: number, height: number,
  panelW: number, panelH: number,
): DropPos {
  const { width: sw, height: sh } = Dimensions.get('window');
  const left = Math.max(8, Math.min(x + width - panelW, sw - panelW - 8));
  const top  = sh - (y + height) > panelH ? y + height + 6 : Math.max(8, y - panelH - 4);
  return { top, left, width: panelW };
}

/** Measure a ref in window coords — reliable on web (unlike getElementById + absolute in Modal). */
function measureAnchor(
  ref: React.RefObject<View | null>,
  panelW: number,
  panelH: number,
  cb: (pos: DropPos | null) => void,
) {
  const node = ref.current;
  if (!node) { cb(null); return; }
  requestAnimationFrame(() => {
    node.measureInWindow((x, y, width, height) => {
      if (width <= 0 && height <= 0) { cb(null); return; }
      cb(computeDropPos(x, y, width, height, panelW, panelH));
    });
  });
}

function dropPanelStyle(pos: DropPos) {
  return Platform.OS === 'web'
    ? ({ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 } as const)
    : ({ position: 'absolute', top: pos.top, left: pos.left, width: pos.width } as const);
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
function DDItem({ icon, label, color, danger, onPress, dd }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; color: string; danger?: boolean; onPress: () => void;
  dd: ReturnType<typeof mkDd>;
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
  const { colors: c } = useTheme();
  const dd = useMemo(() => mkDd(c), [c]);
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const done   = ['completed', 'cancelled'].includes(order.status);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[dd.panel, dropPanelStyle(pos)]}>
        <View style={dd.header}>
          <Text style={dd.headerTitle}>Order #{order.order_number}</Text>
          <Text style={dd.headerSub}>
            {(order.order_type ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            {order.table_name ? ` · ${order.table_name}` : ''}
          </Text>
        </View>
        <View style={dd.sep} />
        <DDItem icon="swap-horizontal-outline" label="Change Status" color={c.primary} dd={dd}
          onPress={() => { onClose(); onShowStatus(); }} />
        {!agg && (
          <DDItem
            icon={isPaid ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            label={isPaid ? 'Mark as Unpaid' : 'Mark as Paid'}
            color={isPaid ? c.warning : c.success}
            onPress={() => { onClose(); onMarkPaid(order.id, !isPaid); }}
            dd={dd}
          />
        )}
        {!done && (
          <DDItem icon="checkmark-done-outline" label="Mark Completed" color={c.success} dd={dd}
            onPress={() => { onClose(); onStatusChange(order.id, 'completed'); }} />
        )}
        {!done && (
          <DDItem icon="close-circle-outline" label="Cancel Order" color={c.danger} danger dd={dd}
            onPress={() => { onClose(); onStatusChange(order.id, 'cancelled'); }} />
        )}
        {Platform.OS === 'web' && (
          <>
            <View style={dd.sep} />
            <DDItem icon="print-outline" label="Print Receipt" color={c.text} dd={dd}
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
  const { colors: c, isDark } = useTheme();
  const dd = useMemo(() => mkDd(c), [c]);
  const FORWARD: OrderStatus[] = ['pending','confirmed','preparing','ready','served','completed'];
  const idx     = FORWARD.indexOf(order.status as OrderStatus);
  const options = idx >= 0 ? FORWARD.slice(idx) : FORWARD;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[dd.panel, dropPanelStyle(pos)]}>
        <View style={dd.header}>
          <Text style={dd.headerTitle}>Change Status</Text>
          <Text style={dd.headerSub}>Order #{order.order_number}</Text>
        </View>
        <View style={dd.sep} />
        {options.map(s => {
          const sc     = sCfg(s, isDark);
          const active = order.status === s;
          return (
            <Pressable
              key={s}
              style={({ pressed }) => [
                dd.item,
                active && { backgroundColor: sc.bg },
                !active && pressed && { backgroundColor: c.surfaceAlt },
              ]}
              onPress={() => { onClose(); onSelect(s); }}
            >
              <View style={[dd.statusDot, { backgroundColor: sc.dot }]} />
              <Text style={[dd.itemLabel, active && { color: sc.text, fontWeight: '700' }]}>{sc.label}</Text>
              {active && <Ionicons name="checkmark-circle" size={15} color={sc.dot} />}
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
  const { colors: c } = useTheme();
  const ms = useMemo(() => mkMs(c), [c]);
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const done   = ['completed', 'cancelled'].includes(order.status);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ms.backdrop} onPress={onClose}>
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <Text style={ms.title}>Order #{order.order_number}</Text>
          <SheetRow icon="swap-horizontal-outline" label="Change Status"   color={c.primary} ms={ms} onPress={() => { onClose(); onShowStatus(); }} />
          {!agg && <SheetRow icon={isPaid ? 'alert-circle-outline' : 'checkmark-circle-outline'} label={isPaid ? 'Mark as Unpaid' : 'Mark as Paid'} color={isPaid ? c.warning : c.success} ms={ms} onPress={() => { onClose(); onMarkPaid(order.id, !isPaid); }} />}
          {!done && <SheetRow icon="checkmark-done-outline" label="Mark Completed" color={c.success} ms={ms} onPress={() => { onClose(); onStatusChange(order.id, 'completed'); }} />}
          {!done && <SheetRow icon="close-circle-outline"   label="Cancel Order"   color={c.danger} ms={ms} onPress={() => { onClose(); onStatusChange(order.id, 'cancelled'); }} />}
          {Platform.OS === 'web' && <SheetRow icon="print-outline" label="Print Receipt" color={c.text} ms={ms} onPress={() => { onClose(); onPrint(order); }} />}
          <View style={{ height: 16 }} />
        </View>
      </Pressable>
    </Modal>
  );
}

function StatusPickerModal({ order, visible, onClose, onSelect }: {
  order: Order; visible: boolean; onClose: () => void; onSelect: (s: string) => void;
}) {
  const { colors: c, isDark } = useTheme();
  const ms = useMemo(() => mkMs(c), [c]);
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
            const sc = sCfg(s, isDark); const active = order.status === s;
            return (
              <Pressable key={s} style={[ms.item, active && { backgroundColor: sc.bg }]}
                onPress={() => { onClose(); onSelect(s); }}>
                <View style={[ms.dot, { backgroundColor: sc.dot }]} />
                <Text style={[ms.itemTxt, active && { color: sc.text, fontWeight: '700' }]}>{sc.label}</Text>
                {active && <Ionicons name="checkmark-circle" size={16} color={sc.dot} />}
              </Pressable>
            );
          })}
          <View style={{ height: 8 }} />
        </View>
      </Pressable>
    </Modal>
  );
}

function SheetRow({ icon, label, color, onPress, ms }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void;
  ms: ReturnType<typeof mkMs>;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable style={ms.item} onPress={onPress}>
      <View style={[ms.itemIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={ms.itemTxt}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={c.textMuted} />
    </Pressable>
  );
}

// ── Order Card (Grid) ─────────────────────────────────────────────────────────
function OrderCard({ order, onStatusChange, onPaymentChange, onMarkPaid, onPrint, isUpdating }: { order: Order } & ActionProps) {
  const { colors: c, isDark } = useTheme();
  const { restaurant } = useAppStore();
  const cd = useMemo(() => mkCd(c, isDark), [c, isDark]);
  const [showAction, setShowAction] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [actionPos,  setActionPos]  = useState<DropPos | null>(null);
  const [statusPos,  setStatusPos]  = useState<DropPos | null>(null);

  const menuAnchorRef   = useRef<View>(null);
  const statusAnchorRef = useRef<View>(null);

  const menuId   = `ord-act-${order.id}`;
  const statusId = `ord-sts-${order.id}`;

  function openAction() {
    measureAnchor(menuAnchorRef, 228, 280, (p) => {
      setActionPos(p);
      setShowAction(true);
    });
  }

  function openStatus() {
    measureAnchor(statusAnchorRef, 200, 260, (p) => {
      setStatusPos(p);
      setShowStatus(true);
    });
  }

  function openStatusFromAction() {
    setShowAction(false);
    // measure after action dropdown closes (next tick)
    setTimeout(() => openStatus(), 50);
  }

  const cfg    = sCfg(order.status, isDark);
  const pill   = statusPillLook(order.status, isDark, c);
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const items  = order.items ?? [];
  const shown  = items.slice(0, 3);
  const more   = Math.max(0, items.length - 3);
  const lbl    = srcLabel(order.source);
  const srcC   = srcCfg(order.source ?? 'pos', isDark);

  return (
    <View style={cd.wrap}>
      {/* ── Card header (csPos: flat surface + blue icon) ── */}
      <View style={cd.head}>
        <View style={cd.headL}>
          <View style={cd.avatar}>
            <Ionicons name="bag-handle-outline" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={cd.orderNum}>Order {order.order_number}</Text>
              {lbl && (
                <View style={[cd.srcBadge, { backgroundColor: srcC.bg }]}>
                  <View style={[cd.srcDot, { backgroundColor: srcC.dot }]} />
                  <Text style={[cd.srcTxt, { color: srcC.color }]}>{lbl}</Text>
                </View>
              )}
            </View>
            <Text style={cd.headSub} numberOfLines={1}>
              {(order.order_type ?? 'dine_in').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
              {order.table_name ? ` | Table: ${order.table_name}` : ''}
            </Text>
          </View>
        </View>
        <View ref={menuAnchorRef} collapsable={false}>
          <Pressable nativeID={menuId} style={cd.menuBtn} onPress={openAction}>
            <Ionicons name="ellipsis-vertical" size={14} color={c.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* ── Total + timestamp ── */}
      <View style={cd.totalRow}>
        <Text style={cd.totalAmt}>Total: ₹{Number(order.total ?? 0).toFixed(2)}</Text>
        <Text style={cd.time}>{fmtCardTime(order.created_at)}</Text>
      </View>

      {/* ── Items ── */}
      <View style={cd.itemsWrap}>
        {shown.length === 0 ? (
          <Text style={cd.noItems}>{agg ? 'Items not synced' : 'No items'}</Text>
        ) : shown.map((i, idx) => {
          const unit  = Number(i.unit_price ?? 0);
          const line  = unit * Number(i.quantity ?? 1);
          const name  = `${i.item_name ?? i.name ?? ''}${i.variation ? ` (${i.variation})` : ''}`;
          return (
            <Text key={idx} style={cd.itemLine} numberOfLines={2}>
              <Text style={cd.itemName}>{name ? `${name} — ` : ''}</Text>
              <Text style={cd.itemQty}>{i.quantity} × </Text>
              <Text style={cd.itemPriceOrange}>₹{unit.toFixed(2)}</Text>
              <Text style={cd.itemQty}> = </Text>
              <Text style={cd.itemPriceOrange}>₹{line.toFixed(2)}</Text>
            </Text>
          );
        })}
        {more > 0 && <Text style={cd.moreItems}>+{more} more item{more > 1 ? 's' : ''}</Text>}
        {order.notes ? (
          <View style={cd.notesBox}>
            <Ionicons name="chatbubble-outline" size={11} color={isDark ? c.warning : '#92400e'} />
            <Text style={cd.notesText} numberOfLines={2}>{order.notes}</Text>
          </View>
        ) : null}
        {agg && (order.rider_name || order.rider_status) ? (
          <View style={cd.riderBox}>
            <Ionicons name="bicycle-outline" size={11} color={isDark ? c.info : '#0369a1'} />
            <Text style={cd.riderText} numberOfLines={1}>
              {order.rider_name ? order.rider_name : 'Rider'}
              {order.rider_phone ? ` · ${order.rider_phone}` : ''}
              {order.rider_status ? ` — ${order.rider_status.replace(/_/g, ' ')}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Action buttons (web) ── */}
      {Platform.OS === 'web' && !agg && (
        <View style={cd.actionRow}>
          <Pressable style={cd.outlineOrangeBtn} onPress={() => onPrint(order)}>
            <Ionicons name="document-text-outline" size={13} color={S.orange} />
            <Text style={cd.outlineOrangeTxt}>Receipt</Text>
          </Pressable>
          <Pressable style={cd.solidPrimaryBtn} onPress={() => onPrint(order)}>
            <Ionicons name="print-outline" size={13} color="#fff" />
            <Text style={cd.solidPrimaryTxt}>Print</Text>
          </Pressable>
          <Pressable style={cd.outlineNeutralBtn} onPress={() => printKOT(order, restaurant)}>
            <Ionicons name="restaurant-outline" size={13} color={isDark ? '#fff' : c.heading} />
            <Text style={cd.outlineNeutralTxt}>KOT</Text>
          </Pressable>
        </View>
      )}

      {/* ── Payment methods ── */}
      {!agg && (
        <View style={cd.payRow}>
          <Text style={cd.payLabel}>Payment:</Text>
          <View style={cd.payMethodRow}>
            {(['cash','card','upi'] as const).map((pm, idx, arr) => {
              const active = (order.payment_method ?? '') === pm;
              const isLast = idx === arr.length - 1;
              return (
                <Pressable key={pm} disabled={isUpdating}
                  style={[cd.pmBtn, isLast && cd.pmBtnLast, active && cd.pmBtnActive]}
                  onPress={() => onPaymentChange(order.id, pm)}>
                  <Text style={[cd.pmText, active && cd.pmTextActive]}>
                    {pm === 'upi' ? 'UPI' : pm.charAt(0).toUpperCase() + pm.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Footer ── */}
      <View style={cd.footer}>
        <View style={[cd.payPill, isPaid ? cd.paidPill : cd.unpaidPill]}>
          <View style={[cd.payDot, { backgroundColor: isPaid ? c.success : c.warning }]} />
          <Text style={[cd.payText, { color: isPaid ? c.success : c.warning }]}>
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
        {isPaid && !agg && (
          <Pressable style={({ pressed }) => [cd.markUnpaidBtn, pressed && { opacity: 0.75 }]}
            onPress={() => onMarkPaid(order.id, false)} disabled={isUpdating}>
            <Text style={cd.markUnpaidTxt}>Mark Unpaid</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />

        {isUpdating ? (
          <ActivityIndicator size="small" color={c.primary} />
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
          <View ref={statusAnchorRef} collapsable={false}>
            <Pressable nativeID={statusId}
              style={[cd.statusPill, { borderColor: pill.border, backgroundColor: pill.bg }]}
              onPress={openStatus}>
              {pill.showDot && (
                <View style={[cd.statusDot, { backgroundColor: pill.dot }]} />
              )}
              <Text style={[cd.statusTxt, { color: pill.text }]}>{cfg.label}</Text>
              <Ionicons name="chevron-down" size={11} color={pill.text} />
            </Pressable>
          </View>
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
  const { colors: c, isDark } = useTheme();
  const lr = useMemo(() => mkLr(c, isDark), [c, isDark]);
  const [showAction, setShowAction] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [actionPos,  setActionPos]  = useState<DropPos | null>(null);
  const [statusPos,  setStatusPos]  = useState<DropPos | null>(null);

  const menuAnchorRef   = useRef<View>(null);
  const statusAnchorRef = useRef<View>(null);

  const menuId   = `ord-lact-${order.id}`;
  const statusId = `ord-lsts-${order.id}`;

  function openAction() {
    measureAnchor(menuAnchorRef, 228, 280, (p) => {
      setActionPos(p);
      setShowAction(true);
    });
  }
  function openStatus() {
    measureAnchor(statusAnchorRef, 200, 260, (p) => {
      setStatusPos(p);
      setShowStatus(true);
    });
  }
  function openStatusFromAction() {
    setShowAction(false);
    setTimeout(() => openStatus(), 50);
  }

  const cfg    = sCfg(order.status, isDark);
  const pill   = statusPillLook(order.status, isDark, c);
  const isPaid = order.payment_status === 'paid';
  const agg    = isAgg(order);
  const srcC   = srcCfg(order.source ?? 'pos', isDark);

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
        {/* Status chip */}
        <View ref={statusAnchorRef} collapsable={false}>
          <Pressable nativeID={statusId}
            style={[lr.statusChip, { backgroundColor: pill.bg, borderColor: pill.border }]}
            onPress={openStatus}>
            {pill.showDot && (
              <View style={[lr.statusDot, { backgroundColor: pill.dot }]} />
            )}
            <Text style={[lr.statusTxt, { color: pill.text }]}>{cfg.label}</Text>
            <Ionicons name="chevron-down" size={10} color={pill.text} style={{ marginLeft: 2 }} />
          </Pressable>
        </View>
      </View>
      <View style={lr.c7}>
        <View style={[lr.payChip, isPaid ? lr.paidChip : lr.unpaidChip]}>
          <Text style={[lr.payTxt, { color: isPaid ? c.success : c.warning }]}>
            {isPaid ? 'Paid' : 'Unpaid'}
          </Text>
        </View>
        {!agg && (
          <View style={lr.paySegRow}>
            {(['cash','card','upi'] as const).map((pm, idx, arr) => {
              const active = (order.payment_method ?? '') === pm;
              const isLast = idx === arr.length - 1;
              return (
                <Pressable key={pm} disabled={isUpdating}
                  style={[lr.pmBtn, isLast && lr.pmBtnLast, active && lr.pmBtnActive]}
                  onPress={() => onPaymentChange(order.id, pm)}>
                  <Text style={[lr.pmTxt, active && lr.pmTxtActive]}>
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
            <Pressable style={lr.printBtn} onPress={() => onPrint(order)}>
              <Ionicons name="print-outline" size={13} color="#fff" />
              <Text style={lr.printBtnTxt}>Print</Text>
            </Pressable>
          )}
          {/* Three-dot menu */}
          <View ref={menuAnchorRef} collapsable={false}>
            <Pressable nativeID={menuId}
              style={[lr.iconBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
              onPress={openAction}>
              <Ionicons name="ellipsis-horizontal" size={13} color={c.textMuted} />
            </Pressable>
          </View>
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
  const { colors: c, isDark } = useTheme();
  const s  = useMemo(() => mkS(c, isDark),  [c, isDark]);
  const lr = useMemo(() => mkLr(c, isDark), [c, isDark]);
  const [orders,     setOrders]     = useState<Order[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState<TabKey>('all');
  const [srcFilter,  setSrcFilter]  = useState('all');
  const [dateRange,  setDateRange]  = useState('all');
  const [search,     setSearch]     = useState('');
  const [viewMode,   setViewMode]   = useState<'grid' | 'list'>('grid');
  const [isUpdating, setIsUpdating] = useState(false);
  const [toastMsg,   setToastMsg]   = useState('');
  const aggAlert = useOrderBadgeStore((s) => s.aggAlert);
  const qrAlert  = useOrderBadgeStore((s) => s.qrAlert);
  const refreshVersion = useOrderBadgeStore((s) => s.refreshVersion);
  const clearAggAlert = useOrderBadgeStore((s) => s.clearAggAlert);
  const clearQrAlert  = useOrderBadgeStore((s) => s.clearQrAlert);
  const aggAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrAlertTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { restaurant } = useAppStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const contentW  = isDesktop ? width - 220 : width;
  const numCols   = contentW >= 2200 ? 5 : contentW >= 1700 ? 4 : contentW >= 1200 ? 3 : contentW >= 700 ? 2 : 1;

  // Generation counter: each new fetch increments this; stale responses are
  useEffect(() => {
    if (!aggAlert) return;
    if (aggAlertTimer.current) clearTimeout(aggAlertTimer.current);
    aggAlertTimer.current = setTimeout(() => clearAggAlert(), 8000);
    return () => { if (aggAlertTimer.current) clearTimeout(aggAlertTimer.current); };
  }, [aggAlert, clearAggAlert]);

  useEffect(() => {
    if (!qrAlert?.length) return;
    if (qrAlertTimer.current) clearTimeout(qrAlertTimer.current);
    qrAlertTimer.current = setTimeout(() => clearQrAlert(), 8000);
    return () => { if (qrAlertTimer.current) clearTimeout(qrAlertTimer.current); };
  }, [qrAlert, clearQrAlert]);

  // Generation counter: each new fetch increments this; stale responses are
  // silently discarded when their generation no longer matches the latest.
  const loadGenRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const gen = ++loadGenRef.current;
    if (!silent) setLoading(true);
    try {
      const range  = getDateRange(dateRange);
      const params: any = { per_page: 300 };
      if (range) { params.from = range.from; params.to = range.to; }
      const res  = await ordersApi.list(params);
      // Discard stale responses that arrived after a newer fetch started.
      if (gen !== loadGenRef.current) return;
      const raw: Order[] = Array.isArray(res.data?.data ?? res.data) ? (res.data?.data ?? res.data) : [];
      const data = raw.map(normalizeOrder);
      setOrders(data);

      const pendingCount = data.filter(o => o.status === 'pending').length;
      const kitchenCount = data.filter(o => ['preparing', 'confirmed'].includes(o.status)).length;
      useOrderBadgeStore.getState().update(pendingCount, kitchenCount);
    } catch (e) { console.warn('Orders load:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [dateRange]);

  // Initial load
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent reload when date filter changes
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return; }
    load(true);
  }, [dateRange, load]);

  useEffect(() => {
    if (refreshVersion === 0) return;
    load(true);
  }, [refreshVersion, load]);

  useFocusEffect(
    useCallback(() => { load(true); }, [load])
  );

  // Immediate refresh when app returns to foreground (native + PWA)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(true);
    });
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') load(true);
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        sub.remove();
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    return () => sub.remove();
  }, [load]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  }, []);

  const handleStatusChange = useCallback(async (id: number, status: string) => {
    setIsUpdating(true);
    try {
      const order = orders.find(o => o.id === id);
      if (status === 'completed') {
        await ordersApi.complete(id, order?.payment_method ?? 'cash');
        setOrders(prev => prev.map(o => o.id === id ? {
          ...o,
          status: 'completed' as OrderStatus,
          payment_status: 'paid',
          payment_method: (o.payment_method ?? 'cash') as Order['payment_method'],
        } : o));
      } else {
        await ordersApi.updateStatus(id, status);
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as OrderStatus } : o));
      }
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Could not update status'); }
    finally { setIsUpdating(false); }
  }, [orders, showToast]);

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
          onPress={() => clearAggAlert()}
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
      {qrAlert && qrAlert.length > 0 && (
        <Pressable style={s.qrBanner} onPress={() => clearQrAlert()}>
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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignSelf: 'stretch', maxWidth: '100%' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={c.brand} />}
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
                <View style={[s.statIconBox, { backgroundColor: isDark ? sc.bgDark : sc.bg }]}>
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
              const accent = t.key === 'paid' ? c.success : t.key === 'unpaid' ? c.warning : c.primary;
              return (
                <Pressable key={t.key} style={[s.tabPill, active && s.tabPillActive, active && { backgroundColor: accent, borderColor: accent }]}
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

          {/* Sources row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row2}>
            {SOURCES.map(src => {
              const active = srcFilter === src.key;
              const sc     = src.key !== 'all' ? SOURCE_CFG[src.key as keyof typeof SOURCE_CFG] : null;
              const cnt    = srcCounts[src.key] ?? 0;
              if (src.key !== 'all' && cnt === 0) return null;
              return (
                <Pressable key={src.key}
                  style={[s.srcChip, active && s.srcChipActive, active && (sc ? { backgroundColor: sc.color, borderColor: sc.color } : { backgroundColor: c.primary, borderColor: c.primary })]}
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
            {/* Date pills only in same row on desktop; on mobile shown separately below */}
            {isDesktop && <View style={s.divider} />}
            {isDesktop && DATE_PRESETS.map(dp => {
              const active = dateRange === dp.key;
              return (
                <Pressable key={dp.key} style={[s.datePill, active && s.datePillActive]}
                  onPress={() => setDateRange(dp.key)}>
                  <Ionicons name={dp.key === 'all' ? 'time-outline' : 'calendar-outline'} size={11}
                    color={active ? '#fff' : c.textMuted} />
                  <Text style={[s.datePillTxt, active && { color: '#fff' }]}>{dp.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Date pills — own row on mobile so they're always visible */}
          {!isDesktop && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row2}>
              {DATE_PRESETS.map(dp => {
                const active = dateRange === dp.key;
                return (
                  <Pressable key={dp.key} style={[s.datePill, active && s.datePillActive]}
                    onPress={() => setDateRange(dp.key)}>
                    <Ionicons name={dp.key === 'all' ? 'time-outline' : 'calendar-outline'} size={11}
                      color={active ? '#fff' : c.textMuted} />
                    <Text style={[s.datePillTxt, active && { color: '#fff' }]}>{dp.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* ── Search row — full-width on mobile, with toggle on desktop ── */}
          <View style={isDesktop ? s.row3 : s.row3Mobile}>
            <View style={isDesktop ? s.searchBox : s.searchBoxMobile}>
              <Ionicons name="search-outline" size={isDesktop ? 14 : 16} color={search ? c.brand : c.textMuted} />
              <TextInput
                style={isDesktop ? s.searchInput : s.searchInputMobile}
                placeholder="Search orders, customer, table…"
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={c.textMuted}
                returnKeyType="search"
                clearButtonMode="while-editing"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={c.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {/* View toggle — desktop only; on mobile it moves to results bar */}
            {isDesktop && (
              <View style={s.viewToggle}>
                <Pressable style={[s.viewBtn, viewMode === 'grid' && s.viewBtnActive]} onPress={() => setViewMode('grid')}>
                  <Ionicons name="grid-outline" size={15} color={viewMode === 'grid' ? '#fff' : c.textMuted} />
                </Pressable>
                <Pressable style={[s.viewBtn, viewMode === 'list' && s.viewBtnActive]} onPress={() => setViewMode('list')}>
                  <Ionicons name="list-outline" size={15} color={viewMode === 'list' ? '#fff' : c.textMuted} />
                </Pressable>
              </View>
            )}
          </View>

          {(tab !== 'all' || srcFilter !== 'all' || dateRange !== 'today' || search) && (
            <View style={s.activeFilters}>
              <Ionicons name="funnel" size={12} color={c.textMuted} />
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
          {loading && !refreshing && <ActivityIndicator size="small" color={c.brand} />}
          {/* View toggle on mobile lives here */}
          {!isDesktop && (
            <View style={s.viewToggle}>
              <Pressable style={[s.viewBtn, viewMode === 'grid' && s.viewBtnActive]} onPress={() => setViewMode('grid')}>
                <Ionicons name="grid-outline" size={14} color={viewMode === 'grid' ? '#fff' : c.textMuted} />
              </Pressable>
              <Pressable style={[s.viewBtn, viewMode === 'list' && s.viewBtnActive]} onPress={() => setViewMode('list')}>
                <Ionicons name="list-outline" size={14} color={viewMode === 'list' ? '#fff' : c.textMuted} />
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Content ── */}
        {loading && !refreshing ? (
          <View style={s.loadWrap}>
            <ActivityIndicator size="large" color={c.sidebar} />
            <Text style={s.loadTxt}>Loading orders…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="bag-outline" size={36} color={c.textMuted} />
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
            {isDesktop ? (
              <View style={s.listTableWrap}>
                <View style={lr.header}>
                  {['Order','Customer','Type','Items','Total','Status','Payment','Actions'].map((h, i) => (
                    <Text key={h} style={[lr.hCell, [lr.c1,lr.c2,lr.c3,lr.c4,lr.c5,lr.c6,lr.c7,lr.c8][i]]}>{h}</Text>
                  ))}
                </View>
                {filtered.map((o, idx) => (
                  <View key={o.id} style={idx % 2 === 1 ? { backgroundColor: c.surfaceAlt } : {}}>
                    <OrderListRow order={o} {...actionProps} />
                  </View>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={[s.listTableWrap, s.listTableInner]}>
                  <View style={lr.header}>
                    {['Order','Customer','Type','Items','Total','Status','Payment','Actions'].map((h, i) => (
                      <Text key={h} style={[lr.hCell, [lr.c1,lr.c2,lr.c3,lr.c4,lr.c5,lr.c6,lr.c7,lr.c8][i]]}>{h}</Text>
                    ))}
                  </View>
                  {filtered.map((o, idx) => (
                    <View key={o.id} style={idx % 2 === 1 ? { backgroundColor: c.surfaceAlt } : {}}>
                      <OrderListRow order={o} {...actionProps} />
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}
        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── StyleSheet factory functions (theme-aware) ────────────────────────────────
function mkS(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    shell:          { flex: 1, backgroundColor: c.background },
    toast:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.danger, paddingHorizontal: 16, paddingVertical: 12, zIndex: 99 },
    toastTxt:       { flex: 1, fontSize: 13, color: '#fff', fontWeight: '600' },
    aggBanner:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, zIndex: 100 },
    aggBannerZomato:{ backgroundColor: c.danger },
    aggBannerSwiggy:{ backgroundColor: S.orange },
    aggBannerIcon:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    aggBannerTitle: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
    aggBannerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
    qrBanner:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, zIndex: 100, backgroundColor: S.purple },
    qrBannerIcon:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    statsScroll:    { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    statsRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
    statCard:       {
      minWidth: 152, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOpacity: isDark ? 0.2 : 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    statLabel:      { fontSize: 11.5, fontWeight: '600', color: c.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
    statNum:        { fontSize: 28, fontWeight: '900', color: c.heading, letterSpacing: -1 },
    statIconBox:    { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    filterSection:  { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    tabRow:         { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 6 },
    tabPill:        {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    },
    tabPillActive:  { shadowColor: '#000', shadowOpacity: isDark ? 0.25 : 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    tabPillTxt:     { fontSize: 13, fontWeight: '600', color: c.heading },
    tabCount:       {
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', borderRadius: 10,
      minWidth: 20, paddingHorizontal: 6, paddingVertical: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    tabCountTxt:    { fontSize: 10.5, fontWeight: '800', color: c.text },
    row2:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
    srcChip:        {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    },
    srcChipActive:  { shadowColor: '#000', shadowOpacity: isDark ? 0.2 : 0.06, shadowRadius: 3, elevation: 1 },
    srcDot:         { width: 6, height: 6, borderRadius: 3 },
    srcChipTxt:     { fontSize: 12.5, fontWeight: '700', color: c.text },
    srcCount:       { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
    srcCountTxt:    { fontSize: 10, fontWeight: '800', color: c.text },
    divider:        { width: 1, height: 22, backgroundColor: c.border, marginHorizontal: 4 },
    datePill:       {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    },
    datePillActive: { backgroundColor: c.primary, borderColor: c.primary },
    datePillTxt:    { fontSize: 12.5, fontWeight: '600', color: c.text },
    row3:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
    row3Mobile:     { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 0 },
    searchBox:      {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      width: 280, maxWidth: 280, flexGrow: 0, flexShrink: 0,
      backgroundColor: c.surfaceAlt, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 10,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchBoxMobile: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 13, paddingVertical: 11,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput:    { flex: 1, fontSize: 13.5, color: c.heading },
    searchInputMobile: {
      flex: 1, fontSize: 14.5, color: c.heading,
      fontWeight: '500' as const,
      paddingVertical: 0,
    },
    viewToggle:     {
      flexDirection: 'row', borderWidth: 1.5, borderColor: c.border,
      borderRadius: 11, overflow: 'hidden', backgroundColor: c.surfaceAlt,
      padding: 3, gap: 2,
    },
    viewBtn:        { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    viewBtnActive:  { backgroundColor: c.primary },
    activeFilters:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
    activeFiltersTxt: { flex: 1, fontSize: 12, color: c.textMuted, fontWeight: '500' },
    clearFilters:   { fontSize: 12, fontWeight: '700', color: c.danger },
    resultsBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
    resultsCount:   { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
    loadWrap:       { paddingTop: 100, alignItems: 'center', gap: 14 },
    loadTxt:        { fontSize: 14, color: c.textMuted, fontWeight: '500' },
    emptyWrap:      { paddingTop: 100, alignItems: 'center', gap: 14 },
    emptyIcon:      { width: 80, height: 80, borderRadius: 40, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    emptyTitle:     { fontSize: 17, fontWeight: '700', color: c.text },
    emptySub:       { fontSize: 13.5, color: c.textMuted, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
    grid:           { padding: 8, width: '100%' },
    gridRow:        { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
    listWrap:       {
      marginHorizontal: 14, marginTop: 8, marginBottom: 14,
      backgroundColor: c.surface, borderRadius: 16, overflow: 'hidden',
      borderWidth: 1, borderColor: c.border, alignSelf: 'stretch', maxWidth: '100%',
      shadowColor: '#000', shadowOpacity: isDark ? 0.2 : 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    listTableWrap:  { width: '100%', alignSelf: 'stretch' },
    listTableInner: { minWidth: 940 },
  });
}

function mkDd(c: ThemeColors) {
  return StyleSheet.create({
    panel: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: 0.20,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 8 },
      elevation: 24,
      paddingVertical: 6,
    },
    header:      { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
    headerTitle: { fontSize: 13.5, fontWeight: '800', color: c.heading },
    headerSub:   { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
    sep:         { height: 1, backgroundColor: c.surfaceAlt, marginVertical: 5, marginHorizontal: 8 },
    item:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, marginHorizontal: 4, marginVertical: 1 },
    itemIcon:    { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    itemLabel:   { flex: 1, fontSize: 13.5, fontWeight: '600', color: c.heading },
    statusDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  });
}

function mkCd(c: ThemeColors, isDark: boolean) {
  const notesBg    = isDark ? 'rgba(253,175,34,0.12)' : '#fffbeb';
  const notesText  = isDark ? c.warning : '#92400e';
  const riderBg    = isDark ? 'rgba(32,136,238,0.12)' : '#f0f9ff';
  const riderText  = isDark ? c.info : '#0369a1';

  return StyleSheet.create({
    wrap:        {
      backgroundColor: c.surface, borderRadius: 16, overflow: 'hidden',
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOpacity: isDark ? 0.25 : 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 3,
    },
    head:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: c.surface, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 8 },
    headL:       { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10, minWidth: 0 },
    avatar:      {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
    orderNum:    { fontSize: 14.5, fontWeight: '800', color: c.heading, letterSpacing: 0.1 },
    srcBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
    srcDot:      { width: 5, height: 5, borderRadius: 3 },
    srcTxt:      { fontSize: 10, fontWeight: '800' },
    headSub:     { fontSize: 12, color: c.textMuted, marginTop: 3 },
    menuBtn:     { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    totalRow:    {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      paddingHorizontal: 14, paddingBottom: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    time:        { fontSize: 11, color: c.textMuted, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
    itemsWrap:   { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
    itemLine:    { fontSize: 12.5, lineHeight: 20, marginBottom: 4, color: c.text },
    itemName:    { color: c.text },
    itemQty:     { color: c.textMuted, fontWeight: '600' },
    itemPriceOrange: { color: S.orange, fontWeight: '700' },
    moreItems:   { fontSize: 12.5, fontWeight: '700', color: c.primary, marginTop: 5 },
    noItems:     { fontSize: 12.5, color: c.warning, fontStyle: 'italic' },
    notesBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: notesBg, borderRadius: 8, padding: 8, marginTop: 7 },
    notesText:   { flex: 1, fontSize: 12, color: notesText, lineHeight: 17 },
    riderBox:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: riderBg, borderRadius: 8, padding: 8, marginTop: 7 },
    riderText:   { flex: 1, fontSize: 12, color: riderText, lineHeight: 17 },
    totalAmt:    { fontSize: 16, fontWeight: '800', color: c.heading, letterSpacing: -0.3, flex: 1 },
    actionRow:   { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    outlineOrangeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: S.orange, backgroundColor: 'transparent' },
    outlineOrangeTxt: { fontSize: 12, fontWeight: '700', color: S.orange },
    solidPrimaryBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 6, backgroundColor: c.primary },
    solidPrimaryTxt:  { fontSize: 12, fontWeight: '700', color: '#fff' },
    outlineNeutralBtn:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.35)' : c.border, backgroundColor: 'transparent' },
    outlineNeutralTxt:{ fontSize: 12, fontWeight: '700', color: isDark ? '#fff' : c.heading },
    payRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border, flexWrap: 'wrap' },
    payLabel:    { fontSize: 12, fontWeight: '700', color: S.orange },
    payMethodRow:{ flexDirection: 'row', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: S.orange },
    pmBtn:       { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'transparent', borderRightWidth: 1, borderRightColor: S.orange },
    pmBtnLast:   { borderRightWidth: 0 },
    pmBtnActive: { backgroundColor: c.primary, borderRightColor: c.primary },
    pmText:      { fontSize: 12, fontWeight: '700', color: S.orange },
    pmTextActive:{ color: '#fff' },
    footer:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' },
    payPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 0, paddingVertical: 0 },
    payDot:      { width: 6, height: 6, borderRadius: 3 },
    payText:     { fontSize: 12, fontWeight: '700' },
    paidPill:    { backgroundColor: 'transparent', borderWidth: 0 },
    unpaidPill:  { backgroundColor: 'transparent', borderWidth: 0 },
    markPaidBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: c.primary },
    markPaidTxt:   { fontSize: 12, fontWeight: '700', color: '#fff' },
    markUnpaidBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: S.orange, backgroundColor: 'transparent' },
    markUnpaidTxt: { fontSize: 12, fontWeight: '700', color: S.orange },
    statusPill:  {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
      backgroundColor: 'transparent',
    },
    statusDot:   { width: 7, height: 7, borderRadius: 4 },
    statusTxt:   { fontSize: 12, fontWeight: '700' },
    acceptBtn:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: c.success },
    acceptTxt:   { fontSize: 12, fontWeight: '700', color: '#fff' },
    rejectBtn:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: c.danger, backgroundColor: c.surface },
    rejectTxt:   { fontSize: 12, fontWeight: '700', color: c.danger },
  });
}

function mkLr(c: ThemeColors, isDark: boolean) {
  const paidBg     = isDark ? 'rgba(20,181,29,0.15)'  : '#ecfdf5';
  const paidBorder = isDark ? 'rgba(20,181,29,0.35)'  : '#bbf7d0';
  const unpaidBg     = isDark ? 'rgba(253,175,34,0.15)' : '#fff7ed';
  const unpaidBorder = isDark ? 'rgba(253,175,34,0.35)' : '#fde68a';

  return StyleSheet.create({
    header:    { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.border, width: '100%' },
    hCell:     { fontSize: 11, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    row:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.border, width: '100%' },
    c1: { flex: 1.35, minWidth: 0, paddingRight: 8 },
    c2: { flex: 1.2, minWidth: 0, paddingRight: 8 },
    c3: { flex: 0.85, minWidth: 0, paddingRight: 8 },
    c4: { flex: 0.45, minWidth: 40, paddingRight: 8, alignItems: 'center' },
    c5: { flex: 0.65, minWidth: 72, paddingRight: 8, alignItems: 'flex-end' },
    c6: { flex: 0.95, minWidth: 0, paddingRight: 8 },
    c7: { flex: 1.15, minWidth: 0, paddingRight: 8 },
    c8: { flex: 1, minWidth: 100, alignItems: 'flex-end' },
    orderNum:  { fontSize: 13.5, fontWeight: '800', color: c.brand },
    srcChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
    srcDot:    { width: 5, height: 5, borderRadius: 3 },
    srcTxt:    { fontSize: 9.5, fontWeight: '800' },
    sub:       { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
    customer:  { fontSize: 13, fontWeight: '600', color: c.heading },
    type:      { fontSize: 12, color: c.text, fontWeight: '600' },
    countBadge:{ backgroundColor: c.surfaceAlt, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'center' },
    countTxt:  { fontSize: 12.5, fontWeight: '700', color: c.textMuted },
    total:     { fontSize: 14, fontWeight: '800', color: c.heading },
    statusChip:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusTxt: { fontSize: 12, fontWeight: '700' },
    payChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
    paidChip:  { backgroundColor: paidBg, borderColor: paidBorder },
    unpaidChip:{ backgroundColor: unpaidBg, borderColor: unpaidBorder },
    payTxt:    { fontSize: 11.5, fontWeight: '700' },
    paySegRow:   { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: S.orange, marginTop: 4, alignSelf: 'flex-start' },
    pmBtn:       { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: S.orange },
    pmBtnLast:   { borderRightWidth: 0 },
    pmBtnActive: { backgroundColor: c.primary, borderRightColor: c.primary },
    pmTxt:       { fontSize: 10.5, fontWeight: '700', color: S.orange },
    pmTxtActive: { color: '#fff' },
    acceptBtn:   { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: c.success },
    acceptTxt:   { fontSize: 11.5, fontWeight: '700', color: '#fff' },
    rejectBtn:   { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: c.danger, backgroundColor: c.surface },
    rejectTxt:   { fontSize: 11.5, fontWeight: '700', color: c.danger },
    printBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: c.primary },
    printBtnTxt: { fontSize: 11.5, fontWeight: '700', color: '#fff' },
    iconBtn:     { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  });
}

function mkMs(c: ThemeColors) {
  return StyleSheet.create({
    backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: -8 }, elevation: 20 },
    centeredSheet:{ backgroundColor: c.surface, borderRadius: 22, paddingTop: 8, width: 320, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: 10 }, elevation: 20 },
    handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center', marginBottom: 8 },
    title:        { fontSize: 16, fontWeight: '800', color: c.heading, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 2 },
    sub:          { fontSize: 12.5, color: c.textMuted, paddingHorizontal: 18, paddingBottom: 8 },
    item:         { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 11, marginHorizontal: 8, marginVertical: 1 },
    itemTxt:      { flex: 1, fontSize: 14, color: c.text, fontWeight: '600' },
    dot:          { width: 8, height: 8, borderRadius: 4 },
    itemIcon:     { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  });
}
