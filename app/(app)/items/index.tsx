/**
 * Items Screen — csPos-matching design
 * Food-type chips · Category ribbon · Grid/List toggle
 * Master badge · Hidden badge · Variations/Addons count
 * Restaurant-admin permissions: toggle availability + CRUD own items
 */
import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal,
  ActivityIndicator, RefreshControl, Alert, Switch, ScrollView, Image,
  Pressable, useWindowDimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { itemsApi } from '@/api/items';
import { categoriesApi } from '@/api/categories';
import type { MenuItem, Category, Variation, Addon } from '@/types';
import { API_BASE_URL } from '@/api/client';

// ── Tokens ────────────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

const SERVER_URL = API_BASE_URL.replace('/api/mobile', '');
function itemImage(img?: string | null): string | null {
  if (!img) return null;
  if (img.startsWith('http')) return img;
  return `${SERVER_URL}/storage/${img}`;
}

// ── Food-type config ──────────────────────────────────────────────────────────
const FOOD_TYPES = [
  { key: 'veg',     label: 'Veg',     color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  { key: 'non_veg', label: 'Non Veg', color: '#dc2626', bg: '#fff1f2', border: '#fecaca' },
  { key: 'egg',     label: 'Egg',     color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
] as const;
type FoodType = 'veg' | 'non_veg' | 'egg';

function ftCfg(ft?: string) {
  return FOOD_TYPES.find(f => f.key === ft) ?? FOOD_TYPES[0];
}
function ftLabel(ft?: string) {
  if (ft === 'non_veg') return 'Non Veg';
  if (ft === 'egg')     return 'Egg';
  return 'Veg';
}

// ── Variation / Addon row for form ────────────────────────────────────────────
interface DynRow { name: string; price: string; }

function DynRows({ label, rows, onChange }: {
  label: string; rows: DynRow[];
  onChange: (rows: DynRow[]) => void;
}) {
  function update(idx: number, field: keyof DynRow, val: string) {
    const next = rows.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    onChange(next);
  }
  function add()           { onChange([...rows, { name: '', price: '' }]); }
  function remove(idx: number) { onChange(rows.filter((_, i) => i !== idx)); }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={f.label}>{label}</Text>
        <TouchableOpacity onPress={add} style={f.addRowBtn}>
          <Ionicons name="add" size={14} color={PRIMARY} />
          <Text style={{ fontSize: 12, color: PRIMARY, fontWeight: '700' }}>Add</Text>
        </TouchableOpacity>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={f.dynRow}>
          <TextInput style={[f.input, { flex: 2 }]} value={r.name} onChangeText={v => update(i, 'name', v)}
            placeholder={label === 'Variations' ? 'e.g. Small' : 'e.g. Extra Cheese'} placeholderTextColor="#9ca3af" />
          <TextInput style={[f.input, { flex: 1, textAlign: 'right' }]} value={r.price}
            onChangeText={v => update(i, 'price', v)} placeholder="₹0" placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad" />
          <TouchableOpacity style={f.rmBtn} onPress={() => remove(i)}>
            <Ionicons name="close" size={14} color="#dc2626" />
          </TouchableOpacity>
        </View>
      ))}
      {rows.length === 0 && (
        <Text style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>None added</Text>
      )}
    </View>
  );
}

// ── Item Form (create / edit own items) ───────────────────────────────────────
interface FormProps {
  item?: MenuItem | null;
  categories: Category[];
  onSave: () => void;
  onClose: () => void;
}

