import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, useWindowDimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ordersApi } from '@/api/orders';
import { useAppStore } from '@/store/appStore';
import type { Order, OrderStatus, AggregatorAction } from '@/types';

const SOURCE_CFG = {
  pos:    { label: 'POS',    color: '#1A2B1A', bg: 'rgba(26,43,26,0.1)',    icon: 'cart-outline'      as const },
  zomato: { label: 'Zomato', color: '#d00000', bg: 'rgba(208,0,0,0.1)',     icon: 'bicycle-outline'   as const },
  swiggy: { label: 'Swiggy', color: '#fc8019', bg: 'rgba(252,128,25,0.1)',  icon: 'storefront-outline' as const },
  qr:     { label: 'QR',     color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  icon: 'qr-code-outline'   as const },
};

const KDS_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];
const STATUS_ADVANCE: Partial<Record<OrderStatus, OrderStatus>> = {
  pending:   'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready:     'served',
};
const STATUS_COLORS: Record<string, string> = {
  pending:   '#f59e0b',
  confirmed: '#3b82f6',
  preparing: '#8b5cf6',
  ready:     '#10b981',
  served:    '#6b7280',
};
const KDS_SOURCE_FILTERS = ['all', 'pos', 'zomato', 'swiggy', 'qr'] as const;

