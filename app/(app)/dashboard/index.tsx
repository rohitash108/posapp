/**
 * Dashboard — matches csPos Restaurant Admin Dashboard exactly
 *
 * Data sources (server-side, matching csPos API calls):
 *   /reports/summary          → BigCards + Key Metrics + Sales Breakdown
 *   /reports/sales?group_by=day → 7-day Sale Analysis bar chart
 *   /reports/top-items        → Top Selling Items
 *   /reports/payment-methods  → Payment Types panel + Payment Methods grid
 *   /reports/expenses         → Expense Summary widget
 *   /orders (active+recent)   → Active Orders list + Recent Orders list
 *   /reservations             → Reservations count (metric card only)
 *
 * Sections (same order as csPos):
 *  Header with date-range filter (Today / Yesterday / Week / Month / All Time)
 *  Row 1  — 3 BigCards: Today Sales · Month Sales · Total Sales (filtered)
 *  Row 1b — 6 SmallCards: Offline/Online counts + Offline/Online/Net/Total sale
 *  Row 2  — 5 MetricCards: Total Orders · Avg Value · Total Tax · Reservations · Unpaid
 *  Expense Summary — Total Expenses · Net Profit (revenue − expenses)
 *  Chart  — Sale Analysis bar (7-day) + Payment-type breakdown
 *  Bill Type Breakdown grid
 *  Bill Status (Cancelled / Free / Deleted)
 *  Payment Methods grid (cards with progress bar)
 *  Top Selling Items (with Most-Ordered banner + rank bars)
 *  Active Orders list
 *  Recent Orders list
 *  Tables Available grid (bottom, just above Quick Access)
 *  Quick Access grid
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  RefreshControl, useWindowDimensions, ActivityIndicator, Platform,
  Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, subDays, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ordersApi } from '@/api/orders';
import { reportsApi } from '@/api/reports';
import client from '@/api/client';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/store/themeStore';
import type { Order, Reservation, RestaurantTable } from '@/types';

/* ── Static semantic colors (same in light & dark: primary, success, …) ─────── */
const S = {
  primary: '#0D76E1',
  success: '#14B51D',
  danger:  '#FF3636',
  warning: '#FDAF22',
  purple:  '#A91CFF',
  info:    '#2088EE',
  orange:  '#E65100',
  indigo:  '#1B36E0',
  gold:    '#d4b45a',
  dark:    '#1B2E1B',
};

const POLL_MS  = 20_000; // 20s — fast enough to catch QR orders on dashboard
const SIDEBAR  = 220;
const CUR      = '₹';

// ── QR order beep (Web Audio API) ────────────────────────────────────────────
function playQRBeep() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx  = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      osc.connect(gain); osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
    };
    play(1046, 0, 0.15); play(880, 0.18, 0.15); play(1046, 0.36, 0.25);
  } catch { /* audio permission denied */ }
}

// ── Date-range presets ────────────────────────────────────────────────────────
type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',     label: 'Today'      },
  { key: 'yesterday', label: 'Yesterday'  },
  { key: 'week',      label: 'This Week'  },
  { key: 'month',     label: 'This Month' },
  { key: 'all',       label: 'All Time'   },
  { key: 'custom',    label: 'Custom'     },
];

function presetDates(p: Preset, cFrom?: string, cTo?: string): { from: string | null; to: string | null } {
  const d     = (date: Date) => format(date, 'yyyy-MM-dd');
  const today = new Date();
  if (p === 'today')     return { from: d(today),                                           to: d(today) };
  if (p === 'yesterday') return { from: d(subDays(today, 1)),                               to: d(subDays(today, 1)) };
  if (p === 'week')      return { from: d(startOfWeek(today, { weekStartsOn: 1 })),         to: d(today) };
  if (p === 'month')     return { from: d(startOfMonth(today)),                              to: d(today) };
  if (p === 'custom')    return { from: cFrom ?? d(today),                                   to: cTo ?? d(today) };
  return { from: null, to: null };
}

function presetLabel(p: Preset, cFrom?: string, cTo?: string): string {
  if (p === 'today')     return "Today's Sales";
  if (p === 'yesterday') return "Yesterday's Sales";
  if (p === 'week')      return "This Week's Sales";
  if (p === 'month')     return "This Month's Sales";
  if (p === 'all')       return 'All Time Sales';
  if (p === 'custom' && cFrom && cTo) {
    try {
      if (cFrom === cTo) return `${format(new Date(cFrom), 'MMM d')} Sales`;
      return `${format(new Date(cFrom), 'MMM d')} – ${format(new Date(cTo), 'MMM d')} Sales`;
    } catch { return 'Custom Sales'; }
  }
  return 'Period Sales';
}

function presetSub(p: Preset, count: number): string {
  const sfx = count === 1 ? 'order' : 'orders';
  if (p === 'today')     return `${count} ${sfx} today`;
  if (p === 'yesterday') return `${count} ${sfx} yesterday`;
  if (p === 'week')      return `${count} ${sfx} this week`;
  if (p === 'month')     return `${count} ${sfx} this month`;
  if (p === 'all')       return `${count} ${sfx} total`;
  return `${count} ${sfx} in range`;
}

function chartParamsForPreset(p: Preset, cFrom?: string, cTo?: string): Record<string, string> {
  const d = (date: Date) => format(date, 'yyyy-MM-dd');
  const today = new Date();
  if (p === 'today')     return { date_from: d(today), date_to: d(today), group_by: 'day' };
  if (p === 'yesterday') { const y = subDays(today, 1); return { date_from: d(y), date_to: d(y), group_by: 'day' }; }
  if (p === 'week')      return { date_from: d(startOfWeek(today, { weekStartsOn: 1 })), date_to: d(today), group_by: 'day' };
  if (p === 'month')     return { date_from: d(startOfMonth(today)), date_to: d(today), group_by: 'day' };
  if (p === 'custom' && cFrom && cTo) return { date_from: cFrom, date_to: cTo, group_by: 'day' };
  // all time — last 12 months grouped by month
  return { date_from: d(subDays(today, 364)), date_to: d(today), group_by: 'month' };
}

function chartSubtitleForPreset(p: Preset, cFrom?: string, cTo?: string): string {
  if (p === 'today')     return 'Today';
  if (p === 'yesterday') return 'Yesterday';
  if (p === 'week')      return 'This Week';
  if (p === 'month')     return 'This Month';
  if (p === 'all')       return 'Last 12 Months';
  if (p === 'custom' && cFrom && cTo) {
    try {
      if (cFrom === cTo) return format(new Date(cFrom), 'MMM d, yyyy');
      return `${format(new Date(cFrom), 'MMM d')} – ${format(new Date(cTo), 'MMM d, yyyy')}`;
    } catch { return 'Custom Range'; }
  }
  return 'Selected Period';
}

