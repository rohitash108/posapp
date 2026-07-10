import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, RefreshControl, Switch, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { suppliesApi } from '@/api/supplies';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { SuppliesData, SupplySku, SupplyConsumptionRule, SupplyHistoryData } from '@/types';

import {
  STOCK_BRAND,
  trackedStockTone,
  filterChipColor,
  stockTabActiveBg,
  errBannerColors,
  dangerBorder,
  activeRuleBg,
  qtyDeltaColor,
} from '@/components/stock/stockUi';

const BRAND = STOCK_BRAND;

type OpType = 'stock-in' | 'waste' | 'adjustment';

function supplyStatus(row: SupplySku, isDark: boolean) {
  return trackedStockTone(row.track_stock, row.on_hand, row.low_stock_threshold, isDark);
}

function mkS(c: ThemeColors, isDark: boolean) {
  const err = errBannerColors(isDark);
  const tabActive = stockTabActiveBg(isDark);
  return StyleSheet.create({
    statsBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    statItem:    { flex: 1, alignItems: 'center', gap: 1 },
    statIcon:    { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
    statVal:     { fontSize: 14, fontWeight: '800' },
    statLbl:     { fontSize: 9, color: c.textMuted, textAlign: 'center' },
    statDivider: { width: 1, height: 28, backgroundColor: c.border },
    card:        { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    tableToolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: c.border, flexWrap: 'wrap' },
    searchWrap:  { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: c.border },
    searchInput: { flex: 1, fontSize: 13.5, color: c.heading },
    filterChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    chip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt },
    chipTxt:     { fontSize: 12, fontWeight: '600', color: c.text },
    chipBadge:   { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: c.border },
    chipBadgeTxt:{ fontSize: 10, fontWeight: '700', color: c.text },
    tRow:        { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border },
    tRowAlt:     { backgroundColor: c.surfaceAlt },
    tHead:       { backgroundColor: c.surfaceAlt },
    tCell:       { fontSize: 12, fontWeight: '600', color: c.textMuted, paddingVertical: 10 },
    cName:       { flex: 2.2, minWidth: 0, paddingHorizontal: 12 },
    cCat:        { flex: 1, minWidth: 70, paddingHorizontal: 8 },
    cOnHand:     { flex: 0.7, minWidth: 50, paddingHorizontal: 8 },
    cStatus:     { flex: 1.1, minWidth: 80, paddingHorizontal: 8 },
    cAct:        { flex: 1, minWidth: 76, paddingRight: 10 },
    ingName:     { fontSize: 14, fontWeight: '700', color: c.heading },
    ingSku:      { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, alignSelf: 'flex-start' },
    statusTxt:   { fontSize: 11.5, fontWeight: '700' },
    minTxt:      { fontSize: 11, color: c.textMuted, marginTop: 3 },
    actBtn:      { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    emptyWrap:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 8 },
    emptyTxt:    { fontSize: 14, color: c.textMuted, fontWeight: '600' },
    tabBar:      { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 3 },
    tabBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8 },
    tabActive:   { backgroundColor: tabActive },
    tabTxt:      { fontSize: 12.5, color: c.textMuted, fontWeight: '600' },
    cardHdr:     { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: 'row', alignItems: 'center' },
    cardHdrTxt:  { fontSize: 14, fontWeight: '800', color: c.heading, flex: 1 },
    cardHdrSub:  { fontSize: 11.5, color: c.textMuted },
    ruleRow:     { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    histMeta:    { fontSize: 11.5, color: c.textMuted },
    loadMoreBtn: { alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.border },
    loadMoreTxt: { fontSize: 13, fontWeight: '700', color: BRAND },
    centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: err.backgroundColor, borderWidth: 1, borderColor: err.borderColor, borderRadius: 10, padding: 12, marginBottom: 12 },
    errText: { flex: 1, fontSize: 12.5, color: isDark ? '#FF3636' : '#dc2626' },
  });
}