function elapsed(created_at?: string): string {
  if (!created_at) return '';
  const mins = Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function elapsedMins(created_at?: string): number {
  if (!created_at) return 0;
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
}

export default function KitchenScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<typeof KDS_SOURCE_FILTERS[number]>('all');
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const { isOnline } = useAppStore();
  const { width } = useWindowDimensions();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await ordersApi.list({ status: KDS_STATUSES.join(','), per_page: 100 });
      const data = res.data?.data ?? res.data ?? [];
      setOrders(Array.isArray(data) ? data : []);
    } catch { /* offline: keep stale */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 30s for live KDS
    pollRef.current = setInterval(() => { setTick(t => t + 1); load(true); }, 30000);
    // Tick counter for elapsed time
    const tickInterval = setInterval(() => setTick(t => t + 1), 60000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(tickInterval);
    };
  }, []);

  async function updateStatus(order: Order, newStatus: OrderStatus) {
    setActionLoading(p => ({ ...p, [order.id]: true }));
    try {
      await ordersApi.updateStatus(order.id, newStatus);
      await load(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to update status');
    } finally {
      setActionLoading(p => ({ ...p, [order.id]: false }));
    }
  }

  async function handleAggregatorAction(order: Order, action: AggregatorAction) {
    const labels = { accept: 'Accept', reject: 'Reject', ready: 'Mark Ready' };
    Alert.alert(`${labels[action]} Order`, `${labels[action]} order #${order.order_number} on ${order.source?.toUpperCase()}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: labels[action],
        style: action === 'reject' ? 'destructive' : 'default',
        onPress: async () => {
          setActionLoading(p => ({ ...p, [order.id]: true }));
          try {
            // Status mapping: accept→confirmed, reject→cancelled, ready→ready
            const statusMap: Record<AggregatorAction, OrderStatus> = { accept: 'confirmed', reject: 'cancelled', ready: 'ready' };
            await ordersApi.updateStatus(order.id, statusMap[action]);
            await load(true);
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message ?? 'Failed');
          } finally {
            setActionLoading(p => ({ ...p, [order.id]: false }));
          }
        },
      },
    ]);
  }

  const displayed = orders.filter(o =>
    (sourceFilter === 'all' || (o.source ?? 'pos') === sourceFilter)
  );

  // Group orders into columns by status for KDS board
  const byStatus: Record<string, Order[]> = {};
  KDS_STATUSES.forEach(s => { byStatus[s] = []; });
  displayed.forEach(o => {
    if (byStatus[o.status]) byStatus[o.status].push(o);
  });

  const cols = width >= 1200 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const shownStatuses = cols === 1 ? ['pending', 'preparing'] : KDS_STATUSES;

  if (loading) {
    return (
      <View style={[st.shell, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#0f8f73" />
        <Text style={{ color: '#6b7280', marginTop: 10, fontSize: 14 }}>Loading kitchen orders...</Text>
      </View>
    );
  }

  return (
    <View style={st.shell}>
      {/* Header bar */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <View style={st.headerIcon}>
            <Ionicons name="flame" size={18} color="#f59e0b" />
          </View>
          <View>
            <Text style={st.headerTitle}>Kitchen Display</Text>
            <Text style={st.headerSub}>{displayed.length} active orders · auto-refresh 30s</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 10 }}>
          {KDS_SOURCE_FILTERS.map(s => {
            const cfg = s !== 'all' ? SOURCE_CFG[s] : null;
            const active = sourceFilter === s;
            const count = s === 'all' ? orders.length : orders.filter(o => (o.source ?? 'pos') === s).length;
            return (
              <TouchableOpacity key={s} style={[st.srcChip, active && { backgroundColor: cfg?.color ?? '#1A2B1A', borderColor: cfg?.color ?? '#1A2B1A' }]} onPress={() => setSourceFilter(s)}>
                {cfg && <Ionicons name={cfg.icon} size={12} color={active ? '#fff' : cfg.color} />}
                <Text style={[st.srcChipText, active && { color: '#fff' }]}>{s === 'all' ? 'All' : cfg?.label}</Text>
                <View style={[st.srcCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[st.srcCountText, active && { color: '#fff' }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* KDS board */}
      <ScrollView
        horizontal={cols > 1}
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#0f8f73" />}
      >
        <View style={{ flexDirection: 'row', flex: 1, gap: 1, minWidth: cols > 1 ? cols * 280 : undefined }}>
          {(shownStatuses as OrderStatus[]).map(status => (
            <View key={status} style={[st.col, { minWidth: cols > 1 ? 280 : undefined, flex: cols === 1 ? 1 : undefined }]}>
              {/* Column header */}
              <View style={[st.colHeader, { borderBottomColor: STATUS_COLORS[status] }]}>
                <View style={[st.colDot, { backgroundColor: STATUS_COLORS[status] }]} />
                <Text style={[st.colTitle, { color: STATUS_COLORS[status] }]}>{status.toUpperCase()}</Text>
                <View style={[st.colCount, { backgroundColor: STATUS_COLORS[status] + '20' }]}>
                  <Text style={[st.colCountText, { color: STATUS_COLORS[status] }]}>{byStatus[status].length}</Text>
                </View>
              </View>

              {/* Orders in column */}
              <ScrollView style={st.colScroll} showsVerticalScrollIndicator={false}>
                {byStatus[status].length === 0 ? (
                  <View style={st.emptyCol}>
                    <Ionicons name="checkmark-circle-outline" size={24} color="#d1d5db" />
                    <Text style={st.emptyColText}>All clear</Text>
                  </View>
                ) : (
                  byStatus[status].map(order => (
                    <KDSCard
                      key={order.id}
                      order={order}
                      isLoading={!!actionLoading[order.id]}
                      onAdvance={updateStatus}
                      onAggregator={handleAggregatorAction}
                      tick={tick}
                    />
                  ))
                )}
              </ScrollView>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function KDSCard({ order, isLoading, onAdvance, onAggregator, tick }: {
  order: Order;
  isLoading: boolean;
  onAdvance: (o: Order, s: OrderStatus) => void;
  onAggregator: (o: Order, a: AggregatorAction) => void;
  tick: number;
}) {
  const src = order.source ?? 'pos';
  const srcCfg = SOURCE_CFG[src as keyof typeof SOURCE_CFG] ?? SOURCE_CFG.pos;
  const mins = elapsedMins(order.created_at);
  const isUrgent = mins >= 15;
  const isAggregator = src === 'zomato' || src === 'swiggy';
  const nextStatus = STATUS_ADVANCE[order.status];

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isUrgent) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])).start();
    }
  }, [isUrgent]);

  return (
    <View style={[st.card, isUrgent && st.cardUrgent]}>
      {/* Card header */}
      <View style={st.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={st.cardOrderNum}>#{order.order_number}</Text>
            <View style={[st.srcBadge, { backgroundColor: srcCfg.bg }]}>
              <Ionicons name={srcCfg.icon} size={10} color={srcCfg.color} />
              <Text style={[st.srcBadgeText, { color: srcCfg.color }]}>{srcCfg.label}</Text>
            </View>
            {order.order_type === 'delivery' && (
              <View style={[st.srcBadge, { backgroundColor: 'rgba(124,58,237,0.1)' }]}>
                <Text style={[st.srcBadgeText, { color: '#7c3aed' }]}>DELIVERY</Text>
              </View>
            )}
          </View>
          {order.table_name && (
            <Text style={st.cardTable}>Table: {order.table_name}</Text>
          )}
          {order.customer_name && (
            <Text style={st.cardCustomer}>{order.customer_name}</Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Animated.View style={{ opacity: isUrgent ? pulseAnim : 1 }}>
            <Text style={[st.cardElapsed, isUrgent && st.cardElapsedUrgent]}>{elapsed(order.created_at)}</Text>
          </Animated.View>
          {mins > 0 && (
            <View style={[st.timerBadge, { backgroundColor: isUrgent ? '#fef2f2' : '#f0fdf4' }]}>
              <Ionicons name="timer-outline" size={10} color={isUrgent ? '#ef4444' : '#10b981'} />
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: isUrgent ? '#ef4444' : '#10b981' }}>{mins}m</Text>
            </View>
          )}
        </View>
      </View>

      {/* Items */}
      <View style={st.cardItems}>
        {order.items?.map((item, idx) => (
          <View key={idx} style={st.cardItem}>
            <View style={st.cardItemQty}>
              <Text style={st.cardItemQtyText}>{item.quantity}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.cardItemName}>{item.name}</Text>
              {item.variation && <Text style={st.cardItemVar}>{item.variation}</Text>}
              {item.addons && item.addons.length > 0 && (
                <Text style={st.cardItemAddons}>+ {item.addons.map(a => a.name).join(', ')}</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Delivery address for aggregator orders */}
      {isAggregator && order.delivery_address && (
        <View style={st.deliveryRow}>
          <Ionicons name="location-outline" size={13} color="#6b7280" />
          <Text style={st.deliveryText} numberOfLines={2}>{order.delivery_address}</Text>
        </View>
      )}

      {/* Notes */}
      {order.notes && (
        <View style={st.notesRow}>
          <Ionicons name="document-text-outline" size={12} color="#6b7280" />
          <Text style={st.notesText} numberOfLines={2}>{order.notes}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={st.cardActions}>
        {isLoading ? (
          <ActivityIndicator color="#0f8f73" size="small" style={{ flex: 1, alignSelf: 'center' }} />
        ) : isAggregator && order.status === 'pending' ? (
          // Aggregator pending: show Accept / Reject
          <>
            <TouchableOpacity style={[st.actionBtn, st.actionAccept]} onPress={() => onAggregator(order, 'accept')}>
              <Ionicons name="checkmark" size={14} color="#fff" />
              <Text style={st.actionBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.actionBtn, st.actionReject]} onPress={() => onAggregator(order, 'reject')}>
              <Ionicons name="close" size={14} color="#fff" />
              <Text style={st.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          </>
        ) : isAggregator && order.status === 'preparing' ? (
          // Aggregator preparing: show Mark Ready
          <>
            <TouchableOpacity style={[st.actionBtn, st.actionReady]} onPress={() => onAggregator(order, 'ready')}>
              <Ionicons name="restaurant" size={14} color="#fff" />
              <Text style={st.actionBtnText}>Mark Ready</Text>
            </TouchableOpacity>
            {nextStatus && (
              <TouchableOpacity style={[st.actionBtn, { backgroundColor: '#f3f4f6', flex: 0, paddingHorizontal: 12 }]} onPress={() => onAdvance(order, nextStatus)}>
                <Text style={[st.actionBtnText, { color: '#374151' }]}>{nextStatus}</Text>
              </TouchableOpacity>
            )}
          </>
        ) : nextStatus ? (
          // POS/QR orders: advance status button
          <TouchableOpacity style={[st.actionBtn, { backgroundColor: STATUS_COLORS[nextStatus] ?? '#1A2B1A' }]} onPress={() => onAdvance(order, nextStatus)}>
            <Ionicons name="arrow-forward-circle" size={14} color="#fff" />
            <Text style={st.actionBtnText}>Mark {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexWrap: 'wrap' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 },
  headerIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fed7aa' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 11, color: '#6b7280', marginTop: 1 },

  srcChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  srcChipText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  srcCount: { backgroundColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  srcCountText: { fontSize: 10, fontWeight: '700', color: '#374151' },

  col: { backgroundColor: '#f8f9fa', borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  colHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 2 },
  colDot: { width: 10, height: 10, borderRadius: 5 },
  colTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, flex: 1 },
  colCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  colCountText: { fontSize: 12, fontWeight: '800' },
  colScroll: { flex: 1, padding: 8 },

  emptyCol: { alignItems: 'center', paddingTop: 30, gap: 6 },
  emptyColText: { fontSize: 13, color: '#d1d5db', fontWeight: '500' },

  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardUrgent: { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  cardOrderNum: { fontSize: 15, fontWeight: '800', color: '#111827' },
  cardTable: { fontSize: 11.5, color: '#6b7280', marginTop: 3, fontWeight: '500' },
  cardCustomer: { fontSize: 11.5, color: '#374151', fontWeight: '600', marginTop: 2 },
  cardElapsed: { fontSize: 11.5, color: '#6b7280', fontWeight: '600', textAlign: 'right' },
  cardElapsedUrgent: { color: '#ef4444', fontWeight: '800' },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 3 },

  srcBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  srcBadgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },

  cardItems: { gap: 6, marginBottom: 8 },
  cardItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardItemQty: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  cardItemQtyText: { fontSize: 12, fontWeight: '800', color: '#374151' },
  cardItemName: { fontSize: 13.5, fontWeight: '600', color: '#111827', lineHeight: 18 },
  cardItemVar: { fontSize: 11, color: '#C9A52A', fontWeight: '500', marginTop: 1 },
  cardItemAddons: { fontSize: 10.5, color: '#6b7280', marginTop: 1 },

  deliveryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: '#f0f4ff', borderRadius: 7, padding: 7, marginBottom: 6 },
  deliveryText: { fontSize: 11, color: '#374151', flex: 1, lineHeight: 15 },

  notesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: '#fffbeb', borderRadius: 7, padding: 7, marginBottom: 6 },
  notesText: { fontSize: 11, color: '#92400e', flex: 1, fontStyle: 'italic', lineHeight: 15 },

  cardActions: { flexDirection: 'row', gap: 6, marginTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
  actionAccept: { backgroundColor: '#10b981' },
  actionReject: { backgroundColor: '#ef4444' },
  actionReady:  { backgroundColor: '#0f8f73' },
  actionBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
});
