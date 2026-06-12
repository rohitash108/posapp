import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { reportsApi } from '@/api/reports';

const PERIODS = [
  { label: 'Today',    days: 0 },
  { label: '7 Days',   days: 7 },
  { label: '30 Days',  days: 30 },
  { label: '3 Months', days: 90 },
];

const TABS = ['Sales', 'Orders', 'Items', 'Payments'];
const METHOD_COLORS: Record<string, string> = { cash: '#16a34a', card: '#2563eb', upi: '#7c3aed', online: '#0891b2' };
const BAR_COLORS = ['#C9A52A', '#1A2B1A', '#2563eb', '#16a34a', '#7c3aed', '#dc2626', '#d97706'];

export default function ReportsScreen() {
  const [activeTab, setActiveTab] = useState(0);
  const [period, setPeriod]       = useState(1);
  const [showCustom, setShowCustom] = useState(false);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [salesData, setSalesData]     = useState<any>(null);
  const [topItems, setTopItems]       = useState<any[]>([]);
  const [payMethods, setPayMethods]   = useState<any[]>([]);
  const [summary, setSummary]         = useState<any>(null);

  function getDates() {
    let from = dateFrom, to = dateTo;
    if (!showCustom) {
      const d = PERIODS[period].days;
      from = d === 0 ? format(new Date(), 'yyyy-MM-dd') : format(subDays(new Date(), d), 'yyyy-MM-dd');
      to   = format(new Date(), 'yyyy-MM-dd');
    }
    return { from: from || undefined, to: to || undefined };
  }

  const load = useCallback(async () => {
    const { from, to } = getDates();
    try {
      const [sRes, iRes, pRes, sumRes] = await Promise.allSettled([
        reportsApi.sales({ date_from: from, date_to: to }),
        reportsApi.topItems({ date_from: from, date_to: to, limit: 10 }),
        reportsApi.paymentMethods({ date_from: from, date_to: to }),
        reportsApi.summary({ date: to }),
      ]);
      if (sRes.status === 'fulfilled') setSalesData(sRes.value.data?.data ?? sRes.value.data);
      if (iRes.status === 'fulfilled') setTopItems(iRes.value.data?.data ?? iRes.value.data ?? []);
      if (pRes.status === 'fulfilled') setPayMethods(pRes.value.data?.data ?? pRes.value.data ?? []);
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data?.data ?? sumRes.value.data);
    } catch { }
    finally { setLoading(false); }
  }, [period, showCustom, dateFrom, dateTo]);

  useEffect(() => { setLoading(true); load(); }, [period, showCustom]);

  const maxTopItem = Math.max(...topItems.map((i: any) => i.total_revenue ?? i.quantity ?? 0), 1);
  const maxPayMethod = Math.max(...payMethods.map((p: any) => p.total ?? 0), 1);
  const totalRevenue = payMethods.reduce((s: number, p: any) => s + Number(p.total ?? 0), 0);

  const salesEntries: any[] = salesData?.entries ?? salesData?.data ?? [];
  const maxSales = Math.max(...salesEntries.map((e: any) => e.revenue ?? e.sales ?? 0), 1);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      {/* Period selector */}
      <View style={s.periodBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PERIODS.map((p, idx) => (
            <TouchableOpacity key={p.label} style={[s.periodChip, period === idx && !showCustom && s.periodActive]} onPress={() => { setShowCustom(false); setPeriod(idx); }}>
              <Text style={[s.periodText, period === idx && !showCustom && s.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.periodChip, showCustom && s.periodActive]} onPress={() => setShowCustom(true)}>
            <Ionicons name="calendar-outline" size={13} color={showCustom ? '#fff' : '#374151'} />
            <Text style={[s.periodText, showCustom && s.periodTextActive]}>Custom</Text>
          </TouchableOpacity>
        </ScrollView>
        {showCustom && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Text style={s.dl}>From</Text><TextInput style={s.di} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" /></View>
            <View style={{ flex: 1 }}><Text style={s.dl}>To</Text><TextInput style={s.di} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" /></View>
            <TouchableOpacity style={s.applyBtn} onPress={() => { setLoading(true); load(); }}><Text style={s.applyText}>Apply</Text></TouchableOpacity>
          </View>
        )}
      </View>

      {/* Summary stats */}
      {summary && (
        <View style={s.statsRow}>
          {[
            { label: "Today's Sales", val: `₹${Number(summary.today_sales ?? 0).toFixed(0)}`, color: '#C9A52A' },
            { label: 'Total Orders', val: String(summary.total_orders ?? 0), color: '#2563eb' },
            { label: 'Avg Order', val: `₹${Number(summary.avg_order ?? 0).toFixed(0)}`, color: '#16a34a' },
            { label: 'Unpaid', val: String(summary.unpaid_orders ?? 0), color: '#dc2626' },
          ].map((st, i) => (
            <View key={i} style={s.statCard}>
              <Text style={[s.statVal, { color: st.color }]}>{st.val}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={{ paddingHorizontal: 10, gap: 4 }}>
        {TABS.map((tab, idx) => (
          <TouchableOpacity key={tab} style={[s.tab, activeTab === idx && s.tabActive]} onPress={() => setActiveTab(idx)}>
            <Text style={[s.tabText, activeTab === idx && s.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#C9A52A" />}>
        {loading ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}><ActivityIndicator color="#C9A52A" size="large" /></View>
        ) : (
          <>
            {/* SALES TAB */}
            {activeTab === 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Revenue Trend</Text>
                {salesEntries.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 30 }}><Ionicons name="bar-chart-outline" size={36} color="#e5e7eb" /><Text style={s.empty}>No sales data</Text></View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {salesEntries.map((e: any, idx: number) => {
                      const val = e.revenue ?? e.sales ?? 0;
                      const pct = (val / maxSales) * 100;
                      return (
                        <View key={idx} style={s.barRow}>
                          <Text style={s.barLabel}>{e.date ? format(new Date(e.date), 'dd MMM') : e.label ?? `Day ${idx+1}`}</Text>
                          <View style={s.barTrack}>
                            <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: '#C9A52A' }]} />
                          </View>
                          <Text style={s.barVal}>₹{Number(val).toFixed(0)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                {salesData?.total_revenue !== undefined && (
                  <View style={s.totalRow}><Text style={s.totalLabel}>Total Revenue</Text><Text style={s.totalVal}>₹{Number(salesData.total_revenue).toFixed(2)}</Text></View>
                )}
              </View>
            )}

            {/* ORDERS TAB */}
            {activeTab === 1 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Order Statistics</Text>
                {[
                  { label: 'Total Orders',   val: salesData?.total_orders ?? '—',   color: '#2563eb' },
                  { label: 'Completed',      val: salesData?.completed ?? '—',       color: '#16a34a' },
                  { label: 'Cancelled',      val: salesData?.cancelled ?? '—',       color: '#dc2626' },
                  { label: 'Dine In',        val: salesData?.dine_in ?? '—',         color: '#C9A52A' },
                  { label: 'Takeaway',       val: salesData?.takeaway ?? '—',        color: '#7c3aed' },
                  { label: 'Delivery',       val: salesData?.delivery ?? '—',        color: '#0891b2' },
                ].map((row, i) => (
                  <View key={i} style={s.statRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[s.dotSm, { backgroundColor: row.color }]} />
                      <Text style={s.statRowLabel}>{row.label}</Text>
                    </View>
                    <Text style={[s.statRowVal, { color: row.color }]}>{row.val}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* TOP ITEMS TAB */}
            {activeTab === 2 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Top Selling Items</Text>
                {topItems.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 30 }}><Ionicons name="fast-food-outline" size={36} color="#e5e7eb" /><Text style={s.empty}>No item data</Text></View>
                ) : (
                  topItems.map((item: any, idx: number) => {
                    const val = item.total_revenue ?? item.quantity ?? 0;
                    const pct = (val / maxTopItem) * 100;
                    const color = BAR_COLORS[idx % BAR_COLORS.length];
                    return (
                      <View key={idx} style={s.itemRow}>
                        <Text style={s.itemRank}>#{idx + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={s.itemName}>{item.name}</Text>
                            <Text style={[s.itemVal, { color }]}>{item.total_revenue ? `₹${Number(item.total_revenue).toFixed(0)}` : `${item.quantity ?? val} qty`}</Text>
                          </View>
                          <View style={s.barTrack}>
                            <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* PAYMENT METHODS TAB */}
            {activeTab === 3 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Payment Breakdown</Text>
                {payMethods.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 30 }}><Ionicons name="wallet-outline" size={36} color="#e5e7eb" /><Text style={s.empty}>No payment data</Text></View>
                ) : (
                  <>
                    {payMethods.map((pm: any, idx: number) => {
                      const color = METHOD_COLORS[pm.method] ?? BAR_COLORS[idx];
                      const pct   = totalRevenue > 0 ? (pm.total / totalRevenue) * 100 : 0;
                      return (
                        <View key={idx} style={s.pmRow}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[s.dotSm, { backgroundColor: color }]} />
                                <Text style={s.pmMethod}>{(pm.method ?? '—').toUpperCase()}</Text>
                                <Text style={s.pmCount}>{pm.count ?? ''} orders</Text>
                              </View>
                              <Text style={[s.pmAmt, { color }]}>₹{Number(pm.total).toFixed(0)}</Text>
                            </View>
                            <View style={s.barTrack}>
                              <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                            </View>
                          </View>
                          <Text style={s.pmPct}>{pct.toFixed(1)}%</Text>
                        </View>
                      );
                    })}
                    <View style={[s.totalRow, { marginTop: 16 }]}>
                      <Text style={s.totalLabel}>Grand Total</Text>
                      <Text style={s.totalVal}>₹{totalRevenue.toFixed(2)}</Text>
                    </View>
                  </>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  periodBar:    { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  periodChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  periodActive: { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' },
  periodText:   { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  periodTextActive: { color: '#C9A52A', fontWeight: '800' },
  dl:           { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 3 },
  di:           { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#111827' },
  applyBtn:     { backgroundColor: '#1A2B1A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  applyText:    { color: '#C9A52A', fontWeight: '800', fontSize: 13 },
  statsRow:     { flexDirection: 'row', gap: 0, backgroundColor: '#1A2B1A' },
  statCard:     { flex: 1, alignItems: 'center', paddingVertical: 12, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)' },
  statVal:      { fontSize: 16, fontWeight: '900' },
  statLabel:    { fontSize: 9, color: '#7A9A7A', marginTop: 2 },
  tabBar:       { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 0 },
  tab:          { paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabActive:    { borderBottomColor: '#C9A52A' },
  tabText:      { fontSize: 13.5, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#1A2B1A', fontWeight: '800' },
  card:         { backgroundColor: '#fff', borderRadius: 14, margin: 12, padding: 18, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  cardTitle:    { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  barRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel:     { width: 52, fontSize: 11, color: '#6b7280', fontWeight: '600' },
  barTrack:     { flex: 1, height: 7, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' },
  barFill:      { height: 7, borderRadius: 4 },
  barVal:       { width: 60, textAlign: 'right', fontSize: 12, fontWeight: '700', color: '#374151' },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 8 },
  totalLabel:   { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  totalVal:     { fontSize: 16, fontWeight: '900', color: '#1A2B1A' },
  statRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  statRowLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  statRowVal:   { fontSize: 15, fontWeight: '800' },
  dotSm:        { width: 8, height: 8, borderRadius: 4 },
  itemRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  itemRank:     { width: 24, fontSize: 12, fontWeight: '800', color: '#9ca3af' },
  itemName:     { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  itemVal:      { fontSize: 13, fontWeight: '800' },
  pmRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  pmMethod:     { fontSize: 13.5, fontWeight: '800', color: '#111827' },
  pmCount:      { fontSize: 11, color: '#9ca3af' },
  pmAmt:        { fontSize: 14, fontWeight: '800' },
  pmPct:        { width: 42, textAlign: 'right', fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  empty:        { color: '#9ca3af', fontSize: 13, fontWeight: '600', marginTop: 8 },
});