function mkM(c: ThemeColors) {
  return StyleSheet.create({
    overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box:      { backgroundColor: c.surface, borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90%', overflow: 'hidden' },
    hdr:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    hdrTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: c.heading },
    closeBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    body:     { padding: 18, gap: 14 },
    field:    { gap: 6 },
    label:    { fontSize: 12.5, fontWeight: '700', color: c.text, textTransform: 'uppercase', letterSpacing: 0.3 },
    input:    { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14.5, color: c.heading },
    opRow:    { flexDirection: 'row', gap: 8 },
    opBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceAlt },
    opTxt:    { fontSize: 12.5, fontWeight: '600', color: c.text },
    picker:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
    pickerTxt:{ flex: 1, fontSize: 14, color: c.heading },
    pickerDropdown: { borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.surface, marginTop: 4, overflow: 'hidden' },
    pickerItem: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border },
    pickerItemTxt: { fontSize: 13.5, color: c.text },
    catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    catChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border },
    err:      { fontSize: 12.5, color: '#dc2626', fontWeight: '600' },
    footer:   { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border },
    cancelBtn:{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    cancelTxt:{ fontSize: 14.5, fontWeight: '600', color: c.text },
    saveBtn:  { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: BRAND },
    saveTxt:  { fontSize: 14.5, fontWeight: '800', color: '#fff' },
    currentQty: { fontSize: 11.5, color: c.textMuted, marginTop: 3 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  });
}

