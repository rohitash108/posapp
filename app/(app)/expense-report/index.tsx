/**
 * Expense Report — CSPos Restaurant Admin match
 * Stats · Date range · Daily/Monthly trend charts · Category + Payment breakdown
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, startOfMonth } from 'date-fns';
import { reportsApi } from '@/api/reports';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

// ── Tokens ────────────────────────────────────────────────────────────────────
const PRIMARY = '#2563eb';

const PERIODS = [
  { label: 'Today',    days: 0  },
  { label: '7 Days',   days: 7  },
  { label: '30 Days',  days: 30 },
  { label: '3 Months', days: 90 },
] as const;

const CAT_COLORS = ['#2563eb','#7c3aed','#dc2626','#d97706','#16a34a','#0891b2','#db2777','#0f766e'];
const PM_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI', bank_transfer: 'Bank Transfer', other: 'Other',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface CatRow  { category: string; count: number; total: number }
interface PMRow   { method: string;   count: number; total: number }
interface TrendPt { date?: string; month?: string; total: number }
interface Report  {
  total?: number;
  tax_total?: number;
  count?: number;
  by_category?: CatRow[];
  by_payment_method?: PMRow[];
  daily_trend?: TrendPt[];
  monthly_trend?: TrendPt[];
  entries?: { category?: string; amount: number; tax_amount?: number; payment_method?: string; description?: string; date?: string }[];
}

// ── Chart style factory ───────────────────────────────────────────────────────
function mkCh(c: ThemeColors) {
  return StyleSheet.create({
    wrap:    { minHeight: 160, paddingTop: 8 },
    bars:    { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 4, minHeight: 140, paddingBottom: 28 },
    barCol:  { flex: 1, alignItems: 'center', gap: 2 },
    barVal:  { fontSize: 8, color: c.textMuted, textAlign: 'center' },
    barBg:   { width: '100%', flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' },
    barFill: { width: '100%', borderRadius: 3 },
    barLbl:  { fontSize: 8, color: c.textMuted, textAlign: 'center', width: '100%' },
    empty:   { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 8 },
    emptyTxt:{ fontSize: 12, color: c.textMuted },
  });
}

// ── Screen style factory ──────────────────────────────────────────────────────
function mkS(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },

    // Page header
    pageHeader:   { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle:    { fontSize: 20, fontWeight: '800', color: c.heading },
    dateRange:    { fontSize: 12, color: c.brand, marginTop: 2, fontWeight: '600' },
    datePickers:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' },
    dateField:    { gap: 4 },
    dateFieldLbl: { fontSize: 10.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    dateInput:    { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: c.heading, backgroundColor: c.surface, minWidth: 110 },
    applyBtn:     { backgroundColor: c.sidebar, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
    applyTxt:     { color: '#fff', fontWeight: '700', fontSize: 13 },

    // Stats
    statsRow: { flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    statCard: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: c.border },
    statLbl:  { fontSize: 10, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    statAmt:  { fontSize: 18, fontWeight: '800' },
    statCount:{ fontSize: 22, fontWeight: '800', color: c.heading },

    // Period chips
    chipsRow:      { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    chip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
    chipActive:    { backgroundColor: c.sidebar, borderColor: c.sidebar },
    chipTxt:       { fontSize: 12, fontWeight: '600', color: c.text },
    chipTxtActive: { color: '#fff', fontWeight: '700' },

    // Load / empty
    loadWrap: { paddingTop: 80, alignItems: 'center', gap: 12 },
    loadTxt:  { fontSize: 13, color: c.textMuted },
    emptyWrap:{ alignItems: 'center', paddingVertical: 48, gap: 8 },
    emptyTxt: { fontSize: 14, fontWeight: '700', color: c.text },
    emptySub: { fontSize: 12, color: c.textMuted },

    // Body
    body:      { padding: 12, gap: 12 },
    chartsRow: { gap: 12 },
    tablesRow: { gap: 12 },

    // Cards
    chartCard:  { backgroundColor: c.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    tableCard:  { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    cardTitle:  { fontSize: 13, fontWeight: '700', color: c.heading },
    tableHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    badge:      { backgroundColor: c.surfaceAlt, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    badgeTxt:   { fontSize: 11, fontWeight: '700', color: c.textMuted },

    // Table
    tHead:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.surfaceAlt, borderBottomWidth: 1, borderBottomColor: c.border },
    tHCell:   { fontSize: 10, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    tRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 },
    tRowAlt:  { backgroundColor: c.surfaceAlt },
    tCell:    { fontSize: 13, color: c.text },
    tFoot:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.surfaceAlt, borderTopWidth: 1, borderTopColor: c.border },
    tFootTxt: { fontSize: 12, fontWeight: '800', color: c.heading },
    tEmpty:   { paddingVertical: 32, alignItems: 'center' },
    tEmptyTxt:{ fontSize: 13, color: c.textMuted },
    catDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
    pmIcon:   { width: 22, height: 22, borderRadius: 6, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  });
}

// ── Mini bar chart (View-based, works on both platforms) ─────────────────────
function TrendChart({ data, label, color = PRIMARY }: {
  data: { label: string; value: number }[];
  label: string;
  color?: string;
}) {
  const { colors: c } = useTheme();
  const ch = useMemo(() => mkCh(c), [c]);

  const max = Math.max(...data.map(d => d.value), 1);
  if (data.length === 0) {
    return (
      <View style={ch.empty}>
        <Ionicons name="bar-chart-outline" size={32} color={c.border} />
        <Text style={ch.emptyTxt}>No data for this period</Text>
      </View>
    );
  }
  return (
    <View style={ch.wrap}>
      <View style={ch.bars}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <View key={i} style={ch.barCol}>
              <Text style={ch.barVal}>{d.value > 0 ? `₹${d.value >= 1000 ? (d.value/1000).toFixed(1)+'k' : d.value.toFixed(0)}` : ''}</Text>
              <View style={ch.barBg}>
                <View style={[ch.barFill, { height: `${Math.max(pct, 2)}%` as any, backgroundColor: color }]} />
              </View>
              <Text style={ch.barLbl} numberOfLines={1}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ExpenseReportScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;

  const { colors: c } = useTheme();
  const s = useMemo(() => mkS(c), [c]);

  const [data,       setData]       = useState<Report | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodIdx,  setPeriodIdx]  = useState(1);
  const [showCustom, setShowCustom] = useState(false);
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  function getPeriodDates(idx: number): { from: string; to: string } {
    const today = format(new Date(), 'yyyy-MM-dd');
    const d = PERIODS[idx].days;
    if (d === 0) return { from: today, to: today };
    return { from: format(subDays(new Date(), d), 'yyyy-MM-dd'), to: today };
  }

  const displayFrom = showCustom ? dateFrom : getPeriodDates(periodIdx).from;
  const displayTo   = showCustom ? dateTo   : getPeriodDates(periodIdx).to;

  const load = useCallback(async (params?: { from?: string; to?: string }) => {
    try {
      const f = params?.from ?? displayFrom;
      const t = params?.to   ?? displayTo;
      const res = await reportsApi.expenses({ date_from: f || undefined, date_to: t || undefined });
      const d: Report = res.data?.data ?? res.data ?? {};
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); setRefreshing(false); }
  }, [displayFrom, displayTo]);

  useEffect(() => { setLoading(true); load(); }, [periodIdx, showCustom]);

  function applyCustom() { setLoading(true); load({ from: dateFrom, to: dateTo }); }

  // ── Computed values ──────────────────────────────────────────────────────────
  const entries    = data?.entries      ?? [];
  const byCategory = data?.by_category  ?? [];
  const byPM       = data?.by_payment_method ?? [];
  const dailyTrend = (data?.daily_trend ?? []).map(p => ({
    label: p.date ? format(new Date(p.date), 'dd MMM') : '',
    value: Number(p.total),
  }));
  const monthlyTrend = (data?.monthly_trend ?? []).map(p => ({
    label: p.month ?? '',
    value: Number(p.total),
  }));

  const totalSpent  = Number(data?.total   ?? entries.reduce((s, e) => s + Number(e.amount), 0));
  const taxPaid     = Number(data?.tax_total ?? entries.reduce((s, e) => s + Number(e.tax_amount ?? 0), 0));
  const catCount    = data?.count !== undefined ? byCategory.length : byCategory.length;
  const recordCount = data?.count ?? entries.length;

  const fmtAmt = (n: number) => `₹${n.toFixed(2)}`;

  // ── Date range label ─────────────────────────────────────────────────────────
  function fmtRangeDate(d: string) {
    if (!d) return '—';
    try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; }
  }

  return (
    <ScrollView
      style={s.screen}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} tintColor={c.sidebar}
          onRefresh={() => { setRefreshing(true); load(); }} />
      }>

      {/* ── Page header ── */}
      <View style={s.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Expense Report</Text>
          {displayFrom && displayTo ? (
            <Text style={s.dateRange}>{fmtRangeDate(displayFrom)} — {fmtRangeDate(displayTo)}</Text>
          ) : null}
        </View>

        {/* Date inputs */}
        <View style={s.datePickers}>
          <View style={s.dateField}>
            <Text style={s.dateFieldLbl}>From</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setShowCustom(true); }}
                style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 12, color: c.heading, backgroundColor: c.surface, cursor: 'pointer' } as any}
              />
            ) : (
              <TextInput style={s.dateInput} value={dateFrom} onChangeText={v => { setDateFrom(v); setShowCustom(true); }} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} />
            )}
          </View>
          <View style={s.dateField}>
            <Text style={s.dateFieldLbl}>To</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setShowCustom(true); }}
                style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 12, color: c.heading, backgroundColor: c.surface, cursor: 'pointer' } as any}
              />
            ) : (
              <TextInput style={s.dateInput} value={dateTo} onChangeText={v => { setDateTo(v); setShowCustom(true); }} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} />
            )}
          </View>
          <Pressable style={({ pressed }) => [s.applyBtn, pressed && { opacity: 0.85 }]} onPress={applyCustom}>
            <Text style={s.applyTxt}>Apply</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Stats ── */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={[s.statLbl, { color: c.brand }]}>Total Spent</Text>
          <Text style={[s.statAmt, { color: c.brand }]}>{fmtAmt(totalSpent)}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statLbl, { color: c.brand }]}>Tax Paid</Text>
          <Text style={[s.statAmt, { color: c.brand }]}>{fmtAmt(taxPaid)}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLbl}>Categories</Text>
          <Text style={s.statCount}>{byCategory.length}</Text>
        </View>
        <View style={[s.statCard, { borderRightWidth: 0 }]}>
          <Text style={s.statLbl}>Records</Text>
          <Text style={s.statCount}>{recordCount}</Text>
        </View>
      </View>

      {/* ── Period chips ── */}
      <View style={s.chipsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8, alignItems: 'center' }}>
          {PERIODS.map((p, idx) => {
            const active = periodIdx === idx && !showCustom;
            return (
              <Pressable key={p.label}
                style={({ pressed }) => [s.chip, active && s.chipActive, pressed && { opacity: 0.8 }]}
                onPress={() => { setShowCustom(false); setPeriodIdx(idx); }}>
                <Text style={[s.chipTxt, active && s.chipTxtActive]}>{p.label}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={({ pressed }) => [s.chip, showCustom && s.chipActive, pressed && { opacity: 0.8 }]}
            onPress={() => setShowCustom(true)}>
            <Ionicons name="calendar-outline" size={12} color={showCustom ? '#fff' : c.text} />
            <Text style={[s.chipTxt, showCustom && s.chipTxtActive]}>Custom</Text>
          </Pressable>
        </ScrollView>
      </View>

      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color={c.sidebar} size="large" />
          <Text style={s.loadTxt}>Generating report…</Text>
        </View>
      ) : (
        <View style={s.body}>

          {/* ── Trend charts ── */}
          <View style={[s.chartsRow, isDesktop && { flexDirection: 'row', gap: 12 }]}>
            <View style={[s.chartCard, isDesktop && { flex: 2 }]}>
              <Text style={s.cardTitle}>Daily Expense Trend</Text>
              <TrendChart data={dailyTrend} label="Daily" color={PRIMARY} />
            </View>
            <View style={[s.chartCard, isDesktop && { flex: 1 }]}>
              <Text style={s.cardTitle}>Monthly Trend</Text>
              <TrendChart data={monthlyTrend} label="Monthly" color="#7c3aed" />
            </View>
          </View>

          {/* ── Breakdown tables ── */}
          <View style={[s.tablesRow, isDesktop && { flexDirection: 'row', gap: 12 }]}>

            {/* Category breakdown */}
            <View style={[s.tableCard, isDesktop && { flex: 1 }]}>
              <View style={s.tableHeader}>
                <Text style={s.cardTitle}>Category Breakdown</Text>
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>{byCategory.length} categories</Text>
                </View>
              </View>
              <View style={s.tHead}>
                <Text style={[s.tHCell, { flex: 1 }]}>Category</Text>
                <Text style={[s.tHCell, { width: 56, textAlign: 'center' }]}>Count</Text>
                <Text style={[s.tHCell, { width: 90, textAlign: 'right' }]}>Amount</Text>
              </View>
              {byCategory.length === 0 ? (
                <View style={s.tEmpty}>
                  <Text style={s.tEmptyTxt}>No category data</Text>
                </View>
              ) : byCategory.map((row, idx) => (
                <View key={row.category} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                  <View style={[s.catDot, { backgroundColor: CAT_COLORS[idx % CAT_COLORS.length] }]} />
                  <Text style={[s.tCell, { flex: 1 }]}>{row.category}</Text>
                  <Text style={[s.tCell, { width: 56, textAlign: 'center', color: c.textMuted }]}>{row.count}</Text>
                  <Text style={[s.tCell, { width: 90, textAlign: 'right', fontWeight: '700', color: c.heading }]}>
                    ₹{Number(row.total).toFixed(2)}
                  </Text>
                </View>
              ))}
              {byCategory.length > 0 && (
                <View style={s.tFoot}>
                  <Text style={[s.tFootTxt, { flex: 1 }]}>Total</Text>
                  <Text style={[s.tFootTxt, { width: 90, textAlign: 'right' }]}>
                    ₹{byCategory.reduce((sum, row) => sum + Number(row.total), 0).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>

            {/* Payment method breakdown */}
            <View style={[s.tableCard, isDesktop && { flex: 1 }]}>
              <View style={s.tableHeader}>
                <Text style={s.cardTitle}>Payment Method Breakdown</Text>
              </View>
              <View style={s.tHead}>
                <Text style={[s.tHCell, { flex: 1 }]}>Method</Text>
                <Text style={[s.tHCell, { width: 56, textAlign: 'center' }]}>Count</Text>
                <Text style={[s.tHCell, { width: 90, textAlign: 'right' }]}>Total</Text>
              </View>
              {byPM.length === 0 ? (
                <View style={s.tEmpty}>
                  <Text style={s.tEmptyTxt}>No payment data</Text>
                </View>
              ) : byPM.map((p, idx) => (
                <View key={p.method} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                  <View style={s.pmIcon}>
                    <Ionicons
                      name={p.method === 'cash' ? 'cash-outline' : p.method === 'card' ? 'card-outline' : p.method === 'upi' ? 'phone-portrait-outline' : 'business-outline'}
                      size={13} color={c.textMuted} />
                  </View>
                  <Text style={[s.tCell, { flex: 1 }]}>{PM_LABELS[p.method] ?? p.method}</Text>
                  <Text style={[s.tCell, { width: 56, textAlign: 'center', color: c.textMuted }]}>{p.count}</Text>
                  <Text style={[s.tCell, { width: 90, textAlign: 'right', fontWeight: '700', color: c.heading }]}>
                    ₹{Number(p.total).toFixed(2)}
                  </Text>
                </View>
              ))}
              {byPM.length > 0 && (
                <View style={s.tFoot}>
                  <Text style={[s.tFootTxt, { flex: 1 }]}>Total</Text>
                  <Text style={[s.tFootTxt, { width: 90, textAlign: 'right' }]}>
                    ₹{byPM.reduce((sum, p) => sum + Number(p.total), 0).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Entries list (if available) ── */}
          {entries.length > 0 && (
            <View style={s.tableCard}>
              <View style={s.tableHeader}>
                <Text style={s.cardTitle}>All Entries</Text>
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>{entries.length} records</Text>
                </View>
              </View>
              <View style={s.tHead}>
                <Text style={[s.tHCell, { flex: 1 }]}>Description</Text>
                <Text style={[s.tHCell, { width: 90 }]}>Category</Text>
                <Text style={[s.tHCell, { width: 70 }]}>Method</Text>
                <Text style={[s.tHCell, { width: 80, textAlign: 'right' }]}>Tax</Text>
                <Text style={[s.tHCell, { width: 90, textAlign: 'right' }]}>Amount</Text>
              </View>
              {entries.map((e, idx) => (
                <View key={idx} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                  <View style={[s.catDot, { backgroundColor: CAT_COLORS[idx % CAT_COLORS.length] }]} />
                  <Text style={[s.tCell, { flex: 1 }]} numberOfLines={1}>{e.description || '—'}</Text>
                  <Text style={[s.tCell, { width: 90, color: c.textMuted }]} numberOfLines={1}>{e.category || '—'}</Text>
                  <Text style={[s.tCell, { width: 70, color: c.textMuted }]}>{PM_LABELS[e.payment_method ?? ''] ?? (e.payment_method || '—')}</Text>
                  <Text style={[s.tCell, { width: 80, textAlign: 'right', color: c.textMuted }]}>₹{Number(e.tax_amount ?? 0).toFixed(2)}</Text>
                  <Text style={[s.tCell, { width: 90, textAlign: 'right', fontWeight: '700', color: c.heading }]}>₹{Number(e.amount).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Empty ── */}
          {!data || (entries.length === 0 && byCategory.length === 0 && byPM.length === 0) ? (
            <View style={s.emptyWrap}>
              <Ionicons name="receipt-outline" size={44} color={c.border} />
              <Text style={s.emptyTxt}>No expense data for this period</Text>
              <Text style={s.emptySub}>Try adjusting the date range</Text>
            </View>
          ) : null}

        </View>
      )}
    </ScrollView>
  );
}
