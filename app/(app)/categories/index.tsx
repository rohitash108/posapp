/**
 * Categories Screen — read-only view matching CSPos restaurant admin.
 * Categories are managed by Super Admin only; this screen is display-only.
 */
import React, {
  useEffect, useState, useCallback, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, RefreshControl, ScrollView, Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categoriesApi } from '@/api/categories';
import { API_BASE_URL } from '@/api/client';
import type { Category } from '@/types';

// ── Tokens ─────────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

const SERVER_URL = API_BASE_URL.replace('/api/mobile', '');
function catImage(img?: string | null): string | null {
  if (!img) return null;
  if (img.startsWith('http')) return img;
  return `${SERVER_URL}/storage/${img}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return (
    <View style={[sb.badge, active ? sb.active : sb.inactive]}>
      <Text style={[sb.txt, active ? sb.activeTxt : sb.inactiveTxt]}>
        {active ? 'Active' : 'Inactive'}
      </Text>
    </View>
  );
}
const sb = StyleSheet.create({
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  active:     { backgroundColor: '#dcfce7' },
  inactive:   { backgroundColor: '#f1f5f9' },
  txt:        { fontSize: 11, fontWeight: '700' },
  activeTxt:  { color: '#16a34a' },
  inactiveTxt:{ color: '#64748b' },
});

// ── Category Card (grid) ────────────────────────────────────────────────────
function CatCard({ cat }: { cat: Category }) {
  const imgUrl = catImage(cat.image);
  return (
    <View style={[cc.wrap, !cat.is_active && cc.wrapInactive]}>
      <View style={cc.imgWrap}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={cc.img} resizeMode="cover" />
        ) : (
          <View style={[cc.imgPlaceholder, { backgroundColor: FOREST }]}>
            <Text style={cc.initial}>{cat.name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}
        {!cat.is_active && (
          <View style={cc.inactiveBadge}>
            <Text style={cc.inactiveBadgeTxt}>Inactive</Text>
          </View>
        )}
      </View>
      <View style={cc.body}>
        <Text style={cc.name} numberOfLines={2}>{cat.name}</Text>
        <View style={cc.metaRow}>
          <View style={cc.chip}>
            <Ionicons name="fast-food-outline" size={10} color={FOREST} />
            <Text style={cc.chipTxt}>{cat.items_count ?? 0} items</Text>
          </View>
          {cat.sort_order != null && cat.sort_order > 0 && (
            <View style={[cc.chip, { backgroundColor: '#fef9c3' }]}>
              <Text style={[cc.chipTxt, { color: '#92400e' }]}>#{cat.sort_order}</Text>
            </View>
          )}
        </View>
        {cat.created_at && (
          <Text style={cc.date}>{fmtDate(cat.created_at)}</Text>
        )}
      </View>
    </View>
  );
}

// ── Category List Row ───────────────────────────────────────────────────────
function CatListRow({ cat }: { cat: Category }) {
  const imgUrl = catImage(cat.image);
  return (
    <View style={[lr.row, !cat.is_active && { backgroundColor: '#fffbeb' }]}>
      <View style={lr.thumb}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={lr.img} resizeMode="cover" />
        ) : (
          <View style={[lr.imgPlaceholder, { backgroundColor: FOREST }]}>
            <Text style={lr.initial}>{cat.name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}
      </View>
      <View style={lr.c1}>
        <Text style={lr.name} numberOfLines={1}>{cat.name}</Text>
      </View>
      <View style={lr.c2}>
        <Text style={lr.cellTxt}>{cat.items_count ?? 0}</Text>
      </View>
      <View style={lr.c3}>
        <Text style={lr.cellTxt}>{fmtDate(cat.created_at)}</Text>
      </View>
      <View style={lr.c4}>
        <StatusBadge active={cat.is_active} />
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [viewMode,   setViewMode]   = useState<'grid' | 'list'>('grid');
  const [error,      setError]      = useState('');

  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const contentW  = isDesktop ? width - 220 : width;
  const numCols   = contentW >= 1500 ? 5 : contentW >= 1100 ? 4 : contentW >= 750 ? 3 : contentW >= 480 ? 2 : 1;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res  = await categoriesApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setCategories(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load categories. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    categories.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())),
    [categories, search],
  );

  const activeCount   = categories.filter(c => c.is_active).length;
  const inactiveCount = categories.length - activeCount;

  return (
    <View style={s.shell}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }} tintColor={GOLD} />
        }>

        {/* ── Page header ── */}
        <View style={s.pageHeader}>
          <View>
            <Text style={s.pageTitle}>Categories</Text>
            <Text style={s.pageSub}>Manage your menu categories</Text>
          </View>
          {categories.length > 0 && (
            <View style={s.viewToggle}>
              <TouchableOpacity style={[s.viewBtn, viewMode === 'grid' && s.viewBtnActive]}
                onPress={() => setViewMode('grid')}>
                <Ionicons name="grid-outline" size={14} color={viewMode === 'grid' ? '#fff' : '#64748b'} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.viewBtn, viewMode === 'list' && s.viewBtnActive]}
                onPress={() => setViewMode('list')}>
                <Ionicons name="list-outline" size={14} color={viewMode === 'list' ? '#fff' : '#64748b'} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Super-Admin notice ── */}
        <View style={s.notice}>
          <Ionicons name="information-circle-outline" size={16} color="#2563eb" />
          <Text style={s.noticeTxt}>Categories are managed by Super Admin.</Text>
        </View>

        {/* ── Stats row ── */}
        <View style={s.statsRow}>
          {[
            { label: 'Total',    value: categories.length, icon: 'folder-outline'            as const, color: PRIMARY    },
            { label: 'Active',   value: activeCount,       icon: 'checkmark-circle-outline'  as const, color: '#16a34a'  },
            { label: 'Inactive', value: inactiveCount,     icon: 'pause-circle-outline'      as const, color: '#f59e0b'  },
          ].map(stat => (
            <View key={stat.label} style={s.statCard}>
              <View style={[s.statIcon, { backgroundColor: stat.color + '18' }]}>
                <Ionicons name={stat.icon} size={16} color={stat.color} />
              </View>
              <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Filter bar ── */}
        <View style={s.filterBar}>
          <View style={s.searchBox}>
            <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
              placeholder="Search categories" placeholderTextColor="#9ca3af" />
            <Ionicons name="search-outline" size={14} color="#9ca3af" />
          </View>
          {search ? (
            <TouchableOpacity style={s.clearBtn} onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.iconBtn} onPress={() => load(true)}>
            <Ionicons name="refresh-outline" size={16} color="#64748b" />
          </TouchableOpacity>
        </View>

        {search !== '' && (
          <View style={s.resultRow}>
            <Text style={s.resultCount}>{filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"</Text>
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={s.clearAll}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Content ── */}
        {loading ? (
          <View style={s.loadWrap}>
            <ActivityIndicator color={FOREST} size="large" />
            <Text style={s.loadTxt}>Loading categories…</Text>
          </View>
        ) : error ? (
          <View style={s.errorWrap}>
            <Ionicons name="alert-circle-outline" size={36} color="#ef4444" />
            <Text style={s.errorTitle}>Failed to load</Text>
            <Text style={s.errorSub}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
              <Text style={s.retryTxt}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="folder-open-outline" size={36} color="#94a3b8" />
            </View>
            <Text style={s.emptyTitle}>{search ? 'No results found' : 'No categories yet'}</Text>
            <Text style={s.emptySub}>
              {search
                ? `No categories match "${search}"`
                : 'Contact your Super Admin to add categories.'}
            </Text>
          </View>
        ) : viewMode === 'grid' ? (
          <View style={[s.grid, numCols > 1 && { flexDirection: 'row', flexWrap: 'wrap' }]}>
            {filtered.map(cat => (
              <View key={cat.id} style={{ width: `${100 / numCols}%` as any, padding: 6 }}>
                <CatCard cat={cat} />
              </View>
            ))}
          </View>
        ) : (
          /* List / table view */
          <View style={s.listWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: isDesktop ? contentW - 24 : 580 }}>
                {/* Table header */}
                <View style={lr.header}>
                  <View style={lr.hThumb} />
                  <Text style={[lr.hCell, lr.c1]}>Category</Text>
                  <Text style={[lr.hCell, lr.c2]}>Items</Text>
                  <Text style={[lr.hCell, lr.c3]}>Created On</Text>
                  <Text style={[lr.hCell, lr.c4]}>Status</Text>
                </View>
                {filtered.map((cat, idx) => (
                  <View key={cat.id} style={idx % 2 === 1 ? { backgroundColor: '#f9fafb' } : {}}>
                    <CatListRow cat={cat} />
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },

  pageHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pageTitle:     { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  pageSub:       { fontSize: 12, color: '#6b7280', marginTop: 2 },
  viewToggle:    { flexDirection: 'row', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 9, overflow: 'hidden', backgroundColor: '#f8fafc', padding: 2, gap: 2 },
  viewBtn:       { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  viewBtnActive: { backgroundColor: FOREST },

  notice:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#eff6ff', borderBottomWidth: 1, borderBottomColor: '#bfdbfe', paddingHorizontal: 16, paddingVertical: 9 },
  noticeTxt: { fontSize: 12.5, color: '#1d4ed8', fontWeight: '600' },

  statsRow:  { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  statCard:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 1 },

  filterBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 10 },
  searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },
  clearBtn:    { padding: 2 },
  iconBtn:     { width: 34, height: 34, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },

  resultRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  resultCount: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  clearAll:    { fontSize: 12, color: PRIMARY, textDecorationLine: 'underline' },

  loadWrap:   { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadTxt:    { fontSize: 14, color: '#9ca3af' },
  errorWrap:  { paddingTop: 80, alignItems: 'center', gap: 10 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  errorSub:   { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 },
  retryBtn:   { marginTop: 6, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 8, backgroundColor: FOREST },
  retryTxt:   { color: GOLD, fontWeight: '700', fontSize: 13 },
  emptyWrap:  { paddingTop: 80, alignItems: 'center', gap: 12 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub:   { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 },

  grid:     { padding: 6 },
  listWrap: { margin: 12, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
});

// Category card styles
const cc = StyleSheet.create({
  wrap:          { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e8edf2', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  wrapInactive:  { borderColor: '#fde68a', opacity: 0.75 },
  imgWrap:       { height: 100, position: 'relative', backgroundColor: '#f8fafc' },
  img:           { width: '100%', height: '100%' },
  imgPlaceholder:{ flex: 1, alignItems: 'center', justifyContent: 'center' },
  initial:       { fontSize: 32, fontWeight: '900', color: '#fff' },
  inactiveBadge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: '#fef9c3' },
  inactiveBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#92400e' },
  body:          { padding: 10 },
  name:          { fontSize: 13, fontWeight: '700', color: '#111827', lineHeight: 17 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  chipTxt:       { fontSize: 10, color: '#374151', fontWeight: '700' },
  date:          { fontSize: 10, color: '#9ca3af', marginTop: 5 },
});

// List row styles
const lr = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  hThumb:        { width: 44, marginRight: 10 },
  hCell:         { fontSize: 11, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thumb:         { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', marginRight: 10, flexShrink: 0, backgroundColor: '#f1f5f9' },
  img:           { width: '100%', height: '100%' },
  imgPlaceholder:{ flex: 1, alignItems: 'center', justifyContent: 'center' },
  initial:       { fontSize: 18, fontWeight: '900', color: '#fff' },
  c1: { flex: 3, paddingRight: 8 },
  c2: { width: 60, paddingRight: 8 },
  c3: { flex: 2, paddingRight: 8 },
  c4: { width: 80 },
  name:    { fontSize: 13, fontWeight: '700', color: '#111827' },
  cellTxt: { fontSize: 12.5, color: '#374151' },
});