function SupplyOpModal({
  visible, skus, defaultId, defaultOp, onSave, onClose,
}: {
  visible: boolean;
  skus: SupplySku[];
  defaultId?: number;
  defaultOp?: OpType;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const m = useMemo(() => mkM(c), [c]);
  const [op, setOp] = useState<OpType>(defaultOp ?? 'stock-in');
  const [skuId, setSkuId] = useState<number | null>(defaultId ?? null);
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setOp(defaultOp ?? 'stock-in');
      setSkuId(defaultId ?? null);
      setQty(''); setNotes(''); setReference(''); setError('');
    }
  }, [visible, defaultId, defaultOp]);

  const selected = skus.find(s => s.id === skuId);

  async function save() {
    if (!skuId) { setError('Select a supply SKU'); return; }
    const q = parseInt(qty, 10);
    if (op === 'adjustment') {
      if (!qty || isNaN(q) || q === 0) { setError('Enter a non-zero quantity change'); return; }
    } else if (!qty || isNaN(q) || q <= 0) {
      setError('Enter a valid quantity'); return;
    }
    setSaving(true); setError('');
    try {
      if (op === 'stock-in') {
        await suppliesApi.update(skuId, { name: selected!.name, sku_code: selected!.sku_code, category: selected!.category, unit: selected!.unit, stock_mode: 'add', quantity: q, stock_notes: notes, reference: reference || undefined });
      } else if (op === 'waste') {
        await suppliesApi.waste(skuId, { quantity: q, notes });
      } else {
        await suppliesApi.adjust(skuId, { quantity_change: q, notes });
      }
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Operation failed');
    } finally { setSaving(false); }
  }

  const OPS: { value: OpType; label: string; icon: string; color: string }[] = [
    { value: 'stock-in',   label: 'Stock In',   icon: 'arrow-down-circle-outline', color: '#059669' },
    { value: 'waste',      label: 'Waste',      icon: 'trash-outline',             color: '#dc2626' },
    { value: 'adjustment', label: 'Adjustment', icon: 'swap-horizontal-outline',   color: '#d97706' },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={m.box}>
          <View style={m.hdr}>
            <Text style={m.hdrTitle}>Supply Operation</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}><Ionicons name="close" size={20} color={c.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={m.body}>
            <View style={m.field}>
              <Text style={m.label}>Operation Type</Text>
              <View style={m.opRow}>
                {OPS.map(o => (
                  <TouchableOpacity key={o.value} style={[m.opBtn, op === o.value && { backgroundColor: o.color, borderColor: o.color }]} onPress={() => setOp(o.value)}>
                    <Ionicons name={o.icon as any} size={15} color={op === o.value ? '#fff' : o.color} />
                    <Text style={[m.opTxt, op === o.value && { color: '#fff', fontWeight: '700' }]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={m.field}>
              <Text style={m.label}>Supply SKU *</Text>
              <TouchableOpacity style={m.picker} onPress={() => setShowPicker(p => !p)}>
                <Text style={[m.pickerTxt, !selected && { color: c.textMuted }]}>{selected ? selected.name : 'Select supply...'}</Text>
                <Ionicons name={showPicker ? 'chevron-up' : 'chevron-down'} size={14} color={c.textMuted} />
              </TouchableOpacity>
              {showPicker && (
                <View style={m.pickerDropdown}>
                  <ScrollView style={{ maxHeight: 200 }}>
                    {skus.map(s => (
                      <TouchableOpacity key={s.id} style={m.pickerItem} onPress={() => { setSkuId(s.id); setShowPicker(false); }}>
                        <Text style={m.pickerItemTxt}>{s.name} ({s.unit})</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            <View style={m.field}>
              <Text style={m.label}>{op === 'adjustment' ? 'Quantity Change (+ or -)' : 'Quantity'} *</Text>
              <TextInput style={m.input} value={qty} onChangeText={setQty} placeholder={op === 'adjustment' ? 'e.g. 5 or -2' : '0'} placeholderTextColor={c.textMuted} keyboardType="numeric" />
              {selected && <Text style={m.currentQty}>Current on hand: {selected.on_hand} {selected.unit}</Text>}
            </View>
            {op === 'stock-in' && (
              <View style={m.field}>
                <Text style={m.label}>Reference</Text>
                <TextInput style={m.input} value={reference} onChangeText={setReference} placeholder="PO / invoice ref" placeholderTextColor={c.textMuted} />
              </View>
            )}
            <View style={m.field}>
              <Text style={m.label}>Notes</Text>
              <TextInput style={[m.input, { height: 70, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="Optional" placeholderTextColor={c.textMuted} multiline />
            </View>
            {error ? <Text style={m.err}>{error}</Text> : null}
          </ScrollView>
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}><Text style={m.cancelTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={m.saveTxt}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CreateSupplyModal({
  visible, categories, onSave, onClose,
}: {
  visible: boolean;
  categories: Record<string, string>;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const m = useMemo(() => mkM(c), [c]);
  const catKeys = Object.keys(categories);
  const [name, setName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [category, setCategory] = useState(catKeys[0] ?? 'packing');
  const [unit, setUnit] = useState('pcs');
  const [threshold, setThreshold] = useState('0');
  const [initialQty, setInitialQty] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(''); setSkuCode(''); setCategory(catKeys[0] ?? 'packing');
      setUnit('pcs'); setThreshold('0'); setInitialQty(''); setTrackStock(true); setError('');
    }
  }, [visible, catKeys]);

  async function save() {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      await suppliesApi.create({
        name: name.trim(),
        sku_code: skuCode || undefined,
        category,
        unit: unit.trim(),
        track_stock: trackStock,
        low_stock_threshold: parseInt(threshold, 10) || 0,
        initial_quantity: initialQty ? parseInt(initialQty, 10) : undefined,
      });
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to create supply');
    } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={m.box}>
          <View style={m.hdr}>
            <Text style={m.hdrTitle}>New Supply SKU</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}><Ionicons name="close" size={20} color={c.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={m.body}>
            <View style={m.field}>
              <Text style={m.label}>Name *</Text>
              <TextInput style={m.input} value={name} onChangeText={setName} placeholder="e.g. Paper bag" placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.field}>
              <Text style={m.label}>SKU Code</Text>
              <TextInput style={m.input} value={skuCode} onChangeText={setSkuCode} placeholder="Optional" placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.field}>
              <Text style={m.label}>Category *</Text>
              <View style={m.catRow}>
                {catKeys.map(k => (
                  <TouchableOpacity key={k} style={[m.catChip, category === k && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setCategory(k)}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: category === k ? '#fff' : c.text }}>{categories[k]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={m.field}>
              <Text style={m.label}>Unit *</Text>
              <TextInput style={m.input} value={unit} onChangeText={setUnit} placeholder="pcs" placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.switchRow}>
              <Text style={m.label}>Track Stock</Text>
              <Switch value={trackStock} onValueChange={setTrackStock} trackColor={{ true: BRAND }} />
            </View>
            <View style={m.field}>
              <Text style={m.label}>Low Stock Threshold</Text>
              <TextInput style={m.input} value={threshold} onChangeText={setThreshold} keyboardType="numeric" placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.field}>
              <Text style={m.label}>Opening Quantity</Text>
              <TextInput style={m.input} value={initialQty} onChangeText={setInitialQty} keyboardType="numeric" placeholder="Optional" placeholderTextColor={c.textMuted} />
            </View>
            {error ? <Text style={m.err}>{error}</Text> : null}
          </ScrollView>
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}><Text style={m.cancelTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={m.saveTxt}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function SuppliesPanel() {
  const { colors: c, isDark } = useTheme();
  const s = useMemo(() => mkS(c, isDark), [c, isDark]);
  const wasteBorder = dangerBorder(isDark);
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const [data, setData] = useState<SuppliesData | null>(null);
  const [rules, setRules] = useState<SupplyConsumptionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tab, setTab] = useState<'stock' | 'movements' | 'rules'>('stock');
  const [history, setHistory] = useState<SupplyHistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySkuId, setHistorySkuId] = useState<number | null>(null);
  const [historyType, setHistoryType] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [showOp, setShowOp] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [opSkuId, setOpSkuId] = useState<number | undefined>();
  const [opType, setOpType] = useState<OpType>('stock-in');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [supRes, rulesRes] = await Promise.all([
        suppliesApi.index({
          stock_status: filter === 'all' ? 'all' : filter,
          category: categoryFilter || undefined,
          q: search || undefined,
        }),
        suppliesApi.rules(),
      ]);
      setData(supRes.data);
      setRules(rulesRes.data.rules ?? []);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to load supplies';
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, categoryFilter]);

  const loadHistory = useCallback(async (page = 1, append = false) => {
    setHistoryLoading(true);
    try {
      const res = await suppliesApi.history({
        inventory_sku_id: historySkuId ?? undefined,
        type: historyType ?? undefined,
        page,
      });
      const payload = res.data as SupplyHistoryData;
      setHistory(prev => append && prev
        ? { ...payload, data: [...prev.data, ...payload.data] }
        : payload);
      setHistoryPage(page);
    } catch {
      if (!append) setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [historySkuId, historyType]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab === 'movements') loadHistory(1, false);
  }, [tab, historySkuId, historyType, loadHistory]);

  const skus = data?.skus ?? [];
  const summary = data?.summary;
  const categories = data?.categories ?? {};
  const historyRows = history?.data ?? [];
  const historySkus = history?.skus ?? skus.map(s => ({ id: s.id, name: s.name }));
  const historyTypes = history?.types ?? ['purchase', 'sale', 'waste', 'adjustment', 'reversal'];

  const displayedSkus = skus.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.sku_code ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function openStockIn(sku?: SupplySku) {
    setOpSkuId(sku?.id);
    setOpType('stock-in');
    setShowOp(true);
  }

  function openWaste(sku?: SupplySku) {
    setOpSkuId(sku?.id);
    setOpType('waste');
    setShowOp(true);
  }

  const statItems = [
    { icon: 'layers-outline', val: summary?.total ?? 0, lbl: 'SKUs', color: '#2563eb' },
    { icon: 'checkbox-outline', val: summary?.tracked_count ?? 0, lbl: 'Tracked', color: '#0f8f73' },
    { icon: 'warning-outline', val: summary?.low_stock_count ?? 0, lbl: 'Low', color: '#d97706' },
    { icon: 'close-circle-outline', val: summary?.out_of_stock_count ?? 0, lbl: 'Out', color: '#dc2626' },
  ] as const;

  if (loading && !data) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={BRAND} />
        <Text style={{ marginTop: 10, color: c.textMuted, fontSize: 13 }}>Loading supplies…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={s.statsBar}>
        {statItems.map((st, i) => (
          <React.Fragment key={st.lbl}>
            {i > 0 && <View style={s.statDivider} />}
            <View style={s.statItem}>
              <View style={[s.statIcon, { backgroundColor: st.color + '18' }]}>
                <Ionicons name={st.icon} size={14} color={st.color} />
              </View>
              <Text style={[s.statVal, { color: st.color }]}>{st.val}</Text>
              <Text style={s.statLbl}>{st.lbl}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {error ? (
        <View style={[s.errBanner, { margin: 14, marginBottom: 0 }]}>
          <Ionicons name="alert-circle" size={14} color="#ef4444" />
          <Text style={s.errText}>{error}</Text>
          <TouchableOpacity onPress={() => load()}><Text style={{ color: isDark ? '#FF3636' : '#dc2626', fontWeight: '700' }}>Retry</Text></TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); }} tintColor={BRAND} />}
      >
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <TouchableOpacity style={s.chip} onPress={() => setShowCreate(true)}>
            <Ionicons name="add-circle-outline" size={14} color={BRAND} />
            <Text style={[s.chipTxt, { color: BRAND }]}>New SKU</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.chip, { borderColor: wasteBorder }]} onPress={() => openWaste()}>
            <Ionicons name="trash-outline" size={14} color="#dc2626" />
            <Text style={[s.chipTxt, { color: '#dc2626' }]}>Waste</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.chip, { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => openStockIn()}>
            <Ionicons name="arrow-down-circle-outline" size={14} color="#fff" />
            <Text style={[s.chipTxt, { color: '#fff' }]}>Stock In</Text>
          </TouchableOpacity>
        </View>

        <View style={s.tabBar}>
          {(['stock', 'movements', 'rules'] as const).map(t => (
            <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabActive]} onPress={() => setTab(t)}>
              <Text style={[s.tabTxt, tab === t && { color: BRAND, fontWeight: '700' }]}>
                {t === 'stock' ? `SKUs (${skus.length})` : t === 'movements' ? 'Supply history' : 'Rules'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'stock' && (
          <View style={s.card}>
            <View style={s.tableToolbar}>
              <View style={s.searchWrap}>
                <Ionicons name="search" size={14} color={c.textMuted} />
                <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search supply..." placeholderTextColor={c.textMuted} onSubmitEditing={() => load()} />
              </View>
              <View style={s.filterChips}>
                <TouchableOpacity style={[s.chip, !categoryFilter && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setCategoryFilter('')}>
                  <Text style={[s.chipTxt, !categoryFilter && { color: '#fff' }]}>All</Text>
                </TouchableOpacity>
                {Object.entries(categories).map(([k, label]) => (
                  <TouchableOpacity key={k} style={[s.chip, categoryFilter === k && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setCategoryFilter(k)}>
                    <Text style={[s.chipTxt, categoryFilter === k && { color: '#fff' }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.filterChips}>
                {([
                  ['all', 'All', skus.length, filterChipColor('all', isDark, c)],
                  ['low', 'Low', summary?.low_stock_count ?? 0, filterChipColor('low', isDark, c)],
                  ['out', 'Out', summary?.out_of_stock_count ?? 0, filterChipColor('out', isDark, c)],
                ] as const).map(([f, label, cnt, col]) => (
                  <TouchableOpacity key={f} style={[s.chip, filter === f && { backgroundColor: col, borderColor: col }]} onPress={() => setFilter(f)}>
                    <Text style={[s.chipTxt, filter === f && { color: '#fff' }]}>{label}</Text>
                    {cnt > 0 && <View style={[s.chipBadge, filter === f && { backgroundColor: 'rgba(255,255,255,0.3)' }]}><Text style={[s.chipBadgeTxt, filter === f && { color: '#fff' }]}>{cnt}</Text></View>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[s.tRow, s.tHead]}>
              <Text style={[s.tCell, s.cName]}>Supply</Text>
              {!isMobile && <Text style={[s.tCell, s.cCat]}>Category</Text>}
              <Text style={[s.tCell, s.cOnHand]}>Qty</Text>
              <Text style={[s.tCell, s.cStatus]}>Status</Text>
              <Text style={[s.tCell, s.cAct, { textAlign: 'right' }]}>Actions</Text>
            </View>
            {skus.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="layers-outline" size={36} color={c.textMuted} />
                <Text style={s.emptyTxt}>No supply SKUs</Text>
              </View>
            ) : displayedSkus.map((row, idx) => {
              const st = supplyStatus(row, isDark);
              return (
                <View key={row.id} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                  <View style={s.cName}>
                    <Text style={s.ingName} numberOfLines={1}>{row.name}</Text>
                    <Text style={s.ingSku}>{row.sku_code || row.unit}</Text>
                    {isMobile && <Text style={s.ingSku}>{row.category_label}</Text>}
                  </View>
                  {!isMobile && <Text style={[s.tCell, s.cCat]} numberOfLines={1}>{row.category_label}</Text>}
                  <Text style={[s.tCell, s.cOnHand, { fontWeight: '800', color: row.track_stock && row.on_hand <= 0 ? (isDark ? '#FF3636' : '#dc2626') : c.heading }]}>
                    {row.track_stock ? row.on_hand : '—'}
                  </Text>
                  <View style={s.cStatus}>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusTxt, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={[s.cAct, { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }]}>
                    <TouchableOpacity style={s.actBtn} onPress={() => openStockIn(row)}>
                      <Ionicons name="arrow-down-circle-outline" size={15} color={BRAND} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actBtn, { borderColor: wasteBorder }]} onPress={() => openWaste(row)}>
                      <Ionicons name="trash-outline" size={15} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {tab === 'movements' && (
          <View style={s.card}>
            <View style={s.cardHdr}>
              <Text style={s.cardHdrTxt}>Supply history</Text>
            </View>
            <View style={{ padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={s.cardHdrSub}>Supply</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChips}>
                <TouchableOpacity style={[s.chip, !historySkuId && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setHistorySkuId(null)}>
                  <Text style={[s.chipTxt, !historySkuId && { color: '#fff' }]}>All</Text>
                </TouchableOpacity>
                {historySkus.map(sku => (
                  <TouchableOpacity key={sku.id} style={[s.chip, historySkuId === sku.id && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setHistorySkuId(sku.id)}>
                    <Text style={[s.chipTxt, historySkuId === sku.id && { color: '#fff' }]} numberOfLines={1}>{sku.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={s.cardHdrSub}>Type</Text>
              <View style={s.filterChips}>
                <TouchableOpacity style={[s.chip, !historyType && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setHistoryType(null)}>
                  <Text style={[s.chipTxt, !historyType && { color: '#fff' }]}>All types</Text>
                </TouchableOpacity>
                {historyTypes.map(t => (
                  <TouchableOpacity key={t} style={[s.chip, historyType === t && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setHistoryType(t)}>
                    <Text style={[s.chipTxt, historyType === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {historyLoading && historyRows.length === 0 ? (
              <View style={s.emptyWrap}><ActivityIndicator color={BRAND} /></View>
            ) : historyRows.length === 0 ? (
              <View style={s.emptyWrap}><Text style={s.emptyTxt}>No movements found.</Text></View>
            ) : (
              <>
                {historyRows.map((mv, idx) => (
                  <View key={mv.id} style={[s.ruleRow, idx % 2 === 1 && s.tRowAlt]}>
                    <Text style={s.ingName}>{mv.sku_name}</Text>
                    <Text style={s.histMeta}>{mv.when} · {mv.type} · {mv.user_name}</Text>
                    <Text style={{ fontWeight: '700', color: qtyDeltaColor(mv.quantity_change, isDark, c), marginTop: 4 }}>
                      {mv.quantity_change > 0 ? '+' : ''}{mv.quantity_change} ({mv.quantity_before} → {mv.quantity_after})
                    </Text>
                    {mv.order_number ? <Text style={s.histMeta}>Order: {mv.order_number}</Text> : null}
                    {mv.notes ? <Text style={s.histMeta}>{mv.notes}</Text> : null}
                  </View>
                ))}
                {history && history.meta.current_page < history.meta.last_page ? (
                  <TouchableOpacity style={s.loadMoreBtn} onPress={() => loadHistory(historyPage + 1, true)} disabled={historyLoading}>
                    <Text style={s.loadMoreTxt}>{historyLoading ? 'Loading…' : `Load more (${history.meta.total} total)`}</Text>
                  </TouchableOpacity>
                ) : history ? (
                  <View style={s.loadMoreBtn}><Text style={s.histMeta}>{history.meta.total} movement(s)</Text></View>
                ) : null}
              </>
            )}
          </View>
        )}

        {tab === 'rules' && (
          <View style={s.card}>
            <View style={s.cardHdr}>
              <Text style={s.cardHdrTxt}>Consumption Rules</Text>
              <Text style={s.cardHdrSub}>{rules.length} rules</Text>
            </View>
            {rules.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyTxt}>No consumption rules</Text>
                <Text style={[s.emptyTxt, { fontSize: 12, fontWeight: '400' }]}>Rules auto-deduct supplies per order (web parity)</Text>
              </View>
            ) : rules.map((rule, idx) => (
              <View key={rule.id} style={[s.ruleRow, idx % 2 === 1 && s.tRowAlt]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.ingName}>{rule.sku_name}</Text>
                  <View style={[s.statusBadge, { backgroundColor: activeRuleBg(rule.is_active, isDark) }]}>
                    <Text style={[s.statusTxt, { color: rule.is_active ? (isDark ? '#14B51D' : '#16a34a') : (isDark ? '#888' : '#6b7280') }]}>{rule.is_active ? 'Active' : 'Inactive'}</Text>
                  </View>
                </View>
                <Text style={s.ingSku}>
                  {rule.quantity_per_unit} per unit
                  {rule.menu_item_name ? ` · ${rule.menu_item_name}` : ''}
                  {rule.order_type_label ? ` · ${rule.order_type_label}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <SupplyOpModal visible={showOp} skus={skus} defaultId={opSkuId} defaultOp={opType} onSave={() => { setShowOp(false); load(true); }} onClose={() => setShowOp(false)} />
      <CreateSupplyModal visible={showCreate} categories={categories} onSave={() => { setShowCreate(false); load(true); }} onClose={() => setShowCreate(false)} />
    </View>
  );
}
