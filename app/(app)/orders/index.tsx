import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, useWindowDimensions, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getOrders, updateLocalOrderStatus, addToSyncQueue } from '@/database/repositories';
import { webGetOrders, webUpdateOrderStatus, webAddSyncQueue } from '@/utils/webDb';
import { ordersApi } from '@/api/orders';
import { Platform } from 'react-native';
import { syncService } from '@/sync/SyncService';
import { useAppStore } from '@/store/appStore';
import type { Order } from '@/types';

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  pending:   { color: '#d97706', bg: '#fef9ec', border: '#fcd34d', icon: 'time-outline',            label: 'Pending'   },
  confirmed: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', icon: 'checkmark-outline',       label: 'Confirmed' },
  preparing: { color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: 'flame-outline',           label: 'Preparing' },
  ready:     { color: '#0891b2', bg: '#ecfeff', border: '#67e8f9', icon: 'restaurant-outline',      label: 'Ready'     },
  served:    { color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', icon: 'checkmark-done-outline',  label: 'Served'    },
  completed: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: 'checkmark-circle-outline',label: 'Completed' },
  cancelled: { color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', icon: 'close-circle-outline',   label: 'Cancelled' },
};

const NEXT_STATUS: Record<string, string> = {
  pending: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'served', served: 'completed',
};

