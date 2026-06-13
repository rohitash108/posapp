import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ordersApi } from '@/api/orders';
import type { Order, OrderStatus } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const KDS_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];

const STATUS_COLORS: Record<string, string> = {
  pending:   '#f59e0b',
  confirmed: '#3b82f6',
  preparing: '#8b5cf6',
  ready:     '#10b981',
};
const STATUS_LABELS: Record<string, string> = {
  pending:   'Pending',
  confirmed: 'In Kitchen',
  preparing: 'Preparing',
  ready:     'Ready',
};

const SOURCE_CFG = {
  pos:    { label: 'POS',    color: '#1A2B1A', bg: 'rgba(26,43,26,0.12)'   },
  zomato: { label: 'Zomato', color: '#d00000', bg: 'rgba(208,0,0,0.1)'     },
  swiggy: { label: 'Swiggy', color: '#fc8019', bg: 'rgba(252,128,25,0.1)'  },
  qr:     { label: 'QR',     color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// csPos status flow:
// - POS/QR  pending|confirmed → Start Preparing → preparing → Mark Ready → ready → Mark Completed → completed
// - Aggregator pending        → Accept (→ confirmed) or Reject (→ cancelled)
// - Aggregator confirmed+     → same as above from confirmed onward
function getNextAction(order: Order): { status: OrderStatus; label: string; color: string } | null {
  const isAgg = order.source === 'zomato' || order.source === 'swiggy';
  if (isAgg && order.status === 'pending') return null; // handled by Accept/Reject
  if (order.status === 'pending' || order.status === 'confirmed') {
    return { status: 'preparing', label: 'Start Preparing', color: '#0D76E1' };
  }
  if (order.status === 'preparing') {
    return { status: 'ready', label: 'Mark Ready', color: '#10b981' };
  }
  if (order.status === 'ready') {
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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function KitchenScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [srcFilter, setSrcFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [tick, setTick] = useState(0);
  const { width } = useWindowDimensions();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 3 cols on wide desktop, 2 on medium, 1 on mobile (sidebar is ~220px on desktop)
  const numCols = width >= 1440 ? 3 : width >= 880 ? 2 : 1;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await ordersApi.list({ status: KDS_STATUSES.join(','), per_page: 200 });
      const raw = res.data?.data ?? res.data ?? [];
      const all: Order[] = Array.isArray(raw) ? raw : [];
      setOrders(all.filter(o => (KDS_STATUSES as string[]).includes(o.status)));
    } catch { /* keep stale data when offline */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload on every navigation to this screen, poll every 15s for live updates
  useFocusEffect(useCallback(() => {
    load();
    pollRef.current = setInterval(() => load(true), 15000);
    tickRef.current = setInterval(() => setTick(t => t + 1), 60000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [load]));

  async function handleStatus(order: Order, newStatus: OrderStatus) {
    setActionLoading(p => ({ ...p, [order.id]: true }));
    try {
      await ordersApi.updateStatus(order.id, newStatus);
      // Optimistic update: remove completed/cancelled, update status otherwise
      if (newStatus === 'completed' || newStatus === 'cancelled') {
        setOrders(prev => prev.filter(o => o.id !== order.id));
      } else {
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: newStatus } : o));
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to update status');
      load(true); // re-sync on error
    } finally {
      setActionLoading(p => ({ ...p, [order.id]: false }));
    }
  }

  function confirmAction(order: Order, newStatus: OrderStatus, label: string) {
    Alert.alert(label, `${label} for order #${order.order_number}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, onPress: () => handleStatus(order, newStatus) },
    ]);
  }

  const filtered = orders.filter(o => srcFilter === 'all' || (o.source ?? 'pos') === srcFilter);
  const counts = {
    pending:   orders.filter(o => o.status === 'pending').length,
    inKitchen: orders.filter(o => o.status === 'confirmed' || o.status === 'preparing').length,
    ready:     orders.filter(o => o.status === 'ready').length,
  };

  if (loading) {
    return (
      <View style={[s.shell, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#1A2B1A" />
        <Text style={{ color: '#6b7280', marginTop: 10 }}>Loading kitchen orders…</Text>
      </View>
    );
  }

  return (
    <View style={s.shell}>

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headLeft}>
          <View style={s.headIcon}>
            <Ionicons name="flame" size={18} color="#f59e0b" />
          </View>
          <View>
            <Text style={s.headTitle}>Kitchen</Text>
            <Text style={s.headSub}>{filtered.length} active · refresh 15s</Text>
          </View>
        </View>

        {/* Pending | In Kitchen | Ready counts */}
        <View style={s.pillRow}>
          {([
            { label: 'Pending',    count: counts.pending,   color: '#f59e0b', bg: '#fffbeb', border: '#f59e0b40' },
            { label: 'In Kitchen', count: counts.inKitchen, color: '#8b5cf6', bg: '#f5f3ff', border: '#8b5cf640' },
            { label: 'Ready',      count: counts.ready,     color: '#10b981', bg: '#ecfdf5', border: '#10b98140' },
          ] as const).map(p => (
            <View key={p.label} style={[s.pill, { backgroundColor: p.bg, borderColor: p.border }]}>
              <Text style={[s.pillLabel, { color: '#374151' }]}>{p.label}</Text>
              <Text style={[s.pillCount, { color: p.color }]}>{p.count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Source filter ───────────────────────────────────── */}
      <View style={s.filterBar}>
        {(['all', 'pos', 'zomato', 'swiggy', 'qr'] as const).map(src => {
          const cfg = src !== 'all' ? SOURCE_CFG[src] : null;
          const active = srcFilter === src;
          const cnt = src === 'all' ? orders.length : orders.filter(o => (o.source ?? 'pos') === src).length;
          return (
            <TouchableOpacity
              key={src}
              style={[s.chip, active && { backgroundColor: cfg?.color ?? '#1A2B1A', borderColor: cfg?.color ?? '#1A2B1A' }]}
              onPress={() => setSrcFilter(src)}
            >
              <Text style={[s.chipText, active && { color: '#fff' }]}>
                {src === 'all' ? 'All' : cfg?.label}
              </Text>
              <View style={[s.chipBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={[s.chipBadgeText, active && { color: '#fff' }]}>{cnt}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
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
            tintColor="#1A2B1A"
          />
        }
        extraData={[actionLoading, tick]}
        renderItem={({ item }) => (
          <KitchenCard
            order={item}
            numCols={numCols}
            isLoading={!!actionLoading[item.id]}
            onConfirm={confirmAction}
          />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="restaurant-outline" size={52} color="#d1d5db" />
            <Text style={s.emptyTitle}>No orders in kitchen</Text>
            <Text style={s.emptyText}>New orders appear here automatically.</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function KitchenCard({ order, numCols, isLoading, onConfirm }: {
  order: Order;
  numCols: number;
  isLoading: boolean;
  onConfirm: (order: Order, status: OrderStatus, label: string) => void;
}) {
  const src = order.source ?? 'pos';
  const srcCfg = SOURCE_CFG[src as keyof typeof SOURCE_CFG] ?? SOURCE_CFG.pos;
  const isAgg = src === 'zomato' || src === 'swiggy';
  const isUrgent = elapsedMins(order.created_at) >= 15;
  const statusColor = STATUS_COLORS[order.status] ?? '#6b7280';
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;
  const nextAction = getNextAction(order);
  const showAcceptReject = isAgg && order.status === 'pending';

  return (
    <View style={[s.card, numCols > 1 && { flex: 1 }, isUrgent && s.cardUrgent]}>

      {/* ── Dark green header (matches csPos bg-gray card header) ── */}
      <View style={s.cardHead}>
        <View style={s.cardHeadLeft}>
          <View style={s.cardAvatar}>
            <Ionicons name="person-outline" size={16} color="rgba(255,255,255,0.8)" />
          </View>
          <View style={s.cardHeadInfo}>
            <Text style={s.cardCustomer} numberOfLines={1}>
              {order.customer_name || 'Walk-in'}
            </Text>
            <Text style={s.cardOrderType} numberOfLines={1}>
              {(order.order_type ?? 'dine_in').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </Text>
          </View>
        </View>
        <View style={s.cardHeadRight}>
          <View style={s.orderNumBadge}>
            <Text style={s.orderNumText}>#{order.order_number}</Text>
          </View>
          {src !== 'pos' && (
            <View style={[s.srcBadge, { backgroundColor: srcCfg.bg, borderColor: srcCfg.color + '40' }]}>
              <Text style={[s.srcBadgeText, { color: srcCfg.color }]}>{srcCfg.label}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Info: table + datetime ── */}
      <View style={s.cardInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={isAgg ? 'bicycle-outline' : 'grid-outline'} size={12} color="#6b7280" />
          <Text style={s.cardInfoLabel}>
            {isAgg
              ? 'Delivery'
              : order.table_name
                ? `Table: ${order.table_name}`
                : 'Takeaway'}
          </Text>
        </View>
        <Text style={s.cardInfoDate}>{formatDateTime(order.created_at)}</Text>
      </View>

      {/* ── Items list ── */}
      <View style={s.cardBody}>
        {(order.items ?? []).map((item, idx) => (
          <View key={idx} style={s.itemRow}>
            <View style={[s.itemDot, { backgroundColor: statusColor }]} />
            <Text style={s.itemName} numberOfLines={2}>
              {(item.item_name ?? item.name ?? '')}
              {item.variation ? ` · ${item.variation}` : ''}
            </Text>
            <Text style={s.itemMeta}>
              ×{item.quantity}
              {item.unit_price ? ` · ₹${Number(item.unit_price).toFixed(0)}` : ''}
            </Text>
          </View>
        ))}

        {/* Addons */}
        {(order.items ?? []).map((item, idx) =>
          item.addons && item.addons.length > 0 ? (
            <Text key={`adn-${idx}`} style={s.itemAddons}>
              + {item.addons.map(a => a.name).join(', ')}
            </Text>
          ) : null
        )}

        {/* Delivery address for aggregator orders */}
        {isAgg && order.delivery_address && (
          <View style={s.infoBox}>
            <Ionicons name="location-outline" size={11} color="#6b7280" />
            <Text style={s.infoBoxText} numberOfLines={2}>{order.delivery_address}</Text>
          </View>
        )}

        {/* Order notes */}
        {order.notes ? (
          <View style={[s.infoBox, s.notesBox]}>
            <Ionicons name="information-circle-outline" size={11} color="#92400e" />
            <Text style={[s.infoBoxText, s.notesText]} numberOfLines={3}>{order.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Footer: status badge + action buttons ── */}
      <View style={s.cardFoot}>
        <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        <View style={s.actionRow}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#1A2B1A" />
          ) : showAcceptReject ? (
            <>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#10b981' }]}
                onPress={() => onConfirm(order, 'confirmed', 'Accept Order')}
              >
                <Ionicons name="checkmark" size={13} color="#fff" />
                <Text style={s.actionBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#ef4444' }]}
                onPress={() => onConfirm(order, 'cancelled', 'Reject Order')}
              >
                <Ionicons name="close" size={13} color="#fff" />
                <Text style={s.actionBtnText}>Reject</Text>
              </TouchableOpacity>
            </>
          ) : nextAction ? (
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: nextAction.color }]}
              onPress={() => onConfirm(order, nextAction.status, nextAction.label)}
            >
              <Text style={s.actionBtnText}>{nextAction.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },

  // Header
  header: { backgroundColor: '#fff', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 8 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fed7aa' },
  headTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  headSub: { fontSize: 11, color: '#6b7280', marginTop: 1 },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  pillLabel: { fontSize: 11, fontWeight: '600' },
  pillCount: { fontSize: 17, fontWeight: '800' },

  // Source filter
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  chipBadge: { backgroundColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  chipBadgeText: { fontSize: 10, fontWeight: '700', color: '#374151' },

  // List / grid
  listContent: { padding: 10, gap: 10, flexGrow: 1 },
  colWrap: { gap: 10, alignItems: 'stretch' },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  cardUrgent: { borderColor: '#fca5a5' },

  // Card header — dark green like csPos bg-gray
  cardHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A2B1A', padding: 12, gap: 8 },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  cardAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardHeadInfo: { flex: 1, minWidth: 0 },
  cardCustomer: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
  cardOrderType: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  cardHeadRight: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  orderNumBadge: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  orderNumText: { fontSize: 11.5, fontWeight: '800', color: '#111827' },
  srcBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  srcBadgeText: { fontSize: 10, fontWeight: '800' },

  // Card info row
  cardInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  cardInfoLabel: { fontSize: 12, color: '#374151', fontWeight: '600' },
  cardInfoDate: { fontSize: 11, color: '#6b7280' },

  // Card body
  cardBody: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 1 },
  itemDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  itemName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827', lineHeight: 17 },
  itemMeta: { fontSize: 12, color: '#374151', fontWeight: '500', flexShrink: 0 },
  itemAddons: { fontSize: 11, color: '#6b7280', paddingLeft: 16 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: '#f0f4ff', borderRadius: 7, padding: 7, marginTop: 3 },
  infoBoxText: { flex: 1, fontSize: 11, color: '#374151', lineHeight: 15 },
  notesBox: { backgroundColor: '#fffbeb' },
  notesText: { color: '#92400e', fontStyle: 'italic' },

  // Card footer
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 6 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#9ca3af' },
  emptyText: { fontSize: 13, color: '#d1d5db', textAlign: 'center' },
});
