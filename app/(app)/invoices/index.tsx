import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ScrollView, Modal, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { invoicesApi } from '@/api/invoices';
import { useAppStore } from '@/store/appStore';
import type { Invoice } from '@/types';

const STATUS_CFG: Record<string, { color: string; bg: string; border: string }> = {
  paid:    { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  unpaid:  { color: '#d97706', bg: '#fef9ec', border: '#fcd34d' },
  pending: { color: '#d97706', bg: '#fef9ec', border: '#fcd34d' },
  partial: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
};
const PAYMENT_FILTERS = ['all', 'paid', 'unpaid'];

function printInvoice(inv: Invoice, restaurant: any) {
  if (Platform.OS !== 'web') return;
  const rows = (inv.items ?? []).map(i =>
    `<tr><td>${i.name}</td><td align="center">${i.quantity}</td><td align="right">₹${Number(i.unit_price).toFixed(2)}</td><td align="right">₹${Number(i.total_price).toFixed(2)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;max-width:360px;margin:0 auto;padding:12px}
h2{text-align:center;font-size:16px;letter-spacing:2px;margin-bottom:2px}.sub{text-align:center;font-size:10px;color:#555;margin-bottom:10px}
hr{border:none;border-top:1px dashed #aaa;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;font-size:9px;text-transform:uppercase;color:#777;padding:3px 0;border-bottom:1px solid #ddd}td{padding:4px 0}
.total{font-size:15px;font-weight:bold}.footer{text-align:center;font-size:10px;color:#999;margin-top:10px}
@media print{body{max-width:100%}}</style></head><body>
<h2>${restaurant?.name ?? 'RESTAURANT'}</h2>
<div class="sub">${restaurant?.address ?? ''}${restaurant?.phone ? '<br/>'+restaurant.phone : ''}</div>
<hr/>
<div style="font-size:11px"><b>Invoice: ${inv.invoice_number}</b></div>
<div style="font-size:10px;color:#555;margin:2px 0">Order: #${inv.order_number ?? '—'} | Customer: ${inv.customer_name || 'Walk-in'}</div>
<div style="font-size:10px;color:#555;margin:2px 0">${inv.created_at ? format(new Date(inv.created_at), 'dd MMM yyyy hh:mm a') : ''}</div>
<hr/>
<table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead><tbody>${rows}</tbody></table>
<hr/>
<table>
<tr><td>Subtotal</td><td align="right">₹${Number(inv.subtotal).toFixed(2)}</td></tr>
${Number(inv.tax_amount) > 0 ? `<tr><td>Tax</td><td align="right">₹${Number(inv.tax_amount).toFixed(2)}</td></tr>` : ''}
${Number(inv.discount_amount) > 0 ? `<tr><td>Discount</td><td align="right" style="color:#16a34a">-₹${Number(inv.discount_amount).toFixed(2)}</td></tr>` : ''}
<tr><td class="total"><b>TOTAL</b></td><td class="total" align="right"><b>₹${Number(inv.total).toFixed(2)}</b></td></tr>
</table>
<hr/>
<div style="font-size:10px">Payment: ${(inv.payment_method ?? '—').toUpperCase()} | ${inv.payment_status?.toUpperCase()}</div>
<div class="footer">Thank you!</div>
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank', 'width=400,height=560');
  if (w) { w.document.write(html); w.document.close(); }
}

export default function InvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const { restaurant } = useAppStore();
  const { width } = useAppStore((s: any) => ({ width: 0 })) as any;
  const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 900 : false;

  const load = useCallback(async () => {
    try {
      const res = await invoicesApi.list({ per_page: 100 });
      const data = res.data?.data ?? res.data ?? [];
      setInvoices(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = invoices.filter(i => {
    if (filter !== 'all' && i.payment_status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (i.invoice_number ?? '').toLowerCase().includes(q)
        || (i.customer_name ?? '').toLowerCase().includes(q)
        || (i.order_number ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  // Totals
  const totalAmt  = invoices.reduce((s, i) => s + Number(i.total), 0);
  const paidAmt   = invoices.filter(i => i.payment_status === 'paid').reduce((s, i) => s + Number(i.total), 0);
  const unpaidAmt = totalAmt - paidAmt;

  function DetailView({ inv }: { inv: Invoice }) {
    const cfg = STATUS_CFG[inv.payment_status] ?? STATUS_CFG.unpaid;
    return (
      <ScrollView style={dp.wrap} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[dp.header, { backgroundColor: cfg.color }]}>
          <View style={{ flex: 1 }}>
            <Text style={dp.invNum}>{inv.invoice_number}</Text>
            <Text style={dp.headerSub}>Order #{inv.order_number ?? '—'}</Text>
          </View>
          <View style={[dp.statusPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={dp.statusText}>{inv.payment_status?.toUpperCase()}</Text>
          </View>
        </View>
        <View style={dp.section}>
          <View style={dp.infoRow}>
            <View style={dp.infoItem}><Text style={dp.label}>Customer</Text><Text style={dp.val}>{inv.customer_name || 'Walk-in'}</Text></View>
            {inv.customer_phone && <View style={dp.infoItem}><Text style={dp.label}>Phone</Text><Text style={dp.val}>{inv.customer_phone}</Text></View>}
            <View style={dp.infoItem}><Text style={dp.label}>Date</Text><Text style={dp.val}>{inv.created_at ? format(new Date(inv.created_at), 'dd MMM yyyy') : '—'}</Text></View>
            <View style={dp.infoItem}><Text style={dp.label}>Method</Text><Text style={dp.val}>{(inv.payment_method ?? '—').toUpperCase()}</Text></View>
          </View>
        </View>
        {inv.items && inv.items.length > 0 && (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>Items</Text>
            {inv.items.map((item, idx) => (
              <View key={idx} style={dp.itemRow}>
                <View style={[dp.qtyBox, { backgroundColor: cfg.bg }]}><Text style={[dp.qtyText, { color: cfg.color }]}>{item.quantity}</Text></View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' }}>{item.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>₹{Number(item.total_price).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={dp.section}>
          <View style={dp.sumRow}><Text style={dp.sumLabel}>Subtotal</Text><Text style={dp.sumVal}>₹{Number(inv.subtotal).toFixed(2)}</Text></View>
          {Number(inv.tax_amount) > 0 && <View style={dp.sumRow}><Text style={dp.sumLabel}>Tax</Text><Text style={dp.sumVal}>₹{Number(inv.tax_amount).toFixed(2)}</Text></View>}
          {Number(inv.discount_amount) > 0 && <View style={dp.sumRow}><Text style={[dp.sumLabel, { color: '#16a34a' }]}>Discount</Text><Text style={[dp.sumVal, { color: '#16a34a' }]}>-₹{Number(inv.discount_amount).toFixed(2)}</Text></View>}
          <View style={[dp.sumRow, { paddingTop: 8, borderTopWidth: 1.5, borderTopColor: '#1A2B1A', marginTop: 4 }]}>
            <Text style={[dp.sumLabel, { fontSize: 16, fontWeight: '800', color: '#1A2B1A' }]}>TOTAL</Text>
            <Text style={[dp.sumVal, { fontSize: 18, fontWeight: '800', color: '#0D76E1' }]}>₹{Number(inv.total).toFixed(2)}</Text>
          </View>
        </View>
        {Platform.OS === 'web' && (
          <View style={{ padding: 16 }}>
            <TouchableOpacity style={dp.printBtn} onPress={() => printInvoice(inv, restaurant)}>
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={dp.printBtnText}>Print Invoice</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  }

  const listPanel = (
    <View style={{ flex: 1 }}>
      {/* Stats */}
      <View style={s.statsBar}>
        <View style={s.statItem}><Text style={[s.statNum, { color: '#0D76E1' }]}>₹{totalAmt.toFixed(0)}</Text><Text style={s.statLabel}>Total Billed</Text></View>
        <View style={s.statDivider} />
        <View style={s.statItem}><Text style={[s.statNum, { color: '#16a34a' }]}>₹{paidAmt.toFixed(0)}</Text><Text style={s.statLabel}>Collected</Text></View>
        <View style={s.statDivider} />
        <View style={s.statItem}><Text style={[s.statNum, { color: '#d97706' }]}>₹{unpaidAmt.toFixed(0)}</Text><Text style={s.statLabel}>Pending</Text></View>
      </View>
      {/* Search */}
      <View style={s.searchBar}>
        <Ionicons name="search" size={15} color="#9ca3af" />
        <TextInput style={s.searchInput} placeholder="Invoice #, order #, customer..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#9ca3af" /></TouchableOpacity> : null}
      </View>
      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
        {PAYMENT_FILTERS.map(f => {
          const cnt = f === 'all' ? invoices.length : invoices.filter(i => i.payment_status === f).length;
          const active = filter === f;
          const cfg = STATUS_CFG[f];
          return (
            <TouchableOpacity key={f} style={[s.filterChip, active && { backgroundColor: cfg?.color ?? '#1A2B1A', borderColor: cfg?.color ?? '#1A2B1A' }]} onPress={() => setFilter(f)}>
              <Text style={[s.filterText, active && { color: '#fff', fontWeight: '700' }]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
              <View style={[s.filterBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={[s.filterBadgeText, active && { color: '#fff' }]}>{cnt}</Text>
              </View>
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
          renderItem={({ item: inv }) => {
            const cfg = STATUS_CFG[inv.payment_status] ?? STATUS_CFG.unpaid;
            return (
              <TouchableOpacity style={[s.card, { borderLeftColor: cfg.color }]} onPress={() => { setSelected(inv); setShowDetail(true); }} activeOpacity={0.8}>
                <View style={s.cardTop}>
                  <View>
                    <Text style={s.invNum}>{inv.invoice_number}</Text>
                    <Text style={s.orderNum}>Order #{inv.order_number ?? '—'}</Text>
                  </View>
                  <View style={[s.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                    <Text style={[s.statusText, { color: cfg.color }]}>{inv.payment_status?.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={s.cardMid}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="person-outline" size={12} color="#9ca3af" />
                    <Text style={s.customer}>{inv.customer_name || 'Walk-in'}</Text>
                  </View>
                  <Text style={s.date}>{inv.created_at ? format(new Date(inv.created_at), 'dd MMM, hh:mm a') : '—'}</Text>
                </View>
                <View style={s.cardBot}>
                  <Text style={s.method}>{(inv.payment_method ?? '—').toUpperCase()}</Text>
                  <Text style={s.total}>₹{Number(inv.total).toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 70, gap: 10 }}>
              <Ionicons name="document-text-outline" size={40} color="#e5e7eb" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '600' }}>No invoices found</Text>
              <Text style={{ color: '#d1d5db', fontSize: 12 }}>Invoices are generated when orders are placed</Text>
            </View>
          }
        />
      )}
    </View>
  );

  if (isDesktop && selected) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>{listPanel}</View>
        <View style={{ width: 380, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', backgroundColor: '#fff' }}>
          <DetailView inv={selected} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {listPanel}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDetail(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: '#111827' }}>Invoice Detail</Text>
            <TouchableOpacity onPress={() => setShowDetail(false)}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
          </View>
          {selected && <DetailView inv={selected} />}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  statsBar:    { flexDirection: 'row', backgroundColor: '#1A2B1A', paddingHorizontal: 16, paddingVertical: 14 },
  statItem:    { flex: 1, alignItems: 'center' },
  statNum:     { fontSize: 20, fontWeight: '800' },
  statLabel:   { fontSize: 10, color: '#7A9A7A', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 4 },
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', margin: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput: { flex: 1, fontSize: 13.5, color: '#111827' },
  filterBar:   { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  filterText:  { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  filterBadge: { backgroundColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  filterBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#6b7280' },
  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  invNum:      { fontSize: 16, fontWeight: '800', color: '#111827' },
  orderNum:    { fontSize: 11.5, color: '#9ca3af', marginTop: 2 },
  statusChip:  { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  cardMid:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  customer:    { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  date:        { fontSize: 11, color: '#9ca3af' },
  cardBot:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  method:      { fontSize: 11, fontWeight: '600', color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  total:       { fontSize: 18, fontWeight: '800', color: '#C9A52A' },
});
const dp = StyleSheet.create({
  wrap:       { flex: 1, backgroundColor: '#fff' },
  header:     { padding: 20 },
  invNum:     { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub:  { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', marginTop: 8 },
  statusText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  section:    { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sectionTitle: { fontSize: 10.5, fontWeight: '800', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  infoRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  infoItem:   { minWidth: 130 },
  label:      { fontSize: 10.5, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  val:        { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  qtyBox:     { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  qtyText:    { fontSize: 12, fontWeight: '800' },
  sumRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  sumLabel:   { fontSize: 13.5, color: '#6b7280' },
  sumVal:     { fontSize: 13.5, fontWeight: '600', color: '#374151' },
  printBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A2B1A', borderRadius: 12, paddingVertical: 14 },
  printBtnText: { color: '#C9A52A', fontWeight: '800', fontSize: 15 },
});
