import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, RefreshControl, Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { inventoryApi } from '@/api/inventory';
import MenuStockPanel from '@/components/stock/MenuStockPanel';
import SuppliesPanel from '@/components/stock/SuppliesPanel';
import IngredientFormModal from '@/components/stock/IngredientFormModal';
import {
  STOCK_BRAND,
  ingredientStockTone,
  filterChipColor,
  pickerSelectedBg,
  errBannerColors,
  moveBadgeBg,
  qtyDeltaColor,
} from '@/components/stock/stockUi';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { Ingredient, ExpiringBatch, StockMovement, InventoryData } from '@/types';

type StockModule = 'ingredients' | 'menu' | 'supplies';

const BRAND = STOCK_BRAND;

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

function stockStatus(ing: Ingredient, isDark: boolean) {
  return ingredientStockTone(ing, isDark);
}

// ─── Style factories ──────────────────────────────────────────────────────────

function mkS(c: ThemeColors, isDark: boolean) {
  const err = errBannerColors(isDark);
  return StyleSheet.create({
    shell:    { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    topbar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle:   { fontSize: 18, fontWeight: '800', color: c.heading },
    pageSub:     { fontSize: 11, color: c.textMuted, marginTop: 1 },
    topActions:  { flexDirection: 'row', gap: 8 },
    actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 },
    actionBtnTxt:{ fontSize: 13, fontWeight: '700' },

    statsBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    statItem:    { flex: 1, alignItems: 'center', gap: 1 },
    statIcon:    { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
    statVal:     { fontSize: 14, fontWeight: '800' },
    statLbl:     { fontSize: 9, color: c.textMuted, textAlign: 'center' },
    statDivider: { width: 1, height: 28, backgroundColor: c.border },

    errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: err.backgroundColor, borderBottomWidth: 1, borderBottomColor: err.borderColor, paddingHorizontal: 14, paddingVertical: 9 },
    errText:   { flex: 1, fontSize: 12.5, color: isDark ? '#FF3636' : '#dc2626' },
    retryBtn:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: '#dc2626' },
    retryTxt:  { fontSize: 12, fontWeight: '700', color: '#fff' },

    alertRow:  { flexDirection: 'row', gap: 14 },
    alertCard: { backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
    alertCardHdr: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
    alertCardTitle: { fontSize: 13.5, fontWeight: '700', color: c.heading, flex: 1 },
    alertBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: c.surfaceAlt },
    alertBadgeTxt: { fontSize: 12, fontWeight: '700' },
    alertEmpty: { fontSize: 12.5, color: c.textMuted, paddingVertical: 4 },
    alertRow2:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    alertItemName: { fontSize: 13, fontWeight: '600', color: c.text },
    alertItemUnit: { fontSize: 11.5, color: c.textMuted, marginTop: 1 },
    warnBadge: { backgroundColor: isDark ? 'rgba(253,175,34,0.15)' : '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    warnBadgeTxt: { fontSize: 11.5, fontWeight: '700', color: isDark ? '#FDAF22' : '#92400e' },

    tabBar:   { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    tabBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
    tabActive:{ borderBottomWidth: 2, borderBottomColor: BRAND },
    tabTxt:   { fontSize: 13, fontWeight: '600', color: c.textMuted },

    moduleBar:   { flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
    moduleBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt },
    moduleActive:{ backgroundColor: BRAND, borderColor: BRAND },
    moduleTxt:   { fontSize: 12, fontWeight: '700', color: c.text },

    card:     { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden', width: '100%', alignSelf: 'stretch' },
    cardHdr:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    cardHdrTxt: { fontSize: 14, fontWeight: '700', color: c.heading },
    cardHdrSub: { fontSize: 12, color: c.textMuted },

    tableToolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, width: '100%' },
    searchWrap:   { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: c.border },
    searchInput:  { flex: 1, fontSize: 13.5, color: c.heading },
    filterChips:  { flexDirection: 'row', gap: 8, flexShrink: 0 },
    chip:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
    chipTxt:      { fontSize: 12, fontWeight: '600', color: c.text },
    chipBadge:    { backgroundColor: c.border, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
    chipBadgeTxt: { fontSize: 10, fontWeight: '700', color: c.text },

    tableWrap: { width: '100%' },
    tRow:    { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border, width: '100%' },
    tHead:   { backgroundColor: c.surfaceAlt, borderBottomColor: c.border },
    tRowAlt: { backgroundColor: c.surfaceAlt },
    tCell:   { paddingHorizontal: 14, paddingVertical: 13, fontSize: 13, color: c.text },

    // Flex columns so the table stretches across the full card width
    cName:   { flex: 3, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12 },
    cUnit:   { flex: 0.8, minWidth: 64, paddingHorizontal: 10 },
    cOnHand: { flex: 1.1, minWidth: 88, paddingHorizontal: 10, textAlign: 'right' },
    cStatus: { flex: 1.3, minWidth: 110, paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'flex-start' },
    cAct:    { flex: 1, minWidth: 96, paddingHorizontal: 10, alignItems: 'flex-end', justifyContent: 'center' },

    ingName:  { fontSize: 14, fontWeight: '700', color: c.heading },
    ingSku:   { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
    progressBg:   { height: 4, backgroundColor: c.border, borderRadius: 2, marginTop: 7, overflow: 'hidden', maxWidth: 220 },
    progressFill: { height: 4, borderRadius: 2 },
    statusBadge:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, alignSelf: 'flex-start' },
    statusTxt:    { fontSize: 11.5, fontWeight: '700' },
    minTxt:       { fontSize: 11, color: c.textMuted, marginTop: 3 },
    actBtn:       { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

    mWhen: { flex: 1.1, minWidth: 90, paddingHorizontal: 14 },
    mType: { flex: 1.2, minWidth: 100, paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'flex-start' },
    mIng:  { flex: 2.5, minWidth: 0, paddingHorizontal: 12, paddingVertical: 12 },
    mQty:  { flex: 1, minWidth: 88, textAlign: 'right', paddingRight: 16, paddingHorizontal: 10 },
    movBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, alignSelf: 'flex-start' },
    movBadgeTxt: { fontSize: 12, fontWeight: '700' },

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
  const { colors: c, isDark } = useTheme();
  const m = useMemo(() => mkM(c), [c]);
  const pickSel = pickerSelectedBg(isDark);

  const [op, setOp]           = useState<OpType>(defaultOp ?? 'stock-in');
  const [ingId, setIngId]     = useState<number | null>(defaultId ?? null);
  const [qty, setQty]         = useState('');
  const [notes, setNotes]     = useState('');
  const [reference, setReference] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
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
      setReference('');
      setExpiryDate('');
      setUnitCost('');
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
    if (op === 'adjustment') {
      if (!qty || isNaN(q) || q === 0) { setError('Enter a non-zero quantity change'); return; }
    } else if (!qty || isNaN(q) || q <= 0) {
      setError('Enter a valid quantity'); return;
    }
    setSaving(true); setError('');
    try {
      if (op === 'stock-in') {
        await inventoryApi.stockIn({
          ingredient_id: ingId,
          quantity: q,
          notes,
          reference: reference || undefined,
          expiry_date: expiryDate || undefined,
          unit_cost: unitCost ? parseFloat(unitCost) : undefined,
        });
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
                        style={[m.pickerItem, ingId === i.id && { backgroundColor: pickSel }]}
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

            {op === 'stock-in' && (
              <>
                <View style={m.field}>
                  <Text style={m.label}>Reference</Text>
                  <TextInput style={m.input} value={reference} onChangeText={setReference} placeholder="PO / invoice ref" placeholderTextColor={c.textMuted} />
                </View>
                <View style={m.field}>
                  <Text style={m.label}>Expiry Date</Text>
                  <TextInput style={m.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} />
                </View>
                <View style={m.field}>
                  <Text style={m.label}>Unit Cost</Text>
                  <TextInput style={m.input} value={unitCost} onChangeText={setUnitCost} placeholder="Optional" placeholderTextColor={c.textMuted} keyboardType="decimal-pad" />
                </View>
              </>
            )}

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
  const { colors: c, isDark } = useTheme();
  const s = useMemo(() => mkS(c, isDark), [c, isDark]);

  const { width } = useWindowDimensions();
  const insets   = useSafeAreaInsets();
  const isMobile = width < 640;
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
  const [module, setModule]     = useState<StockModule>('ingredients');
  const [showIngForm, setShowIngForm] = useState(false);
  const [editIng, setEditIng]   = useState<Ingredient | null>(null);

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

  const outCount = useMemo(
    () => ingredients.filter(i => i.on_hand <= 0).length,
    [ingredients],
  );

  const displayed = useMemo(() => {
    const q = search.toLowerCase();
    return ingredients.filter(i => {
      const matchFilter =
        filter === 'low' ? (i.low_stock_threshold > 0 && i.on_hand <= i.low_stock_threshold) :
        filter === 'out' ? i.on_hand <= 0 :
        true;
      const matchSearch = !search ||
        i.name.toLowerCase().includes(q) ||
        (i.sku ?? '').toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [ingredients, filter, search]);

  const statItems = [
    { icon: 'cube-outline',           val: ingredients.length, lbl: 'Total',     color: '#2563eb' },
    { icon: 'warning-outline',        val: lowStock.length,      lbl: 'Low Stock', color: '#d97706' },
    { icon: 'close-circle-outline',   val: outCount,             lbl: 'Out',       color: '#dc2626' },
    { icon: 'time-outline',           val: expiring.length,      lbl: 'Expiring',  color: '#ef4444' },
  ] as const;

  const moduleLabels: { key: StockModule; label: string; icon: string }[] = [
    { key: 'ingredients', label: 'Ingredients', icon: 'cube-outline' },
    { key: 'menu', label: 'Menu Stock', icon: 'fast-food-outline' },
    { key: 'supplies', label: 'Supplies', icon: 'layers-outline' },
  ];

  const pageSub =
    module === 'ingredients'
      ? `${ingredients.length} ingredients · Branch: ${data?.branch_name ?? 'Main'}`
      : module === 'menu' ? 'Menu item stock levels' :
    'Packing & consumable supplies';

  return (
    <View style={s.shell}>
      {/* ── Page header ────────────────────────────────────── */}
      <View style={[s.topbar, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Stock Management</Text>
          <Text style={s.pageSub}>{pageSub}</Text>
        </View>
        {module === 'ingredients' && (
          <View style={s.topActions}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }]}
              onPress={() => { setEditIng(null); setShowIngForm(true); }}
            >
              <Ionicons name="add-circle-outline" size={14} color={BRAND} />
              <Text style={[s.actionBtnTxt, { color: BRAND }]}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }]} onPress={() => openWaste()}>
              <Ionicons name="trash-outline" size={14} color="#dc2626" />
              <Text style={[s.actionBtnTxt, { color: '#dc2626' }]}>Waste</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: c.sidebar }]} onPress={() => openStockIn()}>
              <Ionicons name="arrow-down-circle-outline" size={14} color="#fff" />
              <Text style={[s.actionBtnTxt, { color: '#fff' }]}>Stock In</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Module tabs — Ingredients | Menu Stock | Supplies */}
      <View style={s.moduleBar}>
        {moduleLabels.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[s.moduleBtn, module === m.key && s.moduleActive]}
            onPress={() => setModule(m.key)}
          >
            <Ionicons name={m.icon as any} size={14} color={module === m.key ? '#fff' : c.textMuted} />
            <Text style={[s.moduleTxt, module === m.key && { color: '#fff' }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {module === 'menu' ? (
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <MenuStockPanel />
        </View>
      ) : module === 'supplies' ? (
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <SuppliesPanel />
        </View>
      ) : (
        <>
      {/* ── Stats bar (Kitchen / Coupons style) ───────────── */}
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
          contentContainerStyle={{ padding: 14, gap: 14, width: '100%', flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); }} tintColor={BRAND} />}
        >
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
            <>
          {/* Low stock + expiring alert cards (csPos inventory.index parity) */}
          {(lowStock.length > 0 || expiring.length > 0) && (
            <View style={[s.alertRow, isMobile && { flexDirection: 'column' }]}>
              <View style={[s.alertCard, { flex: 1 }]}>
                <View style={s.alertCardHdr}>
                  <Ionicons name="warning-outline" size={16} color={isDark ? '#FDAF22' : '#d97706'} />
                  <Text style={s.alertCardTitle}>Low stock</Text>
                  {lowStock.length > 0 && (
                    <View style={s.alertBadge}><Text style={[s.alertBadgeTxt, { color: isDark ? '#FDAF22' : '#d97706' }]}>{lowStock.length}</Text></View>
                  )}
                </View>
                {lowStock.length === 0 ? (
                  <Text style={s.alertEmpty}>No low-stock alerts.</Text>
                ) : lowStock.map(ing => (
                  <View key={ing.id} style={s.alertRow2}>
                    <View>
                      <Text style={s.alertItemName}>{ing.name}</Text>
                      <Text style={s.alertItemUnit}>{ing.unit}</Text>
                    </View>
                    <View style={s.warnBadge}>
                      <Text style={s.warnBadgeTxt}>{ing.on_hand.toFixed(3)} / {ing.low_stock_threshold}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={[s.alertCard, { flex: 1 }]}>
                <View style={s.alertCardHdr}>
                  <Ionicons name="time-outline" size={16} color={isDark ? '#FF3636' : '#dc2626'} />
                  <Text style={s.alertCardTitle}>Expiring (7 days)</Text>
                </View>
                {expiring.length === 0 ? (
                  <Text style={s.alertEmpty}>No batches expiring soon.</Text>
                ) : expiring.map(b => (
                  <View key={b.id} style={s.alertRow2}>
                    <View>
                      <Text style={s.alertItemName}>{b.ingredient_name}</Text>
                      <Text style={s.alertItemUnit}>{b.expiry_date}</Text>
                    </View>
                    <Text style={[s.alertItemName, { fontSize: 12 }]}>{b.quantity_remaining.toFixed(3)} {b.unit}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

            <View style={s.card}>
              {/* Search + filter */}
              <View style={[s.tableToolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={s.searchWrap}>
                  <Ionicons name="search" size={14} color={c.textMuted} />
                  <TextInput
                    style={s.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search ingredient..."
                    placeholderTextColor={c.textMuted}
                  />
                  {search ? (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Ionicons name="close-circle" size={14} color={c.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={s.filterChips}>
                  {([
                    ['all', 'All',       ingredients.length,                                filterChipColor('all', isDark, c)],
                    ['low', 'Low Stock', lowStock.length,                                    filterChipColor('low', isDark, c)],
                    ['out', 'Out',       ingredients.filter(i => i.on_hand <= 0).length,    filterChipColor('out', isDark, c)],
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

              <View style={s.tableWrap}>
                {/* Table header */}
                <View style={[s.tRow, s.tHead]}>
                  <Text style={[s.tCell, s.cName]}>Ingredient</Text>
                  <Text style={[s.tCell, s.cUnit]}>Unit</Text>
                  <Text style={[s.tCell, s.cOnHand]}>On Hand</Text>
                  <Text style={[s.tCell, s.cStatus]}>Status</Text>
                  <Text style={[s.tCell, s.cAct, { textAlign: 'right' }]}>Actions</Text>
                </View>

                {displayed.length === 0 ? (
                  <View style={s.emptyWrap}>
                    <Ionicons name="cube-outline" size={36} color={c.textMuted} />
                    <Text style={s.emptyTxt}>{search ? 'No ingredients matched' : 'No inventory items'}</Text>
                  </View>
                ) : displayed.map((ing, idx) => {
                  const st = stockStatus(ing, isDark);
                  const pct = ing.low_stock_threshold > 0
                    ? Math.min(100, (ing.on_hand / (ing.low_stock_threshold * 3)) * 100)
                    : Math.min(100, (ing.on_hand / 100) * 100);
                  return (
                    <View key={ing.id} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                      <View style={s.cName}>
                        <Text style={s.ingName} numberOfLines={1}>{ing.name}</Text>
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
                      <View style={[s.cAct, { flexDirection: 'row', gap: 6 }]}>
                        <TouchableOpacity style={s.actBtn} onPress={() => { setEditIng(ing); setShowIngForm(true); }}>
                          <Ionicons name="create-outline" size={15} color={c.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actBtn} onPress={() => openStockIn(ing)}>
                          <Ionicons name="arrow-down-circle-outline" size={15} color={BRAND} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.actBtn, { borderColor: '#fecaca' }]} onPress={() => openWaste(ing)}>
                          <Ionicons name="trash-outline" size={15} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
            </>
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
                      <View style={[s.movBadge, { backgroundColor: moveBadgeBg(cfg.color, isDark) }]}>
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
                      color: qtyDeltaColor(mv.quantity_change, isDark, c),
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
      <IngredientFormModal
        visible={showIngForm}
        ingredient={editIng}
        onSave={() => { setShowIngForm(false); setEditIng(null); load(true); }}
        onClose={() => { setShowIngForm(false); setEditIng(null); }}
      />
      <StockOpModal
        visible={showOp}
        ingredients={ingredients}
        defaultId={opIngId}
        defaultOp={opType}
        onSave={() => { setShowOp(false); load(true); }}
        onClose={() => setShowOp(false)}
      />
        </>
      )}
    </View>
  );
}
