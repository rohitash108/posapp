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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { itemsApi } from '@/api/items';
import { categoriesApi } from '@/api/categories';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
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

// ── Style factories ───────────────────────────────────────────────────────────
function mkF(c: ThemeColors) {
  return StyleSheet.create({
    header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 18, borderBottomWidth: 1, borderBottomColor: c.border },
    title:      { fontSize: 18, fontWeight: '800', color: c.heading },
    subtitle:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    closeBtn:   { width: 34, height: 34, borderRadius: 10, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    label:      { fontSize: 11.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    input:      { borderWidth: 1.5, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14.5, color: c.heading, backgroundColor: c.surfaceAlt },
    catChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
    catChipTxt: { fontSize: 13, fontWeight: '600', color: c.text },
    ftChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceAlt },
    ftDot:      { width: 13, height: 13, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    ftDotInner: { width: 6, height: 6, borderRadius: 3 },
    ftTxt:      { fontSize: 13, fontWeight: '600' },
    dynRow:     { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
    addRowBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: PRIMARY, backgroundColor: '#eff6ff' },
    rmBtn:      { width: 28, height: 28, borderRadius: 7, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fecaca' },
    errBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#fff1f2', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
    errTxt:     { flex: 1, fontSize: 13, color: '#dc2626', lineHeight: 18 },
    footer:     { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border },
    cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    cancelTxt:  { fontWeight: '700', color: c.text, fontSize: 14 },
    saveBtn:    { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: c.sidebar },
    saveTxt:    { fontWeight: '800', color: c.brand, fontSize: 14 },
  });
}

function mkMm(c: ThemeColors) {
  return StyleSheet.create({
    header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    title:          { fontSize: 17, fontWeight: '800', color: c.heading, marginBottom: 3 },
    headerSub:      { fontSize: 12.5, color: '#d97706', fontWeight: '600' },
    fieldLabel:     { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 8 },
    priceRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.border, borderRadius: 10, overflow: 'hidden', backgroundColor: c.surfaceAlt },
    pricePrefix:    { paddingHorizontal: 12, paddingVertical: 12, backgroundColor: c.surfaceAlt, borderRightWidth: 1, borderRightColor: c.border },
    pricePrefixTxt: { fontSize: 15, fontWeight: '700', color: c.text },
    priceInput:     { flex: 1, fontSize: 15, color: c.heading, paddingHorizontal: 12, paddingVertical: 12 },
    useMasterBtn:   { paddingHorizontal: 12, paddingVertical: 12, borderLeftWidth: 1, borderLeftColor: c.border, backgroundColor: c.surfaceAlt },
    useMasterTxt:   { fontSize: 13, fontWeight: '600', color: c.text },
    priceHint:      { fontSize: 12, color: '#d97706', marginTop: 6, lineHeight: 17 },
    toggleRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
    toggleLabel:    { fontSize: 14, fontWeight: '600', color: c.heading },
    toggleHint:     { fontSize: 12, color: c.textMuted, marginTop: 6, lineHeight: 17 },
  });
}

function mkM(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    sheet:    { width: '100%', maxWidth: 520, maxHeight: '90%', backgroundColor: c.surface, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  });
}