const ALL_STATUSES = ['all', 'pending', 'confirmed', 'preparing', 'ready', 'served', 'completed'];

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const { isOnline } = useAppStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const load = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        const res = await ordersApi.list();
        const data = res.data?.data ?? res.data ?? [];
        setOrders(Array.isArray(data) ? data : []);
      } catch {
        // Offline — load from IndexedDB
        setOrders(await webGetOrders(100));
      }
    } else {
      setOrders(await getOrders(100));
    }
  }, []);
  useEffect(() => { load(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try { if (isOnline) await syncService.manualSync(); } catch {}
    await load();
    setRefreshing(false);
  }

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      if (isOnline) {
        await ordersApi.updateStatus(order.id, next);
      } else {
        if (Platform.OS === 'web') {
          await webUpdateOrderStatus(String(order.id), next);
          await webAddSyncQueue({ id: `status-${order.id}-${Date.now()}`, action: 'update_status', payload: JSON.stringify({ order_id: order.id, status: next }), created_at: new Date().toISOString() });
        } else {
          await updateLocalOrderStatus(order.id, next);
          await addToSyncQueue({ id: `status-${order.id}-${Date.now()}`, action: 'update_status', payload: JSON.stringify({ order_id: order.id, status: next }), created_at: new Date().toISOString() });
        }
      }
      await load();
    } catch (e) { console.warn(e); }
  }

  const filtered = activeFilter === 'all' ? orders : orders.filter(o => o.status === activeFilter);

  const OrderCard = ({ o }: { o: Order }) => {
    const cfg = STATUS_CONFIG[o.status] ?? { color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0', icon: 'ellipse-outline', label: o.status };
    return (
      <View style={[cs.card, { borderLeftColor: cfg.color }, isDesktop && cs.cardDesktop]}>
        {/* Card top */}
        <View style={cs.cardTop}>
          <View style={cs.orderMeta}>
            <Text style={cs.orderNum}>#{o.order_number ?? '—'}</Text>
            <View style={[cs.typeBadge, { backgroundColor: '#F1F5F9' }]}>
              <Text style={cs.typeText}>{o.order_type?.replace('_', ' ').toUpperCase() ?? 'DINE IN'}</Text>
            </View>
          </View>
          <View style={[cs.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
            <Text style={[cs.statusText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
          </View>
        </View>

        {/* Items list */}
        <View style={cs.itemsList}>
          {o.items?.slice(0, 3).map((item, idx) => (
            <View key={idx} style={cs.itemRow}>
              <View style={[cs.qtyBubble, { backgroundColor: cfg.bg }]}>
                <Text style={[cs.qtyText, { color: cfg.color }]}>{item.quantity}</Text>
              </View>
              <Text style={cs.itemName} numberOfLines={1}>{item.name}</Text>
            </View>
          ))}
          {(o.items?.length ?? 0) > 3 && (
            <Text style={cs.moreItems}>+{o.items.length - 3} more items</Text>
          )}
        </View>

        {/* Card footer */}
        <View style={cs.cardFooter}>
          <View>
            <Text style={cs.totalAmt}>₹{o.total?.toFixed(2)}</Text>
            <Text style={cs.timeText}>
              <Ionicons name="time-outline" size={11} color="#94A3B8" />
              {' '}{o.created_at ? format(new Date(o.created_at), 'hh:mm a, dd MMM') : ''}
            </Text>
          </View>
          {NEXT_STATUS[o.status] && (
            <TouchableOpacity style={cs.advBtn} onPress={() => advanceStatus(o)} activeOpacity={0.8}>
              <Text style={cs.advBtnText}>→ {NEXT_STATUS[o.status]}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={cs.container}>
      {/* Filter bar */}
      <View style={cs.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.filterContent}>
          {ALL_STATUSES.map((s) => {
            const count = s === 'all' ? orders.length : orders.filter(o => o.status === s).length;
            const isActive = activeFilter === s;
            const cfg = STATUS_CONFIG[s];
            return (
              <TouchableOpacity
                key={s}
                style={[cs.filterTab, isActive && cs.filterTabActive, isActive && cfg && { borderColor: cfg.color }]}
                onPress={() => setActiveFilter(s)}
                activeOpacity={0.8}
              >
                {s !== 'all' && cfg && <View style={[cs.filterDot, { backgroundColor: isActive ? cfg.color : '#CBD5E1' }]} />}
                <Text style={[cs.filterLabel, isActive && cs.filterLabelActive, isActive && cfg && { color: cfg.color }]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
                <View style={[cs.countBubble, isActive && cfg ? { backgroundColor: cfg.color + '20' } : {}]}>
                  <Text style={[cs.countText, isActive && cfg ? { color: cfg.color } : {}]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(o) => String(o.id)}
        numColumns={isDesktop ? 2 : 1}
        key={isDesktop ? 'desktop' : 'mobile'}
        columnWrapperStyle={isDesktop ? cs.desktopRow : undefined}
        contentContainerStyle={cs.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#C9A52A" />}
        renderItem={({ item: o }) => <OrderCard o={o} />}
        ListEmptyComponent={
          <View style={cs.empty}>
            <View style={cs.emptyIcon}>
              <Ionicons name="receipt-outline" size={36} color="#CBD5E1" />
            </View>
            <Text style={cs.emptyTitle}>No orders found</Text>
            <Text style={cs.emptyText}>
              {activeFilter === 'all' ? 'Pull to refresh and sync from server' : `No ${activeFilter} orders right now`}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F4' },

  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', gap: 5 },
  filterTabActive: { backgroundColor: '#fff' },
  filterDot: { width: 6, height: 6, borderRadius: 3 },
  filterLabel: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  filterLabelActive: { fontWeight: '700' },
  countBubble: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  countText: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },

  list: { padding: 12, paddingBottom: 32, flexGrow: 1 },
  desktopRow: { gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    borderLeftWidth: 4, borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#1A2B1A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardDesktop: { flex: 1 },

  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  orderMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderNum: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 10, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  itemsList: { gap: 7, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBubble: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 11, fontWeight: '800' },
  itemName: { fontSize: 14, color: '#334155', flex: 1, fontWeight: '500' },
  moreItems: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 2 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalAmt: { fontSize: 22, fontWeight: '800', color: '#C9A52A' },
  timeText: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  advBtn: { backgroundColor: '#1A2B1A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
  advBtnText: { color: '#C9A52A', fontWeight: '700', fontSize: 13 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#94A3B8' },
  emptyText: { fontSize: 13, color: '#CBD5E1', textAlign: 'center' },
});
