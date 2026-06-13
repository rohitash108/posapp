/**
 * Invoices Screen — CSPos admin restaurant design
 * Stats · Search · Date filter · Status tabs · Invoice cards · Detail panel/modal · Print
 */
import React, {
  useEffect, useState, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ScrollView,
  TextInput, Modal, ActivityIndicator, Platform, Pressable,
  useWindowDimensions, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  format, isToday, isYesterday, startOfWeek, startOfMonth,
} from 'date-fns';
import { invoicesApi } from '@/api/invoices';
import { useAppStore } from '@/store/appStore';
import type { Invoice } from '@/types';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

// ── Config ────────────────────────────────────────────────────────────────────
const PAY_CFG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  paid:    { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Paid'    },
  unpaid:  { color: '#d97706', bg: '#fef9ec', border: '#fcd34d', label: 'Unpaid'  },
  pending: { color: '#d97706', bg: '#fef9ec', border: '#fcd34d', label: 'Pending' },
  partial: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', label: 'Partial' },
};
function pCfg(s?: string) { return PAY_CFG[s ?? ''] ?? PAY_CFG.unpaid; }

const DATE_PRESETS = [
  { key: 'all',       label: 'All Time'   },
  { key: 'today',     label: 'Today'      },
  { key: 'yesterday', label: 'Yesterday'  },
  { key: 'week',      label: 'This Week'  },
  { key: 'month',     label: 'This Month' },
];

const STATUS_TABS = [
  { key: 'all',     label: 'All'     },
  { key: 'paid',    label: 'Paid'    },
  { key: 'unpaid',  label: 'Unpaid'  },
  { key: 'partial', label: 'Partial' },
];

function fmtDate(dt?: string) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isToday(d))     return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'dd MMM yyyy');
}