function mkS(c: ThemeColors) {
  return StyleSheet.create({
    shell:         { flex: 1, backgroundColor: c.background },
    pageHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle:     { fontSize: 20, fontWeight: '800', color: c.heading },
    pageSub:       { fontSize: 12, color: c.textMuted, marginTop: 2 },
    viewToggle:    { flexDirection: 'row', borderWidth: 1.5, borderColor: c.border, borderRadius: 9, overflow: 'hidden', backgroundColor: c.surfaceAlt, padding: 2, gap: 2 },
    viewBtn:       { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
    viewBtnActive: { backgroundColor: c.sidebar },
    addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.sidebar, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    addBtnTxt:     { color: c.brand, fontWeight: '800', fontSize: 13 },
    filterBar:     { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 14, paddingVertical: 10 },
    filterBarRow:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    filterBarLabel:{ fontSize: 14, fontWeight: '700', color: c.text, marginRight: 4 },
    ftChipsRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
    ftChip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent' },
    ftChipTxt:     { fontSize: 13, color: c.text, fontWeight: '500' },
    ftCheck:       { width: 17, height: 17, borderRadius: 4, backgroundColor: c.border, alignItems: 'center', justifyContent: 'center' },
    ftCheckActive: { backgroundColor: PRIMARY },
    ftDot:         { width: 13, height: 13, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    ftDotInner:    { width: 6, height: 6, borderRadius: 3 },
    searchRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
    searchBox:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: c.border, minWidth: 160 },
    searchInput:   { flex: 1, fontSize: 13, color: c.heading },
    iconBtn:       { width: 34, height: 34, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    ribbonScroll:  { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    ribbonContent: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    catCard:       { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 150, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border },
    catCardActive: { borderColor: PRIMARY, shadowColor: PRIMARY, shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    catIcon:       { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    catIconActive: { backgroundColor: 'rgba(37,99,235,0.12)' },
    catName:       { fontSize: 11.5, fontWeight: '800', color: c.text, textTransform: 'uppercase', letterSpacing: 0.3 },
    catCount:      { fontSize: 10.5, color: c.textMuted, marginTop: 1 },
    activeFiltersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
    activePills:   { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
    pill:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(37,99,235,0.08)' },
    pillTxt:       { fontSize: 12, color: PRIMARY, fontWeight: '500' },
    pillX:         { fontSize: 14, color: PRIMARY, fontWeight: '700', lineHeight: 16 },
    clearAll:      { fontSize: 12, color: c.textMuted, textDecorationLine: 'underline' },
    resultCount:   { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    loadWrap:      { paddingTop: 80, alignItems: 'center', gap: 12 },
    loadTxt:       { fontSize: 14, color: c.textMuted },
    emptyWrap:     { paddingTop: 80, alignItems: 'center', gap: 12 },
    emptyIcon:     { width: 72, height: 72, borderRadius: 36, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    emptyTitle:    { fontSize: 16, fontWeight: '700', color: c.text },
    emptySub:      { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingHorizontal: 40 },
    clearFiltersBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.sidebar, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
    clearFiltersBtnTxt: { color: c.brand, fontWeight: '800', fontSize: 13 },
    grid:    { padding: 6 },
    listWrap:{ margin: 12, backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  });
}

function mkIc(c: ThemeColors) {
  return StyleSheet.create({
    wrap:        { backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    wrapHidden:  { borderColor: '#fde68a' },
    imgWrap:     { height: 110, position: 'relative', backgroundColor: c.surfaceAlt },
    img:         { width: '100%', height: '100%' },
    imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    ftDot:       { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    ftDotInner:  { width: 8, height: 8, borderRadius: 4 },
    badge:       { position: 'absolute', top: 6, right: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    badgeLeft:   { position: 'absolute', top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    badgeTxt:    { fontSize: 10, fontWeight: '800' },
    body:        { padding: 10 },
    name:        { fontSize: 13, fontWeight: '700', color: c.heading, lineHeight: 17 },
    price:       { fontSize: 15, fontWeight: '800', color: c.sidebar },
    ftBadgeDot:  { width: 7, height: 7, borderRadius: 3.5 },
    ftLabel:     { fontSize: 11, fontWeight: '700' },
    catBadge:    { backgroundColor: c.sidebar, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start', marginTop: 5 },
    catBadgeTxt: { fontSize: 10, fontWeight: '800', color: c.brand },
    metaChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.surfaceAlt, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    metaChipTxt: { fontSize: 10, color: c.textMuted, fontWeight: '600' },
    taxLine:     { fontSize: 10.5, color: c.textMuted, marginTop: 3 },
    overrideTxt: { fontSize: 10, color: '#16a34a', fontWeight: '700', marginTop: 1 },
    actions:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border },
    iconBtn:     { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  });
}

function mkLl(c: ThemeColors) {
  return StyleSheet.create({
    header:     { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    hThumb:     { width: 52, marginRight: 10 },
    hCell:      { fontSize: 11, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    thumb:      { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', marginRight: 10, flexShrink: 0 },
    img:        { width: '100%', height: '100%' },
    imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    ftDot:      { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    ftDotInner: { width: 6, height: 6, borderRadius: 3 },
    c1: { flex: 3, paddingRight: 8 },
    c2: { flex: 2, paddingRight: 8 },
    c3: { flex: 1, paddingRight: 8 },
    c4: { width: 90, paddingRight: 8, alignItems: 'flex-end' },
    c5: { width: 130, alignItems: 'flex-end', gap: 6 },
    name:        { fontSize: 13, fontWeight: '700', color: c.heading },
    desc:        { fontSize: 11, color: c.textMuted, marginTop: 2 },
    badge:       { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
    badgeTxt:    { fontSize: 10, fontWeight: '800' },
    cellTxt:     { fontSize: 12.5, color: c.text },
    price:       { fontSize: 13, fontWeight: '800', color: c.sidebar },
    overrideTxt: { fontSize: 10, color: '#16a34a', fontWeight: '700', marginTop: 1 },
    tax:         { fontSize: 10.5, color: c.textMuted },
    iconBtn:     { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  });
}

// ── Variation / Addon row for form ────────────────────────────────────────────
interface DynRow { name: string; price: string; }

function DynRows({ label, rows, onChange }: {
  label: string; rows: DynRow[];
  onChange: (rows: DynRow[]) => void;
}) {
  const { colors: c } = useTheme();
  const f = useMemo(() => mkF(c), [c]);

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
            placeholder={label === 'Variations' ? 'e.g. Small' : 'e.g. Extra Cheese'} placeholderTextColor={c.textMuted} />
          <TextInput style={[f.input, { flex: 1, textAlign: 'right' }]} value={r.price}
            onChangeText={v => update(i, 'price', v)} placeholder="₹0" placeholderTextColor={c.textMuted}
            keyboardType="decimal-pad" />
          <TouchableOpacity style={f.rmBtn} onPress={() => remove(i)}>
            <Ionicons name="close" size={14} color="#dc2626" />
          </TouchableOpacity>
        </View>
      ))}
      {rows.length === 0 && (
        <Text style={{ fontSize: 12, color: c.textMuted, fontStyle: 'italic' }}>None added</Text>
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
  const { colors: c } = useTheme();
  const f = useMemo(() => mkF(c), [c]);

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
    <View style={{ flexShrink: 1, backgroundColor: c.surface }}>
      <View style={f.header}>
        <View>
          <Text style={f.title}>{item ? 'Edit Item' : 'New Item'}</Text>
          <Text style={f.subtitle}>{item ? item.name : 'Add a restaurant-owned item'}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={f.closeBtn}>
          <Ionicons name="close" size={20} color={c.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 18, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Name */}
        <View>
          <Text style={f.label}>Item Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
          <TextInput style={f.input} value={name} onChangeText={setName} placeholder="e.g. Masala Chai" placeholderTextColor={c.textMuted} />
        </View>

        {/* Description */}
        <View>
          <Text style={f.label}>Description</Text>
          <TextInput style={[f.input, { height: 70, textAlignVertical: 'top', paddingTop: 10 }]}
            value={desc} onChangeText={setDesc} placeholder="Optional" placeholderTextColor={c.textMuted} multiline />
        </View>

        {/* Price row */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={f.label}>Price (₹) <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <TextInput style={f.input} value={price} onChangeText={setPrice}
              placeholder="0.00" placeholderTextColor={c.textMuted} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={f.label}>Net/Cost Price (₹)</Text>
            <TextInput style={f.input} value={netPrice} onChangeText={setNetPrice}
              placeholder="0.00" placeholderTextColor={c.textMuted} keyboardType="decimal-pad" />
          </View>
        </View>

        {/* Category */}
        <View>
          <Text style={f.label}>Category <Text style={{ color: '#dc2626' }}>*</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {categories.map(cat => {
              const active = catId === cat.id;
              return (
                <TouchableOpacity key={cat.id}
                  style={[f.catChip, active && { backgroundColor: c.sidebar, borderColor: c.sidebar }]}
                  onPress={() => setCatId(cat.id)}>
                  <Text style={[f.catChipTxt, active && { color: c.brand }]}>{cat.name}</Text>
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
                  <Text style={[f.ftTxt, { color: active ? ft.color : c.text }, active && { fontWeight: '800' }]}>
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

// ── My Menu Modal (master items: set price override + availability) ───────────
interface MyMenuModalProps {
  item: MenuItem;
  onSave: (updated: MenuItem) => void;
  onClose: () => void;
}

function MyMenuModal({ item, onSave, onClose }: MyMenuModalProps) {
  const { colors: c } = useTheme();
  const mm = useMemo(() => mkMm(c), [c]);
  const f  = useMemo(() => mkF(c),  [c]);

  const [priceOverride, setPriceOverride] = useState(
    item.price_override != null ? String(item.price_override) : ''
  );
  const [isAvailable, setIsAvailable] = useState(item.is_available);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const masterPrice = item.master_price ?? item.price;

  async function save() {
    if (priceOverride !== '' && isNaN(Number(priceOverride))) {
      setError('Price must be a valid number'); return;
    }
    setLoading(true); setError('');
    try {
      const payload = {
        price_override: priceOverride !== '' ? Number(priceOverride) : null,
        is_available: isAvailable,
      };
      const res = await itemsApi.updateMyMenu(item.id, payload);
      const updated = res.data?.data ?? res.data;
      Toast.show({
        type: 'success',
        text1: 'My Menu updated',
        text2: `${item.name} saved successfully.`,
        position: 'bottom',
        visibilityTime: 3000,
      });
      onSave(updated);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Failed to save';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally { setLoading(false); }
  }

  return (
    <View style={{ flexShrink: 1, backgroundColor: c.surface }}>
      {/* Header — "My menu — {item name}" */}
      <View style={mm.header}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={mm.title} numberOfLines={1}>My menu — {item.name}</Text>
          <Text style={mm.headerSub}>Per-outlet price + active flag for this item</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={f.closeBtn}>
          <Ionicons name="close" size={20} color={c.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 18, gap: 16 }} showsVerticalScrollIndicator={false}>

        {/* My selling price */}
        <View>
          <Text style={mm.fieldLabel}>My selling price</Text>
          {/* ₹ prefix + input + "Use master" button — matches web layout */}
          <View style={mm.priceRow}>
            <View style={mm.pricePrefix}>
              <Text style={mm.pricePrefixTxt}>₹</Text>
            </View>
            <TextInput
              style={mm.priceInput}
              value={priceOverride}
              onChangeText={setPriceOverride}
              placeholder={Number(masterPrice).toFixed(2)}
              placeholderTextColor={c.textMuted}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={mm.useMasterBtn} onPress={() => setPriceOverride('')}>
              <Text style={mm.useMasterTxt}>Use master</Text>
            </TouchableOpacity>
          </View>
          <Text style={mm.priceHint}>
            Leave blank (or tap <Text style={{ fontStyle: 'italic' }}>Use master</Text>) to use the chain's master price (₹{Number(masterPrice).toFixed(2)}).
          </Text>
        </View>

        {/* Active on my menu toggle */}
        <View>
          <View style={mm.toggleRow}>
            <Switch
              value={isAvailable}
              onValueChange={setIsAvailable}
              trackColor={{ true: '#2563eb', false: '#e5e7eb' }}
              thumbColor="#fff"
            />
            <Text style={mm.toggleLabel}>Active on my menu</Text>
          </View>
          <Text style={mm.toggleHint}>
            Inactive items stay assigned to your outlet but are hidden from the POS and customer-facing menu. You can re-enable them any time.
          </Text>
        </View>

        {!!error && (
          <View style={f.errBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
            <Text style={f.errTxt}>{error}</Text>
          </View>
        )}
        <View style={{ height: 4 }} />
      </ScrollView>

      <View style={f.footer}>
        <TouchableOpacity style={f.cancelBtn} onPress={onClose}>
          <Text style={f.cancelTxt}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[f.saveBtn, { flexDirection: 'row', gap: 6 }]} onPress={save} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="save-outline" size={15} color={c.brand} />
                <Text style={f.saveTxt}>Save</Text>
              </>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Item Card (grid) ──────────────────────────────────────────────────────────
function ItemCard({ item, onToggle, onEdit, onDelete, onMyMenu, toggling, isSuperAdmin, canManageItems, canManageMyMenu }: {
  item: MenuItem;
  onToggle: (item: MenuItem) => void;
  onEdit:   (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  onMyMenu: (item: MenuItem) => void;
  toggling: boolean;
  isSuperAdmin: boolean;
  canManageItems: boolean;
  canManageMyMenu: boolean;
}) {
  const { colors: c } = useTheme();
  const ic = useMemo(() => mkIc(c), [c]);

  const ft      = ftCfg(item.food_type ?? (item.is_veg === false ? 'non_veg' : 'veg'));
  const imgUrl  = itemImage(item.image);
  const varCount = item.variations?.filter(v => v.name)?.length ?? 0;
  const addCount = item.addons?.filter(a => a.name)?.length ?? 0;
  const isMaster = !!item.is_master;
  const hasOverride = item.price_override != null;

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
          <View>
            <Text style={ic.price}>₹{Number(item.price).toFixed(2)}</Text>
            {hasOverride && (
              <Text style={ic.overrideTxt}>Custom price</Text>
            )}
          </View>
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
                <Ionicons name="layers-outline" size={10} color={c.textMuted} />
                <Text style={ic.metaChipTxt}>{varCount} var</Text>
              </View>
            )}
            {addCount > 0 && (
              <View style={ic.metaChip}>
                <Ionicons name="add-circle-outline" size={10} color={c.textMuted} />
                <Text style={ic.metaChipTxt}>{addCount} addon</Text>
              </View>
            )}
          </View>
        )}

        {/* Tax */}
        {item.tax_name && (
          <Text style={ic.taxLine}>{item.tax_name} ({item.tax_rate}%)</Text>
        )}

        {/* Actions — only render row if there's at least one visible action */}
        {(canManageItems || (canManageMyMenu && isMaster)) && (
          <View style={ic.actions}>
            {/* Availability toggle — super admin all items; restaurant admin own non-master */}
            {(isSuperAdmin || (canManageItems && !isMaster)) && (
              toggling ? (
                <ActivityIndicator size="small" color={c.sidebar} />
              ) : (
                <Switch value={!!item.is_available} onValueChange={() => onToggle(item)}
                  trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff"
                  style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }} />
              )
            )}

            {/* Master items: My Menu for restaurant_admin + super_admin */}
            {canManageMyMenu && isMaster && (
              <TouchableOpacity style={[ic.iconBtn, { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }]} onPress={() => onMyMenu(item)}>
                <Ionicons name="pricetag-outline" size={13} color="#16a34a" />
              </TouchableOpacity>
            )}

            {/* Own (non-master) items: edit + delete */}
            {canManageItems && !isMaster && (
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
        )}
      </View>
    </View>
  );
}

// ── Item List Row ─────────────────────────────────────────────────────────────
function ItemListRow({ item, onToggle, onEdit, onDelete, onMyMenu, toggling, isSuperAdmin, canManageItems, canManageMyMenu }: {
  item: MenuItem;
  onToggle: (item: MenuItem) => void;
  onEdit:   (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  onMyMenu: (item: MenuItem) => void;
  toggling: boolean;
  isSuperAdmin: boolean;
  canManageItems: boolean;
  canManageMyMenu: boolean;
}) {
  const { colors: c } = useTheme();
  const ll = useMemo(() => mkLl(c), [c]);

  const ft         = ftCfg(item.food_type ?? (item.is_veg === false ? 'non_veg' : 'veg'));
  const imgUrl     = itemImage(item.image);
  const isMaster   = !!item.is_master;
  const hasOverride = item.price_override != null;

  return (
    <View style={[ll.row, !item.is_available && { backgroundColor: c.surfaceAlt }]}>
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
        {hasOverride && <Text style={ll.overrideTxt}>Custom</Text>}
        {!hasOverride && item.tax_name && <Text style={ll.tax}>{item.tax_name}</Text>}
      </View>

      {/* Actions */}
      <View style={ll.c5}>
        {/* Toggle — super admin all; restaurant admin own non-master */}
        {(isSuperAdmin || (canManageItems && !isMaster)) && (
          toggling ? (
            <ActivityIndicator size="small" color={c.sidebar} />
          ) : (
            <Switch value={!!item.is_available} onValueChange={() => onToggle(item)}
              trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff"
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} />
          )
        )}
        {/* My Menu — master items for restaurant_admin + super_admin */}
        {canManageMyMenu && isMaster && (
          <TouchableOpacity style={[ll.iconBtn, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}
            onPress={() => onMyMenu(item)}>
            <Ionicons name="pricetag-outline" size={13} color="#16a34a" />
          </TouchableOpacity>
        )}
        {/* Edit + Delete — own non-master items */}
        {canManageItems && !isMaster && (
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
  const { colors: c } = useTheme();
  const s  = useMemo(() => mkS(c),  [c]);
  const ll = useMemo(() => mkLl(c), [c]);
  const m  = useMemo(() => mkM(c),  [c]);

  const [items,          setItems]          = useState<MenuItem[]>([]);
  const [categories,     setCategories]     = useState<Category[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [search,         setSearch]         = useState('');
  const [catFilter,      setCatFilter]      = useState<number | 'all'>('all');
  const [foodFilters,    setFoodFilters]    = useState<Record<FoodType, boolean>>({ veg: true, non_veg: true, egg: true });
  const [viewMode,       setViewMode]       = useState<'grid' | 'list'>('grid');
  const [formVisible,    setFormVisible]    = useState(false);
  const [editing,        setEditing]        = useState<MenuItem | null>(null);
  const [myMenuVisible,  setMyMenuVisible]  = useState(false);
  const [myMenuItem,     setMyMenuItem]     = useState<MenuItem | null>(null);
  const [toggling,       setToggling]       = useState<Set<number>>(new Set());
  const user       = useAppStore(s => s.user);
  const isSuperAdmin       = user?.role === 'super_admin';
  const isRestaurantAdmin  = user?.role === 'restaurant_admin';
  const canManageItems     = isSuperAdmin || isRestaurantAdmin;
  const canManageMyMenu    = isRestaurantAdmin || isSuperAdmin;

  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const isDesktop = width >= 1024;
  const isMobile  = width < 640;
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

  function handleMyMenuSave(updated: MenuItem) {
    setItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
    setMyMenuVisible(false);
    setMyMenuItem(null);
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const catCounts = useMemo(() => {
    const cc: Record<number | string, number> = { all: 0 };
    for (const i of items) {
      cc.all++;
      if (i.category_id) cc[i.category_id] = (cc[i.category_id] ?? 0) + 1;
    }
    return cc;
  }, [items]);

  const usedCatIds = useMemo(() => new Set(items.map(i => i.category_id).filter(Boolean)), [items]);
  const usedCats   = useMemo(() => categories.filter(cat => usedCatIds.has(cat.id)), [categories, usedCatIds]);

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={c.brand} />}>

        {/* ── Page header ── */}
        <View style={[s.pageHeader, { paddingTop: insets.top + 14 }]}>
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
                  <Ionicons name="grid-outline" size={14} color={viewMode === 'grid' ? '#fff' : c.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity style={[s.viewBtn, viewMode === 'list' && s.viewBtnActive]}
                  onPress={() => setViewMode('list')}>
                  <Ionicons name="list-outline" size={14} color={viewMode === 'list' ? '#fff' : c.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            {/* Add Item — restaurant admin + super admin */}
            {canManageItems && (
              <TouchableOpacity style={s.addBtn} onPress={() => { setEditing(null); setFormVisible(true); }}>
                <Ionicons name="add" size={16} color={c.brand} />
                <Text style={s.addBtnTxt}>Add Item</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Food-type filter bar ── */}
        <View style={s.filterBar}>
          {isMobile ? (
            /* ── Mobile: one row — label + horizontal-scroll chips + search below ── */
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.filterBarLabel}>Food Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {FOOD_TYPES.map(ft => {
                    const active = foodFilters[ft.key as FoodType];
                    return (
                      <TouchableOpacity key={ft.key}
                        style={[s.ftChip, active && { backgroundColor: 'rgba(37,99,235,0.08)', borderColor: 'rgba(37,99,235,0.25)' }]}
                        onPress={() => toggleFoodType(ft.key as FoodType)}>
                        <View style={[s.ftCheck, active && s.ftCheckActive]}>
                          {active && <Ionicons name="checkmark" size={11} color="#fff" />}
                        </View>
                        <View style={[s.ftDot, { borderColor: ft.color }]}>
                          <View style={[s.ftDotInner, { backgroundColor: ft.color }]} />
                        </View>
                        <Text style={s.ftChipTxt}>{ft.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              {/* Search row below on mobile */}
              <View style={[s.searchRow, { marginTop: 8 }]}>
                <View style={[s.searchBox, { flex: 1 }]}>
                  <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
                    placeholder="Search menu" placeholderTextColor={c.textMuted} />
                  <Ionicons name="search-outline" size={14} color={c.textMuted} />
                </View>
                <TouchableOpacity style={s.iconBtn} onPress={() => load(true)}>
                  <Ionicons name="refresh-outline" size={16} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* ── Desktop: all in one row ── */
            <View style={s.filterBarRow}>
              <Text style={s.filterBarLabel}>Food Type</Text>
              <View style={s.ftChipsRow}>
                {FOOD_TYPES.map(ft => {
                  const active = foodFilters[ft.key as FoodType];
                  return (
                    <TouchableOpacity key={ft.key}
                      style={[s.ftChip, active && { backgroundColor: 'rgba(37,99,235,0.08)', borderColor: 'rgba(37,99,235,0.25)' }]}
                      onPress={() => toggleFoodType(ft.key as FoodType)}>
                      <View style={[s.ftCheck, active && s.ftCheckActive]}>
                        {active && <Ionicons name="checkmark" size={11} color="#fff" />}
                      </View>
                      <View style={[s.ftDot, { borderColor: ft.color }]}>
                        <View style={[s.ftDotInner, { backgroundColor: ft.color }]} />
                      </View>
                      <Text style={s.ftChipTxt}>{ft.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={s.searchRow}>
                <View style={s.searchBox}>
                  <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
                    placeholder="Search menu" placeholderTextColor={c.textMuted} />
                  <Ionicons name="search-outline" size={14} color={c.textMuted} />
                </View>
                <TouchableOpacity style={s.iconBtn} onPress={() => load(true)}>
                  <Ionicons name="refresh-outline" size={16} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Category ribbon ── */}
        {usedCats.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.ribbonScroll} contentContainerStyle={s.ribbonContent}>
            {/* All Menus card */}
            <TouchableOpacity style={[s.catCard, catFilter === 'all' && s.catCardActive]}
              onPress={() => setCatFilter('all')}>
              <View style={[s.catIcon, catFilter === 'all' && s.catIconActive]}>
                <Ionicons name="grid-outline" size={15} color={catFilter === 'all' ? PRIMARY : c.textMuted} />
              </View>
              <View>
                <Text style={[s.catName, catFilter === 'all' && { color: PRIMARY }]}>All Menus</Text>
                <Text style={s.catCount}>{catCounts.all ?? 0} items</Text>
              </View>
            </TouchableOpacity>
            {usedCats.map(cat => {
              const active = catFilter === cat.id;
              const cnt    = catCounts[cat.id] ?? 0;
              return (
                <TouchableOpacity key={cat.id} style={[s.catCard, active && s.catCardActive]}
                  onPress={() => setCatFilter(cat.id)}>
                  <View style={[s.catIcon, active && s.catIconActive]}>
                    <Ionicons name="folder-outline" size={15} color={active ? PRIMARY : c.textMuted} />
                  </View>
                  <View>
                    <Text style={[s.catName, active && { color: PRIMARY }]} numberOfLines={1}>{cat.name}</Text>
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
                  <Text style={s.pillTxt}>{categories.find(cat => cat.id === catFilter)?.name}</Text>
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
            <ActivityIndicator color={c.sidebar} size="large" />
            <Text style={s.loadTxt}>Loading items…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="fast-food-outline" size={36} color={c.textMuted} />
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
            {!hasActiveFilter && canManageItems && (
              <TouchableOpacity style={s.clearFiltersBtn}
                onPress={() => { setEditing(null); setFormVisible(true); }}>
                <Ionicons name="add" size={14} color={c.brand} />
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
                  onMyMenu={i => { setMyMenuItem(i); setMyMenuVisible(true); }}
                  toggling={toggling.has(item.id)}
                  isSuperAdmin={isSuperAdmin}
                  canManageItems={canManageItems}
                  canManageMyMenu={canManageMyMenu} />
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
                  {(canManageItems || canManageMyMenu) && (
                    <Text style={[ll.hCell, ll.c5, { textAlign: 'right' }]}>Actions</Text>
                  )}
                </View>
                {filtered.map((item, idx) => (
                  <View key={item.id} style={idx % 2 === 1 ? { backgroundColor: c.surfaceAlt } : {}}>
                    <ItemListRow item={item}
                      onToggle={handleToggle}
                      onEdit={i => { setEditing(i); setFormVisible(true); }}
                      onDelete={handleDelete}
                      onMyMenu={i => { setMyMenuItem(i); setMyMenuVisible(true); }}
                      toggling={toggling.has(item.id)}
                      isSuperAdmin={isSuperAdmin}
                      canManageItems={canManageItems}
                      canManageMyMenu={canManageMyMenu} />
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Create / Edit Modal (centered dialog, web-safe) ── */}
      <Modal visible={formVisible} animationType="fade" transparent
        onRequestClose={() => setFormVisible(false)}>
        <Pressable style={m.backdrop} onPress={() => setFormVisible(false)}>
          <Pressable style={m.sheet} onPress={e => e.stopPropagation()}>
            <ItemForm
              item={editing}
              categories={categories}
              onSave={() => { setFormVisible(false); load(true); }}
              onClose={() => setFormVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── My Menu Modal (master items: price override + availability) ── */}
      <Modal visible={myMenuVisible} animationType="fade" transparent
        onRequestClose={() => { setMyMenuVisible(false); setMyMenuItem(null); }}>
        <Pressable style={m.backdrop} onPress={() => { setMyMenuVisible(false); setMyMenuItem(null); }}>
          <Pressable style={[m.sheet, { maxWidth: 420 }]} onPress={e => e.stopPropagation()}>
            {myMenuItem && (
              <MyMenuModal
                item={myMenuItem}
                onSave={handleMyMenuSave}
                onClose={() => { setMyMenuVisible(false); setMyMenuItem(null); }} />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
