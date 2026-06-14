/**
 * Reports — CSPos Restaurant Admin match
 *
 * Tabs: Sales · Orders · Items · Payments · Expenses
 * Periods: Today · Yesterday · 7 Days · This Month · Custom
 *
 * API endpoints:
 *   /reports/summary         → KPI bar + Sales Summary totals + Orders tab counts
 *   /reports/sales           → Revenue Trend daily entries
 *   /reports/top-items       → Items tab
 *   /reports/payment-methods → Payments tab
 *   /reports/expenses        → Expenses tab
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, startOfMonth } from 'date-fns';
import { reportsApi } from '@/api/reports';
import { useThemedScreen } from '@/theme/useThemedScreen';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST = '#1B2E1B';
const GOLD   = '#C9A52A';

// ── Tab & period config ───────────────────────────────────────────────────────
const TABS = [
  { label: 'Sales',    icon: 'trending-up-outline'   as const },
  { label: 'Orders',   icon: 'receipt-outline'        as const },
  { label: 'Items',    icon: 'fast-food-outline'      as const },
  { label: 'Payments', icon: 'card-outline'           as const },
  { label: 'Expenses', icon: 'cash-outline'           as const },
];

const PERIODS = [
  { label: 'Today',      key: 'today'     },
  { label: 'Yesterday',  key: 'yesterday' },
  { label: '7 Days',     key: 'week'      },
  { label: 'This Month', key: 'month'     },
  { label: 'Custom',     key: 'custom'    },
];

const METHOD_COLORS: Record<string, string> = {
  cash:          '#16a34a',
  card:          '#2563eb',
  upi:           '#7c3aed',
  online:        '#0891b2',
  razorpay:      '#0891b2',
  bank_transfer: '#d97706',
  cheque:        '#64748b',
  other:         '#6b7280',
};
const BAR_PALETTE = [GOLD, '#2563eb', '#7c3aed', '#16a34a', '#0891b2', '#dc2626', '#d97706', '#64748b'];
function getColor(idx: number) { return BAR_PALETTE[idx % BAR_PALETTE.length]; }

// ── Date helpers ──────────────────────────────────────────────────────────────
function periodDates(key: string): { date_from: string; date_to: string } {
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  const now  = new Date();
  if (key === 'today')     return { date_from: fmt(now), date_to: fmt(now) };
  if (key === 'yesterday') { const y = subDays(now, 1); return { date_from: fmt(y), date_to: fmt(y) }; }
  if (key === 'week')      return { date_from: fmt(subDays(now, 6)), date_to: fmt(now) };
  if (key === 'month')     return { date_from: fmt(startOfMonth(now)), date_to: fmt(now) };
  return { date_from: fmt(now), date_to: fmt(now) };
}

function safeFormat(dateStr: string): string {
  try { return format(new Date(dateStr + 'T00:00:00'), 'dd MMM'); }
  catch { return dateStr?.slice(5) ?? ''; }
}

// ── Money formatters ──────────────────────────────────────────────────────────
const rupee  = (v: number) =>
  `₹${(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const rupee2 = (v: number) =>
  `₹${(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  total_sales:        number;
  total_orders:       number;
  total_tax:          number;
  total_discount:     number;
  net_sales:          number;
  avg_order_value:    number;
  offline_orders:     number;
  online_orders:      number;
  offline_sales:      number;
  online_sales:       number;
  unpaid_count:       number;
  unpaid_total:       number;
  cancelled_count:    number;
  paid_orders:        number;
  completed_orders:   number;
  dine_in_count:      number;
  takeaway_count:     number;
  delivery_count:     number;
  reservations_count: number;
}

interface SalesEntry {
  date:          string;
  total_sales?:  number;
  revenue?:      number;
  sales?:        number;
  total_orders?: number;
  orders?:       number;
}

interface TopItem {
  item_name?:     string;
  name?:          string;
  quantity?:      number;
  qty?:           number;
  total_revenue?: number;
  total_sales?:   number;
  revenue?:       number;
}

interface PayMethod {
  payment_method?: string;
  method?:         string;
  count:           number;
  total:           number;
  percentage?:     number;
}

interface ExpenseData {
  total?:               number;
  total_amount?:        number;
  tax_total?:           number;
  total_tax?:           number;
  count?:               number;
  by_category?:         { category: string; count: number; total: number }[];
  category_breakdown?:  { category: string; count: number; total: number }[];
  entries?:             {
    id?: number; title?: string; description?: string;
    amount: number; tax_amount?: number; total?: number;
    category?: string; payment_method?: string;
    vendor_name?: string; expense_date?: string; date?: string;
  }[];
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function EmptyState({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={ss.emptyBox}>
      <Ionicons name={icon} size={36} color="#e5e7eb" />
      <Text style={ss.emptyText}>{label}</Text>
    </View>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={ss.statRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[ss.dot, { backgroundColor: color }]} />
        <Text style={ss.statLabel}>{label}</Text>
      </View>
      <Text style={[ss.statVal, { color }]}>{value}</Text>
    </View>
  );
}

function BarRow({ label, value, max, color }: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <View style={ss.barRow}>
      <Text style={ss.barLabel} numberOfLines={1}>{label}</Text>
      <View style={ss.barTrack}>
        <View style={[ss.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={ss.barVal}>{rupee(value)}</Text>
    </View>
  );
}

function SummaryCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <View style={[ss.summCard, { borderLeftColor: color }]}>
      <Text style={[ss.summVal, { color }]}>{value}</Text>
      <Text style={ss.summLabel}>{label}</Text>
      {sub ? <Text style={ss.summSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const t = useThemedScreen();

  const [activeTab,    setActiveTab]  = useState(0);
  const [activePeriod, setPeriod]     = useState('today');
  const [customFrom,   setCustomFrom] = useState('');
  const [customTo,     setCustomTo]   = useState('');
  const [loading,      setLoading]    = useState(true);
  const [refreshing,   setRefreshing] = useState(false);
  const [error,        setError]      = useState<string | null>(null);

  const [summary,      setSummary]      = useState<Summary | null>(null);
  const [salesEntries, setSalesEntries] = useState<SalesEntry[]>([]);
  const [topItems,     setTopItems]     = useState<TopItem[]>([]);
  const [payMethods,   setPayMethods]   = useState<PayMethod[]>([]);
  const [pmGrandTotal, setPmGrandTotal] = useState(0);
  const [expenses,     setExpenses]     = useState<ExpenseData | null>(null);

  function getDates() {
    if (activePeriod === 'custom') {
      const today = format(new Date(), 'yyyy-MM-dd');
      return { date_from: customFrom || today, date_to: customTo || today };
    }
    return periodDates(activePeriod);
  }

  const load = useCallback(async (silent = false) => {
    const { date_from, date_to } = getDates();
    if (!silent) setError(null);

    try {
      const [sumRes, sRes, iRes, pRes, eRes] = await Promise.allSettled([
        reportsApi.summary({ date_from, date_to }),
        reportsApi.sales({ date_from, date_to, group_by: 'day' }),
        reportsApi.topItems({ date_from, date_to }),   // no limit — sliced client-side
        reportsApi.paymentMethods({ date_from, date_to }),
        reportsApi.expenses({ date_from, date_to }),
      ]);

      // ── 1. Summary — handle every field-name variant the server sends ──────
      if (sumRes.status === 'fulfilled') {
        const raw = sumRes.value.data ?? {};
        setSummary({
          total_sales:        Number(raw.total_sales        ?? raw.totalSales        ?? 0),
          total_orders:       Number(raw.total_orders       ?? raw.totalOrders       ?? 0),
          total_tax:          Number(raw.total_tax          ?? raw.totalTax          ?? 0),
          total_discount:     Number(raw.total_discount     ?? raw.totalDiscount     ?? 0),
          net_sales:          Number(raw.net_sales          ?? raw.netSales          ?? 0),
          avg_order_value:    Number(raw.avg_order_value    ?? raw.avgOrderValue     ?? raw.avg_order ?? 0),
          offline_orders:     Number(raw.offline_orders     ?? 0),
          online_orders:      Number(raw.online_orders      ?? 0),
          offline_sales:      Number(raw.offline_sales      ?? 0),
          online_sales:       Number(raw.online_sales       ?? 0),
          unpaid_count:       Number(raw.unpaid_count       ?? raw.unpaidOrders      ?? 0),
          unpaid_total:       Number(raw.unpaid_total       ?? raw.unpaidTotal       ?? 0),
          cancelled_count:    Number(raw.cancelled_count    ?? raw.cancelledBills    ?? raw.cancelled_orders ?? 0),
          paid_orders:        Number(raw.paid_orders        ?? raw.paidOrders        ?? 0),
          completed_orders:   Number(raw.completed_orders   ?? raw.completedOrders   ?? 0),
          dine_in_count:      Number(raw.dine_in_count      ?? raw.dineInCount       ?? raw.dine_in  ?? 0),
          takeaway_count:     Number(raw.takeaway_count     ?? raw.takeawayCount     ?? raw.takeaway ?? 0),
          delivery_count:     Number(raw.delivery_count     ?? raw.deliveryCount     ?? raw.delivery ?? 0),
          reservations_count: Number(raw.reservations_count ?? raw.reservationsCount ?? 0),
        });
      }

      // ── 2. Sales trend entries ─────────────────────────────────────────────
      if (sRes.status === 'fulfilled') {
        const raw = sRes.value.data ?? {};
        const rows: SalesEntry[] =
          Array.isArray(raw.data)          ? raw.data
          : Array.isArray(raw.data?.entries)? raw.data.entries
          : Array.isArray(raw)              ? raw
          : [];
        setSalesEntries(rows);
      }

      // ── 3. Top items ───────────────────────────────────────────────────────
      if (iRes.status === 'fulfilled') {
        const raw = iRes.value.data ?? {};
        const rows: TopItem[] = Array.isArray(raw.data) ? raw.data
          : Array.isArray(raw) ? raw : [];
        setTopItems(rows);
      }

      // ── 4. Payment methods — compute percentage client-side ────────────────
      if (pRes.status === 'fulfilled') {
        const raw = pRes.value.data ?? {};
        const rows: PayMethod[] = Array.isArray(raw.data) ? raw.data
          : Array.isArray(raw) ? raw : [];
        const grandTotal = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
        setPmGrandTotal(grandTotal);
        setPayMethods(rows.map(r => ({
          ...r,
          percentage: grandTotal > 0
            ? (Number(r.total ?? 0) / grandTotal) * 100
            : (r.percentage ?? 0),
        })));
      }

      // ── 5. Expenses — handle by_category or category_breakdown ────────────
      if (eRes.status === 'fulfilled') {
        const raw: ExpenseData = eRes.value.data?.data ?? eRes.value.data ?? {};
        setExpenses(raw);
      }

    } catch (e: any) {
      setError(e?.message ?? 'Failed to load reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activePeriod, customFrom, customTo]);

  useEffect(() => { setLoading(true); load(); }, [activePeriod]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── Derived — normalise field names from server variants ──────────────────

  const entries = salesEntries.map(e => ({
    date:    e.date,
    revenue: Number(e.total_sales ?? e.revenue ?? e.sales ?? 0),
    orders:  Number(e.total_orders ?? e.orders ?? 0),
  }));
  const maxRevenue = Math.max(...entries.map(e => e.revenue), 1);

  const items = topItems.map(i => ({
    name:    i.item_name ?? i.name ?? 'Unknown',
    qty:     Number(i.quantity ?? i.qty ?? 0),
    revenue: Number(i.total_revenue ?? i.total_sales ?? i.revenue ?? 0),
  }));
  const maxItemRevenue = Math.max(...items.map(i => i.revenue), 1);

  const pmList = payMethods.map(p => ({
    method:     (p.payment_method ?? p.method ?? 'other').toLowerCase(),
    count:      Number(p.count ?? 0),
    total:      Number(p.total ?? 0),
    percentage: Number(p.percentage ?? 0),
  })).sort((a, b) => b.total - a.total);
  const maxPm = Math.max(...pmList.map(p => p.total), 1);

  const expTotal   = Number(expenses?.total ?? expenses?.total_amount ?? 0);
  const expTax     = Number(expenses?.tax_total ?? expenses?.total_tax ?? 0);
  const expCount   = Number(expenses?.count ?? 0);
  const expCats    = expenses?.by_category ?? expenses?.category_breakdown ?? [];
  const maxExpCat  = Math.max(...expCats.map(c => c.total), 1);
  const expEntries = expenses?.entries ?? [];

  const periodLabel = PERIODS.find(p => p.key === activePeriod)?.label ?? 'Period';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[ss.shell, { backgroundColor: t.colors.background }]}>

      {/* ── Period selector ───────────────────────────────────────────────── */}
      <View style={[ss.periodBar, { backgroundColor: t.colors.surface, borderBottomColor: t.colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          {PERIODS.map(p => {
            const active = activePeriod === p.key;
            return (
              <Pressable
                key={p.key}
                style={[ss.chip, {
                  borderColor:     active ? FOREST : t.colors.border,
                  backgroundColor: active ? FOREST : t.colors.surfaceAlt,
                }]}
                onPress={() => setPeriod(p.key)}
              >
                {p.key === 'custom' && (
                  <Ionicons name="calendar-outline" size={12} color={active ? GOLD : t.colors.textMuted} />
                )}
                <Text style={[ss.chipText, { color: active ? GOLD : t.colors.text }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {activePeriod === 'custom' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Text style={[ss.inputLabel, { color: t.colors.textMuted }]}>From</Text>
              <TextInput
                style={[ss.dateInput, { color: t.colors.text, borderColor: t.colors.border, backgroundColor: t.colors.surfaceAlt }]}
                value={customFrom} onChangeText={setCustomFrom}
                placeholder="YYYY-MM-DD" placeholderTextColor={t.colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ss.inputLabel, { color: t.colors.textMuted }]}>To</Text>
              <TextInput
                style={[ss.dateInput, { color: t.colors.text, borderColor: t.colors.border, backgroundColor: t.colors.surfaceAlt }]}
                value={customTo} onChangeText={setCustomTo}
                placeholder="YYYY-MM-DD" placeholderTextColor={t.colors.textMuted}
              />
            </View>
            <Pressable style={ss.applyBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={ss.applyText}>Apply</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── KPI bar — period-aware ─────────────────────────────────────────── */}
      {summary && (
        <View style={ss.kpiBar}>
          {[
            { label: `${periodLabel} Sales`, val: rupee(summary.total_sales),    color: GOLD      },
            { label: 'Orders',               val: String(summary.total_orders),  color: '#60a5fa' },
            { label: 'Avg Order',            val: rupee(summary.avg_order_value),color: '#4ade80' },
            { label: 'Unpaid',               val: String(summary.unpaid_count),  color: '#f87171' },
          ].map((kpi, i) => (
            <View key={i} style={[ss.kpiTile, i < 3 && { borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={[ss.kpiVal, { color: kpi.color }]}>{kpi.val}</Text>
              <Text style={ss.kpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <View style={[ss.tabBar, { backgroundColor: t.colors.surface, borderBottomColor: t.colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {TABS.map((tab, idx) => {
            const active = activeTab === idx;
            return (
              <Pressable
                key={tab.label}
                style={[ss.tab, active && { borderBottomColor: GOLD }]}
                onPress={() => setActiveTab(idx)}
              >
                <Ionicons name={tab.icon} size={13} color={active ? FOREST : t.colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={[ss.tabText, { color: active ? FOREST : t.colors.textMuted, fontWeight: active ? '800' : '600' }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {loading ? (
          <View style={ss.loader}><ActivityIndicator size="large" color={GOLD} /></View>
        ) : error ? (
          <View style={ss.errorBox}>
            <Ionicons name="alert-circle-outline" size={32} color="#dc2626" />
            <Text style={ss.errorText}>{error}</Text>
            <Pressable style={ss.retryBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={ss.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>

            {/* ═══════════ SALES TAB ═══════════ */}
            {activeTab === 0 && (
              <>
                {/* Summary grid — sourced from /reports/summary */}
                {summary && (
                  <View style={ss.summGrid}>
                    <SummaryCard label="Total Sales"   value={rupee2(summary.total_sales)}    color={GOLD}     />
                    <SummaryCard label="Net Sales"     value={rupee2(summary.net_sales)}      color="#16a34a"  />
                    <SummaryCard label="Tax Collected" value={rupee2(summary.total_tax)}      color="#2563eb"  />
                    <SummaryCard label="Discounts"     value={rupee2(summary.total_discount)} color="#dc2626"  />
                    <SummaryCard label="Avg Order"     value={rupee2(summary.avg_order_value)}color="#d97706"  />
                    <SummaryCard
                      label="Unpaid Total"
                      value={rupee2(summary.unpaid_total)}
                      color="#f87171"
                      sub={summary.unpaid_count > 0 ? `${summary.unpaid_count} orders` : undefined}
                    />
                  </View>
                )}

                {/* Offline vs Online breakdown — matches CSPos Sales Breakdown */}
                {summary && (
                  <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                    <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Sales Breakdown</Text>
                    <View style={ss.breakdownGrid}>
                      {[
                        { label: 'Offline Orders', val: String(summary.offline_orders), color: '#16a34a' },
                        { label: 'Online Orders',  val: String(summary.online_orders),  color: '#dc2626' },
                        { label: 'Offline Sale',   val: rupee(summary.offline_sales),   color: '#d97706' },
                        { label: 'Online Sale',    val: rupee(summary.online_sales),    color: '#7c3aed' },
                        { label: 'Net Sale',       val: rupee(summary.net_sales),       color: '#0891b2', sub: 'Excl. GST' },
                        { label: 'Total Sale',     val: rupee(summary.total_sales),     color: FOREST,    sub: 'Incl. GST' },
                      ].map((item, i) => (
                        <View key={i} style={[ss.bdCell, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }]}>
                          <Text style={[ss.bdVal, { color: item.color }]}>{item.val}</Text>
                          <Text style={[ss.bdLabel, { color: t.colors.textMuted }]}>{item.label}</Text>
                          {item.sub ? <Text style={[ss.bdSub, { color: t.colors.textMuted }]}>{item.sub}</Text> : null}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Revenue trend from /reports/sales entries */}
                <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                  <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Revenue Trend</Text>
                  {entries.length === 0 ? (
                    <EmptyState icon="bar-chart-outline" label="No sales in this period" />
                  ) : (
                    <View style={{ gap: 9 }}>
                      {entries.map((e, i) => (
                        <BarRow key={i} label={safeFormat(e.date)} value={e.revenue} max={maxRevenue} color={GOLD} />
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {/* ═══════════ ORDERS TAB ═══════════ */}
            {activeTab === 1 && (
              <>
                {summary ? (
                  <>
                    <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                      <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Order Status</Text>
                      <StatRow label="Total Orders"    value={summary.total_orders}     color={t.colors.heading} />
                      <StatRow label="Completed"       value={summary.completed_orders} color="#16a34a" />
                      <StatRow label="Cancelled"       value={summary.cancelled_count}  color="#dc2626" />
                      <StatRow label="Unpaid"          value={summary.unpaid_count}     color="#f87171" />
                      <View style={[ss.divider, { borderTopColor: t.colors.border }]} />
                      <StatRow label="Avg Order Value" value={rupee2(summary.avg_order_value)} color={GOLD} />
                    </View>

                    <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                      <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Order Type</Text>
                      {(() => {
                        const typeTotal = Math.max(
                          summary.dine_in_count + summary.takeaway_count + summary.delivery_count, 1
                        );
                        return [
                          { label: 'Dine In',  val: summary.dine_in_count,  color: GOLD      },
                          { label: 'Takeaway', val: summary.takeaway_count, color: '#7c3aed' },
                          { label: 'Delivery', val: summary.delivery_count, color: '#0891b2' },
                        ].map((row, i) => (
                          <View key={i} style={ss.typeRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: 90 }}>
                              <View style={[ss.dot, { backgroundColor: row.color }]} />
                              <Text style={[ss.statLabel, { color: t.colors.text }]}>{row.label}</Text>
                            </View>
                            <View style={ss.barTrack}>
                              <View style={[ss.barFill, {
                                width: `${Math.max(2, (row.val / typeTotal) * 100)}%` as any,
                                backgroundColor: row.color,
                              }]} />
                            </View>
                            <Text style={[ss.barVal, { color: t.colors.text, width: 36, textAlign: 'right' }]}>
                              {row.val}
                            </Text>
                          </View>
                        ));
                      })()}
                    </View>

                    <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                      <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Revenue</Text>
                      <StatRow label="Total Sales"    value={rupee2(summary.total_sales)}    color={GOLD}     />
                      <StatRow label="Net Sales"      value={rupee2(summary.net_sales)}      color="#16a34a"  />
                      <StatRow label="Total Tax"      value={rupee2(summary.total_tax)}      color="#2563eb"  />
                      <StatRow label="Total Discount" value={rupee2(summary.total_discount)} color="#dc2626"  />
                    </View>
                  </>
                ) : (
                  <EmptyState icon="receipt-outline" label="No order data in this period" />
                )}
              </>
            )}

            {/* ═══════════ ITEMS TAB ═══════════ */}
            {activeTab === 2 && (
              <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Top Selling Items</Text>
                {items.length === 0 ? (
                  <EmptyState icon="fast-food-outline" label="No item data in this period" />
                ) : (
                  items.map((item, idx) => {
                    const color = getColor(idx);
                    return (
                      <View key={idx} style={ss.itemRow}>
                        <View style={[ss.rankBadge, { backgroundColor: color + '22' }]}>
                          <Text style={[ss.rankText, { color }]}>#{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 5 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={[ss.itemName, { color: t.colors.heading }]} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={[ss.itemRev, { color }]}>{rupee(item.revenue)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={ss.barTrack}>
                              <View style={[ss.barFill, {
                                width: `${Math.max(2, (item.revenue / maxItemRevenue) * 100)}%` as any,
                                backgroundColor: color,
                              }]} />
                            </View>
                            <Text style={[ss.itemQty, { color: t.colors.textMuted }]}>{item.qty} sold</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* ═══════════ PAYMENTS TAB ═══════════ */}
            {activeTab === 3 && (
              <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Payment Methods</Text>
                {pmList.length === 0 ? (
                  <EmptyState icon="card-outline" label="No payment data in this period" />
                ) : (
                  <>
                    {pmList.map((pm, idx) => {
                      const color = METHOD_COLORS[pm.method] ?? getColor(idx);
                      return (
                        <View key={idx} style={ss.pmRow}>
                          <View style={{ flex: 1, gap: 5 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[ss.dot, { backgroundColor: color }]} />
                                <Text style={[ss.pmMethod, { color: t.colors.heading }]}>
                                  {pm.method.toUpperCase()}
                                </Text>
                                <Text style={[ss.pmCount, { color: t.colors.textMuted }]}>
                                  {pm.count} order{pm.count !== 1 ? 's' : ''}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[ss.pmAmt, { color }]}>{rupee2(pm.total)}</Text>
                                <Text style={[ss.pmPct, { color: t.colors.textMuted }]}>
                                  {pm.percentage.toFixed(1)}%
                                </Text>
                              </View>
                            </View>
                            <View style={ss.barTrack}>
                              <View style={[ss.barFill, {
                                width: `${Math.max(2, (pm.total / maxPm) * 100)}%` as any,
                                backgroundColor: color,
                              }]} />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    <View style={[ss.divider, { borderTopColor: t.colors.border }]} />
                    <View style={ss.totalRow}>
                      <Text style={[ss.totalLabel, { color: t.colors.textMuted }]}>Grand Total</Text>
                      <Text style={[ss.totalVal, { color: FOREST }]}>{rupee2(pmGrandTotal)}</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* ═══════════ EXPENSES TAB ═══════════ */}
            {activeTab === 4 && (
              <>
                {(expCount > 0 || expTotal > 0) && (
                  <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                    <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Expense Summary</Text>
                    <StatRow label="Total Expenses" value={rupee2(expTotal)}          color="#dc2626" />
                    <StatRow label="Tax Paid"        value={rupee2(expTax)}            color="#d97706" />
                    <StatRow label="Net Expenses"    value={rupee2(expTotal - expTax)} color="#374151" />
                    {expCount > 0 && (
                      <StatRow label="Total Entries" value={String(expCount)} color="#6b7280" />
                    )}
                  </View>
                )}

                <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                  <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>By Category</Text>
                  {expCats.length === 0 ? (
                    <EmptyState icon="cash-outline" label="No expenses in this period" />
                  ) : (
                    expCats.map((cat, idx) => {
                      const color = getColor(idx);
                      return (
                        <View key={idx} style={ss.pmRow}>
                          <View style={{ flex: 1, gap: 5 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[ss.dot, { backgroundColor: color }]} />
                                <Text style={[ss.pmMethod, { color: t.colors.heading }]}>{cat.category}</Text>
                                <Text style={[ss.pmCount, { color: t.colors.textMuted }]}>{cat.count} items</Text>
                              </View>
                              <Text style={[ss.pmAmt, { color }]}>{rupee2(cat.total)}</Text>
                            </View>
                            <View style={ss.barTrack}>
                              <View style={[ss.barFill, {
                                width: `${Math.max(2, (cat.total / maxExpCat) * 100)}%` as any,
                                backgroundColor: color,
                              }]} />
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>

                {expEntries.length > 0 && (
                  <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                    <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Recent Entries</Text>
                    {expEntries.slice(0, 20).map((e, idx) => (
                      <View key={idx} style={[ss.expRow, idx > 0 && { borderTopWidth: 1, borderTopColor: t.colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[ss.expTitle, { color: t.colors.heading }]}>
                            {e.title ?? e.description ?? '—'}
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                            {e.category                    && <Text style={[ss.expMeta, { color: t.colors.textMuted }]}>{e.category}</Text>}
                            {e.vendor_name                 && <Text style={[ss.expMeta, { color: t.colors.textMuted }]}>· {e.vendor_name}</Text>}
                            {(e.expense_date ?? e.date)    && <Text style={[ss.expMeta, { color: t.colors.textMuted }]}>· {e.expense_date ?? e.date}</Text>}
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[ss.expAmt, { color: '#dc2626' }]}>
                            {rupee2(Number(e.total ?? e.amount ?? 0))}
                          </Text>
                          {e.payment_method && (
                            <Text style={[ss.expMeta, { color: t.colors.textMuted }]}>{e.payment_method}</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  shell:     { flex: 1 },

  periodBar: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  chipText:  { fontSize: 12.5, fontWeight: '600' },
  inputLabel:{ fontSize: 10.5, fontWeight: '700', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  applyBtn:  { backgroundColor: FOREST, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-end' },
  applyText: { color: GOLD, fontWeight: '800', fontSize: 13 },

  kpiBar:    { backgroundColor: FOREST, flexDirection: 'row' },
  kpiTile:   { flex: 1, alignItems: 'center', paddingVertical: 11 },
  kpiVal:    { fontSize: 14, fontWeight: '900' },
  kpiLabel:  { fontSize: 8, color: 'rgba(255,255,255,0.5)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },

  tabBar:    { borderBottomWidth: 1 },
  tab:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabText:   { fontSize: 13 },

  card:      { borderRadius: 13, padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },

  // Summary grid
  summGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summCard:  { flex: 1, minWidth: '44%', borderRadius: 10, padding: 13, backgroundColor: '#fff', borderLeftWidth: 3, borderWidth: 1, borderColor: '#f3f4f6' },
  summVal:   { fontSize: 16, fontWeight: '900' },
  summLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginTop: 3 },
  summSub:   { fontSize: 10, color: '#9ca3af', marginTop: 1 },

  // Breakdown grid
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bdCell:        { flex: 1, minWidth: '30%', borderRadius: 8, padding: 10, borderWidth: 1, alignItems: 'center' },
  bdVal:         { fontSize: 14, fontWeight: '900' },
  bdLabel:       { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  bdSub:         { fontSize: 9, marginTop: 1 },

  statRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  statLabel: { fontSize: 13.5, fontWeight: '600' },
  statVal:   { fontSize: 14, fontWeight: '800' },
  dot:       { width: 8, height: 8, borderRadius: 4 },

  barRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  barLabel:  { width: 52, fontSize: 11, fontWeight: '600', color: '#6b7280' },
  barTrack:  { flex: 1, height: 7, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' },
  barFill:   { height: 7, borderRadius: 4 },
  barVal:    { width: 68, textAlign: 'right', fontSize: 12, fontWeight: '700', color: '#374151' },

  typeRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },

  itemRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  rankBadge: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankText:  { fontSize: 11, fontWeight: '900' },
  itemName:  { fontSize: 13.5, fontWeight: '700', flex: 1 },
  itemRev:   { fontSize: 13.5, fontWeight: '800' },
  itemQty:   { fontSize: 11, fontWeight: '600', width: 52, textAlign: 'right' },

  pmRow:     { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  pmMethod:  { fontSize: 13.5, fontWeight: '800' },
  pmCount:   { fontSize: 11 },
  pmAmt:     { fontSize: 14, fontWeight: '800' },
  pmPct:     { fontSize: 11, fontWeight: '600' },

  divider:   { marginVertical: 12, borderTopWidth: 1 },
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel:{ fontSize: 13.5, fontWeight: '700' },
  totalVal:  { fontSize: 17, fontWeight: '900' },

  expRow:    { paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  expTitle:  { fontSize: 13.5, fontWeight: '700' },
  expMeta:   { fontSize: 11, fontWeight: '500' },
  expAmt:    { fontSize: 14, fontWeight: '800' },

  emptyBox:  { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  loader:    { paddingTop: 60, alignItems: 'center' },
  errorBox:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center', fontWeight: '600' },
  retryBtn:  { backgroundColor: FOREST, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 9 },
  retryText: { color: GOLD, fontWeight: '800', fontSize: 13 },
});
