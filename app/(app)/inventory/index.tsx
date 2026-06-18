import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, RefreshControl, Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { inventoryApi } from '@/api/inventory';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { Ingredient, ExpiringBatch, StockMovement, InventoryData } from '@/types';

const BRAND = '#0f8f73';

// ─── Movement type config ─────────────────────────────────────────────────────
const MOVE_CFG: Record<string, { color: string; label: string; sign: string }> = {
  purchase:       { color: '#059669', label: 'Purchase',   sign: '+' },
  stock_in:       { color: '#059669', label: 'Stock In',   sign: '+' },
  sale:           { color: '#6b7280', label: 'Sale',       sign: '−' },
  waste:          { color: '#dc2626', label: 'Waste',      sign: '−' },
  adjustment:     { color: '#d97706', label: 'Adjustment', sign: '±' },
  expiry_writeoff:{ color: '#9ca3af', label: 'Expired',    sign: '−' },
  transfer_in:    { color: '#3b82f6', label: 'Transfer In',sign: '+' },
  transfer_out:   { color: '#f59e0b', label: 'Transfer Out',sign: '−' },
};

function moveCfg(type: string) {
  return MOVE_CFG[type] ?? { color: '#6b7280', label: type, sign: '±' };
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function stockStatus(ing: Ingredient): { label: string; color: string; bg: string } {
  if (ing.on_hand <= 0)
    return { label: 'Out of Stock', color: '#dc2626', bg: '#fef2f2' };
  if (ing.low_stock_threshold > 0 && ing.on_hand <= ing.low_stock_threshold)
    return { label: 'Low Stock', color: '#d97706', bg: '#fef9ec' };
  return { label: 'In Stock', color: '#16a34a', bg: '#f0fdf4' };
}

// ─── Style factories ──────────────────────────────────────────────────────────

function mkS(c: ThemeColors) {
  return StyleSheet.create({
    shell:    { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    topbar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, gap: 10 },
    pageTitle:   { fontSize: 18, fontWeight: '800', color: c.heading },
    pageSub:     { fontSize: 12, color: c.textMuted, marginTop: 2 },
    topActions:  { flexDirection: 'row', gap: 8 },
    actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: 'transparent' },
    actionBtnTxt:{ fontSize: 13, fontWeight: '700' },

    errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderBottomWidth: 1, borderBottomColor: '#fecaca', paddingHorizontal: 14, paddingVertical: 9 },
    errText:   { flex: 1, fontSize: 12.5, color: '#dc2626' },
    retryBtn:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: '#dc2626' },
    retryTxt:  { fontSize: 12, fontWeight: '700', color: '#fff' },

    alertRow:  { gap: 14 },
    alertCard: { backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
    alertCardHdr: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
    alertCardTitle: { fontSize: 13.5, fontWeight: '700', color: c.heading, flex: 1 },
    alertBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: c.surfaceAlt },
    alertBadgeTxt: { fontSize: 12, fontWeight: '700' },
    alertEmpty: { fontSize: 12.5, color: c.textMuted, paddingVertical: 4 },
    alertRow2:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    alertItemName: { fontSize: 13, fontWeight: '600', color: c.text },
    alertItemUnit: { fontSize: 11.5, color: c.textMuted, marginTop: 1 },
    warnBadge: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    warnBadgeTxt: { fontSize: 11.5, fontWeight: '700', color: '#92400e' },

    tabBar:   { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    tabBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
    tabActive:{ borderBottomWidth: 2, borderBottomColor: BRAND },
    tabTxt:   { fontSize: 13, fontWeight: '600', color: c.textMuted },

    card:     { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    cardHdr:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    cardHdrTxt: { fontSize: 14, fontWeight: '700', color: c.heading },
    cardHdrSub: { fontSize: 12, color: c.textMuted },

    tableToolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, flexWrap: 'wrap' },
    searchWrap:   { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: c.border },
    searchInput:  { flex: 1, fontSize: 13, color: c.heading },
    filterChips:  { flexDirection: 'row', gap: 6 },
    chip:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
    chipTxt:      { fontSize: 12, fontWeight: '600', color: c.text },
    chipBadge:    { backgroundColor: c.border, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
    chipBadgeTxt: { fontSize: 10, fontWeight: '700', color: c.text },

    tRow:    { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border },
    tHead:   { backgroundColor: c.surfaceAlt, borderBottomColor: c.border },
    tRowAlt: { backgroundColor: c.surfaceAlt },
    tCell:   { paddingHorizontal: 12, paddingVertical: 11, fontSize: 12.5, color: c.text },

    cName:   { flex: 2, paddingHorizontal: 12, paddingVertical: 10 },
    cUnit:   { width: 70 },
    cOnHand: { width: 90, textAlign: 'right' },
    cStatus: { width: 110, paddingHorizontal: 8, paddingVertical: 8, justifyContent: 'center' },
    cAct:    { width: 80, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },

    ingName:  { fontSize: 13.5, fontWeight: '600', color: c.heading },
    ingSku:   { fontSize: 11, color: c.textMuted, marginTop: 1 },
    progressBg:   { height: 3, backgroundColor: c.border, borderRadius: 2, marginTop: 5, overflow: 'hidden' },
    progressFill: { height: 3, borderRadius: 2 },
    statusBadge:  { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
    statusTxt:    { fontSize: 11, fontWeight: '700' },
    minTxt:       { fontSize: 10.5, color: c.textMuted, marginTop: 2 },
    actBtn:       { width: 30, height: 30, borderRadius: 7, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

    mWhen: { width: 90 },
    mType: { width: 110, paddingHorizontal: 8, paddingVertical: 8, justifyContent: 'center' },
    mIng:  { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
    mQty:  { width: 90, textAlign: 'right', paddingRight: 14 },
    movBadge:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
    movBadgeTxt: { fontSize: 11.5, fontWeight: '700' },

    emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 8 },
    emptyTxt:  { fontSize: 14, color: c.textMuted, fontWeight: '600' },
  });
}

function mkM(c: ThemeColors) {
  return StyleSheet.create({
    overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box:      { backgroundColor: c.surface, borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
    hdr:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    hdrIcon:  { width: 32, height: 32, borderRadius: 8, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
    hdrTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: c.heading },
    closeBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    body:     { padding: 18, gap: 14 },
    field:    { gap: 6 },
    label:    { fontSize: 12.5, fontWeight: '700', color: c.text, textTransform: 'uppercase', letterSpacing: 0.3 },
    input:    { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14.5, color: c.heading },
    currentQty: { fontSize: 11.5, color: c.textMuted, marginTop: 3 },
    opRow:    { flexDirection: 'row', gap: 8 },
    opBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceAlt },
    opTxt:    { fontSize: 12.5, fontWeight: '600', color: c.text },
    picker:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
    pickerTxt:{ flex: 1, fontSize: 14, color: c.heading },
    pickerDropdown: { borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.surface, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, zIndex: 10 },
    pickerSearch: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border },
    pickerSearchInput: { flex: 1, fontSize: 13, color: c.heading },
    pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border },
    pickerItemTxt:  { fontSize: 13.5, color: c.text },
    pickerItemUnit: { fontSize: 12, color: c.textMuted },
    err:      { fontSize: 12.5, color: '#dc2626', fontWeight: '600' },
    footer:   { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border },
    cancelBtn:{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    cancelTxt:{ fontSize: 14.5, fontWeight: '600', color: c.text },
    saveBtn:  { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: BRAND },
    saveTxt:  { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  });
}

// ─── Stock-in / Waste / Adjustment Modal ────────────────────────────────────

type OpType = 'stock-in' | 'waste' | 'adjustment';

function StockOpModal({
  visible, ingredients, defaultId, defaultOp, onSave, onClose,
}: {
  visible: boolean;
  ingredients: Ingredient[];
  defaultId?: number;
  defaultOp?: OpType;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const m = useMemo(() => mkM(c), [c]);

  const [op, setOp]           = useState<OpType>(defaultOp ?? 'stock-in');
  const [ingId, setIngId]     = useState<number | null>(defaultId ?? null);
  const [qty, setQty]         = useState('');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [ingSearch, setIngSearch]   = useState('');

  useEffect(() => {
    if (visible) {
      setOp(defaultOp ?? 'stock-in');
      setIngId(defaultId ?? null);
      setQty('');
      setNotes('');
      setError('');
    }
  }, [visible, defaultId, defaultOp]);

  const selected = ingredients.find(i => i.id === ingId);

  const filteredIngs = ingredients.filter(i =>
    !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())
  );

  async function save() {
    if (!ingId)  { setError('Select an ingredient'); return; }
    const q = parseFloat(qty);
    if (!qty || isNaN(q) || q <= 0) { setError('Enter a valid quantity'); return; }
    setSaving(true); setError('');
    try {
      if (op === 'stock-in') {
        await inventoryApi.stockIn({ ingredient_id: ingId, quantity: q, notes });
      } else if (op === 'waste') {
        await inventoryApi.waste({ ingredient_id: ingId, quantity: q, notes });
      } else {
        await inventoryApi.adjustment({ ingredient_id: ingId, quantity_change: q, notes });
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
          {/* Header */}
          <View style={m.hdr}>
            <View style={m.hdrIcon}>
              <Ionicons name="cube-outline" size={18} color="#fff" />
            </View>
            <Text style={m.hdrTitle}>Stock Operation</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Ionicons name="close" size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={m.body}>
            {/* Op type selector */}
            <View style={m.field}>
              <Text style={m.label}>Operation Type</Text>
              <View style={m.opRow}>
                {OPS.map(o => (
                  <TouchableOpacity
                    key={o.value}
                    style={[m.opBtn, op === o.value && { backgroundColor: o.color, borderColor: o.color }]}
                    onPress={() => setOp(o.value)}
                  >
                    <Ionicons name={o.icon as any} size={15} color={op === o.value ? '#fff' : o.color} />
                    <Text style={[m.opTxt, op === o.value && { color: '#fff', fontWeight: '700' }]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Ingredient picker */}
            <View style={m.field}>
              <Text style={m.label}>Ingredient *</Text>
              <TouchableOpacity style={m.picker} onPress={() => setShowPicker(p => !p)}>
                <Ionicons name="cube-outline" size={14} color={c.textMuted} />
                <Text style={[m.pickerTxt, !selected && { color: c.textMuted }]}>
                  {selected ? `${selected.name} (${selected.unit ?? ''})` : 'Select ingredient...'}
                </Text>
                <Ionicons name={showPicker ? 'chevron-up' : 'chevron-down'} size={14} color={c.textMuted} />
              </TouchableOpacity>
              {showPicker && (
                <View style={m.pickerDropdown}>
                  <View style={m.pickerSearch}>
                    <Ionicons name="search" size={13} color={c.textMuted} />
                    <TextInput
                      style={m.pickerSearchInput}
                      value={ingSearch}
                      onChangeText={setIngSearch}
                      placeholder="Search..."
                      placeholderTextColor={c.textMuted}
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 200 }}>
                    {filteredIngs.map(i => (
                      <TouchableOpacity
                        key={i.id}
                        style={[m.pickerItem, ingId === i.id && { backgroundColor: '#f0fdf4' }]}
                        onPress={() => { setIngId(i.id); setShowPicker(false); setIngSearch(''); }}
                      >
                        <Text style={[m.pickerItemTxt, ingId === i.id && { color: BRAND, fontWeight: '700' }]}>
                          {i.name}
                        </Text>
                        <Text style={m.pickerItemUnit}>{i.unit}</Text>
                      </TouchableOpacity>
                    ))}
                    {filteredIngs.length === 0 && (
                      <Text style={{ padding: 12, color: c.textMuted, fontSize: 13 }}>No ingredients found</Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Quantity */}
            <View style={m.field}>
              <Text style={m.label}>
                {op === 'adjustment' ? 'Quantity Change (+ or -)' : 'Quantity'} *
                {selected?.unit ? ` (${selected.unit})` : ''}
              </Text>
              <TextInput
                style={m.input}
                value={qty}
                onChangeText={setQty}
                placeholder={op === 'adjustment' ? 'e.g. 5 or -2' : '0.000'}
                placeholderTextColor={c.textMuted}
                keyboardType="numeric"
              />
              {selected && (
                <Text style={m.currentQty}>
                  Current on hand: {selected.on_hand.toFixed(3)} {selected.unit ?? ''}
                </Text>
              )}
            </View>

            {/* Notes */}
            <View style={m.field}>
              <Text style={m.label}>Notes</Text>
              <TextInput
                style={[m.input, { height: 70, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional note..."
                placeholderTextColor={c.textMuted}
                multiline
              />
            </View>

            {error ? <Text style={m.err}>{error}</Text> : null}
          </ScrollView>

          {/* Footer */}
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.saveBtn, saving && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={m.saveTxt}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function InventoryScreen() {
  const { colors: c } = useTheme();
  const s = useMemo(() => mkS(c), [c]);

  const { width } = useWindowDimensions();
  const [data, setData]         = useState<InventoryData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'low' | 'out'>('all');
  const [showOp, setShowOp]     = useState(false);
  const [opIngId, setOpIngId]   = useState<number | undefined>();
  const [opType, setOpType]     = useState<OpType>('stock-in');
  const [tab, setTab]           = useState<'stock' | 'movements'>('stock');

  const twoCol = width >= 860;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await inventoryApi.dashboard();
      setData(res.data);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to load inventory';
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openStockIn(ing?: Ingredient) {
    setOpIngId(ing?.id);
    setOpType('stock-in');
    setShowOp(true);
  }

  function openWaste(ing?: Ingredient) {
    setOpIngId(ing?.id);
    setOpType('waste');
    setShowOp(true);
  }

  const ingredients = data?.ingredients ?? [];
  const lowStock    = data?.low_stock ?? [];
  const expiring    = data?.expiring ?? [];
  const movements   = data?.recent_movements ?? [];

  const displayed = ingredients.filter(i => {
    const matchFilter =
      filter === 'low' ? (i.low_stock_threshold > 0 && i.on_hand <= i.low_stock_threshold) :
      filter === 'out' ? i.on_hand <= 0 :
      true;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku ?? '').toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <View style={s.shell}>
      {/* ── Top bar ────────────────────────────────────────── */}
      <View style={s.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Inventory</Text>
          <Text style={s.pageSub}>{ingredients.length} ingredients tracked</Text>
        </View>
        <View style={s.topActions}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => openWaste()}>
            <Ionicons name="trash-outline" size={14} color="#dc2626" />
            <Text style={[s.actionBtnTxt, { color: '#dc2626' }]}>Waste</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: BRAND }]} onPress={() => openStockIn()}>
            <Ionicons name="arrow-down-circle-outline" size={14} color="#fff" />
            <Text style={[s.actionBtnTxt, { color: '#fff' }]}>Stock In</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Error banner ───────────────────────────────────── */}
      {error ? (
        <View style={s.errBanner}>
          <Ionicons name="alert-circle" size={14} color="#ef4444" />
          <Text style={s.errText}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={s.retryBtn}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={BRAND} />
          <Text style={{ marginTop: 10, color: c.textMuted, fontSize: 13 }}>Loading inventory…</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); }} tintColor={BRAND} />}
        >
          {/* ── Alert cards: Low stock | Expiring ────────────── */}
          <View style={[s.alertRow, twoCol && { flexDirection: 'row', gap: 14 }]}>
            {/* Low stock card */}
            <View style={[s.alertCard, twoCol && { flex: 1 }]}>
              <View style={s.alertCardHdr}>
                <Ionicons name="warning-outline" size={15} color="#d97706" />
                <Text style={s.alertCardTitle}>Low Stock</Text>
                <View style={s.alertBadge}>
                  <Text style={[s.alertBadgeTxt, { color: '#d97706' }]}>{lowStock.length}</Text>
                </View>
              </View>
              {lowStock.length === 0 ? (
                <Text style={s.alertEmpty}>No low-stock alerts (or thresholds not set)</Text>
              ) : lowStock.map(i => (
                <View key={i.id} style={s.alertRow2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertItemName}>{i.name}</Text>
                    <Text style={s.alertItemUnit}>{i.unit}</Text>
                  </View>
                  <View style={s.warnBadge}>
                    <Text style={s.warnBadgeTxt}>
                      {i.on_hand.toFixed(2)} / {i.low_stock_threshold.toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Expiring card */}
            <View style={[s.alertCard, twoCol && { flex: 1 }]}>
              <View style={s.alertCardHdr}>
                <Ionicons name="time-outline" size={15} color="#dc2626" />
                <Text style={s.alertCardTitle}>Expiring within 7 days</Text>
                <View style={s.alertBadge}>
                  <Text style={[s.alertBadgeTxt, { color: '#dc2626' }]}>{expiring.length}</Text>
                </View>
              </View>
              {expiring.length === 0 ? (
                <Text style={s.alertEmpty}>No batches expiring soon</Text>
              ) : expiring.map(b => (
                <View key={b.id} style={s.alertRow2}>
                  <Text style={s.alertItemName}>{b.ingredient_name}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.alertItemUnit, { color: daysUntil(b.expiry_date) <= 2 ? '#dc2626' : '#d97706', fontWeight: '700' }]}>
                      {new Date(b.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    <Text style={s.alertItemUnit}>{b.quantity_remaining.toFixed(3)} {b.unit}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* ── Tab: Stock | Movements ────────────────────────── */}
          <View style={s.tabBar}>
            <TouchableOpacity
              style={[s.tabBtn, tab === 'stock' && s.tabActive]}
              onPress={() => setTab('stock')}
            >
              <Ionicons name="cube-outline" size={14} color={tab === 'stock' ? BRAND : c.textMuted} />
              <Text style={[s.tabTxt, tab === 'stock' && { color: BRAND, fontWeight: '700' }]}>
                On-hand ({ingredients.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, tab === 'movements' && s.tabActive]}
              onPress={() => setTab('movements')}
            >
              <Ionicons name="swap-horizontal-outline" size={14} color={tab === 'movements' ? BRAND : c.textMuted} />
              <Text style={[s.tabTxt, tab === 'movements' && { color: BRAND, fontWeight: '700' }]}>
                Recent Movements
              </Text>
            </TouchableOpacity>
          </View>

          {tab === 'stock' ? (
            /* ── On-hand by ingredient ─────────────────────── */
            <View style={s.card}>
              {/* Search + filter */}
              <View style={s.tableToolbar}>
                <View style={s.searchWrap}>
                  <Ionicons name="search" size={13} color={c.textMuted} />
                  <TextInput
                    style={s.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search ingredient..."
                    placeholderTextColor={c.textMuted}
                  />
                  {search ? (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Ionicons name="close-circle" size={13} color={c.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={s.filterChips}>
                  {([
                    ['all', 'All',       ingredients.length,                                '#374151'],
                    ['low', 'Low Stock', lowStock.length,                                    '#d97706'],
                    ['out', 'Out',       ingredients.filter(i => i.on_hand <= 0).length,    '#dc2626'],
                  ] as const).map(([f, label, cnt, col]) => (
                    <TouchableOpacity
                      key={f}
                      style={[s.chip, filter === f && { backgroundColor: col, borderColor: col }]}
                      onPress={() => setFilter(f)}
                    >
                      <Text style={[s.chipTxt, filter === f && { color: '#fff' }]}>{label}</Text>
                      {cnt > 0 && (
                        <View style={[s.chipBadge, filter === f && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                          <Text style={[s.chipBadgeTxt, filter === f && { color: '#fff' }]}>{cnt}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Table header */}
              <View style={[s.tRow, s.tHead]}>
                <Text style={[s.tCell, s.cName]}>Ingredient</Text>
                <Text style={[s.tCell, s.cUnit]}>Unit</Text>
                <Text style={[s.tCell, s.cOnHand]}>On Hand</Text>
                <Text style={[s.tCell, s.cStatus]}>Status</Text>
                <Text style={[s.tCell, s.cAct]}>Actions</Text>
              </View>

              {displayed.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Ionicons name="cube-outline" size={36} color={c.textMuted} />
                  <Text style={s.emptyTxt}>{search ? 'No ingredients matched' : 'No inventory items'}</Text>
                </View>
              ) : displayed.map((ing, idx) => {
                const st = stockStatus(ing);
                const pct = ing.low_stock_threshold > 0
                  ? Math.min(100, (ing.on_hand / (ing.low_stock_threshold * 3)) * 100)
                  : Math.min(100, (ing.on_hand / 100) * 100);
                return (
                  <View key={ing.id} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                    <View style={s.cName}>
                      <Text style={s.ingName}>{ing.name}</Text>
                      {ing.sku ? <Text style={s.ingSku}>{ing.sku}</Text> : null}
                      <View style={s.progressBg}>
                        <View style={[s.progressFill, { width: `${pct}%` as any, backgroundColor: st.color }]} />
                      </View>
                    </View>
                    <Text style={[s.tCell, s.cUnit]}>{ing.unit ?? '—'}</Text>
                    <Text style={[s.tCell, s.cOnHand, { fontWeight: '800', color: ing.on_hand <= 0 ? '#dc2626' : c.heading, fontSize: 15 }]}>
                      {ing.on_hand.toFixed(3)}
                    </Text>
                    <View style={s.cStatus}>
                      <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                        <Text style={[s.statusTxt, { color: st.color }]}>{st.label}</Text>
                      </View>
                      {ing.low_stock_threshold > 0 && (
                        <Text style={s.minTxt}>Min: {ing.low_stock_threshold}</Text>
                      )}
                    </View>
                    <View style={[s.cAct, { flexDirection: 'row', gap: 5 }]}>
                      <TouchableOpacity style={s.actBtn} onPress={() => openStockIn(ing)}>
                        <Ionicons name="arrow-down-circle-outline" size={14} color={BRAND} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actBtn, { borderColor: '#fecaca' }]} onPress={() => openWaste(ing)}>
                        <Ionicons name="trash-outline" size={14} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            /* ── Recent movements ──────────────────────────── */
            <View style={s.card}>
              <View style={s.cardHdr}>
                <Text style={s.cardHdrTxt}>Recent Movements</Text>
                <Text style={s.cardHdrSub}>Last 25 transactions</Text>
              </View>

              {/* Table header */}
              <View style={[s.tRow, s.tHead]}>
                <Text style={[s.tCell, s.mWhen]}>When</Text>
                <Text style={[s.tCell, s.mType]}>Type</Text>
                <Text style={[s.tCell, s.mIng]}>Ingredient</Text>
                <Text style={[s.tCell, s.mQty]}>Qty Δ</Text>
              </View>

              {movements.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Text style={s.emptyTxt}>No recent movements</Text>
                </View>
              ) : movements.map((mv, idx) => {
                const cfg = moveCfg(mv.type);
                return (
                  <View key={mv.id} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                    <Text style={[s.tCell, s.mWhen, { color: c.textMuted, fontSize: 12 }]}>
                      {timeAgo(mv.created_at)}
                    </Text>
                    <View style={s.mType}>
                      <View style={[s.movBadge, { backgroundColor: cfg.color + '18' }]}>
                        <Text style={[s.movBadgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <View style={s.mIng}>
                      <Text style={s.ingName} numberOfLines={1}>{mv.ingredient_name}</Text>
                      {mv.ingredient_unit ? <Text style={s.ingSku}>{mv.ingredient_unit}</Text> : null}
                    </View>
                    <Text style={[s.tCell, s.mQty, {
                      fontFamily: 'monospace',
                      fontWeight: '700',
                      color: mv.quantity_change > 0 ? '#059669' : mv.quantity_change < 0 ? '#dc2626' : c.textMuted,
                    }]}>
                      {mv.quantity_change > 0 ? '+' : ''}{mv.quantity_change.toFixed(3)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Stock operation modal ─────────────────────────── */}
      <StockOpModal
        visible={showOp}
        ingredients={ingredients}
        defaultId={opIngId}
        defaultOp={opType}
        onSave={() => { setShowOp(false); load(true); }}
        onClose={() => setShowOp(false)}
      />
    </View>
  );
}
