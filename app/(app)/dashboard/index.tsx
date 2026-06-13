/**
 * Dashboard — matches csPos Restaurant Admin Dashboard exactly
 *
 * Sections (same order as csPos):
 *  Header with date-range filter (Today / Yesterday / Week / Month / All Time)
 *  Row 1  — 3 BigCards: Today Sales · Month Sales · Total Sales (filtered)
 *  Row 1b — 6 SmallCards: Offline/Online counts + Offline/Online/Net/Total sale
 *  Row 2  — 5 MetricCards: Total Orders · Avg Value · Total Tax · Reservations · Unpaid
 *  Chart  — Sale Analysis bar (7-day) + Payment-type breakdown
 *  Bill Type Breakdown grid
 *  Bill Status (Cancelled / Free / Deleted)
 *  Payment Methods grid (cards with progress bar)
 *  Top Selling Items (with Most-Ordered banner + rank bars)
 *  Active Orders list
 *  Recent Orders list
 *  Upcoming Reservations list
 *  Quick Access grid
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, subDays, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ordersApi } from '@/api/orders';
import client from '@/api/client';
import { useAppStore } from '@/store/appStore';
import { AppBrandLogo, APP_BRAND_NAME, APP_BRAND_TAGLINE } from '@/components/AppBrandLogo';
import { useTheme } from '@/store/themeStore';
import { themes } from '@/theme/tokens';
import type { Order, Reservation } from '@/types';

const C = themes.light.dashboard;

const POLL_MS = 60_000;
const SIDEBAR = 220;
const CUR     = '₹';

// ── Date-range presets ────────────────────────────────────────────────────────
type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'all';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',     label: 'Today'     },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week',      label: 'This Week' },
  { key: 'month',     label: 'This Month'},
  { key: 'all',       label: 'All Time'  },
];

function presetDates(p: Preset): { from: string | null; to: string | null } {
  const d = (date: Date) => format(date, 'yyyy-MM-dd');
  const today = new Date();
  if (p === 'today')     return { from: d(today),                          to: d(today) };
  if (p === 'yesterday') return { from: d(subDays(today, 1)),              to: d(subDays(today, 1)) };
  if (p === 'week')      return { from: d(startOfWeek(today, { weekStartsOn: 1 })), to: d(today) };
  if (p === 'month')     return { from: d(startOfMonth(today)),            to: d(today) };
  return { from: null, to: null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) =>
  `${CUR}${Math.round(n).toLocaleString('en-IN')}`;
const fmtFull = (n: number) =>
  `${CUR}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

function todayStr()      { return format(new Date(), 'yyyy-MM-dd'); }
function monthStartStr() { return format(startOfMonth(new Date()), 'yyyy-MM-dd'); }

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE') };
  });
}

const ONLINE_SOURCES = ['zomato', 'swiggy'];

const PM_CFG: Record<string, { label: string; icon: any; color: string }> = {
  cash:    { label: 'Cash',       icon: 'cash-outline',       color: C.success },
  card:    { label: 'Card',       icon: 'card-outline',       color: C.info    },
  upi:     { label: 'UPI',        icon: 'qr-code-outline',    color: C.purple  },
  razorpay:{ label: 'Razorpay',   icon: 'card-outline',       color: C.primary },
  gpay:    { label: 'Google Pay', icon: 'wallet-outline',     color: C.primary },
  phonepe: { label: 'PhonePe',    icon: 'wallet-outline',     color: C.indigo  },
  paytm:   { label: 'Paytm',      icon: 'wallet-outline',     color: C.indigo  },
  zomato:  { label: 'Zomato',     icon: 'bicycle-outline',    color: C.danger  },
  swiggy:  { label: 'Swiggy',     icon: 'bicycle-outline',    color: C.orange  },
  other:   { label: 'Other',      icon: 'help-circle-outline',color: C.muted   },
};

const BILL_TYPE_CFG: Record<string, { label: string; icon: any; color: string }> = {
  dine_in:  { label: 'Dine In',    icon: 'restaurant-outline',  color: C.primary },
  takeaway: { label: 'Quick Bill', icon: 'bag-outline',          color: C.muted   },
  pickup:   { label: 'Pickup',     icon: 'cube-outline',         color: C.warning },
  delivery: { label: 'Delivery',   icon: 'bicycle-outline',      color: C.success },
  qr_order: { label: 'QR Order',   icon: 'qr-code-outline',      color: C.purple  },
};

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  pending:   { color: '#d97706', bg: '#fef9ec' },
  confirmed: { color: C.primary, bg: '#eff6ff' },
  preparing: { color: C.purple,  bg: '#f5f3ff' },
  ready:     { color: C.info,    bg: '#ecfeff' },
  served:    { color: C.success, bg: '#ecfdf5' },
  completed: { color: '#16a34a', bg: '#f0fdf4' },
  cancelled: { color: C.danger,  bg: '#fff1f2' },
};

// ── Computed stats ─────────────────────────────────────────────────────────────
function computeStats(
  todayOrders: Order[],
  monthOrders: Order[],
  filteredOrders: Order[],
  prevMonthOrders: Order[],
  reservationsCount: number,
) {
  const paid    = (arr: Order[]) => arr.filter(o => o.payment_status === 'paid');
  const sum     = (arr: Order[], key: keyof Order) => arr.reduce((s, o) => s + (Number(o[key]) || 0), 0);
  const paidSum = (arr: Order[]) => sum(paid(arr), 'total');

  // Always-fixed tiles (Today + Month) — match csPos baseQuery behavior
  const todaySales      = paidSum(todayOrders);
  const todayOrderCount = todayOrders.length;
  const monthSales      = paidSum(monthOrders);
  const monthOrderCount = monthOrders.length;

  // Sales growth: this month vs prev month
  const prevMonthSales    = paidSum(prevMonthOrders);
  const salesGrowthPct    = prevMonthSales > 0
    ? Math.round(((monthSales - prevMonthSales) / prevMonthSales) * 100)
    : monthSales > 0 ? 100 : 0;

  // Date-filtered stats (all other metrics)
  const allPaid       = paid(filteredOrders);
  const totalSales    = paidSum(filteredOrders);
  const totalTax      = sum(allPaid, 'tax_amount');
  const totalDiscount = sum(allPaid, 'discount_amount');
  const netSales      = Math.max(0, totalSales - totalTax);
  const avgOrderValue = allPaid.length > 0 ? totalSales / allPaid.length : 0;
  const totalOrders   = filteredOrders.length;

  const offlineOrders = filteredOrders.filter(o => !ONLINE_SOURCES.includes(o.source ?? ''));
  const onlineOrders  = filteredOrders.filter(o =>  ONLINE_SOURCES.includes(o.source ?? ''));
  const offlineSales  = paidSum(offlineOrders);
  const onlineSales   = paidSum(onlineOrders);

  const unpaidOrders = filteredOrders.filter(o => o.payment_status !== 'paid' && o.status !== 'cancelled');
  const unpaidTotal  = sum(unpaidOrders, 'total');
  const cancelledBills = filteredOrders.filter(o => o.status === 'cancelled').length;
  const freeBills      = filteredOrders.filter(o => o.status !== 'cancelled' && Number(o.total) === 0).length;

  // Bill type breakdown
  const billTypes = Object.keys(BILL_TYPE_CFG).reduce((acc, k) => {
    const typeOrders = filteredOrders.filter(o => o.order_type === k);
    acc[k] = { count: typeOrders.length, total: paidSum(typeOrders) };
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  // Payment method breakdown — Zomato/Swiggy grouped by source, others by payment_method
  const pmMap: Record<string, { count: number; total: number }> = {};
  for (const o of allPaid) {
    const key = ONLINE_SOURCES.includes(o.source ?? '') ? (o.source ?? 'other') : (o.payment_method ?? 'other');
    if (!pmMap[key]) pmMap[key] = { count: 0, total: 0 };
    pmMap[key].count++;
    pmMap[key].total += Number(o.total) || 0;
  }
  const pmTotal = Math.max(1, Object.values(pmMap).reduce((s, v) => s + v.total, 0));
  const paymentMethods = Object.entries(pmMap)
    .map(([key, v]) => ({
      key, count: v.count, total: v.total,
      percent: pct(v.total, pmTotal),
      ...(PM_CFG[key] ?? { label: key, icon: 'wallet-outline', color: C.muted }),
    }))
    .sort((a, b) => b.total - a.total);

  // 7-day revenue chart
  const days = last7Days();
  const dailyRevenue = days.map(d => {
    const dayOrders = paid(filteredOrders.filter(o => (o.created_at ?? '').startsWith(d.date)));
    return sum(dayOrders, 'total');
  });
  const dailyOrderCounts = days.map(d =>
    filteredOrders.filter(o => (o.created_at ?? '').startsWith(d.date)).length
  );

  // Order type breakdown (for Category Statistics)
  const ordersByType = Object.keys(BILL_TYPE_CFG).reduce((acc, k) => {
    acc[k] = filteredOrders.filter(o => o.order_type === k).length;
    return acc;
  }, {} as Record<string, number>);

  // Active orders (live, from filtered set)
  const activeOrders = filteredOrders
    .filter(o => ['pending', 'confirmed', 'preparing', 'ready', 'served'].includes(o.status))
    .slice(0, 10);

  // Top selling items
  const itemMap: Record<string, number> = {};
  for (const o of filteredOrders) {
    for (const item of o.items ?? []) {
      const name = item.item_name ?? item.name ?? 'Unknown';
      itemMap[name] = (itemMap[name] ?? 0) + (item.quantity || 1);
    }
  }
  const topItems = Object.entries(itemMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, qty]) => ({ name, qty }));

  return {
    // Fixed tiles
    todaySales, todayOrderCount, monthSales, monthOrderCount, salesGrowthPct,
    // Date-filtered
    totalSales, totalTax, totalDiscount, netSales, avgOrderValue, totalOrders,
    offlineOrders: offlineOrders.length, onlineOrders: onlineOrders.length,
    offlineSales, onlineSales,
    unpaidCount: unpaidOrders.length, unpaidTotal,
    cancelledBills, freeBills,
    reservationsCount,
    billTypes, paymentMethods,
    days: days.map(d => d.label), dailyRevenue, dailyOrderCounts,
    activeOrders, topItems, ordersByType,
    recentOrders: filteredOrders.slice(0, 5),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={sh.row}>
      <View style={sh.titleWrap}>
        <View style={sh.accent} />
        <Text style={sh.title}>{title}</Text>
      </View>
      {action && (
        <TouchableOpacity onPress={onAction} style={sh.actionBtn}>
          <Text style={sh.actionText}>{action}</Text>
          <Ionicons name="arrow-forward" size={12} color={C.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Big 3 stat cards (Row 1)
function BigCard({ label, value, sub, icon, color, bg, growthPct, onPress }: {
  label: string; value: string; sub: string; icon: any;
  color: string; bg: string; growthPct?: number; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={bc.wrap} onPress={onPress} activeOpacity={0.85}>
      <View style={bc.top}>
        <View style={[bc.iconWrap, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        {growthPct !== undefined && growthPct !== 0 && (
          <View style={[bc.growthBadge, { backgroundColor: growthPct > 0 ? '#f0fdf4' : '#fff1f2' }]}>
            <Ionicons
              name={growthPct > 0 ? 'trending-up' : 'trending-down'}
              size={10}
              color={growthPct > 0 ? C.success : C.danger}
            />
            <Text style={[bc.growthText, { color: growthPct > 0 ? C.success : C.danger }]}>
              {growthPct > 0 ? '+' : ''}{growthPct}%
            </Text>
          </View>
        )}
      </View>
      <Text style={bc.value}>{value}</Text>
      <Text style={bc.label}>{label}</Text>
      <Text style={bc.sub}>{sub}</Text>
    </TouchableOpacity>
  );
}

// Small metric cards (Row 1b / Row 2)
function SmallCard({ label, value, sub, icon, color, bg, danger, onPress }: {
  label: string; value: string | number; sub?: string; icon: any;
  color: string; bg: string; danger?: boolean; onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[sc.wrap, danger && sc.dangerBorder]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[sc.iconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[sc.value, danger && { color: C.danger }]}>{String(value)}</Text>
      <Text style={sc.label} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={sc.sub} numberOfLines={1}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

// Bar chart (Sale Analysis — 7 days)
function BarChart({ labels, data, orderCounts }: { labels: string[]; data: number[]; orderCounts: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <View style={ch.wrap}>
      <View style={ch.bars}>
        {data.map((v, i) => {
          const h = Math.max(4, (v / max) * 120);
          return (
            <View key={i} style={ch.col}>
              {v > 0 && (
                <Text style={ch.topVal}>
                  {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))}
                </Text>
              )}
              <View style={ch.track}>
                <View style={[ch.bar, { height: h, backgroundColor: C.primary }]} />
              </View>
              <View style={[ch.orderBadge, { backgroundColor: C.success + '20' }]}>
                <Text style={[ch.orderText, { color: C.success }]}>{orderCounts[i]}</Text>
              </View>
              <Text style={ch.dayLabel}>{labels[i]}</Text>
            </View>
          );
        })}
      </View>
      <View style={ch.legend}>
        <View style={ch.legendItem}>
          <View style={[ch.legendDot, { backgroundColor: C.primary }]} />
          <Text style={ch.legendText}>Revenue</Text>
        </View>
        <View style={ch.legendItem}>
          <View style={[ch.legendDot, { backgroundColor: C.success }]} />
          <Text style={ch.legendText}>Orders (count below bar)</Text>
        </View>
      </View>
    </View>
  );
}

// Progress item (Payment breakdown right panel)
function ProgressItem({ label, sub, value, percent, color, icon }: {
  label: string; sub?: string; value: string; percent: number; color: string; icon?: any;
}) {
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
            <Text style={pi.label} numberOfLines={1}>{label}</Text>
            {sub ? <Text style={pi.sub} numberOfLines={1}>{sub}</Text> : null}
          </View>
        </View>
        <View style={pi.right}>
          <Text style={pi.value}>{value}</Text>
          <View style={[pi.pctBadge, { backgroundColor: color + '18' }]}>
            <Text style={[pi.pctText, { color }]}>{percent}%</Text>
          </View>
        </View>
      </View>
      <View style={pi.track}>
        <View style={[pi.fill, { width: `${Math.min(percent, 100)}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// Payment method as grid card with progress bar
function PaymentCard({ label, icon, color, count, total, percent }: {
  label: string; icon: any; color: string;
  count: number; total: number; percent: number;
}) {
  return (
    <View style={pmc.wrap}>
      <View style={pmc.top}>
        <View style={[pmc.iconWrap, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={pmc.label} numberOfLines={1}>{label}</Text>
          <Text style={pmc.sub}>{count} bills</Text>
        </View>
      </View>
      <Text style={pmc.amount}>{fmtFull(total)}</Text>
      <View style={pmc.track}>
        <View style={[pmc.fill, { width: `${Math.min(percent, 100)}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={pmc.pct}>{percent}% of revenue</Text>
    </View>
  );
}

// Bill type card
function BillTypeCard({ label, icon, color, count, total }: {
  label: string; icon: any; color: string; count: number; total: number;
}) {
  return (
    <View style={btc.wrap}>
      <View style={btc.top}>
        <View style={[btc.icon, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={[btc.badge, { backgroundColor: color + '18' }]}>
          <Text style={[btc.badgeText, { color }]}>{count}</Text>
        </View>
      </View>
      <Text style={btc.label}>{label}</Text>
      <Text style={[btc.amount, { color }]}>{fmtMoney(total)}</Text>
    </View>
  );
}

// Top selling item row with rank + progress bar
function TopItemRow({ name, qty, maxQty, rank }: { name: string; qty: number; maxQty: number; rank: number }) {
  const colors = [C.primary, C.success, C.warning, C.purple, C.orange, C.info];
  const color  = colors[(rank - 1) % colors.length];
  const w      = maxQty > 0 ? (qty / maxQty) * 100 : 0;
  return (
    <View style={ti.wrap}>
      <View style={[ti.rank, { backgroundColor: color + '18' }]}>
        <Text style={[ti.rankText, { color }]}>#{rank}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={ti.nameRow}>
          <Text style={ti.name} numberOfLines={1}>{name}</Text>
          <Text style={[ti.qty, { color }]}>{qty} sold</Text>
        </View>
        <View style={ti.track}>
          <View style={[ti.fill, { width: `${w}%` as any, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

// Active order row
function ActiveOrderRow({ order }: { order: Order }) {
  const sc = STATUS_CFG[order.status] ?? { color: C.muted, bg: '#f3f4f6' };
  return (
    <TouchableOpacity style={ar.row} onPress={() => router.push('/(app)/orders' as any)} activeOpacity={0.8}>
      <View style={[ar.avatar, { backgroundColor: sc.bg }]}>
        <Ionicons name="restaurant-outline" size={13} color={sc.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={ar.num} numberOfLines={1}>
          #{order.order_number} · {order.customer_name ?? 'Walk-in'}
        </Text>
        <Text style={ar.meta} numberOfLines={1}>
          {(order.order_type ?? '').replace(/_/g, ' ')}
          {order.table_name ? ` · ${order.table_name}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Text style={ar.amount}>{fmtFull(Number(order.total ?? 0))}</Text>
        <View style={[ar.badge, { backgroundColor: sc.bg }]}>
          <Text style={[ar.badgeText, { color: sc.color }]}>{order.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Recent order row
function RecentOrderRow({ order }: { order: Order }) {
  const sc    = STATUS_CFG[order.status] ?? { color: C.muted, bg: '#f3f4f6' };
  const src   = order.source ?? 'pos';
  const srcColor: Record<string, string> = { pos: C.dark, zomato: C.danger, swiggy: C.orange, qr: C.purple };
  const color = srcColor[src] ?? C.dark;
  const isPaid = order.payment_status === 'paid';
  return (
    <TouchableOpacity style={rr.row} onPress={() => router.push('/(app)/orders' as any)} activeOpacity={0.8}>
      <View style={[rr.avatar, { backgroundColor: C.primary + '15' }]}>
        <Ionicons name="bag-outline" size={14} color={C.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={rr.num}>#{order.order_number}</Text>
          {src !== 'pos' && (
            <View style={[rr.srcBadge, { backgroundColor: color + '18' }]}>
              <Text style={[rr.srcText, { color }]}>{src.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={rr.meta} numberOfLines={1}>
          {order.customer_name ?? 'Walk-in'} · {(order.order_type ?? '').replace(/_/g, ' ')}
          {order.table_name ? ` · ${order.table_name}` : ''}
        </Text>
        <Text style={rr.time}>
          {order.created_at ? format(new Date(order.created_at), 'dd MMM, hh:mm a') : '—'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={rr.amount}>{fmtFull(Number(order.total ?? 0))}</Text>
        <View style={[rr.badge, { backgroundColor: sc.bg }]}>
          <Text style={[rr.badgeText, { color: sc.color }]}>{order.status}</Text>
        </View>
        <View style={[rr.badge, { backgroundColor: isPaid ? '#f0fdf4' : '#fef9ec' }]}>
          <Text style={[rr.badgeText, { color: isPaid ? '#16a34a' : '#d97706' }]}>
            {isPaid ? 'PAID' : 'UNPAID'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Upcoming reservation row
function ReservationRow({ res }: { res: Reservation }) {
  const statusColors: Record<string, string> = {
    pending:   '#d97706',
    confirmed: C.primary,
    seated:    C.success,
    cancelled: C.danger,
    no_show:   C.muted,
  };
  const color = statusColors[res.status] ?? C.muted;
  return (
    <View style={resR.row}>
      <View style={[resR.avatar, { backgroundColor: color + '18' }]}>
        <Ionicons name="calendar-outline" size={14} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={resR.name} numberOfLines={1}>{res.customer_name}</Text>
        <Text style={resR.meta}>
          {res.guest_count} guests
          {res.table_name ? ` · ${res.table_name}` : ''}
        </Text>
        <Text style={resR.time}>
          {res.reserved_at ? format(new Date(res.reserved_at), 'dd MMM, hh:mm a') : '—'}
        </Text>
      </View>
      <View style={[resR.badge, { backgroundColor: color + '18' }]}>
        <Text style={[resR.badgeText, { color }]}>{res.status}</Text>
      </View>
    </View>
  );
}

const QUICK_LINKS = [
  { label: 'POS',          icon: 'cart-outline',      route: '/(app)/pos',          color: C.dark    },
  { label: 'Kitchen',      icon: 'flame-outline',      route: '/(app)/kitchen',      color: '#f59e0b' },
  { label: 'Orders',       icon: 'receipt-outline',    route: '/(app)/orders',       color: C.primary },
  { label: 'Tables',       icon: 'grid-outline',       route: '/(app)/tables',       color: C.purple  },
  { label: 'Customers',    icon: 'people-outline',     route: '/(app)/customers',    color: C.success },
  { label: 'Reservations', icon: 'calendar-outline',   route: '/(app)/reservations', color: C.danger  },
  { label: 'Expenses',     icon: 'wallet-outline',     route: '/(app)/expenses',     color: C.warning },
  { label: 'Menu',         icon: 'restaurant-outline', route: '/(app)/menu',         color: C.info    },
];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const [preset,          setPreset]          = useState<Preset>('today');
  const [todayOrders,     setTodayOrders]     = useState<Order[]>([]);
  const [monthOrders,     setMonthOrders]     = useState<Order[]>([]);
  const [prevMonthOrders, setPrevMonthOrders] = useState<Order[]>([]);
  const [filteredOrders,  setFilteredOrders]  = useState<Order[]>([]);
  const [reservations,    setReservations]    = useState<Reservation[]>([]);
  const [reservCount,     setReservCount]     = useState(0);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);

  const { restaurant, isOnline } = useAppStore();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const contentW = width >= 640 ? width - SIDEBAR : width;
  const isWide   = contentW >= 900;
  const cols4    = contentW >= 1200 ? 4 : contentW >= 800 ? 3 : contentW >= 500 ? 2 : 2;
  const cols6    = contentW >= 1200 ? 6 : contentW >= 800 ? 4 : contentW >= 500 ? 3 : 2;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false, activePreset: Preset = preset) => {
    if (!silent) setLoading(true);
    try {
      const today     = todayStr();
      const mStart    = monthStartStr();
      const prevMEnd  = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
      const prevMStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
      const { from, to } = presetDates(activePreset);

      const toArr = (r: any): Order[] => {
        const d = r.data?.data ?? r.data ?? [];
        return Array.isArray(d) ? d : [];
      };

      // Always-fixed tiles + prev month for growth %
      const [tRes, mRes, pmRes] = await Promise.all([
        ordersApi.list({ from: today,    to: today,    per_page: 500 }),
        ordersApi.list({ from: mStart,   to: today,    per_page: 500 }),
        ordersApi.list({ from: prevMStart, to: prevMEnd, per_page: 500 }),
      ]);
      setTodayOrders(toArr(tRes));
      setMonthOrders(toArr(mRes));
      setPrevMonthOrders(toArr(pmRes));

      // Date-filtered main query
      const fParams: any = { per_page: 500 };
      if (from) fParams.from = from;
      if (to)   fParams.to   = to;
      const fRes = await ordersApi.list(fParams);
      setFilteredOrders(toArr(fRes));

      // Reservations — upcoming only
      try {
        const rRes = await client.get('/reservations', {
          params: { from: today, status: 'confirmed,pending,seated', per_page: 20 },
        });
        const rData = rRes.data?.data ?? rRes.data ?? [];
        const rArr: Reservation[] = Array.isArray(rData) ? rData : [];
        setReservations(rArr.slice(0, 5));
        setReservCount(rRes.data?.total ?? rArr.length);
      } catch { /* reservations optional */ }

    } catch (e) {
      console.warn('Dashboard load:', e);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    load(false, preset);
    pollRef.current = setInterval(() => load(true, preset), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [preset]);

  const stats = useMemo(() =>
    computeStats(todayOrders, monthOrders, filteredOrders, prevMonthOrders, reservCount),
    [todayOrders, monthOrders, filteredOrders, prevMonthOrders, reservCount]
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load(true, preset);
    setRefreshing(false);
  }

  function changePreset(p: Preset) {
    setPreset(p);
    setLoading(true);
    load(false, p);
  }

  const go = (route: string) => router.push(route as any);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.dashboard.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={C.gold} size="large" />
        <Text style={{ color: C.muted, fontSize: 13 }}>Loading dashboard…</Text>
      </View>
    );
  }

  const cardStyle = { backgroundColor: colors.dashboard.white, borderColor: colors.dashboard.border };

  return (
    <ScrollView
      style={[s.shell, { backgroundColor: colors.dashboard.bg }]}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.gold} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero header ── */}
      <View style={[s.hero, { backgroundColor: colors.sidebar }]}>
        <View style={s.heroBrand}>
          <AppBrandLogo size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.heroName, { color: colors.brandName }]}>{APP_BRAND_NAME}</Text>
            <Text style={[s.heroTagline, { color: colors.brandTagline }]}>{APP_BRAND_TAGLINE}</Text>
            {restaurant?.name
              ? <Text style={s.heroSub} numberOfLines={1}>{restaurant.name}</Text>
              : null}
            <Text style={s.heroDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[s.onlinePill, { backgroundColor: isOnline ? 'rgba(20,181,29,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <View style={[s.onlineDot, { backgroundColor: isOnline ? C.success : C.danger }]} />
            <Text style={[s.onlineText, { color: isOnline ? C.success : C.danger }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={() => load(true, preset)}>
            <Ionicons name="refresh-outline" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Date-range filter chips (matches csPos date filter) ── */}
      <View style={[s.filterBar, { backgroundColor: colors.dashboard.white, borderColor: colors.dashboard.border }]}>
        <Ionicons name="calendar-outline" size={14} color={C.muted} style={{ marginRight: 4 }} />
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[s.filterChip, preset === p.key && s.filterChipActive]}
            onPress={() => changePreset(p.key)}
          >
            <Text style={[s.filterChipText, preset === p.key && s.filterChipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.filterRefresh} onPress={() => changePreset('today')}>
          <Ionicons name="refresh-outline" size={13} color={C.muted} />
          <Text style={s.filterRefreshText}>Today</Text>
        </TouchableOpacity>
      </View>

      <View style={s.body}>

        {/* ── ROW 1: 3 BigCards ── */}
        <View style={s.row}>
          <BigCard
            label="Today's Sales"      value={fmtFull(stats.todaySales)}
            sub={`${stats.todayOrderCount} orders today`}
            icon="calendar-outline"   color={C.primary} bg={C.primary + '18'}
            onPress={() => go('/(app)/orders')}
          />
          <BigCard
            label="This Month's Sales" value={fmtFull(stats.monthSales)}
            sub={`${stats.monthOrderCount} orders this month`}
            icon="calendar-number-outline" color={C.success} bg={C.success + '18'}
            growthPct={stats.salesGrowthPct}
            onPress={() => go('/(app)/orders')}
          />
          <BigCard
            label="Total Sales"        value={fmtFull(stats.totalSales)}
            sub={`${stats.totalOrders} total orders`}
            icon="trending-up-outline" color={C.purple} bg={C.purple + '18'}
            onPress={() => go('/(app)/orders')}
          />
        </View>

        {/* ── ROW 1b: Offline / Online / Net / Total ── */}
        <View style={s.section}>
          <SectionHeader title="Sales Breakdown" />
          <View style={[s.grid, { gap: 8 }]}>
            {[
              { label: 'Offline Orders', value: stats.offlineOrders,         icon: 'desktop-outline',   color: C.success, bg: C.success + '18', sub: 'non-aggregator' },
              { label: 'Online Orders',  value: stats.onlineOrders,          icon: 'bicycle-outline',   color: C.danger,  bg: C.danger  + '18', sub: 'Zomato & Swiggy' },
              { label: 'Offline Sale',   value: fmtMoney(stats.offlineSales),icon: 'cash-outline',      color: C.warning, bg: C.warning + '18', sub: 'excl. GST' },
              { label: 'Online Sale',    value: fmtMoney(stats.onlineSales), icon: 'globe-outline',     color: C.primary, bg: C.primary + '18', sub: 'aggregator paid' },
              { label: 'Net Sale',       value: fmtMoney(stats.netSales),    icon: 'analytics-outline', color: C.orange,  bg: C.orange  + '18', sub: 'Excl. GST' },
              { label: 'Total Sale',     value: fmtMoney(stats.totalSales),  icon: 'wallet-outline',    color: C.purple,  bg: C.purple  + '18', sub: 'Incl. GST' },
            ].map((c, i) => (
              <View key={i} style={{ width: `${100 / cols6}%` as any, padding: 4 }}>
                <SmallCard label={c.label} value={c.value} sub={c.sub}
                  icon={c.icon} color={c.color} bg={c.bg}
                  onPress={() => go('/(app)/orders')} />
              </View>
            ))}
          </View>
        </View>

        {/* ── ROW 2: 5 Metric cards (matches csPos exactly) ── */}
        <View style={s.section}>
          <SectionHeader title="Key Metrics" />
          <View style={[s.grid, { gap: 8 }]}>
            {[
              { label: 'Total Orders',  value: stats.totalOrders,              icon: 'cube-outline',         color: C.orange,  bg: C.orange  + '18', danger: false },
              { label: 'Average Value', value: fmtMoney(stats.avgOrderValue),  icon: 'diamond-outline',      color: C.info,    bg: C.info    + '18', danger: false, sub: 'per paid order' },
              { label: 'Total Tax',     value: fmtMoney(stats.totalTax),       icon: 'receipt-outline',      color: C.warning, bg: C.warning + '18', danger: false },
              { label: 'Reservations',  value: stats.reservationsCount,        icon: 'calendar-outline',     color: C.success, bg: C.success + '18', danger: false },
              { label: 'Unpaid Orders', value: stats.unpaidCount,              icon: 'alert-circle-outline', color: C.danger,  bg: C.danger  + '18', danger: stats.unpaidCount > 0, sub: stats.unpaidCount > 0 ? fmtMoney(stats.unpaidTotal) + ' pending' : undefined },
            ].map((c, i) => (
              <View key={i} style={{ width: `${100 / 5}%` as any, padding: 4 }}>
                <SmallCard label={c.label} value={c.value} sub={c.sub}
                  icon={c.icon} color={c.color} bg={c.bg} danger={c.danger}
                  onPress={() => go(i === 3 ? '/(app)/reservations' : '/(app)/orders')} />
              </View>
            ))}
          </View>
        </View>

        {/* ── Sale Analysis + Payment Type ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Bar chart — Sale Analysis (Last 7 days) */}
            <View style={[s.card, cardStyle, { flex: isWide ? 2 : 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Sale Analysis</Text>
                  <Text style={[s.cardSub, { color: C.muted }]}>Last 7 days · Revenue & Orders</Text>
                </View>
              </View>
              <BarChart labels={stats.days} data={stats.dailyRevenue} orderCounts={stats.dailyOrderCounts} />
            </View>

            {/* Payment type (right panel) */}
            {isWide && (
              <View style={[s.card, cardStyle, { flex: 1 }]}>
                <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Payment Types</Text>
                <Text style={[s.cardSub, { color: C.muted }]}>By payment method</Text>
                <View style={{ marginTop: 12, gap: 8 }}>
                  {stats.paymentMethods.slice(0, 6).map((pm, i) => (
                    <ProgressItem key={i}
                      label={pm.label} sub={`${pm.count} orders`}
                      value={fmtMoney(pm.total)} percent={pm.percent}
                      color={pm.color} icon={pm.icon}
                    />
                  ))}
                  {stats.paymentMethods.length === 0 && (
                    <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', paddingVertical: 16 }}>
                      No paid orders yet
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
          {!isWide && stats.paymentMethods.length > 0 && (
            <View style={[s.card, cardStyle, { marginTop: 12 }]}>
              <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Payment Types</Text>
              <Text style={[s.cardSub, { color: C.muted }]}>By payment method</Text>
              <View style={{ marginTop: 12, gap: 8 }}>
                {stats.paymentMethods.slice(0, 6).map((pm, i) => (
                  <ProgressItem key={i}
                    label={pm.label} sub={`${pm.count} orders`}
                    value={fmtMoney(pm.total)} percent={pm.percent}
                    color={pm.color} icon={pm.icon}
                  />
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── Bill Type Breakdown + Bill Status ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Bill Type grid */}
            <View style={[s.card, cardStyle, { flex: isWide ? 2 : 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Bill Type Breakdown</Text>
                  <Text style={[s.cardSub, { color: C.muted }]}>Orders by service type</Text>
                </View>
                <TouchableOpacity onPress={() => go('/(app)/orders')}>
                  <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>View Orders</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.grid, { gap: 8, marginTop: 8 }]}>
                {Object.entries(BILL_TYPE_CFG).map(([key, cfg]) => {
                  const bt = stats.billTypes[key] ?? { count: 0, total: 0 };
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
            <View style={[s.card, cardStyle, { flex: 1 }]}>
              <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Bill Status</Text>
              <Text style={[s.cardSub, { color: C.muted }]}>Special bill types</Text>
              <View style={{ marginTop: 10, gap: 0 }}>
                {[
                  { label: 'Cancelled Bills', value: stats.cancelledBills, icon: 'close-circle-outline', color: C.danger  },
                  { label: 'Free Bills',       value: stats.freeBills,      icon: 'gift-outline',          color: C.success },
                  { label: 'Deleted Bills',    value: 0,                    icon: 'trash-outline',          color: C.muted   },
                ].map((item, i, arr) => (
                  <View key={i} style={[bsR.row, i < arr.length - 1 && bsR.rowBorder]}>
                    <View style={[bsR.avatar, { backgroundColor: item.color + '18' }]}>
                      <Ionicons name={item.icon as any} size={14} color={item.color} />
                    </View>
                    <Text style={bsR.label}>{item.label}</Text>
                    <View style={[bsR.badge, { backgroundColor: item.color }]}>
                      <Text style={bsR.badgeText}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* ── Payment Methods grid cards (matches csPos full-row payment breakdown) ── */}
        {stats.paymentMethods.length > 0 && (
          <View style={s.section}>
            <SectionHeader title="Payment Methods" action="View Payments" onAction={() => go('/(app)/payments')} />
            <View style={[s.grid, { gap: 8 }]}>
              {stats.paymentMethods.map((pm, i) => (
                <View key={i} style={{ width: `${100 / Math.min(4, cols6)}%` as any, padding: 4 }}>
                  <PaymentCard
                    label={pm.label} icon={pm.icon} color={pm.color}
                    count={pm.count} total={pm.total} percent={pm.percent}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Top Selling Items + Active Orders ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Top Selling Items with "Most Ordered" banner */}
            <View style={[s.card, cardStyle, { flex: isWide ? 2 : 1 }]}>
              <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Top Selling Items</Text>
              <Text style={[s.cardSub, { color: C.muted }]}>By quantity ordered</Text>
              {stats.topItems.length > 0 ? (
                <>
                  {/* Most Ordered banner — matches csPos */}
                  <View style={moB.banner}>
                    <Ionicons name="star" size={13} color="#16a34a" />
                    <Text style={moB.text}>
                      Most Ordered: <Text style={moB.name}>{stats.topItems[0]?.name}</Text>
                    </Text>
                  </View>
                  <View style={{ marginTop: 8, gap: 10 }}>
                    {stats.topItems.map((item, i) => (
                      <TopItemRow key={i} name={item.name} qty={item.qty}
                        maxQty={stats.topItems[0]?.qty ?? 1} rank={i + 1} />
                    ))}
                  </View>
                </>
              ) : (
                <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>
                  No order items yet
                </Text>
              )}
            </View>

            {/* Active Orders */}
            <View style={[s.card, cardStyle, { flex: 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Active Orders</Text>
                  <Text style={[s.cardSub, { color: C.muted }]}>{stats.activeOrders.length} in-flight</Text>
                </View>
                <TouchableOpacity onPress={() => go('/(app)/orders')}>
                  <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>View All</Text>
                </TouchableOpacity>
              </View>
              {stats.activeOrders.length > 0 ? (
                <View style={{ gap: 1, marginTop: 8 }}>
                  {stats.activeOrders.map(o => <ActiveOrderRow key={o.id} order={o} />)}
                </View>
              ) : (
                <View style={s.emptyBox}>
                  <Ionicons name="checkmark-circle-outline" size={32} color="#d1d5db" />
                  <Text style={s.emptyText}>No active orders</Text>
                </View>
              )}
              {stats.activeOrders.length > 0 && (
                <TouchableOpacity
                  style={[s.viewAllBtn, { marginTop: 10, borderColor: colors.dashboard.border }]}
                  onPress={() => go('/(app)/orders')}
                >
                  <Text style={[s.viewAllText, { color: C.primary }]}>View All Orders</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* ── Recent Orders ── */}
        <View style={s.section}>
          <View style={[s.card, cardStyle]}>
            <View style={s.cardHeader}>
              <View>
                <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Recent Orders</Text>
                <Text style={[s.cardSub, { color: C.muted }]}>Last 5 orders</Text>
              </View>
              <TouchableOpacity onPress={() => go('/(app)/orders')}>
                <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>See All</Text>
              </TouchableOpacity>
            </View>
            {stats.recentOrders.length > 0 ? (
              <View style={{ gap: 1, marginTop: 8 }}>
                {stats.recentOrders.map(o => <RecentOrderRow key={o.id} order={o} />)}
              </View>
            ) : (
              <View style={s.emptyBox}>
                <Ionicons name="receipt-outline" size={32} color="#d1d5db" />
                <Text style={s.emptyText}>No orders yet</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Upcoming Reservations (matches csPos reservations widget) ── */}
        <View style={s.section}>
          <View style={[s.card, cardStyle]}>
            <View style={s.cardHeader}>
              <View>
                <Text style={[s.cardTitle, { color: colors.dashboard.text }]}>Upcoming Reservations</Text>
                <Text style={[s.cardSub, { color: C.muted }]}>{reservCount} upcoming</Text>
              </View>
              <TouchableOpacity onPress={() => go('/(app)/reservations')}>
                <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>See All</Text>
              </TouchableOpacity>
            </View>
            {reservations.length > 0 ? (
              <View style={{ gap: 1, marginTop: 8 }}>
                {reservations.map((r, i) => <ReservationRow key={i} res={r} />)}
              </View>
            ) : (
              <View style={s.emptyBox}>
                <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
                <Text style={s.emptyText}>No upcoming reservations</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Quick Access ── */}
        <View style={s.section}>
          <SectionHeader title="Quick Access" />
          <View style={[s.grid, { gap: 8 }]}>
            {QUICK_LINKS.map(ql => (
              <View key={ql.route} style={{ width: `${100 / cols4}%` as any, padding: 4 }}>
                <TouchableOpacity style={[ql_s.card, cardStyle]} onPress={() => go(ql.route)} activeOpacity={0.85}>
                  <View style={[ql_s.icon, { backgroundColor: ql.color + '15' }]}>
                    <Ionicons name={ql.icon as any} size={22} color={ql.color} />
                  </View>
                  <Text style={ql_s.label}>{ql.label}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ── StyleSheets ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell:  { flex: 1 },
  body:   { padding: 12 },
  row:    { flexDirection: 'row', flexWrap: 'wrap' },
  grid:   { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  section:{ marginBottom: 6 },
  card:   {
    backgroundColor: C.white, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2, marginBottom: 0,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardTitle:  { fontSize: 14, fontWeight: '800', color: C.text },
  cardSub:    { fontSize: 11.5, color: C.muted, marginTop: 2 },
  emptyBox:   { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText:  { fontSize: 12.5, color: C.muted },
  viewAllBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  viewAllText:{ fontSize: 12.5, fontWeight: '700' },

  // Hero header
  hero:       { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  heroBrand:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  heroName:   { fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  heroTagline:{ fontSize: 12, fontWeight: '600', marginTop: 2, letterSpacing: 1 },
  heroSub:    { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  heroDate:   { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  onlineDot:  { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: '700' },
  refreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },

  // Date-range filter bar
  filterBar:         { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, marginBottom: 12 },
  filterChip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  filterChipActive:  { backgroundColor: C.dark, borderColor: C.dark },
  filterChipText:    { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  filterChipTextActive: { color: '#C9A52A' },
  filterRefresh:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', marginLeft: 4 },
  filterRefreshText: { fontSize: 12, color: C.muted, fontWeight: '600' },
});

const sh = StyleSheet.create({
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titleWrap:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  accent:   { width: 3, height: 16, borderRadius: 2, backgroundColor: C.gold },
  title:    { fontSize: 13, fontWeight: '800', color: '#374151', letterSpacing: 0.5, textTransform: 'uppercase' },
  actionBtn:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText:{ fontSize: 12, fontWeight: '700', color: C.primary },
});

const bc = StyleSheet.create({
  wrap:        { flex: 1, backgroundColor: C.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, margin: 4, minWidth: 160 },
  top:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  iconWrap:    { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  growthBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  growthText:  { fontSize: 11, fontWeight: '800' },
  value:       { fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 4 },
  label:       { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
  sub:         { fontSize: 11.5, color: C.muted },
});

const sc = StyleSheet.create({
  wrap:        { backgroundColor: C.white, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1, height: '100%' },
  dangerBorder:{ borderColor: C.danger, borderWidth: 1.5 },
  iconWrap:    { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  value:       { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 2 },
  label:       { fontSize: 11.5, fontWeight: '600', color: '#374151' },
  sub:         { fontSize: 10, color: C.muted, marginTop: 2 },
});

const ch = StyleSheet.create({
  wrap:      { marginTop: 12 },
  bars:      { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 6, paddingHorizontal: 4 },
  col:       { flex: 1, alignItems: 'center', gap: 2 },
  topVal:    { fontSize: 9, fontWeight: '700', color: C.muted, textAlign: 'center' },
  track:     { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: '#f1f5f9', borderRadius: 6, overflow: 'hidden' },
  bar:       { width: '100%', borderRadius: 6, minHeight: 4 },
  orderBadge:{ paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  orderText: { fontSize: 9, fontWeight: '700' },
  dayLabel:  { fontSize: 10, fontWeight: '600', color: C.muted, textAlign: 'center', marginTop: 2 },
  legend:    { flexDirection: 'row', gap: 14, marginTop: 8, paddingHorizontal: 4 },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText:{ fontSize: 10.5, color: C.muted },
});

const pi = StyleSheet.create({
  wrap:     { gap: 5 },
  top:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  left:     { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  icon:     { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { fontSize: 12.5, fontWeight: '600', color: C.text },
  sub:      { fontSize: 10.5, color: C.muted },
  right:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  value:    { fontSize: 13, fontWeight: '800', color: C.text },
  pctBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  pctText:  { fontSize: 10.5, fontWeight: '800' },
  track:    { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 3 },
});

const pmc = StyleSheet.create({
  wrap:   { backgroundColor: C.white, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1, height: '100%' },
  top:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap:{ width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:  { fontSize: 13, fontWeight: '700', color: C.text },
  sub:    { fontSize: 11, color: C.muted, marginTop: 1 },
  amount: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 8 },
  track:  { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  fill:   { height: '100%', borderRadius: 3 },
  pct:    { fontSize: 10.5, color: C.muted },
});

const btc = StyleSheet.create({
  wrap:      { backgroundColor: C.white, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1, height: '100%' },
  top:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  icon:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  label:     { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 4 },
  amount:    { fontSize: 16, fontWeight: '800' },
});

const bsR = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  avatar:    { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:     { flex: 1, fontSize: 13.5, fontWeight: '600', color: C.text },
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
});

const moB = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, borderWidth: 1, borderColor: '#bbf7d0' },
  text:   { fontSize: 12.5, color: '#166534', fontWeight: '600', flex: 1 },
  name:   { fontWeight: '800' },
});

const ti = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank:    { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankText:{ fontSize: 11, fontWeight: '800' },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:    { fontSize: 12.5, fontWeight: '600', color: C.text, flex: 1 },
  qty:     { fontSize: 12, fontWeight: '800', marginLeft: 4 },
  track:   { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  fill:    { height: '100%', borderRadius: 3 },
});

const ar = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  avatar:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  num:      { fontSize: 13, fontWeight: '700', color: C.text },
  meta:     { fontSize: 11, color: C.muted, marginTop: 2 },
  amount:   { fontSize: 13, fontWeight: '800', color: C.gold },
  badge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:{ fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});

const rr = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  avatar:   { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  num:      { fontSize: 13, fontWeight: '700', color: C.text },
  srcBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  srcText:  { fontSize: 9.5, fontWeight: '800' },
  meta:     { fontSize: 11, color: C.muted, marginTop: 2 },
  time:     { fontSize: 10.5, color: '#9ca3af', marginTop: 2 },
  amount:   { fontSize: 13, fontWeight: '800', color: C.gold },
  badge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:{ fontSize: 9.5, fontWeight: '700', textTransform: 'capitalize' },
});

const resR = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  avatar:   { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:     { fontSize: 13, fontWeight: '700', color: C.text },
  meta:     { fontSize: 11, color: C.muted, marginTop: 2 },
  time:     { fontSize: 10.5, color: '#9ca3af', marginTop: 2 },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  badgeText:{ fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});

const ql_s = StyleSheet.create({
  card:  { backgroundColor: C.white, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border, gap: 8, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1, height: '100%' },
  icon:  { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', textAlign: 'center' },
});
