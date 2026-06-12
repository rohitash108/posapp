/**
 * Dashboard Screen — matches csPos Admin Dashboard
 * Sections: Primary stats · Secondary stats · 7-day chart ·
 *           Payment methods · Bill types · Active orders ·
 *           Top items · Recent orders · Quick links
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, subDays, startOfMonth } from 'date-fns';
import { ordersApi } from '@/api/orders';
import { useAppStore } from '@/store/appStore';
import type { Order } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const POLL_MS  = 60_000;
const SIDEBAR  = 220;
const CUR      = '₹';

const C = {
  primary:  '#0D76E1',
  success:  '#14B51D',
  danger:   '#ef4444',
  warning:  '#FFA80B',
  purple:   '#A91CFF',
  info:     '#0891b2',
  orange:   '#f97316',
  dark:     '#1A2B1A',
  gold:     '#C9A52A',
  indigo:   '#1B36E0',
  bg:       '#f0f2f7',
  white:    '#fff',
  border:   '#e5e7eb',
  text:     '#111827',
  muted:    '#6b7280',
};

const PM_CFG: Record<string, { label: string; icon: any; color: string }> = {
  cash:     { label: 'Cash',         icon: 'cash-outline',        color: C.success },
  card:     { label: 'Card',         icon: 'card-outline',        color: C.info    },
  upi:      { label: 'UPI',          icon: 'qr-code-outline',     color: C.purple  },
  razorpay: { label: 'Razorpay',     icon: 'card-outline',        color: C.primary },
  gpay:     { label: 'Google Pay',   icon: 'wallet-outline',      color: C.primary },
  phonepe:  { label: 'PhonePe',      icon: 'wallet-outline',      color: C.indigo  },
  paytm:    { label: 'Paytm',        icon: 'wallet-outline',      color: C.indigo  },
  zomato:   { label: 'Zomato',       icon: 'bicycle-outline',     color: C.danger  },
  swiggy:   { label: 'Swiggy',       icon: 'bicycle-outline',     color: C.orange  },
  other:    { label: 'Other',        icon: 'help-circle-outline', color: C.muted   },
};

const BILL_TYPE_CFG: Record<string, { label: string; icon: any; color: string }> = {
  dine_in:  { label: 'Dine In',     icon: 'restaurant-outline',    color: C.primary },
  takeaway: { label: 'Quick Bill',  icon: 'bag-outline',           color: C.muted   },
  pickup:   { label: 'Pickup',      icon: 'cube-outline',          color: C.warning },
  delivery: { label: 'Delivery',    icon: 'bicycle-outline',       color: C.success },
  qr_order: { label: 'QR Order',    icon: 'qr-code-outline',       color: C.purple  },
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

const ONLINE_SOURCES = ['zomato', 'swiggy'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) =>
  `${CUR}${Math.round(n).toLocaleString('en-IN')}`;
const fmtFull = (n: number) =>
  `${CUR}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }
function monthStartStr() { return format(startOfMonth(new Date()), 'yyyy-MM-dd'); }

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE') };
  });
}

// ── Data computation ──────────────────────────────────────────────────────────
function computeStats(todayOrders: Order[], monthOrders: Order[], allOrders: Order[], totalCount: number) {
  const paid = (arr: Order[]) => arr.filter(o => o.payment_status === 'paid');
  const sum  = (arr: Order[], key: keyof Order) => arr.reduce((s, o) => s + (Number(o[key]) || 0), 0);

  const todayPaid = paid(todayOrders);
  const todaySales = sum(todayPaid, 'total');
  const todayOrderCount = todayOrders.length;

  const monthPaid = paid(monthOrders);
  const monthSales = sum(monthPaid, 'total');
  const monthOrderCount = monthOrders.length;

  const allPaid = paid(allOrders);
  const totalSales = sum(allPaid, 'total');
  const totalTax = sum(allPaid, 'tax_amount');
  const totalDiscount = sum(allPaid, 'discount_amount');
  const netSales = Math.max(0, totalSales - totalTax);
  const avgOrderValue = allPaid.length > 0 ? totalSales / allPaid.length : 0;

  const offlineOrders = allOrders.filter(o => !ONLINE_SOURCES.includes(o.source ?? ''));
  const onlineOrders  = allOrders.filter(o =>  ONLINE_SOURCES.includes(o.source ?? ''));
  const offlineSales  = sum(paid(offlineOrders), 'total');
  const onlineSales   = sum(paid(onlineOrders), 'total');

  const unpaidOrders = allOrders.filter(o => o.payment_status !== 'paid' && o.status !== 'cancelled');
  const unpaidTotal  = sum(unpaidOrders, 'total');
  const cancelledBills = allOrders.filter(o => o.status === 'cancelled').length;
  const freeBills = allOrders.filter(o => o.status !== 'cancelled' && Number(o.total) === 0).length;

  // Bill type breakdown
  const billTypes = Object.keys(BILL_TYPE_CFG).reduce((acc, k) => {
    const typeOrders = allOrders.filter(o => o.order_type === k);
    acc[k] = { count: typeOrders.length, total: sum(paid(typeOrders), 'total') };
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  // Payment method breakdown
  const pmMap: Record<string, { count: number; total: number }> = {};
  for (const o of allPaid) {
    const key = ONLINE_SOURCES.includes(o.source ?? '') ? (o.source ?? 'other') : (o.payment_method ?? 'other');
    if (!pmMap[key]) pmMap[key] = { count: 0, total: 0 };
    pmMap[key].count++;
    pmMap[key].total += Number(o.total) || 0;
  }
  const pmTotal = Math.max(1, Object.values(pmMap).reduce((s, v) => s + v.total, 0));
  const paymentMethods = Object.entries(pmMap)
    .map(([key, v]) => ({ key, count: v.count, total: v.total, percent: pct(v.total, pmTotal), ...(PM_CFG[key] ?? { label: key, icon: 'wallet-outline', color: C.muted }) }))
    .sort((a, b) => b.total - a.total);

  // 7-day revenue
  const days = last7Days();
  const dailyRevenue = days.map(d => {
    const dayOrders = paid(allOrders.filter(o => (o.created_at ?? '').startsWith(d.date)));
    return sum(dayOrders, 'total');
  });
  const dailyOrderCounts = days.map(d =>
    allOrders.filter(o => (o.created_at ?? '').startsWith(d.date)).length
  );

  // Active orders
  const activeOrders = allOrders
    .filter(o => ['pending', 'confirmed', 'preparing', 'ready', 'served'].includes(o.status))
    .slice(0, 10);

  // Top selling items from order items
  const itemMap: Record<string, number> = {};
  for (const o of allOrders) {
    for (const item of o.items ?? []) {
      const name = item.item_name ?? item.name ?? 'Unknown';
      itemMap[name] = (itemMap[name] ?? 0) + (item.quantity || 1);
    }
  }
  const topItems = Object.entries(itemMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, qty]) => ({ name, qty }));

  // Order type breakdown
  const ordersByType = Object.keys(BILL_TYPE_CFG).reduce((acc, k) => {
    acc[k] = allOrders.filter(o => o.order_type === k).length;
    return acc;
  }, {} as Record<string, number>);

  return {
    todaySales, todayOrderCount, monthSales, monthOrderCount,
    totalSales, totalTax, totalDiscount, netSales, avgOrderValue,
    offlineOrders: offlineOrders.length, onlineOrders: onlineOrders.length,
    offlineSales, onlineSales, unpaidCount: unpaidOrders.length, unpaidTotal,
    cancelledBills, freeBills, billTypes, paymentMethods,
    days: days.map(d => d.label), dailyRevenue, dailyOrderCounts,
    activeOrders, topItems, ordersByType,
    recentOrders: allOrders.slice(0, 5),
    totalCount,
  };
}

// ── Pure sub-components (defined outside main to prevent remount) ─────────────

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

function BigCard({ label, value, sub, icon, color, bg, onPress }: {
  label: string; value: string; sub: string; icon: any;
  color: string; bg: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={bc.wrap} onPress={onPress} activeOpacity={0.85}>
      <View style={bc.top}>
        <View style={[bc.iconWrap, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={[bc.badge, { backgroundColor: bg }]}>
          <Text style={[bc.badgeText, { color }]}>{sub}</Text>
        </View>
      </View>
      <Text style={bc.value}>{value}</Text>
      <Text style={bc.label}>{label}</Text>
    </TouchableOpacity>
  );
}

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

function MiniCard({ label, value, icon, color, bg, onPress }: {
  label: string; value: string | number; icon: any;
  color: string; bg: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={mc.wrap} onPress={onPress} activeOpacity={0.85}>
      <View style={mc.row}>
        <View style={[mc.icon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={mc.value} numberOfLines={1}>{String(value)}</Text>
          <Text style={mc.label} numberOfLines={1}>{label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function BarChart({ labels, data, color }: { labels: string[]; data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <View style={ch.wrap}>
      <View style={ch.bars}>
        {data.map((v, i) => {
          const h = Math.max(4, (v / max) * 110);
          return (
            <View key={i} style={ch.col}>
              {v > 0 && (
                <Text style={ch.topVal}>
                  {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))}
                </Text>
              )}
              <View style={ch.track}>
                <View style={[ch.bar, { height: h, backgroundColor: color }]} />
              </View>
              <Text style={ch.dayLabel}>{labels[i]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

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

function ActiveOrderRow({ order }: { order: Order }) {
  const sc = STATUS_CFG[order.status] ?? { color: C.muted, bg: '#f3f4f6' };
  return (
    <TouchableOpacity style={ar.row} onPress={() => router.push('/(app)/orders' as any)} activeOpacity={0.8}>
      <View style={[ar.avatar, { backgroundColor: C.primary + '18' }]}>
        <Ionicons name="cart-outline" size={13} color={C.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={ar.num} numberOfLines={1}>#{order.order_number} · {order.customer_name ?? 'Walk-in'}</Text>
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
        <Text style={rr.time}>{order.created_at ? format(new Date(order.created_at), 'dd MMM, hh:mm a') : '—'}</Text>
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

const QUICK_LINKS = [
  { label: 'POS',          icon: 'cart-outline',         route: '/(app)/pos',          color: C.dark    },
  { label: 'Kitchen',      icon: 'flame-outline',         route: '/(app)/kitchen',      color: '#f59e0b' },
  { label: 'Orders',       icon: 'receipt-outline',       route: '/(app)/orders',       color: C.primary },
  { label: 'Tables',       icon: 'grid-outline',          route: '/(app)/tables',       color: C.purple  },
  { label: 'Customers',    icon: 'people-outline',        route: '/(app)/customers',    color: C.success },
  { label: 'Reservations', icon: 'calendar-outline',      route: '/(app)/reservations', color: C.danger  },
  { label: 'Expenses',     icon: 'wallet-outline',        route: '/(app)/expenses',     color: C.warning },
  { label: 'Menu',         icon: 'restaurant-outline',    route: '/(app)/menu',         color: C.info    },
];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const [todayOrders,  setTodayOrders]  = useState<Order[]>([]);
  const [monthOrders,  setMonthOrders]  = useState<Order[]>([]);
  const [allOrders,    setAllOrders]    = useState<Order[]>([]);
  const [totalCount,   setTotalCount]   = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const { restaurant, isOnline } = useAppStore();
  const { width } = useWindowDimensions();
  const contentW  = width >= 640 ? width - SIDEBAR : width;
  const cols3     = contentW >= 900 ? 3 : contentW >= 600 ? 2 : 1;
  const cols4     = contentW >= 1200 ? 4 : contentW >= 800 ? 3 : contentW >= 500 ? 2 : 2;
  const cols6     = contentW >= 1200 ? 6 : contentW >= 800 ? 4 : contentW >= 500 ? 3 : 2;
  const isWide    = contentW >= 900;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const today = todayStr();
      const month = monthStartStr();
      const [tRes, mRes, aRes] = await Promise.all([
        ordersApi.list({ from: today, to: today, per_page: 500 }),
        ordersApi.list({ from: month, to: today, per_page: 500 }),
        ordersApi.list({ per_page: 300 }),
      ]);
      const toArr = (r: any) => {
        const d = r.data?.data ?? r.data ?? [];
        return Array.isArray(d) ? d : [];
      };
      setTodayOrders(toArr(tRes));
      setMonthOrders(toArr(mRes));
      const all = toArr(aRes);
      setAllOrders(all);
      setTotalCount(aRes.data?.total ?? all.length);
    } catch (e) {
      console.warn('Dashboard load:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const stats = useMemo(() =>
    computeStats(todayOrders, monthOrders, allOrders, totalCount),
    [todayOrders, monthOrders, allOrders, totalCount]
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const go = (route: string) => router.push(route as any);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={C.gold} size="large" />
        <Text style={{ color: C.muted, fontSize: 13 }}>Loading dashboard…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.shell}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.gold} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero header ── */}
      <View style={s.hero}>
        <View>
          <Text style={s.heroName}>{restaurant?.name?.toUpperCase() ?? 'RESTAURANT'}</Text>
          <Text style={s.heroDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[s.onlinePill, { backgroundColor: isOnline ? 'rgba(20,181,29,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <View style={[s.onlineDot, { backgroundColor: isOnline ? C.success : C.danger }]} />
            <Text style={[s.onlineText, { color: isOnline ? C.success : C.danger }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={() => load(true)}>
            <Ionicons name="refresh-outline" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.body}>

        {/* ── Row 1: 3 primary cards ── */}
        <View style={[s.row, { gap: 10 }]}>
          <BigCard
            label="Today's Sales" value={fmtMoney(stats.todaySales)}
            sub={`${stats.todayOrderCount} orders today`}
            icon="calendar-outline" color={C.primary} bg={C.primary + '18'}
            onPress={() => go('/(app)/orders')}
          />
          <BigCard
            label="This Month's Sales" value={fmtMoney(stats.monthSales)}
            sub={`${stats.monthOrderCount} orders this month`}
            icon="calendar-number-outline" color={C.success} bg={C.success + '18'}
            onPress={() => go('/(app)/orders')}
          />
          <BigCard
            label="Total Sales" value={fmtMoney(stats.totalSales)}
            sub={`${stats.totalCount} total orders`}
            icon="trending-up-outline" color={C.purple} bg={C.purple + '18'}
            onPress={() => go('/(app)/orders')}
          />
        </View>

        {/* ── Row 2: 6 secondary metric cards ── */}
        <View style={s.section}>
          <SectionHeader title="Sales Breakdown" />
          <View style={[s.grid, { gap: 8 }]}>
            {[
              { label: 'Offline Orders', value: stats.offlineOrders, icon: 'desktop-outline',    color: C.success,  bg: C.success + '18',  sub: 'non-aggregator' },
              { label: 'Online Orders',  value: stats.onlineOrders,  icon: 'bicycle-outline',    color: C.danger,   bg: C.danger  + '18',  sub: 'Zomato & Swiggy' },
              { label: 'Offline Sale',   value: fmtMoney(stats.offlineSales), icon: 'cash-outline', color: C.warning, bg: C.warning + '18', sub: 'paid, excl. GST' },
              { label: 'Online Sale',    value: fmtMoney(stats.onlineSales),  icon: 'globe-outline',color: C.primary, bg: C.primary + '18', sub: 'aggregator paid' },
              { label: 'Net Sale',       value: fmtMoney(stats.netSales),     icon: 'analytics-outline', color: C.orange, bg: C.orange + '18', sub: 'excl. GST' },
              { label: 'Total Sale',     value: fmtMoney(stats.totalSales),   icon: 'wallet-outline',    color: C.purple, bg: C.purple + '18', sub: 'incl. GST' },
            ].map((c, i) => (
              <View key={i} style={{ width: `${100 / cols6}%` as any, padding: 4 }}>
                <SmallCard label={c.label} value={c.value} sub={c.sub}
                  icon={c.icon} color={c.color} bg={c.bg}
                  onPress={() => go('/(app)/orders')} />
              </View>
            ))}
          </View>
        </View>

        {/* ── Row 3: 5 supporting stat cards ── */}
        <View style={s.section}>
          <SectionHeader title="Key Metrics" />
          <View style={[s.grid, { gap: 8 }]}>
            {[
              { label: 'Total Orders',  value: stats.totalCount,              icon: 'cube-outline',           color: C.orange,  bg: C.orange  + '18', sub: undefined },
              { label: 'Average Value', value: fmtMoney(stats.avgOrderValue), icon: 'diamond-outline',        color: C.info,    bg: C.info    + '18', sub: 'per paid order' },
              { label: 'Total Tax',     value: fmtMoney(stats.totalTax),      icon: 'receipt-outline',        color: C.warning, bg: C.warning + '18', sub: 'GST collected' },
              { label: 'Total Discount',value: fmtMoney(stats.totalDiscount), icon: 'pricetag-outline',       color: C.success, bg: C.success + '18', sub: 'given' },
              { label: 'Unpaid Orders', value: stats.unpaidCount,             icon: 'alert-circle-outline',   color: C.danger,  bg: C.danger  + '18', sub: fmtMoney(stats.unpaidTotal) + ' pending', danger: stats.unpaidCount > 0 },
            ].map((c, i) => (
              <View key={i} style={{ width: `${100 / Math.min(5, cols6)}%` as any, padding: 4 }}>
                <SmallCard label={c.label} value={c.value} sub={c.sub}
                  icon={c.icon} color={c.color} bg={c.bg} danger={c.danger}
                  onPress={() => go('/(app)/orders')} />
              </View>
            ))}
          </View>
        </View>

        {/* ── Row 4: 7-day chart + Payment breakdown ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Bar chart */}
            <View style={[s.card, { flex: isWide ? 2 : 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={s.cardTitle}>Sale Analysis</Text>
                  <Text style={s.cardSub}>Revenue · Last 7 days</Text>
                </View>
                <View style={[s.legendRow]}>
                  <View style={s.legendDot} />
                  <Text style={s.legendText}>Revenue</Text>
                </View>
              </View>
              <BarChart labels={stats.days} data={stats.dailyRevenue} color={C.primary} />
              {/* Orders overlay */}
              <View style={s.chartSubRow}>
                {stats.dailyOrderCounts.map((v, i) => (
                  <View key={i} style={s.chartSubCol}>
                    <View style={[s.chartSubBadge, { backgroundColor: C.success + '18' }]}>
                      <Text style={[s.chartSubText, { color: C.success }]}>{v}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={[s.legendRow, { marginTop: 4, gap: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={[s.legendDot, { backgroundColor: C.primary }]} />
                  <Text style={s.legendText}>Revenue</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={[s.legendDot, { backgroundColor: C.success }]} />
                  <Text style={s.legendText}>Orders (number below bars)</Text>
                </View>
              </View>
            </View>

            {/* Payment breakdown */}
            {isWide && (
              <View style={[s.card, { flex: 1 }]}>
                <Text style={s.cardTitle}>Payment Types</Text>
                <Text style={s.cardSub}>By payment method</Text>
                <View style={{ marginTop: 12, gap: 8 }}>
                  {stats.paymentMethods.slice(0, 6).map((pm, i) => (
                    <ProgressItem key={i}
                      label={pm.label} sub={`${pm.count} orders`}
                      value={fmtMoney(pm.total)} percent={pm.percent}
                      color={pm.color} icon={pm.icon}
                    />
                  ))}
                  {stats.paymentMethods.length === 0 && (
                    <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', paddingVertical: 16 }}>No paid orders yet</Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Payment breakdown on mobile (below chart) */}
          {!isWide && stats.paymentMethods.length > 0 && (
            <View style={[s.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>Payment Types</Text>
              <Text style={s.cardSub}>By payment method</Text>
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

        {/* ── Row 5: Bill type breakdown ── */}
        <View style={s.section}>
          <SectionHeader title="Bill Type Breakdown" />
          <View style={[s.grid, { gap: 8 }]}>
            {Object.entries(BILL_TYPE_CFG).map(([key, cfg]) => {
              const bt = stats.billTypes[key] ?? { count: 0, total: 0 };
              return (
                <View key={key} style={{ width: `${100 / Math.min(5, cols6)}%` as any, padding: 4 }}>
                  <BillTypeCard label={cfg.label} icon={cfg.icon} color={cfg.color}
                    count={bt.count} total={bt.total} />
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Row 6: Bill status + Top items ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Bill status */}
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardTitle}>Bill Status</Text>
              <Text style={s.cardSub}>Special bill types</Text>
              <View style={{ marginTop: 12, gap: 6 }}>
                {[
                  { label: 'Cancelled Bills', value: stats.cancelledBills, icon: 'close-circle-outline', color: C.danger  },
                  { label: 'Free Bills',       value: stats.freeBills,      icon: 'gift-outline',          color: C.success },
                  { label: 'Unpaid Bills',     value: stats.unpaidCount,    icon: 'alert-circle-outline',  color: C.warning },
                ].map((item, i) => (
                  <MiniCard key={i} label={item.label} value={item.value}
                    icon={item.icon} color={item.color} bg={item.color + '18'}
                    onPress={() => go('/(app)/orders')} />
                ))}
              </View>
            </View>

            {/* Top selling items */}
            <View style={[s.card, { flex: isWide ? 2 : 1 }]}>
              <Text style={s.cardTitle}>Top Selling Items</Text>
              <Text style={s.cardSub}>By quantity ordered</Text>
              {stats.topItems.length > 0 ? (
                <View style={{ marginTop: 12, gap: 10 }}>
                  {stats.topItems.map((item, i) => (
                    <TopItemRow key={i} name={item.name} qty={item.qty}
                      maxQty={stats.topItems[0]?.qty ?? 1} rank={i + 1} />
                  ))}
                </View>
              ) : (
                <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>
                  No order items data available
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* ── Row 7: Active orders + Recent orders ── */}
        <View style={s.section}>
          <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
            {/* Active orders */}
            <View style={[s.card, { flex: 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={s.cardTitle}>Active Orders</Text>
                  <Text style={s.cardSub}>{stats.activeOrders.length} in-flight</Text>
                </View>
                <TouchableOpacity onPress={() => go('/(app)/orders')}>
                  <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>View all</Text>
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
            </View>

            {/* Recent orders */}
            <View style={[s.card, { flex: 1 }]}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={s.cardTitle}>Recent Orders</Text>
                  <Text style={s.cardSub}>Last 5 orders</Text>
                </View>
                <TouchableOpacity onPress={() => go('/(app)/orders')}>
                  <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>See all</Text>
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
        </View>

        {/* ── Quick access grid ── */}
        <View style={s.section}>
          <SectionHeader title="Quick Access" />
          <View style={[s.grid, { gap: 8 }]}>
            {QUICK_LINKS.map(ql => (
              <View key={ql.route} style={{ width: `${100 / cols4}%` as any, padding: 4 }}>
                <TouchableOpacity style={ql_s.card} onPress={() => go(ql.route)} activeOpacity={0.85}>
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
  shell: { flex: 1, backgroundColor: C.bg },
  body:  { padding: 12 },
  row:   { flexDirection: 'row', flexWrap: 'wrap' },
  grid:  { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  section: { marginBottom: 6 },
  card:  { backgroundColor: C.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border,
           shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, marginBottom: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  cardSub:   { fontSize: 11.5, color: C.muted, marginTop: 2 },
  emptyBox:  { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { fontSize: 12.5, color: C.muted },

  hero: { backgroundColor: C.dark, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  heroName: { fontSize: 18, fontWeight: '900', color: C.gold, letterSpacing: 0.5 },
  heroDate: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3 },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: '700' },
  refreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },

  chartSubRow: { flexDirection: 'row', marginTop: 4 },
  chartSubCol: { flex: 1, alignItems: 'center' },
  chartSubBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  chartSubText: { fontSize: 9.5, fontWeight: '700' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  legendText: { fontSize: 10.5, color: C.muted },
});

const sh = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accent: { width: 3, height: 16, borderRadius: 2, backgroundColor: C.gold },
  title: { fontSize: 13, fontWeight: '800', color: '#374151', letterSpacing: 0.5, textTransform: 'uppercase' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, fontWeight: '700', color: C.primary },
});

const bc = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border,
         shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, margin: 4, minWidth: 160 },
  top:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  value: { fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: C.muted },
});

const sc = StyleSheet.create({
  wrap:  { backgroundColor: C.white, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border,
           shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1, height: '100%' },
  dangerBorder: { borderColor: C.danger, borderWidth: 1.5 },
  iconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  value: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 2 },
  label: { fontSize: 11.5, fontWeight: '600', color: '#374151' },
  sub:   { fontSize: 10, color: C.muted, marginTop: 2 },
});

const mc = StyleSheet.create({
  wrap: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border },
  row:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  value:{ fontSize: 18, fontWeight: '800', color: C.text },
  label:{ fontSize: 12, color: C.muted, marginTop: 1 },
});

const ch = StyleSheet.create({
  wrap:   { marginTop: 12 },
  bars:   { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 6, paddingHorizontal: 4 },
  col:    { flex: 1, alignItems: 'center', gap: 4 },
  topVal: { fontSize: 9, fontWeight: '700', color: C.muted, textAlign: 'center' },
  track:  { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: '#f1f5f9', borderRadius: 6, overflow: 'hidden' },
  bar:    { width: '100%', borderRadius: 6, minHeight: 4 },
  dayLabel:{ fontSize: 10, fontWeight: '600', color: C.muted, textAlign: 'center', marginTop: 4 },
});

const pi = StyleSheet.create({
  wrap:  { gap: 5 },
  top:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  left:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  icon:  { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: 12.5, fontWeight: '600', color: C.text },
  sub:   { fontSize: 10.5, color: C.muted },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  value: { fontSize: 13, fontWeight: '800', color: C.text },
  pctBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  pctText:  { fontSize: 10.5, fontWeight: '800' },
  track: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 3 },
});

const ti = StyleSheet.create({
  wrap:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankText: { fontSize: 11, fontWeight: '800' },
  nameRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:   { fontSize: 12.5, fontWeight: '600', color: C.text, flex: 1 },
  qty:    { fontSize: 12, fontWeight: '800', marginLeft: 4 },
  track:  { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  fill:   { height: '100%', borderRadius: 3 },
});

const ar = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  avatar: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  num:    { fontSize: 13, fontWeight: '700', color: C.text },
  meta:   { fontSize: 11, color: C.muted, marginTop: 2 },
  amount: { fontSize: 13, fontWeight: '800', color: C.gold },
  badge:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});

const rr = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  avatar: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  num:    { fontSize: 13, fontWeight: '700', color: C.text },
  srcBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  srcText:  { fontSize: 9.5, fontWeight: '800' },
  meta:   { fontSize: 11, color: C.muted, marginTop: 2 },
  time:   { fontSize: 10.5, color: '#9ca3af', marginTop: 2 },
  amount: { fontSize: 13, fontWeight: '800', color: C.gold },
  badge:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 9.5, fontWeight: '700', textTransform: 'capitalize' },
});

const btc = StyleSheet.create({
  wrap:   { backgroundColor: C.white, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.border,
           shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1, height: '100%' },
  top:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  icon:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  label:  { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 4 },
  amount: { fontSize: 16, fontWeight: '800' },
});

const ql_s = StyleSheet.create({
  card:  { backgroundColor: C.white, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border, gap: 8,
           shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1, height: '100%' },
  icon:  { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', textAlign: 'center' },
});
