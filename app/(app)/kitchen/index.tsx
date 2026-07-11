import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  RefreshControl, ActivityIndicator, useWindowDimensions,
  TextInput, ScrollView, Platform, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ordersApi } from '@/api/orders';
import { useOrderBadgeStore } from '@/store/orderBadgeStore';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { Order, OrderStatus } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const KDS_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'served'];

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

// Stat card config (matches Coupons stats bar style)
const STAT_CARDS = [
  { key: 'pending',   label: 'Pending',    icon: 'time-outline'            as const, accent: '#f59e0b' },
  { key: 'inKitchen', label: 'In Kitchen', icon: 'flame-outline'           as const, accent: '#8b5cf6' },
  { key: 'ready',     label: 'Ready',      icon: 'checkmark-circle-outline' as const, accent: '#16a34a' },
  { key: 'completed', label: 'Done Today', icon: 'trophy-outline'          as const, accent: '#06b6d4' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNextAction(
  order: Order,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _isAdmin: boolean,
): { status: OrderStatus; label: string; color: string } | null {
  const isAgg = order.source === 'zomato' || order.source === 'swiggy';
  // Aggregator pending: handled by Accept/Reject buttons; non-agg skips confirmed entirely
  if (order.status === 'pending')   return isAgg ? null : { status: 'preparing', label: 'Start Preparing', color: '#0D76E1' };
  if (order.status === 'confirmed') return { status: 'preparing', label: 'Start Preparing', color: '#0D76E1' };
  if (order.status === 'preparing') return { status: 'ready',     label: 'Mark Ready',      color: '#10b981' };
  if (order.status === 'ready')     return { status: 'completed', label: 'Mark Completed',  color: '#16a34a' };
  if (order.status === 'served')    return { status: 'completed', label: 'Mark Completed',  color: '#16a34a' };
  return null;
}

function formatDateTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' });
  const h = d.getHours();
  return `${pad(d.getDate())} ${mon}, ${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
}

function elapsedMins(created_at?: string) {
  if (!created_at) return 0;
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    shell: { flex: 1, backgroundColor: c.background },

    // Error banner
    errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderBottomWidth: 1, borderBottomColor: '#fecaca', paddingHorizontal: 14, paddingVertical: 9 },
    errText:   { flex: 1, fontSize: 12.5, color: '#dc2626' },
    retryBtn:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: '#dc2626' },
    retryTxt:  { fontSize: 12, fontWeight: '700', color: '#fff' },

    // ── Page header (Inventory style) ───────────────────
    topbar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle:   { fontSize: 18, fontWeight: '800', color: c.heading },
    pageSub:     { fontSize: 11, color: c.textMuted, marginTop: 1 },
    refreshBtn:  { width: 34, height: 34, borderRadius: 10, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },

    // ── Stats bar (Coupons parity) ───────────────────────
    statsBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    statItem:    { flex: 1, alignItems: 'center', gap: 1 },
    statIcon:    { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
    statVal:     { fontSize: 14, fontWeight: '800' },
    statLbl:     { fontSize: 9, color: c.textMuted, textAlign: 'center' },
    statDivider: { width: 1, height: 28, backgroundColor: c.border },

    // ── Filter bar ──────────────────────────────────────
    filterBar:   { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: 10, gap: 8 },
    chipsScroll: { paddingHorizontal: 12, gap: 7 },
    chip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
    chipTxt:     { fontSize: 12, fontWeight: '700', color: c.text },
    chipBadge:   { backgroundColor: c.border, borderRadius: 999, minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, alignItems: 'center' },
    chipBadgeTxt:{ fontSize: 10, fontWeight: '700', color: c.text },

    // ── Search ──────────────────────────────────────────
    searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, backgroundColor: c.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: c.border },
    searchInput: { flex: 1, fontSize: 13, color: c.heading },

    // ── Grid ────────────────────────────────────────────
    listContent: { padding: 10, gap: 10, flexGrow: 1 },
    colWrap:     { gap: 10, alignItems: 'stretch' },

    // ── Card (Coupons card shell) ───────────────────────
    card:        { backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: c.brand, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    cardUrgent:  { borderLeftColor: '#ef4444' },
    cardAccent:  { display: 'none' },

    // Card header
    cardHead:     { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: c.border, marginBottom: 10 },
    cardHeadL:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    cardAvatar:   { width: 34, height: 34, borderRadius: 9, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    cardCustomer: { fontSize: 14, fontWeight: '800', color: c.heading },
    cardOrderType:{ fontSize: 11, color: c.textMuted, marginTop: 2 },
    cardHeadR:    { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
    orderNumBadge:{ backgroundColor: '#fefce8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#fef08a' },
    orderNumTxt:  { fontSize: 12, fontWeight: '900', color: c.heading, letterSpacing: 0.5 },
    srcBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
    srcBadgeTxt:  { fontSize: 10, fontWeight: '800' },
    extId:        { fontSize: 10, color: c.sidebarTextMuted },

    // Timer badge (elapsed time)
    timerBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    timerTxt:     { fontSize: 10.5, fontWeight: '700' },

    // Card info row
    cardInfo:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    cardInfoLbl:  { fontSize: 12, color: c.text, fontWeight: '600' },
    cardInfoDate: { fontSize: 11, color: c.textMuted },

    // Items
    cardBody:  { gap: 6 },
    noItems:   { fontSize: 12, color: '#f59e0b', fontStyle: 'italic' },
    itemRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    itemDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981', flexShrink: 0 },
    itemName:  { flex: 1, fontSize: 13, color: c.heading, lineHeight: 18 },
    itemMeta:  { fontSize: 12, color: c.text, flexShrink: 0 },
    addons:    { fontSize: 11, color: c.textMuted, paddingLeft: 15 },
    totalRow:  { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 7, marginTop: 4 },
    totalLabel:{ fontSize: 12.5, fontWeight: '600', color: c.text },
    totalVal:  { fontSize: 12.5, fontWeight: '700', color: c.heading },

    // Info boxes
    infoBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: c.surfaceAlt, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, marginTop: 4 },
    infoBoxTxt:{ flex: 1, fontSize: 11.5, color: c.text, lineHeight: 16 },
    notesBox:  { backgroundColor: '#fffbeb' },
    notesTxt:  { color: '#92400e', fontStyle: 'italic' },

    // Footer
    cardFoot:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, gap: 6 },
    statusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
    statusDot:  { width: 7, height: 7, borderRadius: 4 },
    statusTxt:  { fontSize: 11.5, fontWeight: '700' },
    actionRow:  { flexDirection: 'row', gap: 6, alignItems: 'center' },
    actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
    actionBtnTxt:{ fontSize: 12.5, fontWeight: '700', color: '#fff' },

    // Empty state
    empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
    emptyIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(107,114,128,0.1)', alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: c.textMuted },
    emptyText:  { fontSize: 13, color: c.border, textAlign: 'center' },
  });
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function KitchenScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshVersion = useOrderBadgeStore((s) => s.refreshVersion);
  const prevFocusedRef = useRef(false);
  const isFocused = useIsFocused();

  const numCols  = width >= 1440 ? 3 : width >= 880 ? 2 : 1;
  const isMobile = width < 640;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await ordersApi.list({ per_page: 100, status: KDS_STATUSES.join(','), from: today, to: today });
      const raw = res.data?.data ?? res.data ?? [];
      const kitchen: Order[] = (Array.isArray(raw) ? raw : []).sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
      setOrders(kitchen);
      try {
        const doneRes = await ordersApi.list({ per_page: 1, status: 'completed', from: today, to: today });
        setCompletedToday(doneRes.data?.total ?? 0);
      } catch { /* non-critical */ }
    } catch (e: any) {
      if (!silent) setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load kitchen orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 10000);
    tickRef.current = setInterval(() => setTick(t => t + 1), 60000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (isFocused && !prevFocusedRef.current) load(true);
    prevFocusedRef.current = isFocused;
  }, [isFocused, load]);

  useEffect(() => {
    if (refreshVersion === 0) return;
    load(true);
  }, [refreshVersion, load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(true);
    });
    return () => sub.remove();
  }, [load]);

  async function handleStatus(order: Order, newStatus: OrderStatus) {
    setActionLoading(p => ({ ...p, [order.id]: true }));
    try {
      if (newStatus === 'completed') {
        await ordersApi.complete(order.id, order.payment_method ?? 'cash');
      } else {
        await ordersApi.updateStatus(order.id, newStatus);
      }
      let next: Order[];
      if (newStatus === 'completed' || newStatus === 'cancelled') {
        next = orders.filter(o => o.id !== order.id);
        setOrders(next);
        if (newStatus === 'completed') setCompletedToday(c => c + 1);
      } else {
        next = orders.map(o => o.id === order.id ? { ...o, status: newStatus } : o);
        setOrders(next);
      }
      // Push updated counts to badge store immediately (don't wait for next poll)
      const KDS_ACTIVE: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];
      useOrderBadgeStore.getState().update(
        next.filter(o => o.status === 'pending').length,
        next.filter(o => KDS_ACTIVE.includes(o.status)).length,
      );
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Failed to update status');
      setTimeout(() => setError(''), 4000);
      load(true);
    } finally {
      setActionLoading(p => ({ ...p, [order.id]: false }));
    }
  }

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

  const counts = {
    pending:   orders.filter(o => o.status === 'pending').length,
    inKitchen: orders.filter(o => o.status === 'confirmed' || o.status === 'preparing').length,
    ready:     orders.filter(o => o.status === 'ready' || o.status === 'served').length,
    completed: completedToday,
  };

  if (loading) {
    return (
      <View style={[s.shell, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#1A2B1A', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Ionicons name="restaurant-outline" size={26} color="#fff" />
        </View>
        <ActivityIndicator size="large" color="#1A2B1A" />
        <Text style={{ color: colors.textMuted, marginTop: 10, fontSize: 13 }}>Loading kitchen orders…</Text>
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

      {/* ── Page header ─────────────────────────────────── */}
      <View style={[s.topbar, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Kitchen</Text>
          <Text style={s.pageSub}>{filtered.length} orders · Live kitchen display</Text>
        </View>
        <Pressable
          onPress={() => { setRefreshing(true); load(); }}
          style={({ pressed }) => [s.refreshBtn, (loading || refreshing || pressed) && { opacity: 0.6 }]}
          disabled={loading || refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <Ionicons name="refresh-outline" size={17} color={colors.text} />}
        </Pressable>
      </View>

      {/* ── Stats bar (Coupons style) ───────────────────── */}
      <View style={s.statsBar}>
        {STAT_CARDS.map((card, i) => (
          <React.Fragment key={card.key}>
            {i > 0 && <View style={s.statDivider} />}
            <View style={s.statItem}>
              <View style={[s.statIcon, { backgroundColor: card.accent + '18' }]}>
                <Ionicons name={card.icon} size={14} color={card.accent} />
              </View>
              <Text style={[s.statVal, { color: card.accent }]}>{counts[card.key]}</Text>
              <Text style={s.statLbl}>{card.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* ── Filter bar ───────────────────────────────────── */}
      <View style={s.filterBar}>
        {/* Source chips — always horizontal scroll (no wrap/clip issues) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.chipsScroll, { flexDirection: 'row' }]}
        >
          {(['all', 'pos', 'zomato', 'swiggy', 'qr'] as const).map(src => {
            const cfg = src !== 'all' ? SOURCE_CFG[src] : null;
            const active = srcFilter === src;
            const cnt = src === 'all'
              ? orders.length
              : orders.filter(o => (o.source ?? 'pos') === src).length;
            return (
              <Pressable
                key={src}
                style={({ pressed }) => [
                  s.chip,
                  active && { backgroundColor: cfg?.color ?? '#1A2B1A', borderColor: cfg?.color ?? '#1A2B1A' },
                  pressed && { opacity: 0.75 },
                ]}
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
        </ScrollView>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search" size={14} color={colors.placeholder} />
          <TextInput
            style={s.searchInput}
            placeholder="Search orders, items, tables…"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.placeholder}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color={colors.placeholder} />
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
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 12 }]}
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
            isLoading={!!actionLoading[item.id]}
            onAction={handleStatus}
            s={s}
          />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="restaurant-outline" size={34} color="#9ca3af" />
            </View>
            <Text style={s.emptyTitle}>
              {search ? 'No orders matched' : 'Kitchen is clear'}
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

// ─── KitchenCard ─────────────────────────────────────────────────────────────

function KitchenCard({ order, numCols, isLoading, onAction, s }: {
  order: Order;
  numCols: number;
  isLoading: boolean;
  onAction: (order: Order, status: OrderStatus) => void;
  s: ReturnType<typeof createStyles>;
}) {
  const { colors: c } = useTheme();
  const src = order.source ?? 'pos';
  const srcCfg = SOURCE_CFG[src as keyof typeof SOURCE_CFG] ?? SOURCE_CFG.pos;
  const isAgg = src === 'zomato' || src === 'swiggy';
  const elapsed = elapsedMins(order.created_at);
  const isUrgent = elapsed >= 15;
  const statusColor = STATUS_COLORS[order.status] ?? '#6b7280';
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;
  const nextAction = getNextAction(order, false);
  const showAcceptReject = order.status === 'pending' && isAgg;
  const orderTotal = (order.items ?? []).reduce((s, i) => s + (Number(i.unit_price) || 0) * (i.quantity || 1), 0);
  const hasTotal = isAgg && orderTotal > 0;

  const timerColor = isUrgent ? '#ef4444' : elapsed >= 10 ? '#f59e0b' : '#6b7280';

  return (
    <View style={[s.card, numCols > 1 && { flex: 1 }, isUrgent && s.cardUrgent]}>

      {/* ── Card header ─────────────────────────────────── */}
      <View style={s.cardHead}>
        <View style={s.cardHeadL}>
          <View style={s.cardAvatar}>
            <Ionicons
              name={isAgg ? 'bicycle-outline' : 'person-outline'}
              size={16}
              color={c.textMuted}
            />
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
            <Text style={s.orderNumTxt}>#{order.order_number}</Text>
          </View>
          {/* Elapsed timer */}
          <View style={[s.timerBadge, { backgroundColor: timerColor + '20', borderColor: timerColor + '50' }]}>
            <Ionicons name="alarm-outline" size={10} color={timerColor} />
            <Text style={[s.timerTxt, { color: timerColor }]}>{elapsed}m</Text>
          </View>
          {isAgg && (
            <View style={[s.srcBadge, { backgroundColor: srcCfg.bg, borderColor: srcCfg.color + '40' }]}>
              <Text style={[s.srcBadgeTxt, { color: srcCfg.color }]}>{srcCfg.label}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Table / datetime ─────────────────────────────── */}
      <View style={s.cardInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={isAgg ? 'bicycle-outline' : 'grid-outline'} size={11} color={s.cardInfoLbl.color} />
          <Text style={s.cardInfoLbl}>
            {isAgg ? 'Delivery' : order.table_name ? `Table: ${order.table_name}` : '–'}
          </Text>
        </View>
        <Text style={s.cardInfoDate}>{formatDateTime(order.created_at)}</Text>
      </View>

      {/* ── Items ────────────────────────────────────────── */}
      <View style={s.cardBody}>
        {(order.items ?? []).length === 0 ? (
          <Text style={s.noItems}>Items not loaded</Text>
        ) : (order.items ?? []).map((item, idx) => (
          <View key={idx} style={s.itemRow}>
            <View style={s.itemDot} />
            <Text style={s.itemName} numberOfLines={2}>
              {item.item_name ?? item.name ?? ''}
              {item.variation ? ` · ${item.variation}` : ''}
            </Text>
            <Text style={s.itemMeta}>
              ×{item.quantity}
              {item.unit_price ? ` · ₹${Number(item.unit_price).toFixed(0)}` : ''}
            </Text>
          </View>
        ))}

        {(order.items ?? []).map((item, idx) =>
          item.addons?.length ? (
            <Text key={`adn-${idx}`} style={s.addons}>+ {item.addons.map(a => a.name).join(', ')}</Text>
          ) : null
        )}

        {hasTotal && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Order Total</Text>
            <Text style={s.totalVal}>₹{orderTotal.toFixed(2)}</Text>
          </View>
        )}

        {isAgg && order.delivery_address ? (
          <View style={s.infoBox}>
            <Ionicons name="location-outline" size={11} color="#6b7280" />
            <Text style={s.infoBoxTxt} numberOfLines={2}>{order.delivery_address}</Text>
          </View>
        ) : null}

        {order.notes ? (
          <View style={[s.infoBox, s.notesBox]}>
            <Ionicons name="information-circle-outline" size={11} color="#92400e" />
            <Text style={[s.infoBoxTxt, s.notesTxt]} numberOfLines={3}>
              Notes: {order.notes}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Footer ───────────────────────────────────────── */}
      <View style={s.cardFoot}>
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
            <Pressable
              style={({ pressed }) => [s.actionBtn, { backgroundColor: nextAction.color }, pressed && { opacity: 0.75 }]}
              onPress={() => onAction(order, nextAction.status)}
            >
              <Text style={s.actionBtnTxt}>{nextAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
