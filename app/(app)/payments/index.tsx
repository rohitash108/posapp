/**
 * Payments Screen — CSPos admin restaurant design
 * Page header · Stats · Search · Date filter · Method tabs · Status tabs · Cards
 */
import React, {
  useEffect, useState, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ScrollView,
  TextInput, ActivityIndicator, Platform, Pressable,
  useWindowDimensions, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  format, isToday, isYesterday, startOfWeek, startOfMonth,
} from 'date-fns';
import { paymentsApi } from '@/api/payments';
import type { Payment } from '@/types';

// ── Tokens ────────────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

// ── Config ────────────────────────────────────────────────────────────────────
const METHOD_CFG: Record<string, { color: string; bg: string; border: string; icon: any; label: string }> = {
  cash:   { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: 'cash-outline',           label: 'Cash'   },
  card:   { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', icon: 'card-outline',           label: 'Card'   },
  upi:    { color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: 'phone-portrait-outline', label: 'UPI'    },
  other:  { color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', icon: 'globe-outline',          label: 'Online' },
  online: { color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', icon: 'globe-outline',          label: 'Online' },
};
function mCfg(m?: string) { return METHOD_CFG[m ?? 'cash'] ?? METHOD_CFG.cash; }

const STATUS_CFG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  completed: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Completed' },
  pending:   { color: '#d97706', bg: '#fef9ec', border: '#fcd34d', label: 'Pending'   },
  failed:    { color: '#dc2626', bg: '#fff1f2', border: '#fecaca', label: 'Failed'    },
  refunded:  { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db', label: 'Refunded'  },
};
function sCfg(s?: string) { return STATUS_CFG[s ?? 'completed'] ?? STATUS_CFG.completed; }

const DATE_PRESETS = [
  { key: 'all',       label: 'All Time'   },
  { key: 'today',     label: 'Today'      },
  { key: 'yesterday', label: 'Yesterday'  },
  { key: 'week',      label: 'This Week'  },
  { key: 'month',     label: 'This Month' },
];

const METHOD_TABS = [
  { key: 'all',   label: 'All'    },
  { key: 'cash',  label: 'Cash'   },
  { key: 'card',  label: 'Card'   },
  { key: 'upi',   label: 'UPI'    },
  { key: 'other', label: 'Online' },
];

const STATUS_TABS = [
  { key: 'all',       label: 'All'       },
  { key: 'completed', label: 'Completed' },
  { key: 'pending',   label: 'Pending'   },
  { key: 'failed',    label: 'Failed'    },
  { key: 'refunded',  label: 'Refunded'  },
];

function fmtDate(dt?: string) {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    if (isToday(d))     return format(d, 'h:mm a');
    if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
    return format(d, 'dd MMM yyyy');
  } catch { return dt; }
}

// ── Payment Card ──────────────────────────────────────────────────────────────
function PaymentCard({ pay }: { pay: Payment }) {
  const method = pay.payment_method ?? (pay as any).method ?? 'cash';
  const mc = mCfg(method);
  const sc = sCfg(pay.status);
  const ref = pay.reference_number ?? (pay as any).reference;
  const orderNo = (pay as any).order_number ?? pay.order_id;

  return (
    <View style={[cd.card, { borderLeftColor: mc.color }]}>
      {/* Top row: icon + ref/order + amount */}
      <View style={cd.top}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[cd.iconBox, { backgroundColor: mc.bg }]}>
            <Ionicons name={mc.icon} size={18} color={mc.color} />
          </View>
          <View>
            <Text style={cd.ref}>{ref || `Payment #${pay.id}`}</Text>
            <Text style={cd.order}>Order #{orderNo ?? '—'}</Text>
          </View>
        </View>
        <Text style={[cd.amount, { color: pay.status === 'failed' ? '#dc2626' : '#111827' }]}>
          {pay.status === 'failed' ? '—' : `₹${Number(pay.amount).toFixed(2)}`}
        </Text>
      </View>

      {/* Mid: customer */}
      {(pay.customer_name) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <Ionicons name="person-outline" size={11} color="#94a3b8" />
          <Text style={cd.customer}>{pay.customer_name}</Text>
        </View>
      ) : null}

      {/* Bottom: method + status + date */}
      <View style={cd.bot}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <View style={[cd.chip, { backgroundColor: mc.bg, borderColor: mc.border }]}>
            <Ionicons name={mc.icon} size={10} color={mc.color} />
            <Text style={[cd.chipTxt, { color: mc.color }]}>{mc.label}</Text>
          </View>
          <View style={[cd.chip, { backgroundColor: sc.bg, borderColor: sc.border }]}>
            <Text style={[cd.chipTxt, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>
        <Text style={cd.date}>{fmtDate(pay.created_at)}</Text>
      </View>

      {/* Notes */}
      {pay.notes ? (
        <Text style={cd.notes} numberOfLines={1}>{pay.notes}</Text>
      ) : null}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PaymentsScreen() {
  const [payments,      setPayments]      = useState<Payment[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [search,        setSearch]        = useState('');
  const [methodTab,     setMethodTab]     = useState('all');
  const [statusTab,     setStatusTab]     = useState('all');
  const [dateFilter,    setDateFilter]    = useState('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await paymentsApi.list({ per_page: 300 });
      const data = res.data?.data ?? res.data ?? [];
      setPayments(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = new Date();
    return payments.filter(p => {
      const method = p.payment_method ?? (p as any).method;
      // Method
      if (methodTab !== 'all') {
        if (methodTab === 'other') {
          if (method !== 'other' && method !== 'online') return false;
        } else if (method !== methodTab) return false;
      }
      // Status
      if (statusTab !== 'all' && p.status !== statusTab) return false;
      // Date
      if (dateFilter !== 'all' && p.created_at) {
        const d = new Date(p.created_at);
        if (dateFilter === 'today'     && !isToday(d))     return false;
        if (dateFilter === 'yesterday' && !isYesterday(d)) return false;
        if (dateFilter === 'week'      && d < startOfWeek(now)) return false;
        if (dateFilter === 'month'     && d < startOfMonth(now)) return false;
      }
      // Search
      if (search) {
        const q = search.toLowerCase();
        const ref  = (p.reference_number ?? (p as any).reference ?? '').toLowerCase();
        const name = (p.customer_name ?? '').toLowerCase();
        const ord  = String((p as any).order_number ?? p.order_id ?? '').toLowerCase();
        return ref.includes(q) || name.includes(q) || ord.includes(q);
      }
      return true;
    });
  }, [payments, methodTab, statusTab, dateFilter, search]);

  // ── Stats (always from full list, not filtered) ───────────────────────────
  const completed = useMemo(() => payments.filter(p => p.status === 'completed'), [payments]);
  const totalAmt  = useMemo(() => completed.reduce((s, p) => s + Number(p.amount), 0), [completed]);
  const cashAmt   = useMemo(() => completed.filter(p => (p.payment_method ?? (p as any).method) === 'cash').reduce((s, p) => s + Number(p.amount), 0), [completed]);
  const cardAmt   = useMemo(() => completed.filter(p => (p.payment_method ?? (p as any).method) === 'card').reduce((s, p) => s + Number(p.amount), 0), [completed]);
  const upiAmt    = useMemo(() => completed.filter(p => (p.payment_method ?? (p as any).method) === 'upi').reduce((s, p) => s + Number(p.amount), 0), [completed]);
  const otherAmt  = useMemo(() => completed.filter(p => { const m = p.payment_method ?? (p as any).method; return m === 'other' || m === 'online'; }).reduce((s, p) => s + Number(p.amount), 0), [completed]);

  const hasFilter = search !== '' || methodTab !== 'all' || statusTab !== 'all' || dateFilter !== 'all';

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f7' }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }} tintColor={FOREST} />
        }>

        {/* ── Page header ── */}
        <View style={s.pageHeader}>
          <View>
            <Text style={s.pageTitle}>Payments</Text>
            <Text style={s.pageSub}>Payment transactions and collection summary</Text>
          </View>
          <Pressable style={({ pressed }) => [s.refreshBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { setRefreshing(true); load(true); }}>
            <Ionicons name="refresh-outline" size={16} color="#64748b" />
          </Pressable>
        </View>

        {/* ── Stats ── */}
        <View style={s.statsBar}>
          <View style={[s.statMain, { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }]}>
            <Ionicons name="wallet-outline" size={18} color="#16a34a" style={{ marginBottom: 4 }} />
            <Text style={[s.statMainVal, { color: '#16a34a' }]}>₹{totalAmt.toFixed(2)}</Text>
            <Text style={s.statMainLbl}>Total Collected</Text>
          </View>
          <View style={s.statGrid}>
            {[
              { label: 'Cash',   val: cashAmt,  color: '#16a34a', bg: '#f0fdf4', icon: 'cash-outline'           as const },
              { label: 'Card',   val: cardAmt,  color: '#2563eb', bg: '#eff6ff', icon: 'card-outline'           as const },
              { label: 'UPI',    val: upiAmt,   color: '#7c3aed', bg: '#f5f3ff', icon: 'phone-portrait-outline' as const },
              { label: 'Online', val: otherAmt, color: '#0891b2', bg: '#ecfeff', icon: 'globe-outline'          as const },
            ].map(st => (
              <View key={st.label} style={[s.statSmall, { backgroundColor: st.bg }]}>
                <Ionicons name={st.icon} size={14} color={st.color} />
                <Text style={[s.statSmallVal, { color: st.color }]}>₹{st.val.toFixed(0)}</Text>
                <Text style={[s.statSmallLbl, { color: st.color }]}>{st.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Search ── */}
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Order #, reference, customer…"
              placeholderTextColor="#9ca3af" />
            {search
              ? <Pressable onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#9ca3af" />
                </Pressable>
              : <Ionicons name="search-outline" size={15} color="#9ca3af" />
            }
          </View>
        </View>

        {/* ── Date filter ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.pillRow}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          {DATE_PRESETS.map(dp => {
            const active = dateFilter === dp.key;
            return (
              <Pressable key={dp.key}
                style={({ pressed }) => [
                  s.pill,
                  active && { backgroundColor: FOREST, borderColor: FOREST },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setDateFilter(dp.key)}>
                <Text style={[s.pillTxt, active && { color: GOLD, fontWeight: '700' }]}>{dp.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Method tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[s.pillRow, { borderTopWidth: 0 }]}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, gap: 8 }}>
          {METHOD_TABS.map(tab => {
            const active = methodTab === tab.key;
            const mc     = METHOD_CFG[tab.key];
            const cnt    = tab.key === 'all'
              ? payments.length
              : tab.key === 'other'
                ? payments.filter(p => { const m = p.payment_method ?? (p as any).method; return m === 'other' || m === 'online'; }).length
                : payments.filter(p => (p.payment_method ?? (p as any).method) === tab.key).length;
            return (
              <Pressable key={tab.key}
                style={({ pressed }) => [
                  s.tabChip,
                  active && { backgroundColor: mc?.color ?? FOREST, borderColor: mc?.color ?? FOREST },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setMethodTab(tab.key)}>
                {mc && <Ionicons name={mc.icon} size={12} color={active ? '#fff' : mc.color} />}
                <Text style={[s.tabChipTxt, active && { color: '#fff', fontWeight: '700' }]}>{tab.label}</Text>
                <View style={[s.tabBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.tabBadgeTxt, active && { color: '#fff' }]}>{cnt}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Status tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[s.pillRow, { borderTopWidth: 0 }]}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
          {STATUS_TABS.map(tab => {
            const active = statusTab === tab.key;
            const sc     = STATUS_CFG[tab.key];
            const cnt    = tab.key === 'all' ? payments.length : payments.filter(p => p.status === tab.key).length;
            return (
              <Pressable key={tab.key}
                style={({ pressed }) => [
                  s.tabChip,
                  active && { backgroundColor: sc?.color ?? FOREST, borderColor: sc?.color ?? FOREST },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setStatusTab(tab.key)}>
                <Text style={[s.tabChipTxt, active && { color: '#fff', fontWeight: '700' }]}>{tab.label}</Text>
                <View style={[s.tabBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.tabBadgeTxt, active && { color: '#fff' }]}>{cnt}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Result row ── */}
        <View style={s.resultRow}>
          <Text style={s.resultTxt}>{filtered.length} payment{filtered.length !== 1 ? 's' : ''}</Text>
          {hasFilter && (
            <Pressable onPress={() => { setSearch(''); setMethodTab('all'); setStatusTab('all'); setDateFilter('all'); }}>
              <Text style={s.clearAll}>Clear filters</Text>
            </Pressable>
          )}
        </View>

        {/* ── List ── */}
        {loading ? (
          <View style={s.loadWrap}>
            <ActivityIndicator color={FOREST} size="large" />
            <Text style={s.loadTxt}>Loading payments…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="wallet-outline" size={36} color="#94a3b8" />
            </View>
            <Text style={s.emptyTitle}>No payments found</Text>
            <Text style={s.emptySub}>
              {search ? `No results for "${search}"` : 'No payments match the current filters.'}
            </Text>
          </View>
        ) : (
          <View style={{ padding: 10, paddingBottom: 40 }}>
            {filtered.map(pay => <PaymentCard key={pay.id} pay={pay} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  pageHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pageTitle:   { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  pageSub:     { fontSize: 12, color: '#6b7280', marginTop: 2 },
  refreshBtn:  { width: 34, height: 34, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },

  // Stats
  statsBar:     { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  statMain:     { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', minHeight: 90 },
  statMainVal:  { fontSize: 20, fontWeight: '800', marginTop: 2 },
  statMainLbl:  { fontSize: 10, color: '#16a34a', marginTop: 2, fontWeight: '600' },
  statGrid:     { flex: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statSmall:    { flex: 1, minWidth: '45%', borderRadius: 10, padding: 10, alignItems: 'center', gap: 2 },
  statSmallVal: { fontSize: 14, fontWeight: '800' },
  statSmallLbl: { fontSize: 9.5, fontWeight: '700' },

  // Search
  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },

  // Tabs / pills
  pillRow:      { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pill:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  pillTxt:      { fontSize: 12, fontWeight: '600', color: '#374151' },
  tabChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  tabChipTxt:   { fontSize: 12, fontWeight: '600', color: '#374151' },
  tabBadge:     { backgroundColor: '#e5e7eb', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeTxt:  { fontSize: 10, fontWeight: '700', color: '#6b7280' },

  // Result
  resultRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 7 },
  resultTxt:  { fontSize: 11.5, color: '#9ca3af', fontWeight: '600' },
  clearAll:   { fontSize: 12, color: PRIMARY, textDecorationLine: 'underline' },

  // Load / empty
  loadWrap:  { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadTxt:   { fontSize: 14, color: '#9ca3af' },
  emptyWrap: { paddingTop: 80, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub:  { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 },
});

const cd = StyleSheet.create({
  card:     { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  top:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  iconBox:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ref:      { fontSize: 14, fontWeight: '800', color: '#111827' },
  order:    { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  amount:   { fontSize: 19, fontWeight: '900' },
  customer: { fontSize: 11.5, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  bot:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  chipTxt:  { fontSize: 10.5, fontWeight: '700' },
  date:     { fontSize: 11, color: '#9ca3af' },
  notes:    { fontSize: 11, color: '#9ca3af', marginTop: 6, fontStyle: 'italic' },
});