function displayDateRange(p: Preset, cFrom?: string, cTo?: string): string {
  const d  = (date: Date) => format(date, 'dd MMM yyyy');
  const ds = (date: Date) => format(date, 'dd MMM');
  const today = new Date();
  if (p === 'today')     return d(today);
  if (p === 'yesterday') return d(subDays(today, 1));
  if (p === 'week')      return `${ds(startOfWeek(today, { weekStartsOn: 1 }))} – ${d(today)}`;
  if (p === 'month')     return `${ds(startOfMonth(today))} – ${d(today)}`;
  if (p === 'custom' && cFrom && cTo) {
    try {
      return cFrom === cTo
        ? format(new Date(cFrom), 'dd MMM yyyy')
        : `${format(new Date(cFrom), 'dd MMM')} – ${format(new Date(cTo), 'dd MMM yyyy')}`;
    } catch { return 'Custom Range'; }
  }
  return 'All Time';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney  = (n: number) => `${CUR}${Math.round(n).toLocaleString('en-IN')}`;
const fmtFull   = (n: number) => `${CUR}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct       = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;
const todayStr  = () => format(new Date(), 'yyyy-MM-dd');
const mStartStr = () => format(startOfMonth(new Date()), 'yyyy-MM-dd');

function last7Labels() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE') };
  });
}

const ONLINE_SOURCES = ['zomato', 'swiggy'];

const PM_CFG: Record<string, { label: string; icon: any; color: string }> = {
  cash:    { label: 'Cash',       icon: 'cash-outline',        color: S.success },
  card:    { label: 'Card',       icon: 'card-outline',        color: S.info    },
  upi:     { label: 'UPI',        icon: 'qr-code-outline',     color: S.purple  },
  razorpay:{ label: 'Razorpay',  icon: 'card-outline',        color: S.primary },
  gpay:    { label: 'Google Pay', icon: 'wallet-outline',      color: S.primary },
  phonepe: { label: 'PhonePe',   icon: 'wallet-outline',      color: S.indigo  },
  paytm:   { label: 'Paytm',     icon: 'wallet-outline',      color: S.indigo  },
  zomato:  { label: 'Zomato',    icon: 'bicycle-outline',     color: S.danger  },
  swiggy:  { label: 'Swiggy',    icon: 'bicycle-outline',     color: S.orange  },
  other:   { label: 'Other',     icon: 'help-circle-outline', color: '#64748B' },
};

const BILL_TYPE_CFG: Record<string, { label: string; icon: any; color: string }> = {
  dine_in:  { label: 'Dine In',    icon: 'restaurant-outline', color: S.primary },
  takeaway: { label: 'Quick Bill', icon: 'bag-outline',         color: '#64748B' },
  pickup:   { label: 'Pickup',     icon: 'cube-outline',        color: S.warning },
  delivery: { label: 'Delivery',   icon: 'bicycle-outline',     color: S.success },
  qr_order: { label: 'QR Order',   icon: 'qr-code-outline',     color: S.purple  },
};

const STATUS_CFG: Record<string, { color: string; bg: string; bgDark: string }> = {
  pending:   { color: '#d97706', bg: '#fef9ec', bgDark: 'rgba(217,119,6,0.15)' },
  confirmed: { color: S.primary, bg: '#eff6ff', bgDark: 'rgba(13,118,225,0.15)' },
  preparing: { color: S.purple,  bg: '#f5f3ff', bgDark: 'rgba(169,28,255,0.15)' },
  ready:     { color: S.info,    bg: '#ecfeff', bgDark: 'rgba(32,136,238,0.15)' },
  served:    { color: S.success, bg: '#ecfdf5', bgDark: 'rgba(20,181,29,0.15)' },
  completed: { color: '#16a34a', bg: '#f0fdf4', bgDark: 'rgba(22,163,74,0.15)' },
  cancelled: { color: S.danger,  bg: '#fff1f2', bgDark: 'rgba(255,54,54,0.15)' },
};

// ── Data shapes ───────────────────────────────────────────────────────────────
interface Summary {
  today_sales:       number;
  today_orders:      number;
  month_sales:       number;
  month_orders:      number;
  sales_growth_pct:  number;
  total_sales:       number;
  total_orders:      number;
  total_tax:         number;
  total_discount:    number;
  net_sales:         number;
  avg_order_value:   number;
  offline_orders:    number;
  online_orders:     number;
  offline_sales:     number;
  online_sales:      number;
  unpaid_count:      number;
  unpaid_total:      number;
  cancelled_count:   number;
  free_bills:        number;
  deleted_count:     number;
  reservations_count:number;
  bill_types:        Record<string, { count: number; total: number }>;
}

interface SalesDay { date: string; total_sales: number; total_orders: number; }
interface TopItem  { item_name: string; name?: string; quantity: number; qty?: number; total?: number; }
interface PmRow    { payment_method?: string; method?: string; count: number; total: number; }
interface ExpenseSummary { total: number; tax_total: number; count: number; }

// ── Client-side fallback: compute summary from raw orders ─────────────────────
function summaryFromOrders(
  todayOrders: Order[],
  monthOrders: Order[],
  filteredOrders: Order[],
  prevMonthOrders: Order[],
  reservCount: number,
): Summary {
  const paid    = (arr: Order[]) => arr.filter(o => o.payment_status === 'paid');
  const sum     = (arr: Order[], key: keyof Order) =>
    arr.reduce((s, o) => s + (Number(o[key]) || 0), 0);
  const paidSum = (arr: Order[]) => sum(paid(arr), 'total');

  const todaySales     = paidSum(todayOrders);
  const monthSales     = paidSum(monthOrders);
  const prevMonthSales = paidSum(prevMonthOrders);
  const salesGrowthPct = prevMonthSales > 0
    ? Math.round(((monthSales - prevMonthSales) / prevMonthSales) * 100)
    : monthSales > 0 ? 100 : 0;

  const allPaid        = paid(filteredOrders);
  const totalSales     = paidSum(filteredOrders);
  const totalTax       = sum(allPaid, 'tax_amount');
  const totalDiscount  = sum(allPaid, 'discount_amount');
  const netSales       = Math.max(0, totalSales - totalTax);
  const avgOrderValue  = allPaid.length > 0 ? totalSales / allPaid.length : 0;

  const offlineOrders  = filteredOrders.filter(o => !ONLINE_SOURCES.includes(o.source ?? ''));
  const onlineOrders   = filteredOrders.filter(o =>  ONLINE_SOURCES.includes(o.source ?? ''));
  const unpaidOrders   = filteredOrders.filter(o => o.payment_status !== 'paid' && o.status !== 'cancelled');

  const bill_types = Object.keys(BILL_TYPE_CFG).reduce((acc, k) => {
    const t = filteredOrders.filter(o => o.order_type === k);
    acc[k]  = { count: t.length, total: paidSum(t) };
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  return {
    today_sales:        todaySales,
    today_orders:       todayOrders.length,
    month_sales:        monthSales,
    month_orders:       monthOrders.length,
    sales_growth_pct:   salesGrowthPct,
    total_sales:        totalSales,
    total_orders:       filteredOrders.length,
    total_tax:          totalTax,
    total_discount:     totalDiscount,
    net_sales:          netSales,
    avg_order_value:    avgOrderValue,
    offline_orders:     offlineOrders.length,
    online_orders:      onlineOrders.length,
    offline_sales:      paidSum(offlineOrders),
    online_sales:       paidSum(onlineOrders),
    unpaid_count:       unpaidOrders.length,
    unpaid_total:       sum(unpaidOrders, 'total'),
    cancelled_count:    filteredOrders.filter(o => o.status === 'cancelled').length,
    free_bills:         filteredOrders.filter(o => o.status !== 'cancelled' && Number(o.total) === 0).length,
    deleted_count:      0,
    reservations_count: reservCount,
    bill_types,
  };
}

// ── Sub-components (all theme-aware) ──────────────────────────────────────────

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  const D = colors.dashboard;
  return (
    <View style={sh.row}>
      <Text style={[sh.title, { color: D.text }]}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction} style={sh.actionBtn} activeOpacity={0.7}>
          <Text style={sh.actionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={S.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Colorful circular blob icon matching web dashboard design
function BlobIcon({ color, icon, size = 64 }: { color: string; icon: any; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size,         height: size,         borderRadius: size / 2, backgroundColor: color + '18' }} />
      <View style={{ position: 'absolute', width: size * 0.72, height: size * 0.72, borderRadius: size / 2, backgroundColor: color + '28', right: 1, bottom: 1 }} />
      <View style={{ position: 'absolute', width: size * 0.50, height: size * 0.50, borderRadius: size / 2, backgroundColor: color + '40', left: 3,  top: 3  }} />
      <Ionicons name={icon} size={size * 0.38} color={color} />
    </View>
  );
}

function BigCard({ label, value, sub, icon, color, bg, growthPct, subColor, onPress }: {
  label: string; value: string; sub: string; icon: any;
  color: string; bg?: string; growthPct?: number; subColor?: string; onPress?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  return (
    <TouchableOpacity
      style={[bc.wrap, {
        backgroundColor: D.white,
        borderColor: isDark ? D.border : '#EBEBEB',
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.22 : 0.06,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }]}
      onPress={onPress} activeOpacity={0.82}
    >
      <View style={{ paddingRight: 82 }}>
        <Text style={[bc.label, { color: D.muted }]}>{label}</Text>
        <Text style={[bc.value, { color: D.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Text style={[bc.sub, { color: subColor ?? S.warning }]}>{sub}</Text>
          {growthPct !== undefined && growthPct !== 0 && (
            <View style={[bc.growthBadge, {
              backgroundColor: growthPct > 0 ? 'rgba(20,181,29,0.12)' : 'rgba(255,54,54,0.12)',
            }]}>
              <Ionicons name={growthPct > 0 ? 'trending-up' : 'trending-down'} size={10}
                color={growthPct > 0 ? S.success : S.danger} />
              <Text style={[bc.growthText, { color: growthPct > 0 ? S.success : S.danger }]}>
                {growthPct > 0 ? '+' : ''}{growthPct}%
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ position: 'absolute', right: 14, top: 14 }}>
        <BlobIcon color={color} icon={icon} size={64} />
      </View>
    </TouchableOpacity>
  );
}

function SmallCard({ label, value, sub, icon, color, bg, danger, onPress }: {
  label: string; value: string | number; sub?: string; icon: any;
  color: string; bg?: string; danger?: boolean; onPress?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const c = danger ? S.danger : color;
  return (
    <TouchableOpacity
      style={[smc.wrap, {
        backgroundColor: D.white,
        borderColor: danger ? S.danger : (isDark ? D.border : '#EBEBEB'),
        borderWidth: danger ? 1.5 : 1,
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.18 : 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }]}
      onPress={onPress} activeOpacity={0.82}
    >
      <View style={{ paddingRight: 52 }}>
        <Text style={[smc.label, { color: D.muted }]} numberOfLines={1}>{label}</Text>
        <Text style={[smc.value, { color: danger ? S.danger : D.text }]} numberOfLines={1}>{String(value)}</Text>
        {sub ? <Text style={[smc.sub, { color: c }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <View style={{ position: 'absolute', right: 10, top: 10 }}>
        <BlobIcon color={c} icon={icon} size={46} />
      </View>
    </TouchableOpacity>
  );
}

// ── Dual-axis Line Chart (Revenue + Orders) — matches CSPos Sale Analysis ──────
function LineChart({ labels, revData, ordData }: {
  labels: string[]; revData: number[]; ordData: number[];
}) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const [chartW, setChartW] = useState(300);

  const CHART_H   = 160;
  const PAD_LEFT  = 44;   // Y-axis (Revenue) width
  const PAD_RIGHT = 36;   // Y-axis (Orders) width
  const PAD_TOP   = 10;
  const PAD_BOT   = 0;
  const plotW     = Math.max(60, chartW - PAD_LEFT - PAD_RIGHT);
  const plotH     = CHART_H - PAD_TOP - PAD_BOT;

  const n         = Math.max(labels.length, 2);
  const maxRev    = Math.max(...revData, 1);
  const maxOrd    = Math.max(...ordData, 1);
  const gridLines = 4; // horizontal lines

  const gridBg = isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
  const axisClr = isDark ? 'rgba(255,255,255,0.2)' : '#e2e8f0';

  // Pixel positions for each data point
  const revPts = revData.map((v, i) => ({
    x: PAD_LEFT + (i / (n - 1)) * plotW,
    y: PAD_TOP  + (1 - v / maxRev) * plotH,
    v,
  }));
  const ordPts = ordData.map((v, i) => ({
    x: PAD_LEFT + (i / (n - 1)) * plotW,
    y: PAD_TOP  + (1 - v / maxOrd) * plotH,
    v,
  }));

  // Y-axis labels for Revenue (left)
  const revTicks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const frac = i / gridLines;
    const val  = maxRev * (1 - frac);
    return { y: PAD_TOP + frac * plotH, label: val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(Math.round(val)) };
  });
  // Y-axis labels for Orders (right)
  const ordTicks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const frac = i / gridLines;
    const val  = Math.round(maxOrd * (1 - frac));
    return { y: PAD_TOP + frac * plotH, label: String(val) };
  });

  return (
    <View style={ch.wrap} onLayout={e => setChartW(e.nativeEvent.layout.width)}>
      {/* Legend row — top right matching web */}
      <View style={ch.legend}>
        <View style={ch.legendItem}>
          <View style={[ch.legendDot, { backgroundColor: S.primary }]} />
          <Text style={[ch.legendText, { color: D.muted }]}>Revenue</Text>
        </View>
        <View style={ch.legendItem}>
          <View style={[ch.legendDot, { backgroundColor: S.success }]} />
          <Text style={[ch.legendText, { color: D.muted }]}>Orders</Text>
        </View>
      </View>

      {/* Chart canvas */}
      <View style={{ height: CHART_H + 24, position: 'relative' }}>

        {/* Horizontal grid lines */}
        {revTicks.map((tick, i) => (
          <View key={i} style={{
            position: 'absolute', left: PAD_LEFT, right: PAD_RIGHT,
            top: tick.y, height: 1, backgroundColor: axisClr,
          }} />
        ))}

        {/* Left Y-axis labels (Revenue) */}
        {revTicks.map((tick, i) => (
          <Text key={i} style={[ch.yLabel, { color: D.muted, top: tick.y - 7, left: 0, width: PAD_LEFT - 4, textAlign: 'right' }]}>
            {tick.label}
          </Text>
        ))}

        {/* Right Y-axis labels (Orders) */}
        {ordTicks.map((tick, i) => (
          <Text key={i} style={[ch.yLabel, { color: D.muted, top: tick.y - 7, right: 0, width: PAD_RIGHT - 4, textAlign: 'left' }]}>
            {tick.label}
          </Text>
        ))}

        {/* Revenue line segments (blue) — 2.5px thick */}
        {revPts.map((pt, i) => {
          if (i >= revPts.length - 1) return null;
          const p2  = revPts[i + 1];
          const dx  = p2.x - pt.x, dy = p2.y - pt.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ang = Math.atan2(dy, dx) * (180 / Math.PI);
          const cx  = (pt.x + p2.x) / 2, cy = (pt.y + p2.y) / 2;
          return (
            <View key={i} style={{
              position: 'absolute', left: cx, top: cy,
              width: len, height: 2.5, backgroundColor: S.primary,
              transform: [{ translateX: -len / 2 }, { translateY: -1.25 }, { rotate: `${ang}deg` }],
            }} />
          );
        })}

        {/* Orders line segments (green) — 2.5px thick */}
        {ordPts.map((pt, i) => {
          if (i >= ordPts.length - 1) return null;
          const p2  = ordPts[i + 1];
          const dx  = p2.x - pt.x, dy = p2.y - pt.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ang = Math.atan2(dy, dx) * (180 / Math.PI);
          const cx  = (pt.x + p2.x) / 2, cy = (pt.y + p2.y) / 2;
          return (
            <View key={i} style={{
              position: 'absolute', left: cx, top: cy,
              width: len, height: 2, backgroundColor: S.success,
              transform: [{ translateX: -len / 2 }, { translateY: -1 }, { rotate: `${ang}deg` }],
            }} />
          );
        })}

        {/* Revenue dots — larger with white ring */}
        {revPts.map((pt, i) => (
          <View key={i} style={{
            position: 'absolute', left: pt.x - 5, top: pt.y - 5,
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: S.primary, borderWidth: 2.5, borderColor: D.white,
          }} />
        ))}

        {/* Orders dots — medium with white ring */}
        {ordPts.map((pt, i) => (
          <View key={i} style={{
            position: 'absolute', left: pt.x - 4, top: pt.y - 4,
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: S.success, borderWidth: 2, borderColor: D.white,
          }} />
        ))}

        {/* X-axis labels */}
        <View style={{ position: 'absolute', top: CHART_H + 4, left: PAD_LEFT, right: PAD_RIGHT, flexDirection: 'row' }}>
          {labels.map((lbl, i) => (
            <Text key={i} style={[ch.dayLabel, { color: D.muted, flex: 1, textAlign: 'center' }]}>{lbl}</Text>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── DonutChart for Payment Type panel — matches CSPos web design ──────────────
function DonutChart({ methods, totalRevenue }: {
  methods: { key: string; label: string; color: string; icon: any; count: number; total: number; percent: number }[];
  totalRevenue: number;
}) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const RING_SIZE = 130;
  const RING_W    = 20;

  const hasData = methods.length > 0 && totalRevenue > 0;
  const ringBg  = isDark ? 'rgba(255,255,255,0.07)' : '#f1f5f9';

  return (
    <View style={donut.wrap}>
      {/* Donut ring + center text */}
      <View style={donut.ringWrap}>
        {/* Outer ring (background) */}
        <View style={[donut.ring, {
          width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
          borderWidth: RING_W, borderColor: hasData ? (methods[0]?.color + '30') : ringBg,
        }]} />
        {/* Inner overlay creates "hole" illusion */}
        <View style={[donut.center, { width: RING_SIZE - RING_W * 2, height: RING_SIZE - RING_W * 2, borderRadius: (RING_SIZE - RING_W * 2) / 2, backgroundColor: D.white }]}>
          <Text style={[donut.totalLabel, { color: D.muted }]}>Total</Text>
          <Text style={[donut.totalValue, { color: D.text }]}>{fmtMoney(totalRevenue)}</Text>
        </View>
      </View>

      {/* No-data state */}
      {!hasData && (
        <Text style={[donut.noData, { color: S.warning }]}>No payment data yet.</Text>
      )}

      {/* Legend — each payment method */}
      {hasData && (
        <View style={donut.legend}>
          {methods.slice(0, 6).map((m, i) => (
            <View key={i} style={donut.legendRow}>
              <View style={[donut.legendDot, { backgroundColor: m.color }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[donut.legendLabel, { color: D.text }]} numberOfLines={1}>
                  {m.label}
                </Text>
                <Text style={[donut.legendSub, { color: D.muted }]}>{m.count} orders</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[donut.legendValue, { color: D.text }]}>{fmtMoney(m.total)}</Text>
                <Text style={[donut.legendPct, { color: m.color }]}>{m.percent}%</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {!hasData && (
        <Text style={[donut.note, { color: D.muted }]}>
          {'Other / Not Specified'} — orders where no payment method was recorded.
        </Text>
      )}
    </View>
  );
}

// ProgressItem is kept for compatibility with BillType etc.
function ProgressItem({ label, sub, value, percent, color, icon }: {
  label: string; sub?: string; value: string; percent: number; color: string; icon?: any;
}) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const trackBg = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
  return (
    <View style={pi.wrap}>
      <View style={pi.top}>
        <View style={pi.left}>
          {icon && (
            <View style={[pi.icon, { backgroundColor: color + '18' }]}>
              <Ionicons name={icon} size={13} color={color} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[pi.label, { color: D.text }]} numberOfLines={1}>{label}</Text>
            {sub ? <Text style={[pi.sub, { color: D.muted }]} numberOfLines={1}>{sub}</Text> : null}
          </View>
        </View>
        <View style={pi.right}>
          <Text style={[pi.value, { color: D.text }]}>{value}</Text>
          <View style={[pi.pctBadge, { backgroundColor: color + '18' }]}>
            <Text style={[pi.pctText, { color }]}>{percent}%</Text>
          </View>
        </View>
      </View>
      <View style={[pi.track, { backgroundColor: trackBg }]}>
        <View style={[pi.fill, { width: `${Math.min(percent, 100)}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function PaymentCard({ label, icon, color, count, total, percent }: {
  label: string; icon: any; color: string;
  count: number; total: number; percent: number;
}) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const trackBg = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
  return (
    <View style={[pmc.wrap, { backgroundColor: D.white, borderColor: D.border, shadowColor: D.cardShadow }]}>
      <View style={pmc.top}>
        <View style={[pmc.iconWrap, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[pmc.label, { color: D.text }]} numberOfLines={1}>{label}</Text>
          <Text style={[pmc.sub, { color: D.muted }]}>{count} bills</Text>
        </View>
      </View>
      <Text style={[pmc.amount, { color: D.text }]}>{fmtFull(total)}</Text>
      <View style={[pmc.track, { backgroundColor: trackBg }]}>
        <View style={[pmc.fill, { width: `${Math.min(percent, 100)}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[pmc.pct, { color: D.muted }]}>{percent}% of revenue</Text>
    </View>
  );
}

function BillTypeCard({ label, icon, color, count, total }: {
  label: string; icon: any; color: string; count: number; total: number;
}) {
  const { colors } = useTheme();
  const D = colors.dashboard;
  return (
    <View style={[btc.wrap, { backgroundColor: D.white, borderColor: D.border, shadowColor: D.cardShadow }]}>
      <View style={btc.top}>
        <View style={[btc.icon, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={[btc.badge, { backgroundColor: color + '18' }]}>
          <Text style={[btc.badgeText, { color }]}>{count}</Text>
        </View>
      </View>
      <Text style={[btc.label, { color: D.muted }]}>{label}</Text>
      <Text style={[btc.amount, { color }]}>{fmtMoney(total)}</Text>
    </View>
  );
}

function TopItemRow({ name, qty, maxQty, rank }: { name: string; qty: number; maxQty: number; rank: number }) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const palette = [S.primary, S.success, S.warning, S.purple, S.orange, S.info];
  const color  = palette[(rank - 1) % palette.length];
  const w      = maxQty > 0 ? (qty / maxQty) * 100 : 0;
  const trackBg = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
  return (
    <View style={ti.wrap}>
      <View style={[ti.rank, { backgroundColor: color + '18' }]}>
        <Text style={[ti.rankText, { color }]}>#{rank}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={ti.nameRow}>
          <Text style={[ti.name, { color: D.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[ti.qty, { color }]}>{qty} sold</Text>
        </View>
        <View style={[ti.track, { backgroundColor: trackBg }]}>
          <View style={[ti.fill, { width: `${w}%` as any, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

function ActiveOrderRow({ order }: { order: Order }) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const stCfg = STATUS_CFG[order.status] ?? { color: '#64748B', bg: '#f3f4f6', bgDark: 'rgba(100,116,139,0.15)' };
  const stBg = isDark ? stCfg.bgDark : stCfg.bg;
  return (
    <TouchableOpacity style={[ar.row, { borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb' }]}
      onPress={() => router.push('/(app)/orders' as any)} activeOpacity={0.8}>
      <View style={[ar.avatar, { backgroundColor: stBg }]}>
        <Ionicons name="restaurant-outline" size={13} color={stCfg.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[ar.num, { color: D.text }]} numberOfLines={1}>
          #{order.order_number} · {order.customer_name ?? 'Walk-in'}
        </Text>
        <Text style={[ar.meta, { color: D.muted }]} numberOfLines={1}>
          {(order.order_type ?? '').replace(/_/g, ' ')}
          {order.table_name ? ` · ${order.table_name}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Text style={[ar.amount, { color: S.gold }]}>{fmtFull(Number(order.total ?? 0))}</Text>
        <View style={[ar.badge, { backgroundColor: stBg }]}>
          <Text style={[ar.badgeText, { color: stCfg.color }]}>{order.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function RecentOrderRow({ order }: { order: Order }) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const stCfg  = STATUS_CFG[order.status] ?? { color: '#64748B', bg: '#f3f4f6', bgDark: 'rgba(100,116,139,0.15)' };
  const stBg   = isDark ? stCfg.bgDark : stCfg.bg;
  const src    = order.source ?? 'pos';
  const srcClr: Record<string, string> = { pos: D.text, zomato: S.danger, swiggy: S.orange, qr: S.purple };
  const color  = srcClr[src] ?? D.text;
  const isPaid = order.payment_status === 'paid';
  const paidBg = isDark
    ? (isPaid ? 'rgba(20,181,29,0.15)' : 'rgba(217,119,6,0.15)')
    : (isPaid ? '#f0fdf4' : '#fef9ec');
  return (
    <TouchableOpacity style={[rr.row, { borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb' }]}
      onPress={() => router.push('/(app)/orders' as any)} activeOpacity={0.8}>
      <View style={[rr.avatar, { backgroundColor: S.primary + '15' }]}>
        <Ionicons name="bag-outline" size={14} color={S.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[rr.num, { color: D.text }]}>#{order.order_number}</Text>
          {src !== 'pos' && (
            <View style={[rr.srcBadge, { backgroundColor: color + '18' }]}>
              <Text style={[rr.srcText, { color }]}>{src.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={[rr.meta, { color: D.muted }]} numberOfLines={1}>
          {order.customer_name ?? 'Walk-in'} · {(order.order_type ?? '').replace(/_/g, ' ')}
          {order.table_name ? ` · ${order.table_name}` : ''}
        </Text>
        <Text style={[rr.time, { color: isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af' }]}>
          {order.created_at ? format(new Date(order.created_at), 'dd MMM, hh:mm a') : '—'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[rr.amount, { color: S.gold }]}>{fmtFull(Number(order.total ?? 0))}</Text>
        <View style={[rr.badge, { backgroundColor: stBg }]}>
          <Text style={[rr.badgeText, { color: stCfg.color }]}>{order.status}</Text>
        </View>
        <View style={[rr.badge, { backgroundColor: paidBg }]}>
          <Text style={[rr.badgeText, { color: isPaid ? '#16a34a' : '#d97706' }]}>
            {isPaid ? 'PAID' : 'UNPAID'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ReservationRow({ res }: { res: Reservation }) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const statusColors: Record<string, string> = {
    pending: '#d97706', confirmed: S.primary, seated: S.success,
    cancelled: S.danger, no_show: '#64748B',
  };
  const color = statusColors[res.status] ?? '#64748B';
  return (
    <View style={[resR.row, { borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb' }]}>
      <View style={[resR.avatar, { backgroundColor: color + '18' }]}>
        <Ionicons name="calendar-outline" size={14} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[resR.name, { color: D.text }]} numberOfLines={1}>{res.customer_name}</Text>
        <Text style={[resR.meta, { color: D.muted }]}>
          {res.guest_count} guests{res.table_name ? ` · ${res.table_name}` : ''}
        </Text>
        <Text style={[resR.time, { color: isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af' }]}>
          {res.reserved_at ? format(new Date(res.reserved_at), 'dd MMM, hh:mm a') : '—'}
        </Text>
      </View>
      <View style={[resR.badge, { backgroundColor: color + '18' }]}>
        <Text style={[resR.badgeText, { color }]}>{res.status}</Text>
      </View>
    </View>
  );
}

// ── TableCard — matches CSPos web Tables Available card design ────────────────
function TableChip({ table }: { table: RestaurantTable }) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const cfg = table.status === 'available'
    ? { color: S.success, borderColor: S.success, iconBg: S.success + '18', label: 'Available' }
    : table.status === 'occupied'
    ? { color: S.warning,  borderColor: S.warning,  iconBg: S.warning  + '18', label: 'Occupied'  }
    : { color: S.info,    borderColor: S.info,    iconBg: S.info    + '18', label: 'Reserved'  };
  return (
    <TouchableOpacity
      style={[tablC.wrap, {
        backgroundColor: D.white,
        borderColor: cfg.borderColor + '60',
        shadowColor: cfg.color,
      }]}
      onPress={() => router.push('/(app)/tables' as any)} activeOpacity={0.82}
    >
      {/* Icon area — light bg with restaurant table icon, like CSPos web */}
      <View style={[tablC.iconArea, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8f9fb' }]}>
        <Ionicons name="grid-outline" size={38} color={cfg.color} />
      </View>
      {/* Info area */}
      <View style={tablC.info}>
        <Text style={[tablC.name, { color: D.text }]} numberOfLines={1}>{table.name}</Text>
        {table.capacity
          ? <Text style={[tablC.cap, { color: D.muted }]}>Guests : {table.capacity}</Text>
          : null}
        <Text style={[tablC.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── TrendingMenuCard — card per top-selling item in the Trending Menus grid ──
function TrendingMenuCard({ name, qty, rank, maxQty }: { name: string; qty: number; rank: number; maxQty: number }) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const palette = [S.primary, S.success, S.warning, S.purple, S.orange, S.info];
  const color = palette[(rank - 1) % palette.length];
  const barW  = maxQty > 0 ? Math.round((qty / maxQty) * 100) : 0;
  const trackBg = isDark ? 'rgba(255,255,255,0.07)' : '#f1f5f9';
  return (
    <View style={[tmc.wrap, {
      backgroundColor: isDark ? D.white : color + '08',
      borderColor: isDark ? color + '35' : D.border,
      borderTopColor: color,
      shadowColor: color,
    }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={[tmc.rankBadge, { backgroundColor: color + '1A' }]}>
          <Text style={[tmc.rankText, { color }]}>#{rank}</Text>
        </View>
        {rank === 1 && (
          <View style={[tmc.trendBadge, { backgroundColor: S.success + '14' }]}>
            <Ionicons name="trending-up" size={10} color={S.success} />
            <Text style={[tmc.trendText, { color: S.success }]}>Hot</Text>
          </View>
        )}
      </View>
      <Text style={[tmc.name, { color: D.text }]} numberOfLines={2}>{name}</Text>
      <Text style={[tmc.qty, { color }]}>{qty} sold</Text>
      <View style={[tmc.track, { backgroundColor: trackBg, marginTop: 6 }]}>
        <View style={[tmc.fill, { width: `${barW}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── NotificationRow — single notification list item ───────────────────────────
function NotificationRow({ notif }: { notif: { id: number; title?: string; message?: string; type?: string; created_at?: string; read_at?: string | null } }) {
  const { colors, isDark } = useTheme();
  const D = colors.dashboard;
  const isUnread = !notif.read_at;
  const typeColor: Record<string, string> = {
    order: S.primary, reservation: S.success, payment: S.warning,
    alert: S.danger,  info: S.info,           system: '#64748B',
  };
  const color = typeColor[notif.type ?? 'info'] ?? S.primary;
  const title = notif.title ?? notif.message ?? 'Notification';
  const msg   = notif.title && notif.message ? notif.message : undefined;
  return (
    <View style={[nr.row, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6' }]}>
      <View style={[nr.iconWrap, { backgroundColor: color + '14' }]}>
        <Ionicons
          name={notif.type === 'order' ? 'receipt-outline'
              : notif.type === 'reservation' ? 'calendar-outline'
              : notif.type === 'payment' ? 'cash-outline'
              : notif.type === 'alert' ? 'warning-outline'
              : 'notifications-outline'}
          size={14} color={color}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[nr.title, { color: D.text, fontWeight: isUnread ? '700' : '500' }]} numberOfLines={1}>{title}</Text>
        {msg ? <Text style={[nr.msg, { color: D.muted }]} numberOfLines={1}>{msg}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        {notif.created_at
          ? <Text style={[nr.time, { color: D.muted }]}>{format(new Date(notif.created_at), 'HH:mm')}</Text>
          : null}
        {isUnread && <View style={[nr.dot, { backgroundColor: color }]} />}
      </View>
    </View>
  );
}

const QUICK_LINKS = [
  { label: 'POS',          icon: 'cart-outline',      route: '/(app)/pos',          color: S.dark    },
  { label: 'Kitchen',      icon: 'flame-outline',     route: '/(app)/kitchen',      color: '#f59e0b' },
  { label: 'Orders',       icon: 'receipt-outline',   route: '/(app)/orders',       color: S.primary },
  { label: 'Tables',       icon: 'grid-outline',      route: '/(app)/tables',       color: S.purple  },
  { label: 'Customers',    icon: 'people-outline',    route: '/(app)/customers',    color: S.success },
  ...(Platform.OS !== 'web' ? [{ label: 'Wallet', icon: 'wallet-outline' as const, route: '/(app)/wallet', color: '#d97706' }] : []),
  { label: 'Reservations', icon: 'calendar-outline',  route: '/(app)/reservations', color: S.danger  },
  { label: 'Invoices',     icon: 'document-text-outline', route: '/(app)/invoices', color: '#4f46e5' },
  { label: 'Payments',     icon: 'card-outline',      route: '/(app)/payments',     color: '#0284c7' },
  { label: 'Coupons',      icon: 'pricetag-outline',  route: '/(app)/coupons',      color: '#db2777' },
  { label: 'Expenses',     icon: 'wallet-outline',    route: '/(app)/expenses',     color: S.warning },
  { label: 'Reports',      icon: 'bar-chart-outline', route: '/(app)/reports',      color: S.info    },
  { label: 'Menu',         icon: 'restaurant-outline',route: '/(app)/menu',         color: S.info    },
  { label: 'Staff',        icon: 'people-circle-outline', route: '/(app)/staff',  color: S.dark    },
  { label: 'Settings',     icon: 'settings-outline',  route: '/(app)/settings',     color: '#64748b' },
  { label: 'All Modules',  icon: 'apps-outline',      route: '/(app)/more',         color: '#1A2B1A' },
];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const [preset,       setPreset]       = useState<Preset>('today');
  const [customFrom,   setCustomFrom]   = useState('');
  const [customTo,     setCustomTo]     = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customFromInput, setCustomFromInput] = useState('');
  const [customToInput,   setCustomToInput]   = useState('');
  const [summary,      setSummary]      = useState<Summary | null>(null);
  const [chartDays,    setChartDays]    = useState<string[]>([]);
  const [chartRev,     setChartRev]     = useState<number[]>([]);
  const [chartOrders,  setChartOrders]  = useState<number[]>([]);
  const [topItems,     setTopItems]     = useState<{ name: string; qty: number }[]>([]);
  const [payMethods,   setPayMethods]   = useState<{ key: string; label: string; icon: any; color: string; count: number; total: number; percent: number }[]>([]);
  const [expenses,     setExpenses]     = useState<ExpenseSummary>({ total: 0, tax_total: 0, count: 0 });
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservCount,  setReservCount]  = useState(0);
  const [tables,       setTables]       = useState<RestaurantTable[]>([]);
  const [notifications,setNotifications]= useState<{ id: number; title?: string; message?: string; type?: string; created_at?: string; read_at?: string | null }[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const { restaurant, isOnline } = useAppStore();
  const { colors, isDark }       = useTheme();
  const D                        = colors.dashboard;
  const { width }                = useWindowDimensions();
  const contentW = width >= 640 ? width - SIDEBAR : width;
  const isWide   = contentW >= 900;
  const cols4    = contentW >= 1200 ? 4 : contentW >= 800 ? 3 : contentW >= 500 ? 2 : 2;
  const cols6    = contentW >= 1200 ? 6 : contentW >= 800 ? 4 : contentW >= 500 ? 3 : 2;

  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const [qrAlert, setQrAlert]         = useState<Order[]>([]);
  const qrAlertTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashKnownIds  = useRef<Set<number>>(new Set());
  const dashFirstLoad = useRef(true);

  const showDashQRAlert = useCallback((orders: Order[]) => {
    if (qrAlertTimer.current) clearTimeout(qrAlertTimer.current);
    setQrAlert(orders);
    playQRBeep();
    qrAlertTimer.current = setTimeout(() => setQrAlert([]), 8000);
  }, []);

  const load = useCallback(async (silent = false, p: Preset = preset, cFrom: string = customFrom, cTo: string = customTo) => {
    if (!silent) setLoading(true);
    try {
      const today  = todayStr();
      const mStart = mStartStr();
      const { from, to } = presetDates(p, cFrom, cTo);

      // ── 1. Reports API (server-side aggregation) ──────────────────────────
      const reportParams: { date_from?: string; date_to?: string } = {};
      if (from) reportParams.date_from = from;
      if (to)   reportParams.date_to   = to;

      const cParams = chartParamsForPreset(p, cFrom, cTo);

      const [summaryRes, salesRes, topItemsRes, payRes, expRes] = await Promise.allSettled([
        reportsApi.summary(reportParams),
        reportsApi.sales(cParams),
        reportsApi.topItems(reportParams),
        reportsApi.paymentMethods(reportParams),
        reportsApi.expenses(reportParams),
      ]);

      // ── 2. Summary ────────────────────────────────────────────────────────
      if (summaryRes.status === 'fulfilled') {
        const d = summaryRes.value.data ?? {};
        const raw = d.data ?? d;

        const bill_types: Record<string, { count: number; total: number }> = {};
        if (raw.bill_types) {
          Object.assign(bill_types, raw.bill_types);
        } else {
          for (const k of Object.keys(BILL_TYPE_CFG)) {
            bill_types[k] = {
              count: Number(raw[`${k}_count`] ?? raw[`${k}_orders`] ?? 0),
              total: Number(raw[`${k}_total`] ?? raw[`${k}_sales`]  ?? 0),
            };
          }
        }

        setSummary({
          today_sales:        Number(raw.today_sales        ?? raw.todaySales        ?? 0),
          today_orders:       Number(raw.today_orders       ?? raw.todayOrders       ?? 0),
          month_sales:        Number(raw.month_sales        ?? raw.monthSales        ?? 0),
          month_orders:       Number(raw.month_orders       ?? raw.monthOrders       ?? 0),
          sales_growth_pct:   Number(raw.sales_growth_pct   ?? raw.salesGrowthPct   ?? 0),
          total_sales:        Number(raw.total_sales        ?? raw.totalSales        ?? 0),
          total_orders:       Number(raw.total_orders       ?? raw.totalOrders       ?? 0),
          total_tax:          Number(raw.total_tax          ?? raw.totalTax          ?? 0),
          total_discount:     Number(raw.total_discount     ?? raw.totalDiscount     ?? 0),
          net_sales:          Number(raw.net_sales          ?? raw.netSales          ?? 0),
          avg_order_value:    Number(raw.avg_order_value    ?? raw.avgOrderValue     ?? 0),
          offline_orders:     Number(raw.offline_orders                              ?? 0),
          online_orders:      Number(raw.online_orders                               ?? 0),
          offline_sales:      Number(raw.offline_sales                               ?? 0),
          online_sales:       Number(raw.online_sales                                ?? 0),
          unpaid_count:       Number(raw.unpaid_count       ?? raw.unpaidOrders      ?? 0),
          unpaid_total:       Number(raw.unpaid_total       ?? raw.unpaidTotal       ?? 0),
          cancelled_count:    Number(raw.cancelled_count    ?? raw.cancelledBills    ?? 0),
          free_bills:         Number(raw.free_bills         ?? raw.freeBills         ?? 0),
          deleted_count:      Number(raw.deleted_count      ?? raw.deletedBills      ?? raw.deleted_bills ?? 0),
          reservations_count: Number(raw.reservations_count ?? raw.reservationsCount ?? 0),
          bill_types,
        });
      } else {
        // Fallback: load raw orders and compute client-side
        try {
          const toArr = (r: any): Order[] => {
            const d = r.data?.data ?? r.data ?? [];
            return Array.isArray(d) ? d : [];
          };
          const prevMEnd   = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
          const prevMStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');

          const [tRes, mRes, pmRes, fRes] = await Promise.all([
            ordersApi.list({ from: today,     to: today,     per_page: 500 }),
            ordersApi.list({ from: mStart,    to: today,     per_page: 500 }),
            ordersApi.list({ from: prevMStart,to: prevMEnd,  per_page: 500 }),
            ordersApi.list({ ...(from ? { from } : {}), ...(to ? { to } : {}), per_page: 500 }),
          ]);

          const [td, mo, pm, fi] = [toArr(tRes), toArr(mRes), toArr(pmRes), toArr(fRes)];
          setSummary(summaryFromOrders(td, mo, fi, pm, reservCount));

          const days = last7Labels();
          const paid = (arr: Order[]) => arr.filter(o => o.payment_status === 'paid');
          const sm   = (arr: Order[]) => arr.reduce((s, o) => s + (Number(o.total) || 0), 0);
          setChartDays(days.map(d => d.label));
          setChartRev(days.map(d => sm(paid(fi.filter(o => (o.created_at ?? '').startsWith(d.date))))));
          setChartOrders(days.map(d => fi.filter(o => (o.created_at ?? '').startsWith(d.date)).length));

          const pmMap: Record<string, { count: number; total: number }> = {};
          for (const o of paid(fi)) {
            const k = ONLINE_SOURCES.includes(o.source ?? '') ? (o.source ?? 'other') : (o.payment_method ?? 'other');
            if (!pmMap[k]) pmMap[k] = { count: 0, total: 0 };
            pmMap[k].count++;
            pmMap[k].total += Number(o.total) || 0;
          }
          const pmTotal = Math.max(1, Object.values(pmMap).reduce((s, v) => s + v.total, 0));
          setPayMethods(Object.entries(pmMap)
            .map(([key, v]) => ({
              key, count: v.count, total: v.total,
              percent: pct(v.total, pmTotal),
              ...(PM_CFG[key] ?? { label: key, icon: 'wallet-outline', color: '#64748B' }),
            }))
            .sort((a, b) => b.total - a.total));

          const itemMap: Record<string, number> = {};
          for (const o of fi) {
            for (const item of o.items ?? []) {
              const n = item.item_name ?? item.name ?? 'Unknown';
              itemMap[n] = (itemMap[n] ?? 0) + (item.quantity || 1);
            }
          }
          setTopItems(Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, qty]) => ({ name, qty })));
        } catch (fallbackErr) {
          console.warn('Dashboard fallback load failed:', fallbackErr);
        }
      }

      // ── 3. Sales chart — period-specific ─────────────────────────────────
      if (salesRes.status === 'fulfilled') {
        const raw  = salesRes.value.data ?? {};
        const rows: SalesDay[] = Array.isArray(raw.data) ? raw.data
          : Array.isArray(raw.data?.entries) ? raw.data.entries
          : Array.isArray(raw) ? raw : [];
        const isMonthGroup = cParams.group_by === 'month';
        if (rows.length > 0) {
          setChartDays(rows.map(r => {
            const ds = String((r as any).date ?? '');
            try {
              if (isMonthGroup) return format(new Date(ds + '-01'), 'MMM');
              if (p === 'month') return format(new Date(ds), 'd');
              if (p === 'today' || p === 'yesterday') return format(new Date(ds), 'MMM d');
              return format(new Date(ds), 'EEE');
            } catch { return ds.slice(5) || ds; }
          }));
          setChartRev(rows.map(r => Number((r as any).total_sales ?? (r as any).revenue ?? (r as any).sales ?? 0)));
          setChartOrders(rows.map(r => Number((r as any).total_orders ?? (r as any).orders ?? 0)));
        } else {
          // No data for period — show last-7 scaffold with zeros
          const days = last7Labels();
          setChartDays(days.map(d => d.label));
          setChartRev(days.map(() => 0));
          setChartOrders(days.map(() => 0));
        }
      }

      // ── 4. Top items ──────────────────────────────────────────────────────
      if (topItemsRes.status === 'fulfilled') {
        const raw  = topItemsRes.value.data ?? {};
        const rows: TopItem[] = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw) ? raw : []);
        setTopItems(rows.slice(0, 6).map(r => ({
          name: r.item_name ?? r.name ?? 'Unknown',
          qty:  Number(r.quantity ?? r.qty ?? 0),
        })));
      }

      // ── 5. Payment methods ────────────────────────────────────────────────
      if (payRes.status === 'fulfilled') {
        const raw  = payRes.value.data ?? {};
        const rows: PmRow[] = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw) ? raw : []);
        const pmTotal = Math.max(1, rows.reduce((s, r) => s + Number(r.total ?? 0), 0));
        setPayMethods(rows
          .map(r => {
            const key  = (r.payment_method ?? r.method ?? 'other').toLowerCase();
            const cfg  = PM_CFG[key] ?? { label: key, icon: 'wallet-outline', color: '#64748B' };
            return { key, ...cfg, count: Number(r.count ?? 0), total: Number(r.total ?? 0), percent: pct(Number(r.total ?? 0), pmTotal) };
          })
          .sort((a, b) => b.total - a.total));
      }

      // ── 6. Expenses ───────────────────────────────────────────────────────
      if (expRes.status === 'fulfilled') {
        const raw = expRes.value.data?.data ?? expRes.value.data ?? {};
        setExpenses({
          total:     Number(raw.total     ?? raw.total_amount ?? 0),
          tax_total: Number(raw.tax_total ?? raw.total_tax   ?? 0),
          count:     Number(raw.count     ?? raw.total_count  ?? 0),
        });
      }

      // ── 7. Active + Recent orders (always fresh) ──────────────────────────
      try {
        const aoRes = await ordersApi.list({
          status: 'pending,confirmed,preparing,ready,served',
          per_page: 10,
        });
        const aoArr: Order[] = Array.isArray(aoRes.data?.data) ? aoRes.data.data
          : (Array.isArray(aoRes.data) ? aoRes.data : []);
        setActiveOrders(aoArr.slice(0, 10));

        // QR order detection on background polls
        if (dashFirstLoad.current) {
          aoArr.forEach(o => dashKnownIds.current.add(o.id));
          dashFirstLoad.current = false;
        } else if (silent) {
          const newQR = aoArr.filter(o => o.source === 'qr' && !dashKnownIds.current.has(o.id));
          if (newQR.length > 0) showDashQRAlert(newQR);
          aoArr.forEach(o => dashKnownIds.current.add(o.id));
        }

        const rrRes = await ordersApi.list({ per_page: 8 });
        const rrArr: Order[] = Array.isArray(rrRes.data?.data) ? rrRes.data.data
          : (Array.isArray(rrRes.data) ? rrRes.data : []);
        setRecentOrders(rrArr.slice(0, 5));
      } catch { /* orders optional */ }

      // ── 8. Reservations ───────────────────────────────────────────────────
      try {
        const rRes = await client.get('/reservations', {
          params: { from: today, status: 'confirmed,pending,seated', per_page: 20 },
        });
        const rData = rRes.data?.data ?? rRes.data ?? [];
        const rArr: Reservation[] = Array.isArray(rData) ? rData : [];
        setReservations(rArr.slice(0, 5));
        // Prefer the summary count (filtered by preset) over the raw list count.
        // Only fall back to the reservation list total when the summary didn't load.
        setReservCount(prev => prev || (rRes.data?.total ?? rArr.length));
      } catch { /* reservations optional */ }

      // ── 9. Tables ─────────────────────────────────────────────────────────
      try {
        const tblRes = await client.get('/tables');
        const tbls: RestaurantTable[] = tblRes.data?.data ?? tblRes.data ?? [];
        setTables(Array.isArray(tbls) ? tbls : []);
      } catch { /* tables optional */ }

      // ── 10. Notifications ─────────────────────────────────────────────────
      try {
        const notifRes = await client.get('/orders/notifications/new');
        const notifs = notifRes.data?.orders ?? notifRes.data?.data ?? notifRes.data ?? [];
        setNotifications(Array.isArray(notifs) ? notifs.slice(0, 10) : []);
      } catch { /* notifications optional */ }

    } catch (e) {
      console.warn('Dashboard load:', e);
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    load(false, preset, customFrom, customTo);
    pollRef.current = setInterval(() => load(true, preset, customFrom, customTo), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [preset, customFrom, customTo]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(true, preset, customFrom, customTo);
    setRefreshing(false);
  }

  function changePreset(p: Preset) {
    if (p === 'custom') {
      setCustomFromInput(customFrom || format(subDays(new Date(), 7), 'yyyy-MM-dd'));
      setCustomToInput(customTo || format(new Date(), 'yyyy-MM-dd'));
      setShowCustomModal(true);
    } else {
      setPreset(p);
    }
  }

  function applyCustomDates() {
    try {
      const from = format(new Date(customFromInput), 'yyyy-MM-dd');
      const to   = format(new Date(customToInput),   'yyyy-MM-dd');
      setCustomFrom(from);
      setCustomTo(to);
      setPreset('custom');
      setShowCustomModal(false);
    } catch {
      setShowCustomModal(false);
    }
  }

  const go = (route: string) => router.push(route as any);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: D.bg, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <View style={{
          width: 80, height: 80, borderRadius: 22,
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8f9fb',
          borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ActivityIndicator color={S.primary} size="large" />
        </View>
        <View style={{ alignItems: 'center', gap: 5 }}>
          <Text style={{ color: D.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.3 }}>Loading Dashboard</Text>
          <Text style={{ color: D.muted, fontSize: 12.5 }}>Fetching your restaurant data…</Text>
        </View>
      </View>
    );
  }

  const st       = summary;
  const cardS    = { backgroundColor: D.white, borderColor: D.border, shadowColor: D.cardShadow };
  const netProfit = (st?.total_sales ?? 0) - expenses.total;
  const dividerColor = isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6';

  return (
    <View style={{ flex: 1, backgroundColor: D.bg }}>

      {/* ── QR Order notification banner ── */}
      {qrAlert.length > 0 && (
        <Pressable
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, zIndex: 200, backgroundColor: '#7c3aed' }}
          onPress={() => setQrAlert([])}
        >
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="qr-code-outline" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 }}>
              {qrAlert.length === 1 ? 'New QR Order!' : `${qrAlert.length} New QR Orders!`}
            </Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3 }} numberOfLines={1}>
              {qrAlert.map(o => o.order_number ?? `#${o.id}`).join(' · ')} · Tap to dismiss
            </Text>
          </View>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
        </Pressable>
      )}

      {/* ── Custom date range modal ── */}
      <Modal visible={showCustomModal} transparent animationType="fade" onRequestClose={() => setShowCustomModal(false)}>
        <Pressable style={cdm.backdrop} onPress={() => setShowCustomModal(false)}>
          <Pressable style={[cdm.box, { backgroundColor: D.white }]} onPress={e => e.stopPropagation()}>
            <View style={cdm.header}>
              <Ionicons name="calendar-outline" size={18} color={S.warning} />
              <Text style={[cdm.title, { color: D.text }]}>Custom Date Range</Text>
            </View>

            <Text style={[cdm.label, { color: D.muted }]}>From Date</Text>
            <TextInput
              style={[cdm.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8f9fb', color: D.text, borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e0e0e0' }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={D.muted}
              value={customFromInput}
              onChangeText={setCustomFromInput}
              keyboardType="numeric"
              maxLength={10}
            />

            <Text style={[cdm.label, { color: D.muted }]}>To Date</Text>
            <TextInput
              style={[cdm.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8f9fb', color: D.text, borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e0e0e0' }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={D.muted}
              value={customToInput}
              onChangeText={setCustomToInput}
              keyboardType="numeric"
              maxLength={10}
            />

            <Text style={[cdm.hint, { color: D.muted }]}>Enter dates in YYYY-MM-DD format (e.g. 2025-06-01)</Text>

            <View style={cdm.actions}>
              <TouchableOpacity style={[cdm.btn, cdm.cancelBtn, { borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e0e0e0' }]} onPress={() => setShowCustomModal(false)}>
                <Text style={[cdm.btnText, { color: D.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[cdm.btn, cdm.applyBtn]} onPress={applyCustomDates}>
                <Text style={cdm.applyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    <ScrollView
      style={{ flex: 1, backgroundColor: D.bg }}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={S.gold} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Dashboard header — matches web design ── */}
      <View style={[s.dashHeader, { backgroundColor: D.white, borderBottomColor: isDark ? D.border : '#E8E3DA' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[s.dashTitle, { color: D.text }]}>Dashboard</Text>
          <TouchableOpacity onPress={() => load(true, preset)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="refresh-outline" size={18} color={D.muted} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[s.dashDate, { color: D.muted }]}>{displayDateRange(preset, customFrom, customTo)}</Text>
          <View style={[s.onlinePill, { backgroundColor: isOnline ? 'rgba(20,181,29,0.12)' : 'rgba(255,54,54,0.12)' }]}>
            <View style={[s.onlineDot, { backgroundColor: isOnline ? S.success : S.danger }]} />
            <Text style={[s.onlineText, { color: isOnline ? S.success : S.danger }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Date-range filter — segmented chips matching web "Today" button style ── */}
      <View style={[s.filterBar, { backgroundColor: D.white, borderBottomColor: isDark ? D.border : '#E8E3DA' }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, alignItems: 'center', paddingVertical: 2 }}>
          {PRESETS.map(p => {
            const isActive = preset === p.key;
            const chipLabel = p.key === 'custom' && preset === 'custom' && customFrom && customTo
              ? `${format(new Date(customFrom), 'dd/MM')}–${format(new Date(customTo), 'dd/MM')}`
              : p.label;
            return (
              <TouchableOpacity
                key={p.key}
                style={[
                  s.filterChip,
                  isActive
                    ? { backgroundColor: 'transparent', borderColor: S.warning }
                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F5F5', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E0E0E0' },
                ]}
                onPress={() => changePreset(p.key)}
                activeOpacity={0.8}
              >
                {(isActive || p.key === 'custom') && (
                  <Ionicons
                    name="calendar-outline"
                    size={12}
                    color={isActive ? S.warning : D.muted}
                    style={{ marginRight: 3 }}
                  />
                )}
                <Text style={[s.filterChipText, { color: isActive ? S.warning : D.muted, fontWeight: isActive ? '700' : '600' }]}>
                  {chipLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          style={[s.filterRefreshBtn, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E0E0E0' }]}
          onPress={handleRefresh}
        >
          <Ionicons name="refresh-outline" size={14} color={D.muted} />
        </TouchableOpacity>
      </View>

      <View style={s.body}>

        {/* ── ROW 1: 3 BigCards — Card 1 updates with the selected date range ── */}
        <View style={[s.row, { marginBottom: 12 }]}>
          <BigCard
            label={presetLabel(preset, customFrom, customTo)}
            value={fmtFull(st?.total_sales ?? 0)}
            sub={presetSub(preset, st?.total_orders ?? 0)}
            icon={preset === 'all' ? 'wallet-outline' : preset === 'today' ? 'time-outline' : 'calendar-outline'}
            color={S.primary}
            onPress={() => go('/(app)/orders')}
          />
          <BigCard
            label="This Month's Sales"
            value={fmtFull(st?.month_sales ?? 0)}
            sub={`${st?.month_orders ?? 0} orders this month`}
            icon="calendar-number-outline"
            color={S.success}
            growthPct={st?.sales_growth_pct}
            onPress={() => go('/(app)/orders')}
          />
          <BigCard
            label={preset === 'today' ? 'Net Sales (Today)' : "Today's Sales"}
            value={fmtFull(preset === 'today' ? (st?.net_sales ?? 0) : (st?.today_sales ?? 0))}
            sub={preset === 'today'
              ? 'excl. tax'
              : `${st?.today_orders ?? 0} orders today`}
            subColor={preset === 'today' ? S.info : S.warning}
            icon={preset === 'today' ? 'analytics-outline' : 'time-outline'}
            color={S.purple}
            onPress={() => go('/(app)/orders')}
          />
        </View>

        {/* ── ROW 1b: 6 Sales Breakdown SmallCards ── */}
        <View style={s.section}>
          <SectionHeader title="Sales Breakdown" />
          <View style={s.grid}>
            {[
              { label: 'Offline Orders', value: st?.offline_orders ?? 0,          icon: 'desktop-outline',   color: S.success, sub: undefined },
              { label: 'Online Orders',  value: st?.online_orders  ?? 0,          icon: 'bicycle-outline',   color: S.danger,  sub: undefined },
              { label: 'Offline Sale',   value: fmtMoney(st?.offline_sales ?? 0), icon: 'cash-outline',      color: S.warning, sub: undefined },
              { label: 'Online Sale',    value: fmtMoney(st?.online_sales  ?? 0), icon: 'globe-outline',     color: S.primary, sub: undefined },
              { label: 'Net Sale',       value: fmtMoney(st?.net_sales     ?? 0), icon: 'analytics-outline', color: S.orange,  sub: 'Excl. GST' },
              { label: 'Total Sale',     value: fmtMoney(st?.total_sales   ?? 0), icon: 'wallet-outline',    color: S.purple,  sub: 'Incl. GST' },
            ].map((c, i) => (
              <View key={i} style={{ width: `${100 / cols6}%` as any, padding: 4 }}>
                <SmallCard label={c.label} value={c.value} sub={c.sub}
                  icon={c.icon} color={c.color} bg=""
                  onPress={() => go('/(app)/orders')} />
              </View>
            ))}
          </View>
        </View>

        {/* ── ROW 2: 5 Key Metric SmallCards — matches CSPos exactly ── */}
        <View style={s.section}>
          <SectionHeader title="Key Metrics" />
          <View style={s.grid}>
            {([
              { label: 'Total Orders',   value: st?.total_orders      ?? 0,            icon: 'cube-outline',         color: S.orange,  bg: S.orange  + '20', danger: false, route: '/(app)/orders' },
              { label: 'Average Value',  value: fmtMoney(st?.avg_order_value ?? 0),    icon: 'diamond-outline',      color: S.info,    bg: S.info    + '20', danger: false, route: '/(app)/orders' },
              { label: 'Total Tax',      value: fmtMoney(st?.total_tax       ?? 0),    icon: 'receipt-outline',      color: S.warning, bg: S.warning + '20', danger: false, route: '/(app)/orders' },
              { label: 'Reservations',   value: st?.reservations_count ?? reservCount, icon: 'calendar-outline',     color: S.success, bg: S.success + '20', danger: false, route: '/(app)/reservations' },
              { label: 'Unpaid Orders',  value: st?.unpaid_count ?? 0,                 icon: 'alert-circle-outline', color: S.danger,  bg: S.danger  + '20',
                danger: (st?.unpaid_count ?? 0) > 0,
                sub: (st?.unpaid_count ?? 0) > 0 ? fmtMoney(st?.unpaid_total ?? 0) + ' pending' : undefined,
                route: '/(app)/orders' },
            ] as { label: string; value: string | number; icon: string; color: string; bg: string; danger: boolean; sub?: string; route: string }[]).map((c, i) => (
              <View key={i} style={{ width: `${100 / Math.min(5, cols6)}%` as any, padding: 4 }}>
                <SmallCard label={c.label} value={c.value} sub={c.sub}
                  icon={c.icon} color={c.color} bg={c.bg} danger={c.danger}
                  onPress={() => go(c.route)} />
              </View>
            ))}
          </View>
        </View>

        {/* ── Expense Summary ── */}
        <View style={s.section}>
          <SectionHeader title="Expense Summary" action="View Expenses" onAction={() => go('/(app)/expenses')} />
          <View style={s.grid}>
            {[
              {
                label: 'Total Expenses', value: fmtMoney(expenses.total),
                sub: `${expenses.count} expense${expenses.count !== 1 ? 's' : ''}`,
                icon: 'wallet-outline', color: S.danger, bg: S.danger + '18',
              },
              {
                label: 'Tax on Expenses', value: fmtMoney(expenses.tax_total),
                sub: 'included in total',
                icon: 'receipt-outline', color: S.warning, bg: S.warning + '18',
              },
              {
                label: 'Net Profit', value: fmtMoney(netProfit),
                sub: 'sales − expenses',
                icon: netProfit >= 0 ? 'trending-up-outline' : 'trending-down-outline',
                color: netProfit >= 0 ? S.success : S.danger,
                bg: (netProfit >= 0 ? S.success : S.danger) + '18',
              },
            ].map((c, i) => (
              <View key={i} style={{ width: `${100 / 3}%` as any, padding: 4 }}>
                <SmallCard label={c.label} value={c.value} sub={c.sub}
                  icon={c.icon} color={c.color} bg={c.bg}
                  onPress={() => go('/(app)/expenses')} />
              </View>
            ))}
          </View>
        </View>

        {/* ── Sale Analysis + Payment Types ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Line chart — Last 7 days, dual-axis (Revenue + Orders) */}
            <View style={[s.card, cardS, { flex: isWide ? 2 : 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={[s.cardTitle, { color: D.text }]}>Sale Analysis</Text>
                  <Text style={[s.cardSub, { color: D.muted }]}>{chartSubtitleForPreset(preset, customFrom, customTo)}</Text>
                </View>
              </View>
              <LineChart labels={chartDays} revData={chartRev} ordData={chartOrders} />
            </View>

            {/* Payment Type donut — right panel (desktop) */}
            {isWide && (
              <View style={[s.card, cardS, { flex: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Ionicons name="pie-chart-outline" size={14} color={D.muted} />
                  <Text style={[s.cardTitle, { color: D.text }]}>Payment Type</Text>
                </View>
                <DonutChart methods={payMethods} totalRevenue={st?.total_sales ?? 0} />
              </View>
            )}
          </View>

          {/* Payment Type donut — below chart (mobile) */}
          {!isWide && (
            <View style={[s.card, cardS, { marginTop: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="pie-chart-outline" size={14} color={D.muted} />
                <Text style={[s.cardTitle, { color: D.text }]}>Payment Type</Text>
              </View>
              <DonutChart methods={payMethods} totalRevenue={st?.total_sales ?? 0} />
            </View>
          )}
        </View>

        {/* ── Bill Type Breakdown + Bill Status ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Bill Type grid */}
            <View style={[s.card, cardS, { flex: isWide ? 2 : 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={[s.cardTitle, { color: D.text }]}>Bill Type Breakdown</Text>
                  <Text style={[s.cardSub, { color: D.muted }]}>Orders by service type</Text>
                </View>
                <TouchableOpacity onPress={() => go('/(app)/orders')}>
                  <Text style={{ color: S.primary, fontSize: 12, fontWeight: '700' }}>View Orders</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.grid, { marginTop: 8 }]}>
                {Object.entries(BILL_TYPE_CFG).map(([key, cfg]) => {
                  const bt = st?.bill_types?.[key] ?? { count: 0, total: 0 };
                  return (
                    <View key={key} style={{ width: `${100 / Math.min(3, cols6)}%` as any, padding: 4 }}>
                      <BillTypeCard label={cfg.label} icon={cfg.icon} color={cfg.color}
                        count={bt.count} total={bt.total} />
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Bill Status */}
            <View style={[s.card, cardS, { flex: 1 }]}>
              <Text style={[s.cardTitle, { color: D.text }]}>Bill Status</Text>
              <Text style={[s.cardSub, { color: D.muted }]}>Special bill types</Text>
              <View style={{ marginTop: 10 }}>
                {[
                  { label: 'Cancelled Bills', value: st?.cancelled_count ?? 0, icon: 'close-circle-outline', color: S.danger  },
                  { label: 'Free Bills',       value: st?.free_bills     ?? 0, icon: 'gift-outline',          color: S.success },
                  { label: 'Deleted Bills',    value: st?.deleted_count  ?? 0, icon: 'trash-outline',          color: '#64748B' },
                ].map((item, i, arr) => (
                  <View key={i} style={[bsR.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: dividerColor }]}>
                    <View style={[bsR.avatar, { backgroundColor: item.color + '18' }]}>
                      <Ionicons name={item.icon as any} size={14} color={item.color} />
                    </View>
                    <Text style={[bsR.label, { color: D.text }]}>{item.label}</Text>
                    <View style={[bsR.badge, { backgroundColor: item.color }]}>
                      <Text style={bsR.badgeText}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* ── Payment Methods grid cards ── */}
        {payMethods.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Payment Methods" action="View Payments" onAction={() => go('/(app)/payments')} />
            <View style={s.grid}>
              {payMethods.map((pm, i) => (
                <View key={i} style={{ width: `${100 / Math.min(4, cols6)}%` as any, padding: 4 }}>
                  <PaymentCard label={pm.label} icon={pm.icon} color={pm.color}
                    count={pm.count} total={pm.total} percent={pm.percent} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Trending Menus ── */}
        {topItems.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Trending Menus" action="View Menu" onAction={() => go('/(app)/menu' as any)} />
            <View style={s.grid}>
              {topItems.map((item, i) => (
                <View key={i} style={{ width: `${100 / Math.min(cols6, 6)}%` as any, padding: 4 }}>
                  <TrendingMenuCard name={item.name} qty={item.qty} rank={i + 1} maxQty={topItems[0]?.qty ?? 1} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Top Selling Items + Active Orders ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Top Items */}
            <View style={[s.card, cardS, { flex: isWide ? 2 : 1 }]}>
              <Text style={[s.cardTitle, { color: D.text }]}>Top Selling Items</Text>
              <Text style={[s.cardSub, { color: D.muted }]}>By quantity ordered</Text>
              {topItems.length > 0 ? (
                <>
                  <View style={[moB.banner, {
                    backgroundColor: isDark ? 'rgba(22,163,74,0.12)' : '#f0fdf4',
                    borderColor: isDark ? 'rgba(22,163,74,0.2)' : '#bbf7d0',
                  }]}>
                    <Ionicons name="star" size={13} color="#16a34a" />
                    <Text style={[moB.text, { color: isDark ? '#4ade80' : '#166534' }]}>
                      Most Ordered: <Text style={moB.name}>{topItems[0]?.name}</Text>
                    </Text>
                  </View>
                  <View style={{ marginTop: 8, gap: 10 }}>
                    {topItems.map((item, i) => (
                      <TopItemRow key={i} name={item.name} qty={item.qty}
                        maxQty={topItems[0]?.qty ?? 1} rank={i + 1} />
                    ))}
                  </View>
                </>
              ) : (
                <View style={s.emptyBox}>
                  <Ionicons name="restaurant-outline" size={32} color={D.muted + '60'} />
                  <Text style={[s.emptyText, { color: D.muted }]}>No order items yet</Text>
                </View>
              )}
            </View>

            {/* Active Orders */}
            <View style={[s.card, cardS, { flex: 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={[s.cardTitle, { color: D.text }]}>Active Orders</Text>
                  <Text style={[s.cardSub, { color: D.muted }]}>{activeOrders.length} in-flight</Text>
                </View>
                <TouchableOpacity onPress={() => go('/(app)/orders')}>
                  <Text style={{ color: S.primary, fontSize: 12, fontWeight: '700' }}>View All</Text>
                </TouchableOpacity>
              </View>
              {activeOrders.length > 0 ? (
                <View style={{ gap: 1, marginTop: 8 }}>
                  {activeOrders.map(o => <ActiveOrderRow key={o.id} order={o} />)}
                </View>
              ) : (
                <View style={s.emptyBox}>
                  <Ionicons name="checkmark-circle-outline" size={32} color={D.muted + '60'} />
                  <Text style={[s.emptyText, { color: D.muted }]}>No active orders</Text>
                </View>
              )}
              {activeOrders.length > 0 && (
                <TouchableOpacity
                  style={[s.viewAllBtn, { marginTop: 10, borderColor: D.border }]}
                  onPress={() => go('/(app)/orders')}
                >
                  <Text style={[s.viewAllText, { color: S.primary }]}>View All Orders</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* ── Notifications ── */}
        {notifications.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Notifications"
              action={`${notifications.filter(n => !n.read_at).length} unread`}
              onAction={() => go('/(app)/notifications')} />
            <View style={[s.card, cardS]}>
              {notifications.map((n, i) => (
                <NotificationRow key={n.id ?? i} notif={n} />
              ))}
            </View>
          </View>
        )}

        {/* ── Recent Orders ── */}
        <View style={s.section}>
          <View style={[s.card, cardS]}>
            <View style={s.cardHeader}>
              <View>
                <Text style={[s.cardTitle, { color: D.text }]}>Recent Orders</Text>
                <Text style={[s.cardSub, { color: D.muted }]}>Latest orders</Text>
              </View>
              <TouchableOpacity onPress={() => go('/(app)/orders')}>
                <Text style={{ color: S.primary, fontSize: 12, fontWeight: '700' }}>See All</Text>
              </TouchableOpacity>
            </View>
            {recentOrders.length > 0 ? (
              <View style={{ gap: 1, marginTop: 8 }}>
                {recentOrders.map(o => <RecentOrderRow key={o.id} order={o} />)}
              </View>
            ) : (
              <View style={s.emptyBox}>
                <Ionicons name="receipt-outline" size={32} color={D.muted + '60'} />
                <Text style={[s.emptyText, { color: D.muted }]}>No orders yet</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Tables Available ── */}
        {tables.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Tables Available" action="Manage Tables" onAction={() => go('/(app)/tables')} />
            {/* 3 status summary SmallCards */}
            <View style={s.grid}>
              {[
                { label: 'Available', value: tables.filter(t => t.status === 'available').length, icon: 'checkmark-circle-outline', color: S.success, bg: S.success + '18', sub: 'tables free'   },
                { label: 'Occupied',  value: tables.filter(t => t.status === 'occupied').length,  icon: 'people-outline',           color: S.danger,  bg: S.danger  + '18', sub: 'tables in use' },
                { label: 'Reserved',  value: tables.filter(t => t.status === 'reserved').length,  icon: 'bookmark-outline',         color: S.warning, bg: S.warning + '18', sub: 'tables booked' },
              ].map((c, i) => (
                <View key={i} style={{ width: '33.33%', padding: 4 }}>
                  <SmallCard label={c.label} value={c.value} sub={c.sub}
                    icon={c.icon} color={c.color} bg={c.bg}
                    onPress={() => go('/(app)/tables')} />
                </View>
              ))}
            </View>
            {/* Table card grid — 2-4 columns, matches CSPos web layout */}
            <View style={[s.grid, { marginTop: 4 }]}>
              {tables.map(tbl => (
                <View key={tbl.id} style={{ width: `${100 / cols4}%` as any, padding: 4 }}>
                  <TableChip table={tbl} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Quick Access ── */}
        <View style={s.section}>
          <SectionHeader title="Quick Access" />
          <View style={s.grid}>
            {QUICK_LINKS.map(ql => (
              <View key={ql.route} style={{ width: `${100 / cols4}%` as any, padding: 4 }}>
                <TouchableOpacity style={[qlS.card, cardS]} onPress={() => go(ql.route)} activeOpacity={0.82}>
                  <View style={[qlS.icon, { backgroundColor: ql.color + '12' }]}>
                    <Ionicons name={ql.icon as any} size={22} color={ql.color} />
                  </View>
                  <Text style={[qlS.label, { color: D.text }]}>{ql.label}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

      </View>
      <View style={{ height: 48 }} />
    </ScrollView>
    </View>
  );
}

// ── StyleSheets (layout-only; colours applied inline from theme) ──────────────
const s = StyleSheet.create({
  body:     { padding: 16 },
  row:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  section:  { marginBottom: 20 },
  card:     {
    borderRadius: 14, padding: 18,
    borderWidth: 1,
    shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 },
    elevation: 2, marginBottom: 0,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardTitle:  { fontSize: 14, fontWeight: '700' },
  cardSub:    { fontSize: 12, marginTop: 2 },
  emptyBox:   { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyText:  { fontSize: 13 },
  viewAllBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  viewAllText:{ fontSize: 13, fontWeight: '700' },

  // Dashboard header (replaces dark hero)
  dashHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  dashTitle:    { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  dashDate:     { fontSize: 12, fontWeight: '600' },
  onlinePill:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  onlineDot:    { width: 6, height: 6, borderRadius: 3 },
  onlineText:   { fontSize: 11.5, fontWeight: '700' },

  // Date-range filter bar
  filterBar:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  filterChip:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  filterChipText:   { fontSize: 12 },
  filterRefreshBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  filterRefresh:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterRefreshText:    { fontSize: 12, fontWeight: '600' },

  // legacy (unused but kept for compat)
  hero:       { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  heroBrand:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  heroName:   { fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  heroTagline:{ fontSize: 12, fontWeight: '600', marginTop: 2, letterSpacing: 1 },
  heroSub:    { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  heroDate:   { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  refreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
});

const sh = StyleSheet.create({
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title:     { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionText:{ fontSize: 12.5, fontWeight: '600', color: S.primary },
});

const bc = StyleSheet.create({
  // Clean white card — no border accent, blob icon in top-right
  wrap:        { flex: 1, borderRadius: 16,
                 paddingTop: 20, paddingBottom: 20, paddingLeft: 18, paddingRight: 18,
                 borderWidth: 1,
                 elevation: 3, minWidth: 150,
                 overflow: 'hidden' },
  growthBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  growthText:  { fontSize: 11, fontWeight: '800' },
  value:       { fontSize: 28, fontWeight: '900', letterSpacing: -0.8, marginTop: 5, marginBottom: 0 },
  label:       { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, color: '#64748B' },
  sub:         { fontSize: 12.5, fontWeight: '600' },
  iconBox:     { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});

const smc = StyleSheet.create({
  // Clean white small card — no top accent, blob icon in top-right
  wrap:        { borderRadius: 14,
                 paddingTop: 14, paddingBottom: 14, paddingLeft: 13, paddingRight: 13,
                 overflow: 'hidden' },
  value:       { fontSize: 20, fontWeight: '900', letterSpacing: -0.4, marginTop: 3, marginBottom: 1 },
  label:       { fontSize: 10, fontWeight: '600', letterSpacing: 0.2, color: '#64748B' },
  sub:         { fontSize: 11, fontWeight: '600', marginTop: 2 },
  iconBox:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

const ch = StyleSheet.create({
  wrap:      { marginTop: 8 },
  dayLabel:  { fontSize: 10.5, fontWeight: '600', textAlign: 'center' },
  yLabel:    { position: 'absolute', fontSize: 9.5, fontWeight: '600' },
  legend:    { flexDirection: 'row', gap: 14, justifyContent: 'flex-end', marginBottom: 8 },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText:{ fontSize: 11 },
});

const donut = StyleSheet.create({
  wrap:        { alignItems: 'center', paddingVertical: 8 },
  ringWrap:    { width: 130, height: 130, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  ring:        { position: 'absolute' },
  center:      { alignItems: 'center', justifyContent: 'center' },
  totalLabel:  { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  totalValue:  { fontSize: 14, fontWeight: '800' },
  noData:      { fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 8 },
  note:        { fontSize: 10.5, textAlign: 'center', paddingHorizontal: 8, marginTop: 4, lineHeight: 15 },
  legend:      { width: '100%', marginTop: 4, gap: 8 },
  legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0, marginTop: 2 },
  legendLabel: { fontSize: 12, fontWeight: '600' },
  legendSub:   { fontSize: 10.5, marginTop: 1 },
  legendValue: { fontSize: 12, fontWeight: '700' },
  legendPct:   { fontSize: 10.5, fontWeight: '700', marginTop: 1 },
});

const pi = StyleSheet.create({
  wrap:     { gap: 6 },
  top:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  left:     { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  icon:     { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { fontSize: 13, fontWeight: '600' },
  sub:      { fontSize: 11 },
  right:    { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  value:    { fontSize: 13.5, fontWeight: '800' },
  pctBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  pctText:  { fontSize: 11, fontWeight: '800' },
  track:    { height: 7, borderRadius: 4, overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 4 },
});

const pmc = StyleSheet.create({
  wrap:    { borderRadius: 14, padding: 14, borderWidth: 1, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  top:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  iconWrap:{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:   { fontSize: 13, fontWeight: '700' },
  sub:     { fontSize: 11, marginTop: 1 },
  amount:  { fontSize: 17, fontWeight: '800', marginBottom: 10 },
  track:   { height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 5 },
  fill:    { height: '100%', borderRadius: 4 },
  pct:     { fontSize: 11 },
});

const btc = StyleSheet.create({
  wrap:      { borderRadius: 14, padding: 16, borderWidth: 1, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  top:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  icon:      { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  label:     { fontSize: 12.5, fontWeight: '600', marginBottom: 5 },
  amount:    { fontSize: 17, fontWeight: '800' },
});

const bsR = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  avatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:     { flex: 1, fontSize: 13.5, fontWeight: '600' },
  badge:     { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },
});

const moB = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, borderWidth: 1 },
  text:   { fontSize: 12.5, fontWeight: '600', flex: 1 },
  name:   { fontWeight: '800' },
});

const ti = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankText:{ fontSize: 12, fontWeight: '800' },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:    { fontSize: 13, fontWeight: '600', flex: 1 },
  qty:     { fontSize: 12.5, fontWeight: '800', marginLeft: 4 },
  track:   { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill:    { height: '100%', borderRadius: 4 },
});

const ar = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  avatar:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  num:      { fontSize: 13.5, fontWeight: '700' },
  meta:     { fontSize: 11.5, marginTop: 2 },
  amount:   { fontSize: 13.5, fontWeight: '800' },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText:{ fontSize: 10.5, fontWeight: '700', textTransform: 'capitalize' },
});

const rr = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  avatar:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  num:      { fontSize: 13.5, fontWeight: '700' },
  srcBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  srcText:  { fontSize: 9.5, fontWeight: '800' },
  meta:     { fontSize: 11.5, marginTop: 2 },
  time:     { fontSize: 10.5, marginTop: 2 },
  amount:   { fontSize: 13.5, fontWeight: '800' },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText:{ fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});

const resR = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  avatar:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:     { fontSize: 13.5, fontWeight: '700' },
  meta:     { fontSize: 11.5, marginTop: 2 },
  time:     { fontSize: 10.5, marginTop: 2 },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  badgeText:{ fontSize: 10.5, fontWeight: '700', textTransform: 'capitalize' },
});

const qlS = StyleSheet.create({
  card:  { borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1, gap: 11, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, minHeight: 85 },
  icon:  { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
});

// ── Tables Available card (matches CSPos web design) ─────────────────────────
const tablC = StyleSheet.create({
  wrap:        { borderRadius: 14, borderWidth: 1.5, overflow: 'hidden',
                 shadowOpacity: 0.10, shadowRadius: 10, elevation: 3 },
  iconArea:    { alignItems: 'center', justifyContent: 'center',
                 paddingTop: 22, paddingBottom: 18 },
  info:        { paddingHorizontal: 12, paddingBottom: 16, alignItems: 'center', gap: 5 },
  name:        { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cap:         { fontSize: 12, textAlign: 'center' },
  statusLabel: { fontSize: 12.5, fontWeight: '700', marginTop: 2 },
});

// ── Trending Menus card ───────────────────────────────────────────────────────
const tmc = StyleSheet.create({
  wrap:       { borderRadius: 16, padding: 15, borderWidth: 1, borderTopWidth: 3,
                shadowOpacity: 0.10, shadowRadius: 12, elevation: 3 },
  rankBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  rankText:   { fontSize: 11, fontWeight: '800' },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  trendText:  { fontSize: 10, fontWeight: '800' },
  name:       { fontSize: 13, fontWeight: '700', lineHeight: 17.5, marginTop: 8, marginBottom: 4 },
  qty:        { fontSize: 12.5, fontWeight: '800' },
  track:      { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill:       { height: '100%', borderRadius: 3 },
});

// ── Notification row ──────────────────────────────────────────────────────────
const nr = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  title:    { fontSize: 13, lineHeight: 18.5, fontWeight: '500' },
  msg:      { fontSize: 12, marginTop: 2, lineHeight: 16.5 },
  time:     { fontSize: 11 },
  dot:      { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});

// ── Custom date modal ─────────────────────────────────────────────────────────
const cdm = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  box:        { width: '100%', maxWidth: 380, borderRadius: 20, padding: 24, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  title:      { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  label:      { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 6 },
  input:      { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontWeight: '600', marginBottom: 14 },
  hint:       { fontSize: 11.5, marginBottom: 20, lineHeight: 16, textAlign: 'center' },
  actions:    { flexDirection: 'row', gap: 10 },
  btn:        { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelBtn:  { borderWidth: 1.5 },
  applyBtn:   { backgroundColor: '#1A2B1A' },
  btnText:    { fontSize: 14, fontWeight: '700' },
  applyText:  { fontSize: 14, fontWeight: '800', color: '#C9A52A' },
});
