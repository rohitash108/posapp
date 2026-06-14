import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, startOfMonth, startOfWeek } from 'date-fns';
import { reportsApi } from '@/api/reports';
import { useThemedScreen } from '@/theme/useThemedScreen';

// ── Types ────────────────────────────────────────────────────────────────────

interface SalesEntry { date: string; orders: number; revenue: number; }
interface SalesData {
  entries: SalesEntry[];
  total_revenue: number;  paid_revenue: number;  total_orders: number;
  avg_order: number;      total_tax: number;      total_discount: number;
  completed: number;      cancelled: number;
  dine_in: number;        takeaway: number;       delivery: number;
}
interface TopItem { name: string; quantity: number; total_revenue: number; order_count: number; }
interface PayMethod { method: string; count: number; total: number; percentage: number; }
interface ExpenseEntry {
  id: number; title: string; amount: number; tax_amount: number; total: number;
  category?: string; payment_method?: string; vendor_name?: string; expense_date?: string;
}
interface ExpenseCat { category: string; total: number; tax: number; count: number; }
interface ExpensesData {
  entries: ExpenseEntry[];
  category_breakdown: ExpenseCat[];
  total: number; total_tax: number; count: number;
}
interface Summary {
  today_sales: number;   today_orders: number;
  week_sales: number;    month_sales: number;
  total_orders: number;  avg_order: number;
  unpaid_orders: number; paid_orders: number; cancelled_orders: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FOREST = '#1B2E1B';
const GOLD   = '#C9A52A';

const TABS = [
  { label: 'Sales',    icon: 'trending-up-outline'  as const },
  { label: 'Orders',   icon: 'receipt-outline'       as const },
  { label: 'Items',    icon: 'fast-food-outline'     as const },
  { label: 'Payments', icon: 'wallet-outline'        as const },
  { label: 'Expenses', icon: 'cash-outline'          as const },
];

const PERIODS = [
  { label: 'Today',      key: 'today'     },
  { label: 'Yesterday',  key: 'yesterday' },
  { label: '7 Days',     key: 'week'      },
  { label: 'This Month', key: 'month'     },
  { label: 'Custom',     key: 'custom'    },
];

const METHOD_COLORS: Record<string, string> = {
  cash: '#16a34a', card: '#2563eb', upi: '#7c3aed',
  online: '#0891b2', razorpay: '#0891b2', other: '#6b7280',
};
const BAR_PALETTE = [GOLD, '#2563eb', '#7c3aed', '#16a34a', '#0891b2', '#dc2626', '#d97706', '#64748b'];

function getColor(idx: number): string { return BAR_PALETTE[idx % BAR_PALETTE.length]; }

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const rupee  = (v: number) => `₹${(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const rupee2 = (v: number) => `₹${(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function BarRow({ label, value, max, color, suffix = '' }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <View style={ss.barRow}>
      <Text style={ss.barLabel} numberOfLines={1}>{label}</Text>
      <View style={ss.barTrack}><View style={[ss.barFill, { width: `${pct}%` as any, backgroundColor: color }]} /></View>
      <Text style={ss.barVal}>{suffix}{rupee(value)}</Text>
    </View>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={ss.statRowContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[ss.dot, { backgroundColor: color }]} />
        <Text style={ss.statRowLabel}>{label}</Text>
      </View>
      <Text style={[ss.statRowVal, { color }]}>{value}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const t = useThemedScreen();

  const [activeTab,  setActiveTab]  = useState(0);
  const [activePeriod, setPeriod]   = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [salesData,  setSalesData]  = useState<SalesData | null>(null);
  const [topItems,   setTopItems]   = useState<TopItem[]>([]);
  const [payMethods, setPayMethods] = useState<{ data: PayMethod[]; grand_total: number } | null>(null);
  const [expenses,   setExpenses]   = useState<ExpensesData | null>(null);

  function getDates() {
    if (activePeriod === 'custom') {
      return {
        date_from: customFrom || format(new Date(), 'yyyy-MM-dd'),
        date_to:   customTo   || format(new Date(), 'yyyy-MM-dd'),
      };
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
        reportsApi.topItems({ date_from, date_to, limit: 10 }),
        reportsApi.paymentMethods({ date_from, date_to }),
        reportsApi.expenses({ date_from, date_to }),
      ]);
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data);
      if (sRes.status   === 'fulfilled') setSalesData(sRes.value.data?.data ?? null);
      if (iRes.status   === 'fulfilled') setTopItems(iRes.value.data?.data ?? []);
      if (pRes.status   === 'fulfilled') setPayMethods(pRes.value.data ?? null);
      if (eRes.status   === 'fulfilled') setExpenses(eRes.value.data?.data ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activePeriod, customFrom, customTo]);

  useEffect(() => { setLoading(true); load(); }, [activePeriod]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── Derived ──────────────────────────────────────────────────────────────

  const rawEntries  = salesData?.entries ?? [];
  const salesEntries: SalesEntry[] = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);
  const maxSales    = Math.max(...salesEntries.map(e => e.revenue), 1);
  const rawTopItems = Array.isArray(topItems) ? topItems : Object.values(topItems ?? {});
  const maxTopItem  = Math.max(...rawTopItems.map((i: any) => i.total_revenue), 1);
  const pmList      = Array.isArray(payMethods?.data) ? payMethods!.data : Object.values(payMethods?.data ?? {});
  const maxPm       = Math.max(...pmList.map((p: any) => p.total), 1);
  const rawExpCats  = expenses?.category_breakdown ?? [];
  const expCats     = Array.isArray(rawExpCats) ? rawExpCats : Object.values(rawExpCats);
  const maxExpCat   = Math.max(...expCats.map((c: any) => c.total), 1);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[ss.shell, { backgroundColor: t.colors.background }]}>

