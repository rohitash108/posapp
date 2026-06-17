import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  RefreshControl, ActivityIndicator, useWindowDimensions,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { ordersApi } from '@/api/orders';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { Order, OrderStatus } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

// Include 'served' so orders marked served from Orders/Waiter screen stay visible
// until explicitly completed from Kitchen (matches CSPos KDS behaviour)
const KDS_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'served'];

// csPos status label mapping — 'confirmed' = Accepted in kitchen lifecycle
const STATUS_LABELS: Record<string, string> = {
  pending:   'Pending',
  confirmed: 'Accepted',
  preparing: 'Preparing',
  ready:     'Ready',
  served:    'Served',
};
const STATUS_COLORS: Record<string, string> = {
  pending:   '#f59e0b',
  confirmed: '#3b82f6',
  preparing: '#8b5cf6',
  ready:     '#10b981',
  served:    '#06b6d4',
};

const SOURCE_CFG = {
  pos:    { label: 'POS',    color: '#1A2B1A', bg: 'rgba(26,43,26,0.12)'   },
  zomato: { label: 'Zomato', color: '#d00000', bg: 'rgba(208,0,0,0.1)'     },
  swiggy: { label: 'Swiggy', color: '#fc8019', bg: 'rgba(252,128,25,0.1)'  },
  qr:     { label: 'QR',     color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// csPos status flow (Pending → Accepted → Preparing → Ready → Completed):
// POS/QR:      pending → Accept(confirmed) → preparing → ready → served → completed
// Aggregators: pending → Accept(confirmed)/Reject(cancelled) → preparing → ready → served → completed
//
// isAdmin: restaurant_admin role gets a direct "Complete" shortcut from ready/served.
function getNextAction(
  order: Order,
  isAdmin: boolean,
): { status: OrderStatus; label: string; color: string } | null {
  const isAgg = order.source === 'zomato' || order.source === 'swiggy';

  // pending is always handled by explicit Accept/Reject buttons (see showAcceptReject below)
  if (order.status === 'pending') return null;

  if (order.status === 'confirmed') {
    return { status: 'preparing', label: 'Start Preparing', color: '#0D76E1' };
  }
  if (order.status === 'preparing') {
    return { status: 'ready', label: 'Mark Ready', color: '#10b981' };
  }
  if (order.status === 'ready') {
    // Admin can complete directly; everyone can mark served
    if (isAdmin) return { status: 'completed', label: 'Mark Completed', color: '#16a34a' };
    return { status: 'served', label: 'Mark Served', color: '#06b6d4' };
  }
  if (order.status === 'served') {
    return { status: 'completed', label: 'Mark Completed', color: '#16a34a' };
  }
  return null;
}

function formatDateTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' });
  const h = d.getHours();
  return `${pad(d.getDate())} ${mon} ${d.getFullYear()}, ${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
}

function elapsedMins(created_at?: string) {
  if (!created_at) return 0;
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
}

// ─── Theme-aware styles ───────────────────────────────────────────────────────

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    shell: { flex: 1, backgroundColor: c.background },

    // Error banner
    errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: '#fecaca', paddingHorizontal: 14, paddingVertical: 9 },
    errText: { flex: 1, fontSize: 12.5, color: '#dc2626' },
    retryBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: '#dc2626' },
    retryTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },

    // Header
    header: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 14, paddingVertical: 12 },
    headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 18, fontWeight: '800', color: c.heading },
    refreshBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },

    // Stats pills
    pillsRow: { flexDirection: 'row', gap: 8, flex: 1, flexWrap: 'wrap' },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, borderRadius: 999, borderWidth: 1, borderColor: c.border,
      paddingLeft: 6, paddingRight: 12, paddingVertical: 6,
    },
    pillIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    pillLabel: { fontSize: 12, fontWeight: '500', color: c.text },
    pillCount: { fontSize: 17, fontWeight: '700', color: c.heading },

    // Filter bar
    filterBar: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
    chipTxt: { fontSize: 12, fontWeight: '700', color: c.text },
    chipBadge: { backgroundColor: c.border, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
    chipBadgeTxt: { fontSize: 10, fontWeight: '700', color: c.text },
    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surfaceAlt, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: c.border, minWidth: 180 },
    searchInput: { flex: 1, fontSize: 13, color: c.heading },

    // Grid
    listContent: { padding: 10, gap: 10, flexGrow: 1 },
    colWrap: { gap: 10, alignItems: 'stretch' },

    // Card
    card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
    cardUrgent: { borderColor: '#fca5a5' },

    // Card header — dark bg matching csPos
    cardHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.sidebar, padding: 12, gap: 10 },
    cardHeadL: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    cardAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    cardCustomer: { fontSize: 13.5, fontWeight: '600', color: c.sidebarText },
    cardOrderType: { fontSize: 11.5, color: c.sidebarTextMuted, marginTop: 2 },
    cardHeadR: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
    orderNumBadge: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
    orderNumTxt: { fontSize: 11.5, fontWeight: '800', color: '#111827' },
    srcBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
    srcBadgeTxt: { fontSize: 10.5, fontWeight: '800' },
    extId: { fontSize: 10, color: c.sidebarTextMuted },

    // Card info row (table + datetime)
    cardInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    cardInfoLbl: { fontSize: 12.5, color: c.text, fontWeight: '500' },
    cardInfoDate: { fontSize: 11.5, color: c.text, fontWeight: '400' },

    // Card body — items list
    cardBody: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 5 },
    noItems: { fontSize: 12, color: '#f59e0b', fontStyle: 'italic' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    itemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', flexShrink: 0 },
    itemName: { flex: 1, fontSize: 13, color: c.heading, lineHeight: 18 },
    itemMeta: { fontSize: 12, color: c.text, flexShrink: 0 },
    addons: { fontSize: 11, color: c.textMuted, paddingLeft: 16 },

    // Order total row (aggregator orders)
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 7, marginTop: 4 },
    totalLabel: { fontSize: 12.5, fontWeight: '600', color: c.text },
    totalVal: { fontSize: 12.5, fontWeight: '700', color: c.heading },

    // Info boxes (address, notes)
    infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: c.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, marginTop: 2 },
    infoBoxTxt: { flex: 1, fontSize: 11.5, color: c.text, lineHeight: 16 },
    notesBox: { backgroundColor: '#fffbeb' },
    notesTxt: { color: '#92400e', fontStyle: 'italic' },

    // Card footer
    cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.border, gap: 6 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusTxt: { fontSize: 11.5, fontWeight: '700' },
    actionRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
    actionBtnTxt: { fontSize: 12.5, fontWeight: '700', color: '#fff' },

    // Empty state
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: c.textMuted },
    emptyText: { fontSize: 13, color: c.border, textAlign: 'center' },
  });
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function KitchenScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [srcFilter, setSrcFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const { width } = useWindowDimensions();
  const user = useAppStore((s) => s.user);
  // Restaurant Admin has full control: direct complete from ready, cancel orders, etc.
  const isAdmin = user?.role === 'restaurant_admin' || user?.role === 'admin';
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevFocusedRef = useRef(false);
  const isFocused = useIsFocused();

  // 3 cols wide desktop, 2 medium, 1 mobile
  const numCols = width >= 1440 ? 3 : width >= 880 ? 2 : 1;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await ordersApi.list({
        per_page: 100,
        status: KDS_STATUSES.join(','),
        from: today,
        to: today,
      });
      const raw = res.data?.data ?? res.data ?? [];
      const orders: Order[] = Array.isArray(raw) ? raw : [];
      // API already filters by status; sort newest first to match CSPos KDS order
      const kitchen = orders.sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
      setOrders(kitchen);
      // completed count: fetch separately so it's accurate even with status filter active
      const todayStr = new Date().toISOString().slice(0, 10);
      try {
        const doneRes = await ordersApi.list({ per_page: 1, status: 'completed', from: todayStr, to: todayStr });
        setCompletedToday(doneRes.data?.total ?? 0);
      } catch { /* non-critical — leave at previous value */ }
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to load kitchen orders';
      console.error('[Kitchen] load error:', e?.response?.status, msg);
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load on mount + 10s polling
  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 10000);
    tickRef.current = setInterval(() => setTick(t => t + 1), 60000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [load]);

  // Reload immediately on tab focus (false → true transition only).
  // useIsFocused() from @react-navigation/native is driven by the navigator's
  // focus/blur events — it only changes on REAL tab switches, never on
  // re-renders, so this cannot cause an infinite loop unlike useFocusEffect.
  useEffect(() => {
    if (isFocused && !prevFocusedRef.current) {
      load(true);
    }
    prevFocusedRef.current = isFocused;
  }, [isFocused, load]);

  async function handleStatus(order: Order, newStatus: OrderStatus) {
    setActionLoading(p => ({ ...p, [order.id]: true }));
    try {
      await ordersApi.updateStatus(order.id, newStatus);
      if (newStatus === 'completed' || newStatus === 'cancelled') {
        setOrders(prev => prev.filter(o => o.id !== order.id));
        if (newStatus === 'completed') setCompletedToday(c => c + 1);
      } else {
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: newStatus } : o));
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to update status';
      setError(msg);
      setTimeout(() => setError(''), 4000);
      load(true);
    } finally {
      setActionLoading(p => ({ ...p, [order.id]: false }));
    }
  }

  // Apply source filter then search filter
  const filtered = orders
    .filter(o => srcFilter === 'all' || (o.source ?? 'pos') === srcFilter)
    .filter(o => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (o.order_number ?? '').toLowerCase().includes(q) ||
        (o.customer_name ?? '').toLowerCase().includes(q) ||
        (o.table_name ?? '').toLowerCase().includes(q) ||
        (o.items ?? []).some(i => (i.item_name ?? i.name ?? '').toLowerCase().includes(q))
      );
    });

  // Stats counts (matching csPos: Pending, In Kitchen, Ready, Completed)
  const counts = {
    pending:   orders.filter(o => o.status === 'pending').length,
    inKitchen: orders.filter(o => o.status === 'confirmed' || o.status === 'preparing').length,
    ready:     orders.filter(o => o.status === 'ready' || o.status === 'served').length,
    completed: completedToday,
  };

  if (loading) {
    return (
      <View style={[s.shell, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={{ color: colors.textMuted, marginTop: 10 }}>Loading kitchen orders…</Text>
      </View>
    );
  }

  return (
    <View style={s.shell}>

      {/* ── Error banner ─────────────────────────────────── */}
      {error ? (
        <View style={s.errBanner}>
          <Ionicons name="alert-circle" size={14} color="#ef4444" />
          <Text style={s.errText} numberOfLines={2}>{error}</Text>
          <Pressable onPress={() => load()} style={s.retryBtn}>
            <Text style={s.retryTxt}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Header ───────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          {/* Title */}
          <View style={s.titleRow}>
            <Text style={s.title}>Kitchen</Text>
            <Pressable
              onPress={() => { setRefreshing(true); load(); }}
              style={({ pressed }) => [s.refreshBtn, (loading || refreshing || pressed) && { opacity: 0.6 }]}
              disabled={loading || refreshing}
            >
              {refreshing
                ? <ActivityIndicator size="small" color={colors.text} />
                : <Ionicons name="refresh-outline" size={16} color={colors.text} />}
            </Pressable>
          </View>

          {/* csPos-style stats pills: Pending | In Kitchen | Ready | Completed */}
          <View style={s.pillsRow}>
            <StatPill icon="newspaper-outline"      iconBg="#374151" label="Pending"    count={counts.pending}   s={s} />
            <StatPill icon="cube-outline"           iconBg="#6b7280" label="In Kitchen" count={counts.inKitchen} s={s} />
            <StatPill icon="alarm-outline"          iconBg="#dc2626" label="Ready"      count={counts.ready}     s={s} />
            <StatPill icon="checkmark-done-outline" iconBg="#059669" label="Completed"  count={counts.completed} s={s} />
          </View>
        </View>
      </View>

      {/* ── Source filter + Search ────────────────────────── */}
      <View style={s.filterBar}>
        <View style={s.filterChips}>
          {(['all', 'pos', 'zomato', 'swiggy', 'qr'] as const).map(src => {
            const cfg = src !== 'all' ? SOURCE_CFG[src] : null;
            const active = srcFilter === src;
            const cnt = src === 'all' ? orders.length : orders.filter(o => (o.source ?? 'pos') === src).length;
            return (
              <Pressable
                key={src}
                style={({ pressed }) => [s.chip, active && { backgroundColor: cfg?.color ?? '#1A2B1A', borderColor: cfg?.color ?? '#1A2B1A' }, pressed && { opacity: 0.75 }]}
                onPress={() => setSrcFilter(src)}
              >
                <Text style={[s.chipTxt, active && { color: '#fff' }]}>
                  {src === 'all' ? 'All' : cfg?.label}
                </Text>
                <View style={[s.chipBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.chipBadgeTxt, active && { color: '#fff' }]}>{cnt}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={14} color={colors.placeholder} />
          <TextInput
            style={s.searchInput}
            placeholder="Search orders..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.placeholder}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={14} color={colors.placeholder} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Card grid ──────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={o => String(o.id)}
        numColumns={numCols}
        key={`grid-${numCols}`}
        columnWrapperStyle={numCols > 1 ? s.colWrap : undefined}
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.brand}
          />
        }
        extraData={[actionLoading, tick]}
        renderItem={({ item }) => (
          <KitchenCard
            order={item}
            numCols={numCols}
            isAdmin={isAdmin}
            isLoading={!!actionLoading[item.id]}
            onAction={handleStatus}
            s={s}
          />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="restaurant-outline" size={52} color="#d1d5db" />
            <Text style={s.emptyTitle}>
              {search ? 'No orders matched' : 'No orders in kitchen'}
            </Text>
            <Text style={s.emptyText}>
              {search ? 'Try a different search term' : 'New and in-progress orders will appear here.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ icon, iconBg, label, count, s }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  label: string;
  count: number;
  s: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={s.pill}>
      <View style={[s.pillIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={13} color="#fff" />
      </View>
      <Text style={s.pillLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={s.pillCount}>{count}</Text>
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function KitchenCard({ order, numCols, isAdmin, isLoading, onAction, s }: {
  order: Order;
  numCols: number;
  isAdmin: boolean;
  isLoading: boolean;
  onAction: (order: Order, status: OrderStatus) => void;
  s: ReturnType<typeof createStyles>;
}) {
  const src = order.source ?? 'pos';
  const srcCfg = SOURCE_CFG[src as keyof typeof SOURCE_CFG] ?? SOURCE_CFG.pos;
  const isAgg = src === 'zomato' || src === 'swiggy';
  const isUrgent = elapsedMins(order.created_at) >= 15;
  const statusColor = STATUS_COLORS[order.status] ?? '#6b7280';
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;
  const nextAction = getNextAction(order, isAdmin);
  // All pending orders show Accept/Reject (POS gets Accept only; aggregators get both)
  const showAcceptReject = order.status === 'pending';
  const orderTotal = (order.items ?? []).reduce((s, i) => s + (Number(i.unit_price) || 0) * (i.quantity || 1), 0);
  const hasTotal = isAgg && orderTotal > 0;

  return (
    <View style={[s.card, numCols > 1 && { flex: 1 }, isUrgent && s.cardUrgent]}>

      {/* ── Card header — dark (bg-gray like csPos) ────────── */}
      <View style={s.cardHead}>
        <View style={s.cardHeadL}>
          <View style={s.cardAvatar}>
            <Ionicons name="hand-right-outline" size={18} color="rgba(255,255,255,0.8)" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.cardCustomer} numberOfLines={1}>
              {order.customer_name || 'Walk-in'}
            </Text>
            <Text style={s.cardOrderType} numberOfLines={1}>
              {(order.order_type ?? 'dine_in').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </Text>
          </View>
        </View>
        <View style={s.cardHeadR}>
          <View style={s.orderNumBadge}>
            <Text style={s.orderNumTxt}>Order {order.order_number}</Text>
          </View>
          {isAgg && (
            <View style={[s.srcBadge, { backgroundColor: srcCfg.bg, borderColor: srcCfg.color + '40' }]}>
              <Text style={[s.srcBadgeTxt, { color: srcCfg.color }]}>{srcCfg.label}</Text>
            </View>
          )}
          {order.external_id && isAgg && (
            <Text style={s.extId}>ID: {order.external_id}</Text>
          )}
        </View>
      </View>

      {/* ── Table / delivery + datetime ───────────────────── */}
      <View style={s.cardInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={isAgg ? 'bicycle-outline' : 'grid-outline'} size={12} color={s.cardInfoLbl.color} />
          <Text style={s.cardInfoLbl}>
            {isAgg
              ? 'Delivery'
              : order.table_name
                ? `Table : ${order.table_name}`
                : '–'}
          </Text>
        </View>
        <Text style={s.cardInfoDate}>{formatDateTime(order.created_at)}</Text>
      </View>

      {/* ── Items list ────────────────────────────────────── */}
      <View style={s.cardBody}>
        {(order.items ?? []).length === 0 ? (
          <Text style={s.noItems}>Items not loaded</Text>
        ) : (order.items ?? []).map((item, idx) => (
          <View key={idx} style={s.itemRow}>
            {/* csPos uses green dot (dot success) for all items */}
            <View style={s.itemDot} />
            <Text style={s.itemName} numberOfLines={2}>
              {item.item_name ?? item.name ?? ''}
              {item.variation ? ` · ${item.variation}` : ''}
            </Text>
            <Text style={s.itemMeta}>
              ×{item.quantity}
              {item.unit_price ? ` · ₹${Number(item.unit_price).toFixed(2)}` : ''}
            </Text>
          </View>
        ))}

        {/* Addons */}
        {(order.items ?? []).map((item, idx) =>
          item.addons && item.addons.length > 0 ? (
            <Text key={`adn-${idx}`} style={s.addons}>
              + {item.addons.map(a => a.name).join(', ')}
            </Text>
          ) : null
        )}

        {/* Order total for aggregator orders (matches csPos) */}
        {hasTotal && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Order total</Text>
            <Text style={s.totalVal}>₹{orderTotal.toFixed(2)}</Text>
          </View>
        )}

        {/* Delivery address */}
        {isAgg && order.delivery_address ? (
          <View style={s.infoBox}>
            <Ionicons name="location-outline" size={11} color="#6b7280" />
            <Text style={s.infoBoxTxt} numberOfLines={2}>{order.delivery_address}</Text>
          </View>
        ) : null}

        {/* Notes (matches csPos bg-light notes box) */}
        {order.notes ? (
          <View style={[s.infoBox, s.notesBox]}>
            <Ionicons name="information-circle-outline" size={11} color="#92400e" />
            <Text style={[s.infoBoxTxt, s.notesTxt]} numberOfLines={3}>
              Notes : {order.notes}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Footer: status badge + action buttons ─────────── */}
      <View style={s.cardFoot}>
        {/* Status badge (badge-soft style matching csPos) */}
        <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusTxt, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        <View style={s.actionRow}>
          {isLoading ? (
            <ActivityIndicator size="small" color={STATUS_COLORS.confirmed} />
          ) : showAcceptReject ? (
            <>
              <Pressable
                style={({ pressed }) => [s.actionBtn, { backgroundColor: '#10b981' }, pressed && { opacity: 0.75 }]}
                onPress={() => onAction(order, 'confirmed')}
              >
                <Ionicons name="checkmark" size={13} color="#fff" />
                <Text style={s.actionBtnTxt}>Accept</Text>
              </Pressable>
              {/* Only aggregator orders can be rejected from Kitchen */}
              {isAgg && (
                <Pressable
                  style={({ pressed }) => [s.actionBtn, { backgroundColor: '#ef4444' }, pressed && { opacity: 0.75 }]}
                  onPress={() => onAction(order, 'cancelled')}
                >
                  <Ionicons name="close" size={13} color="#fff" />
                  <Text style={s.actionBtnTxt}>Reject</Text>
                </Pressable>
              )}
            </>
          ) : nextAction ? (
            <>
              {/* Admin on a 'ready' order gets a secondary 'Mark Served' button too */}
              {isAdmin && order.status === 'ready' && (
                <Pressable
                  style={({ pressed }) => [s.actionBtn, { backgroundColor: '#06b6d4' }, pressed && { opacity: 0.75 }]}
                  onPress={() => onAction(order, 'served')}
                >
                  <Text style={s.actionBtnTxt}>Mark Served</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [s.actionBtn, { backgroundColor: nextAction.color }, pressed && { opacity: 0.75 }]}
                onPress={() => onAction(order, nextAction.status)}
              >
                <Text style={s.actionBtnTxt}>{nextAction.label}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// Styles are generated dynamically by createStyles(colors) above the KitchenScreen component.