function ItemForm({ item, categories, onSave, onClose }: FormProps) {
  const [name,       setName]       = useState(item?.name ?? '');
  const [desc,       setDesc]       = useState(item?.description ?? '');
  const [price,      setPrice]      = useState(item ? String(item.price) : '');
  const [netPrice,   setNetPrice]   = useState(item?.net_price != null ? String(item.net_price) : '');
  const [catId,      setCatId]      = useState<number | undefined>(item?.category_id);
  const [foodType,   setFoodType]   = useState<FoodType>((item?.food_type as FoodType) ?? 'veg');
  const [variations, setVariations] = useState<DynRow[]>((item?.variations ?? []).map(v => ({ name: v.name, price: String(v.price) })));
  const [addons,     setAddons]     = useState<DynRow[]>((item?.addons ?? []).map(a => ({ name: a.name, price: String(a.price) })));
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  async function save() {
    if (!name.trim())               { setError('Name is required');           return; }
    if (!catId)                     { setError('Category is required');        return; }
    if (!price || isNaN(Number(price))) { setError('Valid price is required'); return; }
    setLoading(true); setError('');
    try {
      const payload = {
        name: name.trim(),
        description: desc.trim() || undefined,
        price: Number(price),
        net_price: netPrice && !isNaN(Number(netPrice)) ? Number(netPrice) : undefined,
        category_id: catId,
        food_type: foodType,
        variations: variations.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), price: Number(r.price) || 0 })),
        addons:     addons.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), price: Number(r.price) || 0 })),
      };
      if (item?.id) await itemsApi.update(item.id, payload);
      else          await itemsApi.create(payload);
      onSave();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.response?.data?.errors;
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Failed to save');
    } finally { setLoading(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={f.header}>
        <View>
          <Text style={f.title}>{item ? 'Edit Item' : 'New Item'}</Text>
          <Text style={f.subtitle}>{item ? item.name : 'Add a restaurant-owned item'}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={f.closeBtn}>
          <Ionicons name="close" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Name */}
        <View>
          <Text style={f.label}>Item Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
          <TextInput style={f.input} value={name} onChangeText={setName} placeholder="e.g. Masala Chai" placeholderTextColor="#9ca3af" />
        </View>

        {/* Description */}
        <View>
          <Text style={f.label}>Description</Text>
          <TextInput style={[f.input, { height: 70, textAlignVertical: 'top', paddingTop: 10 }]}
            value={desc} onChangeText={setDesc} placeholder="Optional" placeholderTextColor="#9ca3af" multiline />
        </View>

        {/* Price row */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={f.label}>Price (₹) <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <TextInput style={f.input} value={price} onChangeText={setPrice}
              placeholder="0.00" placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={f.label}>Net/Cost Price (₹)</Text>
            <TextInput style={f.input} value={netPrice} onChangeText={setNetPrice}
              placeholder="0.00" placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />
          </View>
        </View>

        {/* Category */}
        <View>
          <Text style={f.label}>Category <Text style={{ color: '#dc2626' }}>*</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {categories.map(c => {
              const active = catId === c.id;
              return (
                <TouchableOpacity key={c.id}
                  style={[f.catChip, active && { backgroundColor: FOREST, borderColor: FOREST }]}
                  onPress={() => setCatId(c.id)}>
                  <Text style={[f.catChipTxt, active && { color: GOLD }]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Food type */}
        <View>
          <Text style={f.label}>Food Type</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {FOOD_TYPES.map(ft => {
              const active = foodType === ft.key;
              return (
                <TouchableOpacity key={ft.key}
                  style={[f.ftChip, active && { backgroundColor: ft.bg, borderColor: ft.border }]}
                  onPress={() => setFoodType(ft.key as FoodType)}>
                  <View style={[f.ftDot, { borderColor: ft.color, backgroundColor: active ? ft.color : 'transparent' }]} />
                  <Text style={[f.ftTxt, { color: active ? ft.color : '#374151' }, active && { fontWeight: '800' }]}>
                    {ft.label}
                  </Text>
                  {active && <Ionicons name="checkmark" size={13} color={ft.color} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Variations */}
        <DynRows label="Variations" rows={variations} onChange={setVariations} />

        {/* Addons */}
        <DynRows label="Add-Ons" rows={addons} onChange={setAddons} />

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
            : <Text style={f.saveTxt}>{item ? 'Save Changes' : 'Create Item'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Item Card (grid) ──────────────────────────────────────────────────────────
function ItemCard({ item, onToggle, onEdit, onDelete, toggling }: {
  item: MenuItem;
  onToggle: (item: MenuItem) => void;
  onEdit:   (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  toggling: boolean;
}) {
  const ft      = ftCfg(item.food_type ?? (item.is_veg === false ? 'non_veg' : 'veg'));
  const imgUrl  = itemImage(item.image);
  const varCount = item.variations?.filter(v => v.name)?.length ?? 0;
  const addCount = item.addons?.filter(a => a.name)?.length ?? 0;
  const isMaster = !!item.is_master;

  return (
    <View style={[ic.wrap, !item.is_available && ic.wrapHidden]}>
      {/* Image */}
      <View style={ic.imgWrap}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={ic.img} resizeMode="cover" />
        ) : (
          <View style={[ic.imgPlaceholder, { backgroundColor: ft.bg }]}>
            <View style={[ic.ftDot, { borderColor: ft.color }]}>
              <View style={[ic.ftDotInner, { backgroundColor: ft.color }]} />
            </View>
          </View>
        )}
        {/* Badges overlay */}
        {!item.is_available && (
          <View style={[ic.badge, { backgroundColor: '#fde68a' }]}>
            <Text style={[ic.badgeTxt, { color: '#92400e' }]}>Hidden</Text>
          </View>
        )}
        {isMaster && (
          <View style={[ic.badgeLeft, { backgroundColor: '#eff6ff' }]}>
            <Text style={[ic.badgeTxt, { color: PRIMARY }]}>Master</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={ic.body}>
        <Text style={ic.name} numberOfLines={2}>{item.name}</Text>

        {/* Price + food type */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={ic.price}>₹{Number(item.price).toFixed(2)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={[ic.ftBadgeDot, { backgroundColor: ft.color }]} />
            <Text style={[ic.ftLabel, { color: ft.color }]}>{ft.label}</Text>
          </View>
        </View>

        {/* Category */}
        {item.category_name && (
          <View style={ic.catBadge}>
            <Text style={ic.catBadgeTxt} numberOfLines={1}>{item.category_name}</Text>
          </View>
        )}

        {/* Variations + Addons counts */}
        {(varCount > 0 || addCount > 0) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 5 }}>
            {varCount > 0 && (
              <View style={ic.metaChip}>
                <Ionicons name="layers-outline" size={10} color="#64748b" />
                <Text style={ic.metaChipTxt}>{varCount} var</Text>
              </View>
            )}
            {addCount > 0 && (
              <View style={ic.metaChip}>
                <Ionicons name="add-circle-outline" size={10} color="#64748b" />
                <Text style={ic.metaChipTxt}>{addCount} addon</Text>
              </View>
            )}
          </View>
        )}

        {/* Tax */}
        {item.tax_name && (
          <Text style={ic.taxLine}>{item.tax_name} ({item.tax_rate}%)</Text>
        )}

        {/* Actions */}
        <View style={ic.actions}>
          {/* Availability toggle */}
          {toggling ? (
            <ActivityIndicator size="small" color={FOREST} />
          ) : (
            <Switch value={!!item.is_available} onValueChange={() => onToggle(item)}
              trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff"
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }} />
          )}

          {/* Edit / Delete for own (non-master) items */}
          {!isMaster && (
            <View style={{ flexDirection: 'row', gap: 5 }}>
              <TouchableOpacity style={[ic.iconBtn, { backgroundColor: '#eff6ff' }]} onPress={() => onEdit(item)}>
                <Ionicons name="pencil-outline" size={13} color={PRIMARY} />
              </TouchableOpacity>
              <TouchableOpacity style={[ic.iconBtn, { backgroundColor: '#fff1f2' }]} onPress={() => onDelete(item)}>
                <Ionicons name="trash-outline" size={13} color="#dc2626" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Item List Row ─────────────────────────────────────────────────────────────
function ItemListRow({ item, onToggle, onEdit, onDelete, toggling }: {
  item: MenuItem;
  onToggle: (item: MenuItem) => void;
  onEdit:   (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  toggling: boolean;
}) {
  const ft       = ftCfg(item.food_type ?? (item.is_veg === false ? 'non_veg' : 'veg'));
  const imgUrl   = itemImage(item.image);
  const isMaster = !!item.is_master;

  return (
    <View style={[ll.row, !item.is_available && { backgroundColor: '#fffbeb' }]}>
      {/* Thumb */}
      <View style={ll.thumb}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={ll.img} resizeMode="cover" />
        ) : (
          <View style={[ll.imgPlaceholder, { backgroundColor: ft.bg }]}>
            <View style={[ll.ftDot, { borderColor: ft.color }]}>
              <View style={[ll.ftDotInner, { backgroundColor: ft.color }]} />
            </View>
          </View>
        )}
      </View>

      {/* Name + badges */}
      <View style={ll.c1}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Text style={ll.name} numberOfLines={1}>{item.name}</Text>
          {isMaster && (
            <View style={[ll.badge, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
              <Text style={[ll.badgeTxt, { color: PRIMARY }]}>Master</Text>
            </View>
          )}
          {!item.is_available && (
            <View style={[ll.badge, { backgroundColor: '#fef9c3', borderColor: '#fde68a' }]}>
              <Text style={[ll.badgeTxt, { color: '#92400e' }]}>Hidden</Text>
            </View>
          )}
        </View>
        {item.description && (
          <Text style={ll.desc} numberOfLines={1}>{item.description}</Text>
        )}
      </View>

      {/* Category */}
      <View style={ll.c2}>
        <Text style={ll.cellTxt} numberOfLines={1}>{item.category_name ?? '—'}</Text>
      </View>

      {/* Food type */}
      <View style={ll.c3}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={[ll.ftDot, { borderColor: ft.color, width: 10, height: 10 }]}>
            <View style={[ll.ftDotInner, { backgroundColor: ft.color, width: 5, height: 5 }]} />
          </View>
          <Text style={[ll.cellTxt, { color: ft.color }]}>{ft.label}</Text>
        </View>
      </View>

      {/* Price */}
      <View style={ll.c4}>
        <Text style={ll.price}>₹{Number(item.price).toFixed(2)}</Text>
        {item.tax_name && <Text style={ll.tax}>{item.tax_name}</Text>}
      </View>

      {/* Actions */}
      <View style={ll.c5}>
        {toggling ? (
          <ActivityIndicator size="small" color={FOREST} />
        ) : (
          <Switch value={!!item.is_available} onValueChange={() => onToggle(item)}
            trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} />
        )}
        {!isMaster && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity style={[ll.iconBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
              onPress={() => onEdit(item)}>
              <Ionicons name="pencil-outline" size={13} color={PRIMARY} />
            </TouchableOpacity>
            <TouchableOpacity style={[ll.iconBtn, { backgroundColor: '#fff1f2', borderColor: '#fecaca' }]}
              onPress={() => onDelete(item)}>
              <Ionicons name="trash-outline" size={13} color="#dc2626" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ItemsScreen() {
  const [items,       setItems]       = useState<MenuItem[]>([]);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [catFilter,   setCatFilter]   = useState<number | 'all'>('all');
  const [foodFilters, setFoodFilters] = useState<Record<FoodType, boolean>>({ veg: true, non_veg: true, egg: true });
  const [viewMode,    setViewMode]    = useState<'grid' | 'list'>('grid');
  const [formVisible, setFormVisible] = useState(false);
  const [editing,     setEditing]     = useState<MenuItem | null>(null);
  const [toggling,    setToggling]    = useState<Set<number>>(new Set());
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const contentW  = isDesktop ? width - 220 : width;
  const numCols   = contentW >= 2000 ? 6 : contentW >= 1500 ? 5 : contentW >= 1100 ? 4 : contentW >= 750 ? 3 : contentW >= 480 ? 2 : 1;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [iRes, cRes] = await Promise.all([itemsApi.list(), categoriesApi.list()]);
      const iData = iRes.data?.data ?? iRes.data ?? [];
      const cData = cRes.data?.data ?? cRes.data ?? [];
      setItems(Array.isArray(iData) ? iData : []);
      setCategories(Array.isArray(cData) ? cData : []);
    } catch (e) { console.warn('Items load:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(item: MenuItem) {
    setToggling(prev => new Set(prev).add(item.id));
    const newVal = !item.is_available;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: newVal } : i));
    try {
      await itemsApi.updateAvailability(item.id, newVal);
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !newVal } : i));
    } finally {
      setToggling(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  async function handleDelete(item: MenuItem) {
    Alert.alert('Delete Item', `Delete "${item.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await itemsApi.delete(item.id); load(true); }
        catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Delete failed'); }
      }},
    ]);
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const catCounts = useMemo(() => {
    const c: Record<number | string, number> = { all: 0 };
    for (const i of items) {
      c.all++;
      if (i.category_id) c[i.category_id] = (c[i.category_id] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const usedCatIds = useMemo(() => new Set(items.map(i => i.category_id).filter(Boolean)), [items]);
  const usedCats   = useMemo(() => categories.filter(c => usedCatIds.has(c.id)), [categories, usedCatIds]);

  const filtered = useMemo(() => items.filter(i => {
    const ft = (i.food_type ?? (i.is_veg === false ? 'non_veg' : 'veg')) as FoodType;
    if (!foodFilters[ft]) return false;
    if (catFilter !== 'all' && i.category_id !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !(i.description ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [items, foodFilters, catFilter, search]);

  function toggleFoodType(ft: FoodType) {
    setFoodFilters(prev => ({ ...prev, [ft]: !prev[ft] }));
  }
  function clearFilters() {
    setSearch(''); setCatFilter('all');
    setFoodFilters({ veg: true, non_veg: true, egg: true });
  }

  const hasActiveFilter = search !== '' || catFilter !== 'all' || !foodFilters.veg || !foodFilters.non_veg || !foodFilters.egg;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.shell}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={GOLD} />}>

        {/* ── Page header ── */}
        <View style={s.pageHeader}>
          <View>
            <Text style={s.pageTitle}>Items</Text>
            <Text style={s.pageSub}>Manage your restaurant's menu items</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Grid/List toggle — only when items exist */}
            {items.length > 0 && (
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
            <TouchableOpacity style={s.addBtn} onPress={() => { setEditing(null); setFormVisible(true); }}>
              <Ionicons name="add" size={16} color={GOLD} />
              <Text style={s.addBtnTxt}>Add Item</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Food-type filter bar ── */}
        <View style={s.filterBar}>
          <View style={s.filterBarRow}>
            <Text style={s.filterBarLabel}>Food Type</Text>
            <View style={s.ftChipsRow}>
              {FOOD_TYPES.map(ft => {
                const active = foodFilters[ft.key as FoodType];
                return (
                  <TouchableOpacity key={ft.key}
                    style={[s.ftChip, active && { backgroundColor: 'rgba(37,99,235,0.08)', borderColor: 'rgba(37,99,235,0.25)' }]}
                    onPress={() => toggleFoodType(ft.key as FoodType)}>
                    {/* Checkmark */}
                    <View style={[s.ftCheck, active && s.ftCheckActive]}>
                      {active && <Ionicons name="checkmark" size={11} color="#fff" />}
                    </View>
                    {/* Colored food dot */}
                    <View style={[s.ftDot, { borderColor: ft.color }]}>
                      <View style={[s.ftDotInner, { backgroundColor: ft.color }]} />
                    </View>
                    <Text style={s.ftChipTxt}>{ft.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Search + refresh */}
            <View style={s.searchRow}>
              <View style={s.searchBox}>
                <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
                  placeholder="Search menu" placeholderTextColor="#9ca3af" />
                <Ionicons name="search-outline" size={14} color="#9ca3af" />
              </View>
              <TouchableOpacity style={s.iconBtn} onPress={() => load(true)}>
                <Ionicons name="refresh-outline" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Category ribbon ── */}
        {usedCats.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.ribbonScroll} contentContainerStyle={s.ribbonContent}>
            {/* All Menus card */}
            <TouchableOpacity style={[s.catCard, catFilter === 'all' && s.catCardActive]}
              onPress={() => setCatFilter('all')}>
              <View style={[s.catIcon, catFilter === 'all' && s.catIconActive]}>
                <Ionicons name="grid-outline" size={15} color={catFilter === 'all' ? PRIMARY : '#64748b'} />
              </View>
              <View>
                <Text style={[s.catName, catFilter === 'all' && { color: PRIMARY }]}>All Menus</Text>
                <Text style={s.catCount}>{catCounts.all ?? 0} items</Text>
              </View>
            </TouchableOpacity>
            {usedCats.map(c => {
              const active = catFilter === c.id;
              const cnt    = catCounts[c.id] ?? 0;
              return (
                <TouchableOpacity key={c.id} style={[s.catCard, active && s.catCardActive]}
                  onPress={() => setCatFilter(c.id)}>
                  <View style={[s.catIcon, active && s.catIconActive]}>
                    <Ionicons name="folder-outline" size={15} color={active ? PRIMARY : '#64748b'} />
                  </View>
                  <View>
                    <Text style={[s.catName, active && { color: PRIMARY }]} numberOfLines={1}>{c.name}</Text>
                    <Text style={s.catCount}>{cnt} items</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Active filter pills + result count ── */}
        {(hasActiveFilter || filtered.length !== items.length) && (
          <View style={s.activeFiltersRow}>
            <View style={s.activePills}>
              {search !== '' && (
                <View style={s.pill}>
                  <Text style={s.pillTxt}>Search: "{search}"</Text>
                  <TouchableOpacity onPress={() => setSearch('')}><Text style={s.pillX}>×</Text></TouchableOpacity>
                </View>
              )}
              {catFilter !== 'all' && (
                <View style={s.pill}>
                  <Text style={s.pillTxt}>{categories.find(c => c.id === catFilter)?.name}</Text>
                  <TouchableOpacity onPress={() => setCatFilter('all')}><Text style={s.pillX}>×</Text></TouchableOpacity>
                </View>
              )}
              {(Object.entries(foodFilters) as [FoodType, boolean][]).filter(([, v]) => !v).map(([ft]) => (
                <View key={ft} style={s.pill}>
                  <Text style={s.pillTxt}>Hide {ftLabel(ft)}</Text>
                  <TouchableOpacity onPress={() => toggleFoodType(ft)}><Text style={s.pillX}>×</Text></TouchableOpacity>
                </View>
              ))}
              {hasActiveFilter && (
                <TouchableOpacity onPress={clearFilters}><Text style={s.clearAll}>Clear all</Text></TouchableOpacity>
              )}
            </View>
            <Text style={s.resultCount}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</Text>
          </View>
        )}

        {/* ── Loading ── */}
        {loading ? (
          <View style={s.loadWrap}>
            <ActivityIndicator color={FOREST} size="large" />
            <Text style={s.loadTxt}>Loading items…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="fast-food-outline" size={36} color="#94a3b8" />
            </View>
            <Text style={s.emptyTitle}>No items found</Text>
            <Text style={s.emptySub}>
              {search ? `No results for "${search}"` : 'No items match the current filters.'}
            </Text>
            {!search && hasActiveFilter && (
              <TouchableOpacity style={s.clearFiltersBtn} onPress={clearFilters}>
                <Text style={s.clearFiltersBtnTxt}>Clear Filters</Text>
              </TouchableOpacity>
            )}
            {!hasActiveFilter && (
              <TouchableOpacity style={s.clearFiltersBtn}
                onPress={() => { setEditing(null); setFormVisible(true); }}>
                <Ionicons name="add" size={14} color={GOLD} />
                <Text style={s.clearFiltersBtnTxt}>Add First Item</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : viewMode === 'grid' ? (
          <View style={[s.grid, numCols > 1 && { flexDirection: 'row', flexWrap: 'wrap' }]}>
            {filtered.map(item => (
              <View key={item.id} style={{ width: `${100 / numCols}%` as any, padding: 6 }}>
                <ItemCard item={item}
                  onToggle={handleToggle}
                  onEdit={i => { setEditing(i); setFormVisible(true); }}
                  onDelete={handleDelete}
                  toggling={toggling.has(item.id)} />
              </View>
            ))}
          </View>
        ) : (
          <View style={s.listWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: isDesktop ? contentW - 24 : 740 }}>
                {/* Table header */}
                <View style={ll.header}>
                  <View style={[ll.hThumb]} />
                  <Text style={[ll.hCell, ll.c1]}>Name</Text>
                  <Text style={[ll.hCell, ll.c2]}>Category</Text>
                  <Text style={[ll.hCell, ll.c3]}>Type</Text>
                  <Text style={[ll.hCell, ll.c4, { textAlign: 'right' }]}>Price</Text>
                  <Text style={[ll.hCell, ll.c5, { textAlign: 'right' }]}>Actions</Text>
                </View>
                {filtered.map((item, idx) => (
                  <View key={item.id} style={idx % 2 === 1 ? { backgroundColor: '#f9fafb' } : {}}>
                    <ItemListRow item={item}
                      onToggle={handleToggle}
                      onEdit={i => { setEditing(i); setFormVisible(true); }}
                      onDelete={handleDelete}
                      toggling={toggling.has(item.id)} />
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
        <ItemForm
          item={editing}
          categories={categories}
          onSave={() => { setFormVisible(false); load(true); }}
          onClose={() => setFormVisible(false)} />
      </Modal>
    </View>
  );
}

// ── StyleSheets ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell:         { flex: 1, backgroundColor: '#f0f2f7' },

  // Page header
  pageHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pageTitle:     { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  pageSub:       { fontSize: 12, color: '#6b7280', marginTop: 2 },
  viewToggle:    { flexDirection: 'row', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 9, overflow: 'hidden', backgroundColor: '#f8fafc', padding: 2, gap: 2 },
  viewBtn:       { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  viewBtnActive: { backgroundColor: FOREST },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: FOREST, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnTxt:     { color: GOLD, fontWeight: '800', fontSize: 13 },

  // Filter bar
  filterBar:     { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 10 },
  filterBarRow:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  filterBarLabel:{ fontSize: 14, fontWeight: '700', color: '#374151', marginRight: 4 },
  ftChipsRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  ftChip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent' },
  ftChipTxt:     { fontSize: 13, color: '#374151', fontWeight: '500' },
  ftCheck:       { width: 17, height: 17, borderRadius: 4, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  ftCheckActive: { backgroundColor: PRIMARY },
  ftDot:         { width: 13, height: 13, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ftDotInner:    { width: 6, height: 6, borderRadius: 3 },
  searchRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  searchBox:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#e2e8f0', minWidth: 180 },
  searchInput:   { flex: 1, fontSize: 13, color: '#111827' },
  iconBtn:       { width: 34, height: 34, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },

  // Category ribbon
  ribbonScroll:  { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  ribbonContent: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  catCard:       { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 150, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb' },
  catCardActive: { borderColor: PRIMARY, shadowColor: PRIMARY, shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  catIcon:       { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  catIconActive: { backgroundColor: 'rgba(37,99,235,0.12)' },
  catName:       { fontSize: 11.5, fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.3 },
  catCount:      { fontSize: 10.5, color: '#9ca3af', marginTop: 1 },

  // Active filter pills
  activeFiltersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  activePills:   { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
  pill:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(37,99,235,0.08)' },
  pillTxt:       { fontSize: 12, color: PRIMARY, fontWeight: '500' },
  pillX:         { fontSize: 14, color: PRIMARY, fontWeight: '700', lineHeight: 16 },
  clearAll:      { fontSize: 12, color: '#6b7280', textDecorationLine: 'underline' },
  resultCount:   { fontSize: 12, color: '#6b7280', fontWeight: '600' },

  // Load / empty states
  loadWrap:  { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadTxt:   { fontSize: 14, color: '#9ca3af' },
  emptyWrap: { paddingTop: 80, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub:  { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: FOREST, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  clearFiltersBtnTxt: { color: GOLD, fontWeight: '800', fontSize: 13 },

  // Grid
  grid: { padding: 6 },

  // List
  listWrap: { margin: 12, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
});

// Item card styles
const ic = StyleSheet.create({
  wrap:        { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e8edf2', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  wrapHidden:  { borderColor: '#fde68a' },
  imgWrap:     { height: 110, position: 'relative', backgroundColor: '#f8fafc' },
  img:         { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ftDot:       { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ftDotInner:  { width: 8, height: 8, borderRadius: 4 },
  badge:       { position: 'absolute', top: 6, right: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  badgeLeft:   { position: 'absolute', top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  badgeTxt:    { fontSize: 10, fontWeight: '800' },
  body:        { padding: 10 },
  name:        { fontSize: 13, fontWeight: '700', color: '#111827', lineHeight: 17 },
  price:       { fontSize: 15, fontWeight: '800', color: FOREST },
  ftBadgeDot:  { width: 7, height: 7, borderRadius: 3.5 },
  ftLabel:     { fontSize: 11, fontWeight: '700' },
  catBadge:    { backgroundColor: FOREST, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start', marginTop: 5 },
  catBadgeTxt: { fontSize: 10, fontWeight: '800', color: GOLD },
  metaChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  metaChipTxt: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  taxLine:     { fontSize: 10.5, color: '#9ca3af', marginTop: 3 },
  actions:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  iconBtn:     { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});

// List row styles
const ll = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  hThumb:    { width: 52, marginRight: 10 },
  hCell:     { fontSize: 11, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thumb:     { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', marginRight: 10, flexShrink: 0 },
  img:       { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ftDot:     { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ftDotInner:{ width: 6, height: 6, borderRadius: 3 },
  c1: { flex: 3, paddingRight: 8 },
  c2: { flex: 2, paddingRight: 8 },
  c3: { flex: 1, paddingRight: 8 },
  c4: { width: 90, paddingRight: 8, alignItems: 'flex-end' },
  c5: { width: 130, alignItems: 'flex-end', gap: 6 },
  name:      { fontSize: 13, fontWeight: '700', color: '#111827' },
  desc:      { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  badge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  badgeTxt:  { fontSize: 10, fontWeight: '800' },
  cellTxt:   { fontSize: 12.5, color: '#374151' },
  price:     { fontSize: 13, fontWeight: '800', color: FOREST },
  tax:       { fontSize: 10.5, color: '#9ca3af' },
  iconBtn:   { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

// Form styles
const f = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 18, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title:      { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle:   { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  closeBtn:   { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  label:      { fontSize: 11.5, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:      { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14.5, color: '#111827', backgroundColor: '#fafafa' },
  catChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  catChipTxt: { fontSize: 13, fontWeight: '600', color: '#374151' },
  ftChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#f8fafc' },
  ftDot:      { width: 13, height: 13, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ftDotInner: { width: 6, height: 6, borderRadius: 3 },
  ftTxt:      { fontSize: 13, fontWeight: '600' },
  dynRow:     { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  addRowBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: PRIMARY, backgroundColor: '#eff6ff' },
  rmBtn:      { width: 28, height: 28, borderRadius: 7, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fecaca' },
  errBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#fff1f2', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
  errTxt:     { flex: 1, fontSize: 13, color: '#dc2626', lineHeight: 18 },
  footer:     { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  cancelTxt:  { fontWeight: '700', color: '#374151', fontSize: 14 },
  saveBtn:    { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: FOREST },
  saveTxt:    { fontWeight: '800', color: GOLD, fontSize: 14 },
});