      {/* Period selector */}
      <View style={[ss.periodBar, { backgroundColor: t.colors.surface, borderBottomColor: t.colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          {PERIODS.map(p => {
            const active = activePeriod === p.key;
            return (
              <Pressable
                key={p.key}
                style={[ss.periodChip, { borderColor: active ? FOREST : t.colors.border, backgroundColor: active ? FOREST : t.colors.surfaceAlt }]}
                onPress={() => { if (p.key !== 'custom') setPeriod(p.key); else setPeriod('custom'); }}
              >
                {p.key === 'custom' && <Ionicons name="calendar-outline" size={12} color={active ? GOLD : t.colors.textMuted} />}
                <Text style={[ss.periodText, { color: active ? GOLD : t.colors.text }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {activePeriod === 'custom' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Text style={[ss.inputLabel, { color: t.colors.textMuted }]}>From</Text>
              <TextInput style={[ss.dateInput, { color: t.colors.text, borderColor: t.colors.border, backgroundColor: t.colors.surfaceAlt }]} value={customFrom} onChangeText={setCustomFrom} placeholder="YYYY-MM-DD" placeholderTextColor={t.colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ss.inputLabel, { color: t.colors.textMuted }]}>To</Text>
              <TextInput style={[ss.dateInput, { color: t.colors.text, borderColor: t.colors.border, backgroundColor: t.colors.surfaceAlt }]} value={customTo} onChangeText={setCustomTo} placeholder="YYYY-MM-DD" placeholderTextColor={t.colors.textMuted} />
            </View>
            <Pressable style={ss.applyBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={ss.applyText}>Apply</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* KPI summary bar */}
      {summary && (
        <View style={ss.kpiBar}>
          {[
            { label: "Today's Sales", val: rupee(summary.today_sales ?? 0), color: GOLD },
            { label: 'Month Orders',  val: String(summary.total_orders ?? 0), color: '#60a5fa' },
            { label: 'Avg Order',     val: rupee(summary.avg_order ?? 0),     color: '#4ade80' },
            { label: 'Unpaid',        val: String(summary.unpaid_orders ?? 0), color: '#f87171' },
          ].map((kpi, i) => (
            <View key={i} style={[ss.kpiTile, i < 3 && { borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)' }]}>
              <Text style={[ss.kpiVal, { color: kpi.color }]}>{kpi.val}</Text>
              <Text style={ss.kpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Tab bar */}
      <View style={[ss.tabBar, { backgroundColor: t.colors.surface, borderBottomColor: t.colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {TABS.map((tab, idx) => {
            const active = activeTab === idx;
            return (
              <Pressable key={tab.label} style={[ss.tab, active && { borderBottomColor: GOLD }]} onPress={() => setActiveTab(idx)}>
                <Ionicons name={tab.icon} size={13} color={active ? FOREST : t.colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={[ss.tabText, { color: active ? FOREST : t.colors.textMuted, fontWeight: active ? '800' : '600' }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
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
            {/* ── SALES TAB ─────────────────────────────────────────── */}
            {activeTab === 0 && (
              <>
                {/* Revenue Trend */}
                <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                  <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Revenue Trend</Text>
                  {salesEntries.length === 0 ? (
                    <EmptyState icon="bar-chart-outline" label="No sales in this period" />
                  ) : (
                    <View style={{ gap: 9 }}>
                      {salesEntries.map((e, i) => (
                        <BarRow key={i} label={safeFormat(e.date)} value={e.revenue} max={maxSales} color={GOLD} />
                      ))}
                    </View>
                  )}
                </View>

                {/* Revenue totals */}
                {salesData && (
                  <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                    <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Sales Summary</Text>
                    <StatRow label="Gross Revenue"  value={rupee2(salesData.total_revenue  ?? 0)} color={GOLD} />
                    <StatRow label="Paid Revenue"   value={rupee2(salesData.paid_revenue   ?? 0)} color="#16a34a" />
                    <StatRow label="Tax Collected"  value={rupee2(salesData.total_tax      ?? 0)} color="#2563eb" />
                    <StatRow label="Discounts"      value={rupee2(salesData.total_discount ?? 0)} color="#dc2626" />
                    <View style={[ss.divider, { borderTopColor: t.colors.border }]} />
                    <View style={ss.totalRow}>
                      <Text style={[ss.totalLabel, { color: t.colors.textMuted }]}>Net Paid</Text>
                      <Text style={[ss.totalVal, { color: FOREST }]}>{rupee2((salesData.paid_revenue ?? 0) - (salesData.total_tax ?? 0))}</Text>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ── ORDERS TAB ────────────────────────────────────────── */}
            {activeTab === 1 && salesData && (
              <>
                <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                  <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Order Status</Text>
                  <StatRow label="Total Orders"  value={salesData.total_orders ?? 0} color={t.colors.heading} />
                  <StatRow label="Completed"     value={salesData.completed    ?? 0} color="#16a34a" />
                  <StatRow label="Cancelled"     value={salesData.cancelled    ?? 0} color="#dc2626" />
                  <StatRow label="Avg Order Value" value={rupee2(salesData.avg_order ?? 0)} color={GOLD} />
                </View>
                <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                  <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Order Type</Text>
                  {(() => {
                    const total = (salesData.dine_in ?? 0) + (salesData.takeaway ?? 0) + (salesData.delivery ?? 0) || 1;
                    return [
                      { label: 'Dine In',   val: salesData.dine_in  ?? 0, color: GOLD },
                      { label: 'Takeaway',  val: salesData.takeaway ?? 0, color: '#7c3aed' },
                      { label: 'Delivery',  val: salesData.delivery ?? 0, color: '#0891b2' },
                    ].map((row, i) => (
                      <View key={i} style={ss.typeRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: 90 }}>
                          <View style={[ss.dot, { backgroundColor: row.color }]} />
                          <Text style={[ss.statRowLabel, { color: t.colors.text }]}>{row.label}</Text>
                        </View>
                        <View style={ss.barTrack}>
                          <View style={[ss.barFill, { width: `${Math.max(2, (row.val / total) * 100)}%` as any, backgroundColor: row.color }]} />
                        </View>
                        <Text style={[ss.barVal, { color: t.colors.text }]}>{row.val}</Text>
                      </View>
                    ));
                  })()}
                </View>
              </>
            )}

            {/* ── ITEMS TAB ─────────────────────────────────────────── */}
            {activeTab === 2 && (
              <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Top Selling Items</Text>
                {topItems.length === 0 ? (
                  <EmptyState icon="fast-food-outline" label="No item data in this period" />
                ) : (
                  topItems.map((item, idx) => {
                    const color = getColor(idx);
                    return (
                      <View key={idx} style={ss.itemRow}>
                        <View style={[ss.rankBadge, { backgroundColor: color + '20' }]}>
                          <Text style={[ss.rankText, { color }]}>#{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 5 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={[ss.itemName, { color: t.colors.heading }]} numberOfLines={1}>{item.name}</Text>
                            <Text style={[ss.itemRev, { color }]}>{rupee(item.total_revenue)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={ss.barTrack}>
                              <View style={[ss.barFill, { width: `${Math.max(2, (item.total_revenue / maxTopItem) * 100)}%` as any, backgroundColor: color }]} />
                            </View>
                            <Text style={[ss.itemQty, { color: t.colors.textMuted }]}>{item.quantity} sold</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* ── PAYMENTS TAB ──────────────────────────────────────── */}
            {activeTab === 3 && (
              <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Payment Methods</Text>
                {pmList.length === 0 ? (
                  <EmptyState icon="wallet-outline" label="No payment data in this period" />
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
                                <Text style={[ss.pmMethod, { color: t.colors.heading }]}>{pm.method.toUpperCase()}</Text>
                                <Text style={[ss.pmCount, { color: t.colors.textMuted }]}>{pm.count} orders</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[ss.pmAmt, { color }]}>{rupee(pm.total)}</Text>
                                <Text style={[ss.pmPct, { color: t.colors.textMuted }]}>{pm.percentage.toFixed(1)}%</Text>
                              </View>
                            </View>
                            <View style={ss.barTrack}>
                              <View style={[ss.barFill, { width: `${Math.max(2, (pm.total / maxPm) * 100)}%` as any, backgroundColor: color }]} />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    <View style={[ss.divider, { borderTopColor: t.colors.border }]} />
                    <View style={ss.totalRow}>
                      <Text style={[ss.totalLabel, { color: t.colors.textMuted }]}>Grand Total</Text>
                      <Text style={[ss.totalVal, { color: FOREST }]}>{rupee2(payMethods?.grand_total ?? 0)}</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* ── EXPENSES TAB ──────────────────────────────────────── */}
            {activeTab === 4 && (
              <>
                {/* Category breakdown */}
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
                              <View style={[ss.barFill, { width: `${Math.max(2, (cat.total / maxExpCat) * 100)}%` as any, backgroundColor: color }]} />
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                  {expenses && expenses.count > 0 && (
                    <>
                      <View style={[ss.divider, { borderTopColor: t.colors.border }]} />
                      <StatRow label="Total Expenses" value={rupee2(expenses.total)}     color="#dc2626" />
                      <StatRow label="Total Tax"      value={rupee2(expenses.total_tax)} color="#d97706" />
                    </>
                  )}
                </View>

                {/* Recent expense entries */}
                {expenses && expenses.entries.length > 0 && (
                  <View style={[ss.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
                    <Text style={[ss.cardTitle, { color: t.colors.textMuted }]}>Recent Expenses</Text>
                    {expenses.entries.slice(0, 15).map((e, idx) => (
                      <View key={e.id} style={[ss.expRow, idx > 0 && { borderTopWidth: 1, borderTopColor: t.colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[ss.expTitle, { color: t.colors.heading }]}>{e.title}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                            {e.category    && <Text style={[ss.expMeta, { color: t.colors.textMuted }]}>{e.category}</Text>}
                            {e.vendor_name && <Text style={[ss.expMeta, { color: t.colors.textMuted }]}>· {e.vendor_name}</Text>}
                            {e.expense_date && <Text style={[ss.expMeta, { color: t.colors.textMuted }]}>· {e.expense_date}</Text>}
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[ss.expAmt, { color: '#dc2626' }]}>{rupee2(e.total)}</Text>
                          {e.payment_method && <Text style={[ss.expMeta, { color: t.colors.textMuted }]}>{e.payment_method}</Text>}
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

// ── Small helper components ───────────────────────────────────────────────────

function EmptyState({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={ss.emptyBox}>
      <Ionicons name={icon} size={36} color="#e5e7eb" />
      <Text style={ss.emptyText}>{label}</Text>
    </View>
  );
}

function safeFormat(dateStr: string): string {
  try { return format(new Date(dateStr + 'T00:00:00'), 'dd MMM'); }
  catch { return dateStr?.slice(5) ?? ''; }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  shell:        { flex: 1 },
  periodBar:    { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  periodChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  periodText:   { fontSize: 12.5, fontWeight: '600' },
  inputLabel:   { fontSize: 10.5, fontWeight: '700', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateInput:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  applyBtn:     { backgroundColor: FOREST, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-end' },
  applyText:    { color: GOLD, fontWeight: '800', fontSize: 13 },

  kpiBar:       { backgroundColor: FOREST, flexDirection: 'row' },
  kpiTile:      { flex: 1, alignItems: 'center', paddingVertical: 11 },
  kpiVal:       { fontSize: 15, fontWeight: '900' },
  kpiLabel:     { fontSize: 8.5, color: 'rgba(255,255,255,0.55)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },

  tabBar:       { borderBottomWidth: 1 },
  tab:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabText:      { fontSize: 13 },

  card:         { borderRadius: 13, padding: 16, borderWidth: 1, gap: 0 },
  cardTitle:    { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },

  barRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  barLabel:     { width: 52, fontSize: 11, fontWeight: '600', color: '#6b7280' },
  barTrack:     { flex: 1, height: 7, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' },
  barFill:      { height: 7, borderRadius: 4 },
  barVal:       { width: 64, textAlign: 'right', fontSize: 12, fontWeight: '700', color: '#374151' },

  statRowContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  statRowLabel: { fontSize: 13.5, fontWeight: '600' },
  statRowVal:   { fontSize: 14, fontWeight: '800' },
  dot:          { width: 8, height: 8, borderRadius: 4 },

  typeRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },

  divider:      { marginVertical: 12, borderTopWidth: 1 },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel:   { fontSize: 13.5, fontWeight: '700' },
  totalVal:     { fontSize: 17, fontWeight: '900' },

  itemRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  rankBadge:    { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankText:     { fontSize: 11, fontWeight: '900' },
  itemName:     { fontSize: 13.5, fontWeight: '700', flex: 1 },
  itemRev:      { fontSize: 13.5, fontWeight: '800' },
  itemQty:      { fontSize: 11, fontWeight: '600', width: 52, textAlign: 'right' },

  pmRow:        { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  pmMethod:     { fontSize: 13.5, fontWeight: '800' },
  pmCount:      { fontSize: 11 },
  pmAmt:        { fontSize: 14, fontWeight: '800' },
  pmPct:        { fontSize: 11, fontWeight: '600' },

  expRow:       { paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  expTitle:     { fontSize: 13.5, fontWeight: '700' },
  expMeta:      { fontSize: 11, fontWeight: '500' },
  expAmt:       { fontSize: 14, fontWeight: '800' },

  emptyBox:     { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText:    { fontSize: 13, fontWeight: '600', color: '#9ca3af' },

  loader:       { paddingTop: 60, alignItems: 'center' },
  errorBox:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
  errorText:    { fontSize: 14, color: '#dc2626', textAlign: 'center', fontWeight: '600' },
  retryBtn:     { backgroundColor: FOREST, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 9 },
  retryText:    { color: GOLD, fontWeight: '800', fontSize: 13 },
});
