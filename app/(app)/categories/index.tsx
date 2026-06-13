/**
 * Categories Screen — CSPos admin restaurant design
 * Page header · Search · Grid/List toggle · CRUD · Active toggle
 */
import React, {
  useEffect, useState, useCallback, useMemo,
} from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal,
  ActivityIndicator, RefreshControl, Alert, Switch, ScrollView, Image,
  Pressable, useWindowDimensions,
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

// ── Color palette for new categories ───────────────────────────────────────
const PALETTE = [
  '#ef4444','#f97316','#f59e0b','#10b981','#3b82f6',
  '#8b5cf6','#ec4899','#14b8a6','#1A2B1A','#6b7280',
];

// ── Category Form ───────────────────────────────────────────────────────────
function CategoryForm({ cat, onSave, onClose }: {
  cat?: Category | null; onSave: () => void; onClose: () => void;
}) {
  const [name,      setName]      = useState(cat?.name ?? '');
  const [desc,      setDesc]      = useState(cat?.description ?? '');
  const [color,     setColor]     = useState(cat?.color ?? PALETTE[0]);
  const [sortOrder, setSortOrder] = useState(cat?.sort_order != null ? String(cat.sort_order) : '');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  async function save() {
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true); setError('');
    try {
      const payload: any = {
        name:        name.trim(),
        description: desc.trim() || undefined,
        color,
        sort_order:  sortOrder ? Number(sortOrder) : undefined,
      };
      if (cat?.id) await categoriesApi.update(cat.id, payload);
      else         await categoriesApi.create(payload);
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={f.header}>
        <View>
          <Text style={f.title}>{cat ? 'Edit Category' : 'New Category'}</Text>
          <Text style={f.subtitle}>{cat ? cat.name : 'Add a menu category'}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={f.closeBtn}>
          <Ionicons name="close" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 16 }}
        showsVerticalScrollIndicator={false}>

        {/* Name */}
        <View>
          <Text style={f.label}>Category Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
          <TextInput style={f.input} value={name} onChangeText={setName}
            placeholder="e.g. Starters" placeholderTextColor="#9ca3af" />
        </View>

        {/* Description */}
        <View>
          <Text style={f.label}>Description</Text>
          <TextInput style={[f.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
            value={desc} onChangeText={setDesc} placeholder="Optional description"
            placeholderTextColor="#9ca3af" multiline />
        </View>

        {/* Sort Order */}
        <View>
          <Text style={f.label}>Sort Order</Text>
          <TextInput style={f.input} value={sortOrder} onChangeText={setSortOrder}
            placeholder="0" placeholderTextColor="#9ca3af" keyboardType="number-pad" />
        </View>

        {/* Color picker */}
        <View>
          <Text style={f.label}>Color</Text>
          <View style={f.palette}>
            {PALETTE.map(c => (
              <Pressable key={c} style={[f.colorSwatch, { backgroundColor: c }, color === c && f.colorSwatchActive]}
                onPress={() => setColor(c)}>
                {color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
              </Pressable>
            ))}
          </View>
        </View>

        {!!error && (
          <View style={f.errBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
            <Text style={f.errTxt}>{error}</Text>
          </View>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>

      <View style={f.footer}>
        <TouchableOpacity style={f.cancelBtn} onPress={onClose}>
          <Text style={f.cancelTxt}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={f.saveBtn} onPress={save} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={f.saveTxt}>{cat ? 'Save Changes' : 'Create Category'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Category Card (grid) ────────────────────────────────────────────────────
function CatCard({ cat, onToggle, onEdit, onDelete, toggling }: {
  cat: Category;
  onToggle: (cat: Category) => void;
  onEdit:   (cat: Category) => void;
  onDelete: (cat: Category) => void;
  toggling: boolean;
}) {
  const imgUrl = catImage(cat.image_url ?? cat.image);

  return (
    <View style={[cc.wrap, !cat.is_active && cc.wrapInactive]}>
      {/* Image / placeholder */}
      <View style={cc.imgWrap}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={cc.img} resizeMode="cover" />
        ) : (
          <View style={[cc.imgPlaceholder, { backgroundColor: cat.color ?? FOREST }]}>
            <Text style={cc.initial}>{cat.name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}
        {/* Color accent bar */}
        <View style={[cc.colorBar, { backgroundColor: cat.color ?? GOLD }]} />
        {/* Inactive badge */}
        {!cat.is_active && (
          <View style={cc.badge}>
            <Text style={cc.badgeTxt}>Inactive</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={cc.body}>
        <Text style={cc.name} numberOfLines={2}>{cat.name}</Text>
        {cat.description ? (
          <Text style={cc.desc} numberOfLines={1}>{cat.description}</Text>
        ) : null}

        <View style={cc.metaRow}>
          <View style={cc.itemsChip}>
            <Ionicons name="fast-food-outline" size={10} color={FOREST} />
            <Text style={cc.itemsChipTxt}>{cat.items_count ?? 0} items</Text>
          </View>
          {cat.sort_order != null && cat.sort_order > 0 && (
            <View style={cc.sortChip}>
              <Text style={cc.sortChipTxt}>#{cat.sort_order}</Text>
            </View>
          )}
        </View>

        {/* Actions footer */}
        <View style={cc.actions}>
          {toggling ? (
            <ActivityIndicator size="small" color={FOREST} />
          ) : (
            <Switch value={!!cat.is_active} onValueChange={() => onToggle(cat)}
              trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff"
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }} />
          )}
          <View style={{ flexDirection: 'row', gap: 5 }}>
            <TouchableOpacity style={[cc.iconBtn, { backgroundColor: '#eff6ff' }]}
              onPress={() => onEdit(cat)}>
              <Ionicons name="pencil-outline" size={13} color={PRIMARY} />
            </TouchableOpacity>
            <TouchableOpacity style={[cc.iconBtn, { backgroundColor: '#fff1f2' }]}
              onPress={() => onDelete(cat)}>
              <Ionicons name="trash-outline" size={13} color="#dc2626" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Category List Row ───────────────────────────────────────────────────────
function CatListRow({ cat, onToggle, onEdit, onDelete, toggling }: {
  cat: Category;
  onToggle: (cat: Category) => void;
  onEdit:   (cat: Category) => void;
  onDelete: (cat: Category) => void;
  toggling: boolean;
}) {
  const imgUrl = catImage(cat.image_url ?? cat.image);

  return (
    <View style={[lr.row, !cat.is_active && { backgroundColor: '#fffbeb' }]}>
      {/* Color bar */}
      <View style={[lr.colorBar, { backgroundColor: cat.color ?? GOLD }]} />

      {/* Thumb */}
      <View style={lr.thumb}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={lr.img} resizeMode="cover" />
        ) : (
          <View style={[lr.imgPlaceholder, { backgroundColor: cat.color ?? FOREST }]}>
            <Text style={lr.initial}>{cat.name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}
      </View>

      {/* Name + desc */}
      <View style={lr.c1}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Text style={lr.name} numberOfLines={1}>{cat.name}</Text>
          {!cat.is_active && (
            <View style={[lr.badge, { backgroundColor: '#fef9c3', borderColor: '#fde68a' }]}>
              <Text style={[lr.badgeTxt, { color: '#92400e' }]}>Inactive</Text>
            </View>
          )}
        </View>
        {cat.description && (
          <Text style={lr.desc} numberOfLines={1}>{cat.description}</Text>
        )}
      </View>

      {/* Items count */}
      <View style={lr.c2}>
        <Text style={lr.cellTxt}>{cat.items_count ?? 0} items</Text>
      </View>

      {/* Sort order */}
      <View style={lr.c3}>
        <Text style={lr.cellTxt}>{cat.sort_order ?? '—'}</Text>
      </View>

      {/* Actions */}
      <View style={lr.c4}>
        {toggling ? (
          <ActivityIndicator size="small" color={FOREST} />
        ) : (
          <Switch value={!!cat.is_active} onValueChange={() => onToggle(cat)}
            trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} />
        )}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={[lr.iconBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
            onPress={() => onEdit(cat)}>
            <Ionicons name="pencil-outline" size={13} color={PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={[lr.iconBtn, { backgroundColor: '#fff1f2', borderColor: '#fecaca' }]}
            onPress={() => onDelete(cat)}>
            <Ionicons name="trash-outline" size={13} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function CategoriesScreen() {
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [viewMode,    setViewMode]    = useState<'grid' | 'list'>('grid');
  const [formVisible, setFormVisible] = useState(false);
  const [editing,     setEditing]     = useState<Category | null>(null);
  const [toggling,    setToggling]    = useState<Set<number>>(new Set());
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const contentW  = isDesktop ? width - 220 : width;
  const numCols   = contentW >= 1500 ? 5 : contentW >= 1100 ? 4 : contentW >= 750 ? 3 : contentW >= 480 ? 2 : 1;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await categoriesApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setCategories(Array.isArray(data) ? data : []);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(cat: Category) {
    Alert.alert('Delete Category', `Delete "${cat.name}"? This may affect linked items.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await categoriesApi.delete(cat.id); load(true); }
        catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Delete failed'); }
      }},
    ]);
  }

  async function handleToggle(cat: Category) {
    setToggling(prev => new Set(prev).add(cat.id));
    const newVal = !cat.is_active;
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: newVal } : c));
    try { await categoriesApi.toggle(cat.id); }
    catch { setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: !newVal } : c)); }
    finally { setToggling(prev => { const n = new Set(prev); n.delete(cat.id); return n; }); }
  }

  // ── Derived ──────────────────────────────────────────────────────────────
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
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
            <TouchableOpacity style={s.addBtn}
              onPress={() => { setEditing(null); setFormVisible(true); }}>
              <Ionicons name="add" size={16} color={GOLD} />
              <Text style={s.addBtnTxt}>Add Category</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Stats row ── */}
        <View style={s.statsRow}>
          {[
            { label: 'Total',    value: categories.length,  icon: 'folder-outline'       as const, color: PRIMARY  },
            { label: 'Active',   value: activeCount,        icon: 'checkmark-circle-outline' as const, color: '#16a34a' },
            { label: 'Inactive', value: inactiveCount,      icon: 'pause-circle-outline'  as const, color: '#f59e0b' },
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

        {/* ── Result count ── */}
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
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="folder-open-outline" size={36} color="#94a3b8" />
            </View>
            <Text style={s.emptyTitle}>{search ? 'No results found' : 'No categories yet'}</Text>
            <Text style={s.emptySub}>
              {search ? `No categories match "${search}"` : 'Create your first category to organise the menu.'}
            </Text>
            {!search && (
              <TouchableOpacity style={s.addBtn}
                onPress={() => { setEditing(null); setFormVisible(true); }}>
                <Ionicons name="add" size={14} color={GOLD} />
                <Text style={s.addBtnTxt}>Create First Category</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : viewMode === 'grid' ? (
          <View style={[s.grid, numCols > 1 && { flexDirection: 'row', flexWrap: 'wrap' }]}>
            {filtered.map(cat => (
              <View key={cat.id} style={{ width: `${100 / numCols}%` as any, padding: 6 }}>
                <CatCard cat={cat}
                  onToggle={handleToggle}
                  onEdit={c => { setEditing(c); setFormVisible(true); }}
                  onDelete={handleDelete}
                  toggling={toggling.has(cat.id)} />
              </View>
            ))}
          </View>
        ) : (
          /* List view */
          <View style={s.listWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: isDesktop ? contentW - 24 : 640 }}>
                {/* Table header */}
                <View style={lr.header}>
                  <View style={{ width: 4, marginRight: 6 }} />
                  <View style={lr.hThumb} />
                  <Text style={[lr.hCell, lr.c1]}>Name</Text>
                  <Text style={[lr.hCell, lr.c2]}>Items</Text>
                  <Text style={[lr.hCell, lr.c3]}>Order</Text>
                  <Text style={[lr.hCell, lr.c4, { textAlign: 'right' }]}>Actions</Text>
                </View>
                {filtered.map((cat, idx) => (
                  <View key={cat.id} style={idx % 2 === 1 ? { backgroundColor: '#f9fafb' } : {}}>
                    <CatListRow cat={cat}
                      onToggle={handleToggle}
                      onEdit={c => { setEditing(c); setFormVisible(true); }}
                      onDelete={handleDelete}
                      toggling={toggling.has(cat.id)} />
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Create / Edit Modal ── */}
      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setFormVisible(false)}>
        <CategoryForm
          cat={editing}
          onSave={() => { setFormVisible(false); load(true); }}
          onClose={() => setFormVisible(false)} />
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },

  // Page header
  pageHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pageTitle:     { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  pageSub:       { fontSize: 12, color: '#6b7280', marginTop: 2 },
  viewToggle:    { flexDirection: 'row', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 9, overflow: 'hidden', backgroundColor: '#f8fafc', padding: 2, gap: 2 },
  viewBtn:       { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  viewBtnActive: { backgroundColor: FOREST },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: FOREST, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnTxt:     { color: GOLD, fontWeight: '800', fontSize: 13 },

  // Stats
  statsRow:  { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  statCard:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 1 },

  // Filter bar
  filterBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 10 },
  searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },
  clearBtn:    { padding: 2 },
  iconBtn:     { width: 34, height: 34, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },

  // Result row
  resultRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  resultCount: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  clearAll:    { fontSize: 12, color: PRIMARY, textDecorationLine: 'underline' },

  // Load / empty
  loadWrap:  { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadTxt:   { fontSize: 14, color: '#9ca3af' },
  emptyWrap: { paddingTop: 80, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub:  { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 },

  // Grid
  grid:     { padding: 6 },
  listWrap: { margin: 12, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
});

// Category card styles
const cc = StyleSheet.create({
  wrap:        { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e8edf2', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  wrapInactive:{ borderColor: '#fde68a' },
  imgWrap:     { height: 100, position: 'relative', backgroundColor: '#f8fafc' },
  img:         { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initial:     { fontSize: 32, fontWeight: '900', color: '#fff' },
  colorBar:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },
  badge:       { position: 'absolute', top: 6, right: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: '#fef9c3' },
  badgeTxt:    { fontSize: 10, fontWeight: '800', color: '#92400e' },
  body:        { padding: 10 },
  name:        { fontSize: 13, fontWeight: '700', color: '#111827', lineHeight: 17 },
  desc:        { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  itemsChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  itemsChipTxt:{ fontSize: 10, color: '#374151', fontWeight: '700' },
  sortChip:    { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: '#fef9c3' },
  sortChipTxt: { fontSize: 10, color: '#92400e', fontWeight: '700' },
  actions:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  iconBtn:     { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});

// List row styles
const lr = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  hThumb:     { width: 44, marginRight: 10 },
  hCell:      { fontSize: 11, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  colorBar:   { width: 4, height: 40, borderRadius: 2, marginRight: 6, flexShrink: 0 },
  thumb:      { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', marginRight: 10, flexShrink: 0 },
  img:        { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initial:    { fontSize: 18, fontWeight: '900', color: '#fff' },
  c1: { flex: 3, paddingRight: 8 },
  c2: { flex: 1, paddingRight: 8 },
  c3: { width: 70, paddingRight: 8 },
  c4: { width: 140, alignItems: 'flex-end', gap: 6, flexDirection: 'row', justifyContent: 'flex-end' },
  name:       { fontSize: 13, fontWeight: '700', color: '#111827' },
  desc:       { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  badge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  badgeTxt:   { fontSize: 10, fontWeight: '800' },
  cellTxt:    { fontSize: 12.5, color: '#374151' },
  iconBtn:    { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

// Form styles
const f = StyleSheet.create({
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 18, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title:     { fontSize: 18, fontWeight: '800', color: '#111827' },
  subtitle:  { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  closeBtn:  { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  label:     { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:     { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#fafafa' },
  palette:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  colorSwatch:       { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  colorSwatchActive: { borderWidth: 2.5, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 4 },
  errBox:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff1f2', borderRadius: 8, padding: 10 },
  errTxt:    { fontSize: 12.5, color: '#dc2626', flex: 1 },
  footer:    { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  cancelTxt: { fontWeight: '700', color: '#374151', fontSize: 14.5 },
  saveBtn:   { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: FOREST },
  saveTxt:   { fontWeight: '800', color: GOLD, fontSize: 14.5 },
});