// ── Print ─────────────────────────────────────────────────────────────────────
function printInvoice(inv: Invoice, restaurant: any) {
  if (Platform.OS !== 'web') return;
  const rows = (inv.items ?? []).map(i =>
    `<tr>
      <td style="padding:5px 0">${(i as any).item_name ?? (i as any).name ?? ''}</td>
      <td align="center" style="padding:5px 4px">${i.quantity}</td>
      <td align="right" style="padding:5px 0">₹${Number(i.unit_price).toFixed(2)}</td>
      <td align="right" style="padding:5px 0">₹${Number(i.total_price).toFixed(2)}</td>
    </tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Invoice ${inv.invoice_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;max-width:380px;margin:0 auto;padding:16px}
h2{text-align:center;font-size:15px;letter-spacing:2px;margin-bottom:3px}
.sub{text-align:center;font-size:10px;color:#555;line-height:1.6;margin-bottom:10px}
hr{border:none;border-top:1px dashed #bbb;margin:8px 0}
table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;font-size:9px;text-transform:uppercase;color:#888;padding:4px 0;border-bottom:1px solid #ddd}
.total-row td{font-size:14px;font-weight:bold;padding-top:8px}
.footer{text-align:center;font-size:10px;color:#aaa;margin-top:14px}
@media print{body{max-width:100%;padding:0}}
</style></head><body>
<h2>${restaurant?.name ?? 'RESTAURANT'}</h2>
<div class="sub">${restaurant?.address ?? ''}${restaurant?.phone ? '<br>' + restaurant.phone : ''}</div>
<hr>
<b style="font-size:11px">Invoice: ${inv.invoice_number}</b>
<div style="font-size:10px;color:#666;margin:3px 0">
  Order: #${inv.order_number ?? '—'} &nbsp;|&nbsp; ${inv.created_at ? format(new Date(inv.created_at), 'dd MMM yyyy, hh:mm a') : ''}
</div>
<div style="font-size:10px;color:#666;margin:2px 0">Customer: ${inv.customer_name || 'Walk-in'}</div>
<hr>
<table>
  <thead><tr><th>Item</th><th align="center">Qty</th><th align="right">Rate</th><th align="right">Amt</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<hr>
<table>
  <tr><td>Subtotal</td><td align="right">₹${Number(inv.subtotal ?? 0).toFixed(2)}</td></tr>
  ${Number(inv.tax_amount) > 0 ? `<tr><td>Tax</td><td align="right">₹${Number(inv.tax_amount).toFixed(2)}</td></tr>` : ''}
  ${Number(inv.discount_amount) > 0 ? `<tr><td>Discount</td><td align="right" style="color:#16a34a">-₹${Number(inv.discount_amount).toFixed(2)}</td></tr>` : ''}
  <tr class="total-row"><td><b>TOTAL</b></td><td align="right"><b>₹${Number(inv.total).toFixed(2)}</b></td></tr>
</table>
<hr>
<div style="font-size:10px">Payment: ${(inv.payment_method ?? '—').toUpperCase()} &nbsp;|&nbsp; ${pCfg(inv.payment_status).label.toUpperCase()}</div>
<div class="footer">Thank you for visiting!</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;
  const w = window.open('', '_blank', 'width=440,height=620');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Invoice Card ──────────────────────────────────────────────────────────────
function InvoiceCard({ inv, onPress }: { inv: Invoice; onPress: () => void }) {
  const cfg = pCfg(inv.payment_status);
  return (
    <Pressable
      style={({ pressed }) => [cd.card, { borderLeftColor: cfg.color }, pressed && { opacity: 0.82 }]}
      onPress={onPress}>
      {/* Top */}
      <View style={cd.top}>
        <View style={{ flex: 1 }}>
          <Text style={cd.invNo}>{inv.invoice_number}</Text>
          <Text style={cd.orderNo}>Order #{inv.order_number ?? '—'}</Text>
        </View>
        <View style={[cd.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[cd.badgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      {/* Mid */}
      <View style={cd.mid}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="person-outline" size={12} color="#94a3b8" />
          <Text style={cd.customer}>{inv.customer_name || 'Walk-in'}</Text>
        </View>
        <Text style={cd.date}>{fmtDate(inv.created_at)}</Text>
      </View>
      {/* Bottom */}
      <View style={cd.bot}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {inv.payment_method ? (
            <View style={cd.methodChip}>
              <Ionicons name="card-outline" size={10} color="#6b7280" />
              <Text style={cd.methodTxt}>{inv.payment_method.toUpperCase()}</Text>
            </View>
          ) : null}
          {(inv.items?.length ?? 0) > 0 && (
            <View style={cd.itemChip}>
              <Text style={cd.itemChipTxt}>{inv.items!.length} item{inv.items!.length !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
        <Text style={cd.total}>₹{Number(inv.total).toFixed(2)}</Text>
      </View>
    </Pressable>
  );
}

// ── Invoice Detail ────────────────────────────────────────────────────────────
function InvoiceDetail({
  inv, restaurant, onClose,
}: { inv: Invoice; restaurant: any; onClose: () => void }) {
  const cfg = pCfg(inv.payment_status);
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={[dt.header, { borderLeftColor: cfg.color }]}>
        <View style={{ flex: 1 }}>
          <Text style={dt.invNo}>{inv.invoice_number}</Text>
          <Text style={dt.orderNo}>Order #{inv.order_number ?? '—'}</Text>
        </View>
        <View style={[dt.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[dt.statusTxt, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <Pressable style={({ pressed }) => [dt.closeBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
          <Ionicons name="close" size={18} color="#374151" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Color accent */}
        <View style={[dt.accent, { backgroundColor: cfg.color }]} />

        {/* Info grid */}
        <View style={dt.section}>
          <Text style={dt.sectionLbl}>Details</Text>
          <View style={dt.infoGrid}>
            <View style={dt.infoItem}>
              <Text style={dt.infoLbl}>Customer</Text>
              <Text style={dt.infoVal}>{inv.customer_name || 'Walk-in'}</Text>
            </View>
            {inv.customer_phone ? (
              <View style={dt.infoItem}>
                <Text style={dt.infoLbl}>Phone</Text>
                <Text style={dt.infoVal}>{inv.customer_phone}</Text>
              </View>
            ) : null}
            <View style={dt.infoItem}>
              <Text style={dt.infoLbl}>Date & Time</Text>
              <Text style={dt.infoVal}>
                {inv.created_at ? format(new Date(inv.created_at), 'dd MMM yyyy, hh:mm a') : '—'}
              </Text>
            </View>
            <View style={dt.infoItem}>
              <Text style={dt.infoLbl}>Payment Method</Text>
              <Text style={dt.infoVal}>{(inv.payment_method ?? '—').toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Items table */}
        {(inv.items?.length ?? 0) > 0 && (
          <View style={dt.section}>
            <Text style={dt.sectionLbl}>Items ({inv.items!.length})</Text>
            <View style={dt.tableHeader}>
              <Text style={[dt.tHCell, { flex: 1 }]}>Item</Text>
              <Text style={[dt.tHCell, { width: 32, textAlign: 'center' }]}>Qty</Text>
              <Text style={[dt.tHCell, { width: 68, textAlign: 'right' }]}>Rate</Text>
              <Text style={[dt.tHCell, { width: 76, textAlign: 'right' }]}>Amount</Text>
            </View>
            {inv.items!.map((item, idx) => (
              <View key={idx} style={[dt.tableRow, idx % 2 === 1 && { backgroundColor: '#fafafa' }]}>
                <View style={[dt.qtyBox, { backgroundColor: cfg.bg }]}>
                  <Text style={[dt.qtyTxt, { color: cfg.color }]}>{item.quantity}</Text>
                </View>
                <Text style={[dt.itemName, { flex: 1 }]} numberOfLines={2}>
                  {(item as any).item_name ?? (item as any).name ?? ''}
                </Text>
                <Text style={[dt.cellTxt, { width: 68, textAlign: 'right' }]}>
                  ₹{Number(item.unit_price).toFixed(2)}
                </Text>
                <Text style={[dt.amtTxt, { width: 76, textAlign: 'right' }]}>
                  ₹{Number(item.total_price).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Summary */}
        <View style={dt.section}>
          <Text style={dt.sectionLbl}>Summary</Text>
          {[
            { label: 'Subtotal',    val: Number(inv.subtotal ?? 0),       show: true,                        color: '#374151', green: false },
            { label: 'Tax',         val: Number(inv.tax_amount ?? 0),      show: Number(inv.tax_amount) > 0,  color: '#374151', green: false },
            { label: 'Discount',    val: Number(inv.discount_amount ?? 0), show: Number(inv.discount_amount) > 0, color: '#16a34a', green: true },
          ].filter(r => r.show).map(r => (
            <View key={r.label} style={dt.sumRow}>
              <Text style={dt.sumLbl}>{r.label}</Text>
              <Text style={[dt.sumVal, { color: r.color }]}>
                {r.green ? '-' : ''}₹{r.val.toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={dt.totalRow}>
            <Text style={dt.totalLbl}>TOTAL</Text>
            <Text style={dt.totalVal}>₹{Number(inv.total).toFixed(2)}</Text>
          </View>
        </View>

        {/* Print */}
        {Platform.OS === 'web' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Pressable
              style={({ pressed }) => [dt.printBtn, pressed && { opacity: 0.8 }]}
              onPress={() => printInvoice(inv, restaurant)}>
              <Ionicons name="print-outline" size={17} color={GOLD} />
              <Text style={dt.printTxt}>Print Invoice</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function InvoicesScreen() {
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [search,       setSearch]       = useState('');
  const [statusTab,    setStatusTab]    = useState('all');
  const [dateFilter,   setDateFilter]   = useState('all');
  const [selected,     setSelected]     = useState<Invoice | null>(null);
  const [showDetail,   setShowDetail]   = useState(false);
  const { restaurant } = useAppStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await invoicesApi.list({ per_page: 200 });
      const data = res.data?.data ?? res.data ?? [];
      setInvoices(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = new Date();
    return invoices.filter(inv => {
      // Status tab
      if (statusTab !== 'all' && inv.payment_status !== statusTab) return false;
      // Date filter
      if (dateFilter !== 'all' && inv.created_at) {
        const d = new Date(inv.created_at);
        if (dateFilter === 'today'     && !isToday(d))     return false;
        if (dateFilter === 'yesterday' && !isYesterday(d)) return false;
        if (dateFilter === 'week'      && d < startOfWeek(now)) return false;
        if (dateFilter === 'month'     && d < startOfMonth(now)) return false;
      }
      // Search
      if (search) {
        const q = search.toLowerCase();
        return (inv.invoice_number ?? '').toLowerCase().includes(q)
            || (inv.customer_name  ?? '').toLowerCase().includes(q)
            || (inv.order_number   ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [invoices, statusTab, dateFilter, search]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const totalAmt  = useMemo(() => invoices.reduce((s, i) => s + Number(i.total), 0), [invoices]);
  const paidAmt   = useMemo(() => invoices.filter(i => i.payment_status === 'paid').reduce((s, i) => s + Number(i.total), 0), [invoices]);
  const unpaidAmt = totalAmt - paidAmt;

  // ── Open detail ─────────────────────────────────────────────────────────────
  const openDetail = useCallback((inv: Invoice) => {
    setSelected(inv);
    setShowDetail(true);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch(''); setStatusTab('all'); setDateFilter('all');
  }, []);

  const hasFilter = search !== '' || statusTab !== 'all' || dateFilter !== 'all';

  // ── List panel ───────────────────────────────────────────────────────────────
  const ListPanel = (
    <View style={{ flex: 1 }}>
      {/* Page header */}
      <View style={s.pageHeader}>
        <View>
          <Text style={s.pageTitle}>Invoices</Text>
          <Text style={s.pageSub}>Billing history and receipts</Text>
        </View>
        <Pressable style={({ pressed }) => [s.refreshBtn, pressed && { opacity: 0.7 }]}
          onPress={() => { setRefreshing(true); load(true); }}>
          <Ionicons name="refresh-outline" size={16} color="#64748b" />
        </Pressable>
      </View>

      {/* Stats */}
      <View style={s.statsBar}>
        <View style={s.statItem}>
          <View style={[s.statIcon, { backgroundColor: '#eff6ff' }]}>
            <Ionicons name="document-text-outline" size={14} color={PRIMARY} />
          </View>
          <Text style={[s.statVal, { color: PRIMARY }]}>{invoices.length}</Text>
          <Text style={s.statLbl}>Total</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <View style={[s.statIcon, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="cash-outline" size={14} color={FOREST} />
          </View>
          <Text style={[s.statVal, { color: FOREST }]}>₹{totalAmt.toFixed(0)}</Text>
          <Text style={s.statLbl}>Billed</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <View style={[s.statIcon, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#16a34a" />
          </View>
          <Text style={[s.statVal, { color: '#16a34a' }]}>₹{paidAmt.toFixed(0)}</Text>
          <Text style={s.statLbl}>Collected</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <View style={[s.statIcon, { backgroundColor: '#fef9ec' }]}>
            <Ionicons name="time-outline" size={14} color="#d97706" />
          </View>
          <Text style={[s.statVal, { color: '#d97706' }]}>₹{unpaidAmt.toFixed(0)}</Text>
          <Text style={s.statLbl}>Pending</Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Invoice #, order #, customer…"
            placeholderTextColor="#9ca3af" />
          {search
            ? <Pressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </Pressable>
            : <Ionicons name="search-outline" size={15} color="#9ca3af" />
          }
        </View>
      </View>

      {/* Date filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.scrollRow}
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

      {/* Status tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[s.scrollRow, { borderTopWidth: 0 }]}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
        {STATUS_TABS.map(tab => {
          const active = statusTab === tab.key;
          const cnt    = tab.key === 'all' ? invoices.length : invoices.filter(i => i.payment_status === tab.key).length;
          const cfg    = PAY_CFG[tab.key];
          return (
            <Pressable key={tab.key}
              style={({ pressed }) => [
                s.statusTab,
                active && { backgroundColor: cfg?.color ?? FOREST, borderColor: cfg?.color ?? FOREST },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setStatusTab(tab.key)}>
              <Text style={[s.statusTabTxt, active && { color: '#fff', fontWeight: '700' }]}>{tab.label}</Text>
              <View style={[s.tabBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={[s.tabBadgeTxt, active && { color: '#fff' }]}>{cnt}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Result row */}
      <View style={s.resultRow}>
        <Text style={s.resultTxt}>{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</Text>
        {hasFilter && (
          <Pressable onPress={clearFilters}>
            <Text style={s.clearAll}>Clear filters</Text>
          </Pressable>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color={FOREST} size="large" />
          <Text style={s.loadTxt}>Loading invoices…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 10, paddingBottom: 40, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }} tintColor={GOLD} />
          }
          renderItem={({ item }) => (
            <InvoiceCard inv={item} onPress={() => openDetail(item)} />
          )}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <Ionicons name="document-text-outline" size={36} color="#94a3b8" />
              </View>
              <Text style={s.emptyTitle}>No invoices found</Text>
              <Text style={s.emptySub}>
                {search
                  ? `No results for "${search}"`
                  : 'Invoices are generated when orders are completed.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );

  // ── Desktop: side panel; Mobile: bottom modal ────────────────────────────────
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#f0f2f7' }}>
        <View style={{ flex: 1 }}>
          {ListPanel}
        </View>
        <View style={s.sidePanel}>
          {selected ? (
            <InvoiceDetail
              inv={selected}
              restaurant={restaurant}
              onClose={() => setSelected(null)} />
          ) : (
            <View style={s.sidePlaceholder}>
              <Ionicons name="receipt-outline" size={44} color="#e2e8f0" />
              <Text style={s.sidePlaceholderTxt}>Select an invoice to view details</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f7' }}>
      {ListPanel}
      <Modal
        visible={showDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetail(false)}>
        {selected && (
          <InvoiceDetail
            inv={selected}
            restaurant={restaurant}
            onClose={() => setShowDetail(false)} />
        )}
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Page header
  pageHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pageTitle:   { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  pageSub:     { fontSize: 12, color: '#6b7280', marginTop: 2 },
  refreshBtn:  { width: 34, height: 34, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },

  // Stats
  statsBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  statItem:    { flex: 1, alignItems: 'center', gap: 2 },
  statIcon:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statVal:     { fontSize: 13, fontWeight: '800' },
  statLbl:     { fontSize: 9.5, color: '#9ca3af' },
  statDivider: { width: 1, height: 36, backgroundColor: '#f1f5f9' },

  // Search
  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },

  // Pills / tabs
  scrollRow:   { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pill:        { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  pillTxt:     { fontSize: 12, fontWeight: '600', color: '#374151' },
  statusTab:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  statusTabTxt:{ fontSize: 12, fontWeight: '600', color: '#374151' },
  tabBadge:    { backgroundColor: '#e5e7eb', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeTxt: { fontSize: 10, fontWeight: '700', color: '#6b7280' },

  // Result
  resultRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 7 },
  resultTxt:  { fontSize: 11.5, color: '#9ca3af', fontWeight: '600' },
  clearAll:   { fontSize: 12, color: PRIMARY, textDecorationLine: 'underline' },

  // Cards
  loadWrap:  { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadTxt:   { fontSize: 14, color: '#9ca3af' },
  emptyWrap: { paddingTop: 80, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub:  { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 },

  // Desktop
  sidePanel:         { width: 400, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', backgroundColor: '#fff' },
  sidePlaceholder:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sidePlaceholderTxt:{ fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 40 },
});

const cd = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  top:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  invNo:      { fontSize: 15, fontWeight: '800', color: '#111827' },
  orderNo:    { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  badge:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  badgeTxt:   { fontSize: 11, fontWeight: '700' },
  mid:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  customer:   { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  date:       { fontSize: 11, color: '#9ca3af' },
  bot:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  methodChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3f4f6', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  methodTxt:  { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  itemChip:   { backgroundColor: '#eff6ff', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  itemChipTxt:{ fontSize: 10, fontWeight: '600', color: PRIMARY },
  total:      { fontSize: 17, fontWeight: '800', color: GOLD },
});

const dt = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', borderLeftWidth: 4 },
  invNo:       { fontSize: 17, fontWeight: '800', color: '#111827' },
  orderNo:     { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', marginTop: 2 },
  statusTxt:   { fontSize: 11, fontWeight: '800' },
  closeBtn:    { width: 30, height: 30, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  accent:      { height: 3 },
  section:     { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sectionLbl:  { fontSize: 10.5, fontWeight: '800', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  infoGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  infoItem:    { minWidth: 140 },
  infoLbl:     { fontSize: 10.5, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  infoVal:     { fontSize: 13.5, fontWeight: '600', color: '#111827' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 2 },
  tHCell:      { fontSize: 10, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  qtyBox:      { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  qtyTxt:      { fontSize: 11, fontWeight: '800' },
  itemName:    { fontSize: 13, fontWeight: '600', color: '#111827' },
  cellTxt:     { fontSize: 12, color: '#6b7280' },
  amtTxt:      { fontSize: 13, fontWeight: '700', color: '#374151' },
  sumRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  sumLbl:      { fontSize: 13, color: '#6b7280' },
  sumVal:      { fontSize: 13, fontWeight: '600' },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 6, borderTopWidth: 1.5, borderTopColor: '#e5e7eb' },
  totalLbl:    { fontSize: 15, fontWeight: '800', color: FOREST },
  totalVal:    { fontSize: 18, fontWeight: '800', color: PRIMARY },
  printBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: FOREST, borderRadius: 12, paddingVertical: 14 },
  printTxt:    { color: GOLD, fontWeight: '800', fontSize: 15 },
});
