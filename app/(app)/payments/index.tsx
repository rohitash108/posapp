import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { paymentsApi } from '@/api/payments';
import type { Payment } from '@/types';

const METHOD_CFG: Record<string, { color: string; bg: string; icon: string }> = {
  cash:   { color: '#16a34a', bg: '#f0fdf4', icon: 'cash-outline' },
  card:   { color: '#2563eb', bg: '#eff6ff', icon: 'card-outline' },
  upi:    { color: '#7c3aed', bg: '#f5f3ff', icon: 'phone-portrait-outline' },
  online: { color: '#0891b2', bg: '#ecfeff', icon: 'globe-outline' },
};
const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  completed: { color: '#16a34a', bg: '#f0fdf4' },
  pending:   { color: '#d97706', bg: '#fef9ec' },
  failed:    { color: '#dc2626', bg: '#fef2f2' },
  refunded:  { color: '#6b7280', bg: '#f3f4f6' },
};
const FILTERS = ['all', 'cash', 'card', 'upi'];
const STATUS_FILTERS = ['all', 'completed', 'pending', 'failed'];

export default function PaymentsScreen() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await paymentsApi.list({ per_page: 200 });
      const data = res.data?.data ?? res.data ?? [];
      setPayments(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = payments.filter(p => {
    if (methodFilter !== 'all' && p.payment_method !== methodFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.reference_number ?? '').toLowerCase().includes(q)
        || (p.customer_name ?? '').toLowerCase().includes(q)
        || String(p.order_id).includes(q);
    }
    return true;
  });

  // Stats
  const totalAmt = filtered.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
  const cashAmt  = filtered.filter(p => p.payment_method === 'cash'  && p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
  const cardAmt  = filtered.filter(p => p.payment_method === 'card'  && p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
  const upiAmt   = filtered.filter(p => p.payment_method === 'upi'   && p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);

  function formatTime(str?: string) {
    if (!str) return '—';
    try {
      const d = new Date(str);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) return 'Today ' + format(d, 'hh:mm a');
      return format(d, 'dd MMM, hh:mm a');
    } catch { return str; }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      {/* Summary Cards */}
      <View style={s.statsRow}>
        <View style={[s.statCard, { flex: 2, backgroundColor: '#1A2B1A' }]}>
          <Text style={[s.statAmt, { color: '#C9A52A', fontSize: 22 }]}>₹{totalAmt.toFixed(2)}</Text>
          <Text style={[s.statLabel, { color: '#7A9A7A' }]}>Total Collected</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: '#f0fdf4' }]}>
          <Ionicons name="cash-outline" size={16} color="#16a34a" style={{ marginBottom: 4 }} />
          <Text style={[s.statAmt, { color: '#16a34a', fontSize: 17 }]}>₹{cashAmt.toFixed(0)}</Text>
          <Text style={[s.statLabel, { color: '#22c55e' }]}>Cash</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: '#eff6ff' }]}>
          <Ionicons name="card-outline" size={16} color="#2563eb" style={{ marginBottom: 4 }} />
          <Text style={[s.statAmt, { color: '#2563eb', fontSize: 17 }]}>₹{cardAmt.toFixed(0)}</Text>
          <Text style={[s.statLabel, { color: '#60a5fa' }]}>Card</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: '#f5f3ff' }]}>
          <Ionicons name="phone-portrait-outline" size={16} color="#7c3aed" style={{ marginBottom: 4 }} />
          <Text style={[s.statAmt, { color: '#7c3aed', fontSize: 17 }]}>₹{upiAmt.toFixed(0)}</Text>
          <Text style={[s.statLabel, { color: '#a78bfa' }]}>UPI</Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchBar}>
        <Ionicons name="search" size={15} color="#9ca3af" />
        <TextInput style={s.searchInput} placeholder="Order ID, reference, customer..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#9ca3af" /></TouchableOpacity> : null}
      </View>

      {/* Method Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 6 }}>
        {FILTERS.map(f => {
          const cfg = METHOD_CFG[f];
          const active = methodFilter === f;
          const cnt = f === 'all' ? payments.length : payments.filter(p => p.payment_method === f).length;
          return (
            <TouchableOpacity key={f} style={[s.filterChip, active && { backgroundColor: cfg?.color ?? '#1A2B1A', borderColor: cfg?.color ?? '#1A2B1A' }]} onPress={() => setMethodFilter(f)}>
              {cfg && <Ionicons name={cfg.icon as any} size={13} color={active ? '#fff' : cfg.color} />}
              <Text style={[s.filterText, active && { color: '#fff', fontWeight: '700' }]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
              <View style={[s.filterBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={[s.filterBadgeText, active && { color: '#fff' }]}>{cnt}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ width: 1, backgroundColor: '#e5e7eb', marginHorizontal: 4 }} />
        {STATUS_FILTERS.map(f => {
          const cfg = STATUS_CFG[f];
          const active = statusFilter === f;
          return (
            <TouchableOpacity key={'s-'+f} style={[s.filterChip, active && { backgroundColor: cfg?.color ?? '#1A2B1A', borderColor: cfg?.color ?? '#1A2B1A' }]} onPress={() => setStatusFilter(f)}>
              <Text style={[s.filterText, active && { color: '#fff', fontWeight: '700' }]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#C9A52A" size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 10, paddingBottom: 32, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#C9A52A" />}
          renderItem={({ item: pay }) => {
            const mCfg = METHOD_CFG[pay.payment_method ?? 'cash'] ?? METHOD_CFG.cash;
            const sCfg = STATUS_CFG[pay.status ?? 'completed'] ?? STATUS_CFG.completed;
            return (
              <View style={[s.card, { borderLeftColor: mCfg.color }]}>
                <View style={s.cardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[s.iconBox, { backgroundColor: mCfg.bg }]}>
                      <Ionicons name={mCfg.icon as any} size={18} color={mCfg.color} />
                    </View>
                    <View>
                      <Text style={s.refNum}>{pay.reference_number || `Pay #${pay.id}`}</Text>
                      <Text style={s.orderId}>Order #{pay.order_id}</Text>
                    </View>
                  </View>
                  <Text style={[s.amount, { color: pay.status === 'failed' ? '#dc2626' : '#1A2B1A' }]}>
                    {pay.status === 'failed' ? '—' : `₹${Number(pay.amount).toFixed(2)}`}
                  </Text>
                </View>
                <View style={s.cardBot}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={[s.methodPill, { backgroundColor: mCfg.bg }]}><Text style={[s.methodText, { color: mCfg.color }]}>{(pay.payment_method ?? 'cash').toUpperCase()}</Text></View>
                    <View style={[s.methodPill, { backgroundColor: sCfg.bg }]}><Text style={[s.methodText, { color: sCfg.color }]}>{(pay.status ?? 'completed').toUpperCase()}</Text></View>
                  </View>
                  <Text style={s.time}>{formatTime(pay.created_at)}</Text>
                </View>
                {pay.customer_name && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="person-outline" size={11} color="#9ca3af" />
                    <Text style={s.customer}>{pay.customer_name}</Text>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 70, gap: 10 }}>
              <Ionicons name="wallet-outline" size={40} color="#e5e7eb" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '600' }}>No payments found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  statsRow:   { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#f8f9fa' },
  statCard:   { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statAmt:    { fontSize: 20, fontWeight: '800' },
  statLabel:  { fontSize: 9.5, fontWeight: '700', marginTop: 2 },
  searchBar:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', marginHorizontal: 10, marginBottom: 4, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput: { flex: 1, fontSize: 13.5, color: '#111827' },
  filterBar:  { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  filterBadge: { backgroundColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  filterBadgeText: { fontSize: 10, fontWeight: '700', color: '#6b7280' },
  card:       { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  iconBox:    { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  refNum:     { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  orderId:    { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  amount:     { fontSize: 20, fontWeight: '900' },
  cardBot:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  methodPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  methodText: { fontSize: 10.5, fontWeight: '800' },
  time:       { fontSize: 11, color: '#9ca3af' },
  customer:   { fontSize: 11.5, fontWeight: '600', color: '#6b7280' },
});
