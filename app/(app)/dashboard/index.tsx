import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ordersApi } from '@/api/orders';
import { useAppStore } from '@/store/appStore';
import type { Order } from '@/types';

interface StatCard {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  color: string;
  bg: string;
  route?: string;
}

const QUICK_LINKS = [
  { label: 'POS',          icon: 'cart-outline',         route: '/(app)/pos',          color: '#1A2B1A' },
  { label: 'Kitchen',      icon: 'flame-outline',         route: '/(app)/kitchen',      color: '#f59e0b' },
  { label: 'Orders',       icon: 'receipt-outline',       route: '/(app)/orders',       color: '#3b82f6' },
  { label: 'Tables',       icon: 'grid-outline',          route: '/(app)/tables',       color: '#8b5cf6' },
  { label: 'Customers',    icon: 'people-outline',        route: '/(app)/customers',    color: '#0f8f73' },
  { label: 'Reservations', icon: 'calendar-outline',      route: '/(app)/reservations', color: '#ef4444' },
  { label: 'Expenses',     icon: 'wallet-outline',        route: '/(app)/expenses',     color: '#d97706' },
  { label: 'Menu',         icon: 'restaurant-outline',    route: '/(app)/menu',         color: '#6b7280' },
];

export default function DashboardScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const restaurant = useAppStore(s => s.restaurant);
  const isOnline = useAppStore(s => s.isOnline);
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;

  const load = useCallback(async () => {
    try {
      const res = await ordersApi.list({ per_page: 200 });
      const data = res.data?.data ?? res.data ?? [];
      setOrders(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { load(); }, []);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayOrders = orders.filter(o => (o.created_at ?? '').startsWith(today));
  const todaySales = todayOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const preparingCount = orders.filter(o => o.status === 'preparing').length;
  const zomatoToday = todayOrders.filter(o => o.source === 'zomato').length;
  const swiggyToday = todayOrders.filter(o => o.source === 'swiggy').length;

  const stats: StatCard[] = [
    { label: "Today's Sales",   value: `₹${todaySales.toFixed(2)}`, sub: `${todayOrders.length} orders`, icon: 'cash-outline',          color: '#1A2B1A', bg: 'rgba(26,43,26,0.08)',      route: '/(app)/orders' },
    { label: 'Pending Orders',  value: String(pendingCount),         sub: 'need attention',               icon: 'time-outline',           color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',     route: '/(app)/kitchen' },
    { label: 'In Kitchen',      value: String(preparingCount),       sub: 'preparing',                    icon: 'flame-outline',          color: '#ef4444', bg: 'rgba(239,68,68,0.1)',      route: '/(app)/kitchen' },
    { label: 'Zomato Orders',   value: String(zomatoToday),          sub: 'today',                        icon: 'bicycle-outline',        color: '#d00000', bg: 'rgba(208,0,0,0.08)',       route: '/(app)/kitchen' },
    { label: 'Swiggy Orders',   value: String(swiggyToday),          sub: 'today',                        icon: 'storefront-outline',     color: '#fc8019', bg: 'rgba(252,128,25,0.1)',     route: '/(app)/kitchen' },
    { label: 'Total Orders',    value: String(orders.length),        sub: 'all time',                     icon: 'receipt-outline',        color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',     route: '/(app)/orders' },
  ];

  const recentOrders = orders.slice(0, 5);

  return (
    <ScrollView
      style={st.shell}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#C9A52A" />}
    >
      {/* Welcome */}
      <View style={st.welcome}>
        <View>
          <Text style={st.welcomeName}>{restaurant?.name ?? 'Restaurant'}</Text>
          <Text style={st.welcomeDate}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
        </View>
        <View style={[st.onlineBadge, { backgroundColor: isOnline ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
          <View style={[st.onlineDot, { backgroundColor: isOnline ? '#10b981' : '#ef4444' }]} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: isOnline ? '#10b981' : '#ef4444' }}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Stats grid */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>Overview</Text>
        <View style={[st.statsGrid, { gap: 10 }]}>
          {stats.map((s, idx) => (
            <TouchableOpacity key={idx} style={[st.statCard, { width: `${Math.floor(100 / cols) - 1.5}%` }]} onPress={() => s.route && router.push(s.route as any)} activeOpacity={0.8}>
              <View style={[st.statIconBox, { backgroundColor: s.bg }]}>
                <Ionicons name={s.icon as any} size={20} color={s.color} />
              </View>
              <Text style={st.statValue}>{s.value}</Text>
              <Text style={st.statLabel}>{s.label}</Text>
              {s.sub && <Text style={st.statSub}>{s.sub}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quick links */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>Quick Access</Text>
        <View style={[st.quickGrid, { gap: 8 }]}>
          {QUICK_LINKS.map((ql) => (
            <TouchableOpacity key={ql.route} style={[st.quickCard, { width: `${Math.floor(100 / Math.min(cols, 4)) - 2}%` }]} onPress={() => router.push(ql.route as any)} activeOpacity={0.8}>
              <View style={[st.quickIcon, { backgroundColor: ql.color + '15' }]}>
                <Ionicons name={ql.icon as any} size={22} color={ql.color} />
              </View>
              <Text style={st.quickLabel}>{ql.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <View style={[st.section, { marginBottom: 30 }]}>
          <View style={st.sectionRow}>
            <Text style={st.sectionTitle}>Recent Orders</Text>
            <TouchableOpacity onPress={() => router.push('/(app)/orders' as any)}>
              <Text style={st.seeAll}>See all →</Text>
            </TouchableOpacity>
          </View>
          {recentOrders.map(o => {
            const srcColors: Record<string, string> = { pos: '#1A2B1A', zomato: '#d00000', swiggy: '#fc8019', qr: '#7c3aed' };
            const src = o.source ?? 'pos';
            return (
              <View key={o.id} style={st.recentRow}>
                <View style={[st.recentSrc, { backgroundColor: (srcColors[src] ?? '#1A2B1A') + '15' }]}>
                  <Text style={[st.recentSrcText, { color: srcColors[src] ?? '#1A2B1A' }]}>{src.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.recentNum}>#{o.order_number}</Text>
                  <Text style={st.recentCustomer}>{o.customer_name ?? 'Walk-in'} · {o.order_type?.replace('_', ' ')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.recentTotal}>₹{o.total?.toFixed(2)}</Text>
                  <View style={[st.recentStatus, { backgroundColor: '#f3f4f6' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#374151' }}>{o.status}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },

  welcome: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A2B1A', padding: 18, paddingTop: 20 },
  welcomeName: { fontSize: 18, fontWeight: '800', color: '#C9A52A' },
  welcomeDate: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3 },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },

  section: { padding: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#374151', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  seeAll: { fontSize: 12.5, fontWeight: '700', color: '#0D76E1' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  statIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 2 },
  statSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  quickCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', gap: 8 },
  quickIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textAlign: 'center' },

  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  recentSrc: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  recentSrcText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  recentNum: { fontSize: 14, fontWeight: '800', color: '#111827' },
  recentCustomer: { fontSize: 11.5, color: '#6b7280', marginTop: 2 },
  recentTotal: { fontSize: 14, fontWeight: '800', color: '#C9A52A' },
  recentStatus: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 3 },
});
