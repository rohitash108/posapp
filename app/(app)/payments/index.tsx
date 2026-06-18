/**
 * Payments Screen — matches restaurant.softwar.in/payments exactly
 * Table: Transaction ID · Order ID · Token No · Customer · Type · Menus · Grand Total
 * Pagination · Search · Sort · Export
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ScrollView,
  TextInput, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { paymentsApi } from '@/api/payments';
import { buildCsv, downloadCsv } from '@/utils/export';
import type { Payment } from '@/types';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

const PRIMARY   = '#2563eb';
const PAGE_SIZES = [15, 25, 50] as const;
const TYPE_FILTERS = ['all', 'Dine in', 'Takeaway', 'Delivery'] as const;

function mkS(c: ThemeColors) {
  return StyleSheet.create({
    shell:        { flex: 1, backgroundColor: c.background },
    header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    title:        { fontSize: 22, fontWeight: '800', color: c.heading, letterSpacing: -0.5 },
    iconBtn:      { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    exportBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    exportBtnTxt: { fontSize: 13, fontWeight: '600', color: c.text },
    dropMenu:     { position: 'absolute', top: '100%', right: 0, marginTop: 4, backgroundColor: c.surface, borderRadius: 8, borderWidth: 1, borderColor: c.border, minWidth: 140, zIndex: 50, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
    dropItem:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
    dropItemTxt:  { fontSize: 13, color: c.text },
    tableCard:    { margin: 16, backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    toolbar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    searchBox:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: c.border, minWidth: 200 },
    searchInput:  { flex: 1, fontSize: 13, color: c.heading, minWidth: 120 },
    toolBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    toolBtnActive:{ borderColor: c.sidebar, backgroundColor: c.surfaceAlt },
    toolBtnTxt:   { fontSize: 12.5, fontWeight: '600', color: c.text },
    sortBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    colHead:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, backgroundColor: c.surfaceAlt, borderBottomWidth: 1, borderBottomColor: c.border },
    colHd:        { fontSize: 11.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border },
    rowAlt:       { backgroundColor: c.surfaceAlt },
    cell:         { fontSize: 13.5, color: c.text, fontWeight: '500' },
    cellRef:      { fontWeight: '700', color: c.heading },
    cellMuted:    { color: c.textMuted },
    cellAmt:      { fontWeight: '800', color: c.heading, textAlign: 'right' },
    cardRow:      { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    cardRef:      { fontSize: 14, fontWeight: '700', color: c.heading },
    cardAmt:      { fontSize: 16, fontWeight: '800', color: c.sidebar, marginTop: 2 },
    cardMeta:     { fontSize: 12, color: c.textMuted, marginTop: 2 },
    paginBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
    entriesBox:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    entriesTxt:   { fontSize: 12.5, fontWeight: '600', color: c.text },
    entriesLabel: { fontSize: 12.5, color: c.textMuted },
    pageBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    pageBtnActive:{ backgroundColor: PRIMARY, borderColor: PRIMARY },
    pageBtnDis:   { opacity: 0.4 },
    pageBtnTxt:   { fontSize: 12.5, fontWeight: '600', color: c.text },
    footer:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
    footerTxt:    { fontSize: 12.5, color: '#f59e0b', fontWeight: '600' },
    pageBtn2:     { width: 30, height: 30, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    pageBtn2Active:{ backgroundColor: PRIMARY, borderColor: PRIMARY },
    pageBtn2Txt:  { fontSize: 12.5, fontWeight: '600', color: c.text },
    centerWrap:   { paddingVertical: 60, alignItems: 'center', gap: 12 },
    centerTxt:    { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PaymentsScreen() {
  const { colors: c } = useTheme();
  const s = useMemo(() => mkS(c), [c]);

  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(1);
  const [pageSize,    setPageSize]    = useState<number>(15);
  const [sortNewest,  setSortNewest]  = useState(true);
  const [typeFilter,  setTypeFilter]  = useState<string>('all');
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [exportOpen,  setExportOpen]  = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await paymentsApi.list({ per_page: 200 });
      const data = res.data?.data ?? res.data ?? [];
      setAllPayments(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = [...allPayments];
    if (sortNewest) list = list.sort((a, b) => b.id - a.id);
    else            list = list.sort((a, b) => a.id - b.id);
    if (typeFilter !== 'all') {
      list = list.filter(p => {
        const t = (p as any).order_type ?? (p as any).type ?? 'Dine in';
        return t === typeFilter;
      });
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(p =>
      String(p.id).includes(q) ||
      String(p.order_id ?? '').includes(q) ||
      String(p.order_number ?? '').includes(q) ||
      p.customer_name?.toLowerCase().includes(q) ||
      p.reference_number?.toLowerCase().includes(q)
    );
  }, [allPayments, search, sortNewest, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageData   = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const fromRow    = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const toRow      = Math.min(safePage * pageSize, filtered.length);

  function goPage(p: number) { setPage(Math.max(1, Math.min(totalPages, p))); }

  function handleExport() {
    const headers = ['Transaction ID', 'Order ID', 'Token No', 'Customer', 'Type', 'Menus', 'Amount'];
    const rows = filtered.map(p => [
      p.reference_number ?? p.id,
      p.order_id ?? '',
      (p as any).token_no ?? '',
      p.customer_name ?? 'Walk-in',
      (p as any).order_type ?? (p as any).type ?? 'Dine in',
      (p as any).items_count ?? (p as any).menus ?? '',
      p.amount,
    ]);
    downloadCsv(`payments-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(headers, rows));
    setExportOpen(false);
  }

  const pageNums = useMemo(() => {
    const nums: number[] = [];
    const start = Math.max(1, safePage - 2);
    const end   = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [safePage, totalPages]);

  return (
    <View style={s.shell}>
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={s.title}>Payments</Text>
          <Pressable onPress={() => { setRefreshing(true); load(true); }}
            style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="refresh-outline" size={15} color={c.textMuted} />
          </Pressable>
        </View>
        <View style={{ position: 'relative' }}>
          <Pressable style={s.exportBtn} onPress={() => setExportOpen(o => !o)}>
            <Ionicons name="share-outline" size={14} color={c.text} />
            <Text style={s.exportBtnTxt}>Export</Text>
            <Ionicons name="chevron-down" size={13} color={c.text} />
          </Pressable>
          {exportOpen && (
            <View style={s.dropMenu}>
              <Pressable style={s.dropItem} onPress={handleExport}>
                <Ionicons name="document-text-outline" size={14} color={c.text} />
                <Text style={s.dropItemTxt}>Export CSV</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }} tintColor={c.sidebar} />
        }>

        <View style={s.tableCard}>
          <View style={s.toolbar}>
            <View style={s.searchBox}>
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={v => { setSearch(v); setPage(1); }}
                placeholder="Search"
                placeholderTextColor={c.textMuted} />
              {search
                ? <Pressable onPress={() => { setSearch(''); setPage(1); }}>
                    <Ionicons name="close-circle" size={15} color={c.textMuted} />
                  </Pressable>
                : <Ionicons name="search-outline" size={15} color={c.textMuted} />
              }
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ position: 'relative' }}>
                <Pressable style={[s.toolBtn, typeFilter !== 'all' && s.toolBtnActive]} onPress={() => setFilterOpen(o => !o)}>
                  <Ionicons name="filter-outline" size={14} color={c.text} />
                  <Text style={s.toolBtnTxt}>{typeFilter === 'all' ? 'Filter' : typeFilter}</Text>
                </Pressable>
                {filterOpen && (
                  <View style={s.dropMenu}>
                    {TYPE_FILTERS.map(tf => (
                      <Pressable key={tf} style={s.dropItem}
                        onPress={() => { setTypeFilter(tf); setFilterOpen(false); setPage(1); }}>
                        <Text style={[s.dropItemTxt, typeFilter === tf && { fontWeight: '700', color: c.sidebar }]}>{tf === 'all' ? 'All types' : tf}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              <Pressable style={[s.toolBtn, compactView && s.toolBtnActive]} onPress={() => setCompactView(v => !v)}>
                <Ionicons name="grid-outline" size={14} color={c.text} />
              </Pressable>
              <Pressable style={s.sortBtn} onPress={() => setSortNewest(v => !v)}>
                <Text style={s.toolBtnTxt}>Sort by : {sortNewest ? 'Newest' : 'Oldest'}</Text>
                <Ionicons name="chevron-down" size={13} color={c.text} />
              </Pressable>
            </View>
          </View>

          {!compactView && (
            <View style={s.colHead}>
              <Text style={[s.colHd, { flex: 1.4 }]}>Transaction ID</Text>
              <Text style={[s.colHd, { flex: 1   }]}>Order ID</Text>
              <Text style={[s.colHd, { flex: 1.1 }]}>Token No</Text>
              <Text style={[s.colHd, { flex: 1.5 }]}>Customer</Text>
              <Text style={[s.colHd, { flex: 1.2 }]}>Type</Text>
              <Text style={[s.colHd, { flex: 0.8 }]}>Menus</Text>
              <Text style={[s.colHd, { flex: 1.2, textAlign: 'right' }]}>Grand Total</Text>
            </View>
          )}

          {loading ? (
            <View style={s.centerWrap}>
              <ActivityIndicator color={c.sidebar} size="large" />
              <Text style={s.centerTxt}>Loading payments…</Text>
            </View>
          ) : pageData.length === 0 ? (
            <View style={s.centerWrap}>
              <Ionicons name="wallet-outline" size={36} color={c.border} />
              <Text style={s.centerTxt}>No payments found</Text>
            </View>
          ) : compactView ? (
            pageData.map(pay => {
              const ref = pay.reference_number ?? `#${pay.id}`;
              return (
                <View key={pay.id} style={s.cardRow}>
                  <Text style={s.cardRef}>{ref}</Text>
                  <Text style={s.cardAmt}>₹{Number(pay.amount).toFixed(2)}</Text>
                  <Text style={s.cardMeta}>{pay.customer_name ?? 'Walk-in'} · Order #{pay.order_id ?? '—'}</Text>
                </View>
              );
            })
          ) : (
            pageData.map((pay, i) => {
              const ref      = pay.reference_number ?? `#${pay.id}`;
              const orderId  = pay.order_id ?? '—';
              const tokenNo  = (pay as any).token_no ?? '—';
              const customer = pay.customer_name ?? 'Walk-in';
              const type     = (pay as any).order_type ?? (pay as any).type ?? 'Dine in';
              const menus    = (pay as any).items_count ?? (pay as any).menus ?? '—';
              const total    = `₹${Number(pay.amount).toFixed(2)}`;
              const isEven   = i % 2 === 1;
              return (
                <View key={pay.id} style={[s.row, isEven && s.rowAlt]}>
                  <Text style={[s.cell, s.cellRef, { flex: 1.4 }]}>{ref}</Text>
                  <Text style={[s.cell, { flex: 1   }]}>{orderId}</Text>
                  <Text style={[s.cell, s.cellMuted, { flex: 1.1 }]}>{tokenNo}</Text>
                  <Text style={[s.cell, { flex: 1.5 }]}>{customer}</Text>
                  <Text style={[s.cell, { flex: 1.2 }]}>{type}</Text>
                  <Text style={[s.cell, { flex: 0.8 }]}>{menus}</Text>
                  <Text style={[s.cell, s.cellAmt, { flex: 1.2 }]}>{total}</Text>
                </View>
              );
            })
          )}

          {!loading && filtered.length > 0 && (
            <View style={s.paginBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable style={s.entriesBox} onPress={() => {
                  const idx = PAGE_SIZES.indexOf(pageSize as typeof PAGE_SIZES[number]);
                  const next = PAGE_SIZES[(idx + 1) % PAGE_SIZES.length];
                  setPageSize(next);
                  setPage(1);
                }}>
                  <Text style={s.entriesTxt}>{pageSize}</Text>
                </Pressable>
                <Text style={s.entriesLabel}>Entries</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable style={[s.pageBtn, safePage === 1 && s.pageBtnDis]}
                  onPress={() => goPage(safePage - 1)} disabled={safePage === 1}>
                  <Text style={[s.pageBtnTxt, safePage === 1 && { color: c.border }]}>‹ Prev</Text>
                </Pressable>
                {[1, 2].filter(n => n <= totalPages).map(n => (
                  <Pressable key={n} style={[s.pageBtn, safePage === n && s.pageBtnActive]}
                    onPress={() => goPage(n)}>
                    <Text style={[s.pageBtnTxt, safePage === n && { color: '#fff', fontWeight: '700' }]}>{n}</Text>
                  </Pressable>
                ))}
                <Pressable style={[s.pageBtn, safePage === totalPages && s.pageBtnDis]}
                  onPress={() => goPage(safePage + 1)} disabled={safePage === totalPages}>
                  <Text style={[s.pageBtnTxt, safePage === totalPages && { color: c.border }]}>Next ›</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {!loading && filtered.length > 0 && (
          <View style={s.footer}>
            <Text style={s.footerTxt}>
              Showing {fromRow} to {toRow} of {filtered.length} results
            </Text>
            <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              <Pressable style={s.pageBtn2} onPress={() => goPage(1)} disabled={safePage === 1}>
                <Ionicons name="chevron-back" size={13} color={safePage === 1 ? c.border : c.text} />
              </Pressable>
              {pageNums.map(n => (
                <Pressable key={n} style={[s.pageBtn2, safePage === n && s.pageBtn2Active]}
                  onPress={() => goPage(n)}>
                  <Text style={[s.pageBtn2Txt, safePage === n && { color: '#fff', fontWeight: '700' }]}>{n}</Text>
                </Pressable>
              ))}
              <Pressable style={s.pageBtn2} onPress={() => goPage(totalPages)} disabled={safePage === totalPages}>
                <Ionicons name="chevron-forward" size={13} color={safePage === totalPages ? c.border : c.text} />
              </Pressable>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
