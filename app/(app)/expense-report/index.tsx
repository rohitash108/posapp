import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { reportsApi } from '@/api/reports';

interface ExpenseEntry {
  category?: string;
  amount: number;
  description?: string;
  date?: string;
}
interface ExpenseData {
  total?: number;
  entries?: ExpenseEntry[];
  by_category?: { category: string; total: number }[];
}

const PERIODS = [
  { label: 'Today',    days: 0 },
  { label: '7 Days',   days: 7 },
  { label: '30 Days',  days: 30 },
  { label: '3 Months', days: 90 },
];

const CATEGORY_COLORS = ['#2563eb', '#7c3aed', '#dc2626', '#d97706', '#16a34a', '#0891b2', '#db2777'];

export default function ExpenseReportScreen() {
  const [data, setData]             = useState<ExpenseData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod]         = useState(1); // index
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const load = useCallback(async () => {
    try {
      let from = dateFrom;
      let to   = dateTo;
      if (!showCustom && PERIODS[period].days > 0) {
        from = format(subDays(new Date(), PERIODS[period].days), 'yyyy-MM-dd');
        to   = format(new Date(), 'yyyy-MM-dd');
      } else if (!showCustom && PERIODS[period].days === 0) {
        from = to = format(new Date(), 'yyyy-MM-dd');
      }
      const res = await reportsApi.expenses({ date_from: from || undefined, date_to: to || undefined });
      const d = res.data?.data ?? res.data ?? {};
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [period, showCustom, dateFrom, dateTo]);

  useEffect(() => { setLoading(true); load(); }, [period, showCustom]);

  const entries      = data?.entries ?? [];
  const byCategory   = data?.by_category ?? [];
  const totalExpense = data?.total ?? entries.reduce((s, e) => s + Number(e.amount), 0);
  const maxCat       = Math.max(...byCategory.map(c => c.total), 1);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8f9fa' }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#C9A52A" />}>
      {/* Header card */}
      <View style={s.headerCard}>
        <Text style={s.headerLabel}>Total Expenses</Text>
        <Text style={s.totalAmt}>₹{Number(totalExpense).toFixed(2)}</Text>
        <Text style={s.headerSub}>{byCategory.length > 0 ? `${byCategory.length} categories` : 'No data yet'}</Text>
      </View>

      {/* Period selector */}
      <View style={s.section}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {PERIODS.map((p, idx) => (
            <TouchableOpacity key={p.label} style={[s.periodChip, period === idx && !showCustom && s.periodChipActive]} onPress={() => { setShowCustom(false); setPeriod(idx); }}>
              <Text style={[s.periodText, period === idx && !showCustom && s.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.periodChip, showCustom && s.periodChipActive]} onPress={() => setShowCustom(true)}>
            <Ionicons name="calendar-outline" size={13} color={showCustom ? '#fff' : '#374151'} />
            <Text style={[s.periodText, showCustom && s.periodTextActive]}>Custom</Text>
          </TouchableOpacity>
        </ScrollView>
        {showCustom && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.dateLabel}>From</Text>
              <TextInput style={s.dateInput} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.dateLabel}>To</Text>
              <TextInput style={s.dateInput} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
            </View>
            <TouchableOpacity style={s.applyBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={s.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}><ActivityIndicator color="#C9A52A" size="large" /></View>
      ) : (
        <>
          {/* Category breakdown */}
          {byCategory.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>By Category</Text>
              {byCategory.map((cat, idx) => {
                const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                const pct   = (cat.total / maxCat) * 100;
                return (
                  <View key={cat.category} style={s.catRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                        <Text style={s.catName}>{cat.category}</Text>
                        <Text style={[s.catAmt, { color }]}>₹{Number(cat.total).toFixed(2)}</Text>
                      </View>
                      <View style={s.barBg}>
                        <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                      </View>
                    </View>
                    <Text style={s.catPct}>{totalExpense > 0 ? ((cat.total / totalExpense) * 100).toFixed(1) : 0}%</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Entries list */}
          {entries.length > 0 && (
            <View style={[s.section, { marginBottom: 24 }]}>
              <Text style={s.sectionTitle}>All Expenses</Text>
              {entries.map((e, idx) => (
                <View key={idx} style={s.entryRow}>
                  <View style={[s.catDot, { backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.entryDesc}>{e.description || e.category || 'Expense'}</Text>
                    {e.category && <Text style={s.entryMeta}>{e.category}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.entryAmt}>₹{Number(e.amount).toFixed(2)}</Text>
                    {e.date && <Text style={s.entryDate}>{format(new Date(e.date), 'dd MMM')}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {!data || (entries.length === 0 && byCategory.length === 0) ? (
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 10 }}>
              <Ionicons name="receipt-outline" size={44} color="#e5e7eb" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '600' }}>No expense data for this period</Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  headerCard:   { backgroundColor: '#1A2B1A', margin: 12, borderRadius: 16, padding: 20, alignItems: 'center' },
  headerLabel:  { fontSize: 11, fontWeight: '700', color: '#7A9A7A', letterSpacing: 1, textTransform: 'uppercase' },
  totalAmt:     { fontSize: 38, fontWeight: '900', color: '#C9A52A', marginTop: 4 },
  headerSub:    { fontSize: 12, color: '#7A9A7A', marginTop: 4 },
  section:      { backgroundColor: '#fff', borderRadius: 14, margin: 12, marginTop: 0, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
  periodChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  periodChipActive: { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' },
  periodText:   { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  periodTextActive: { color: '#C9A52A', fontWeight: '800' },
  dateLabel:    { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 4 },
  dateInput:    { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13.5, color: '#111827' },
  applyBtn:     { alignSelf: 'flex-end', backgroundColor: '#1A2B1A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  applyText:    { color: '#C9A52A', fontWeight: '800', fontSize: 13 },
  catRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  catName:      { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  catAmt:       { fontSize: 14, fontWeight: '800' },
  barBg:        { height: 5, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  barFill:      { height: 5, borderRadius: 3 },
  catPct:       { width: 40, textAlign: 'right', fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  catDot:       { width: 8, height: 8, borderRadius: 4 },
  entryRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  entryDesc:    { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  entryMeta:    { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  entryAmt:     { fontSize: 14, fontWeight: '800', color: '#1A2B1A' },
  entryDate:    { fontSize: 10.5, color: '#9ca3af', marginTop: 1 },
});
