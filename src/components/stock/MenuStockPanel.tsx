import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, RefreshControl, useWindowDimensions, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { stockApi } from '@/api/stock';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { MenuStockData, MenuStockItem, MenuStockMovement, StockHistoryData, StockHistoryRow, StockItemDetail, StockItemMovement } from '@/types';

import {
  STOCK_BRAND,
  trackedStockTone,
  filterChipColor,
  stockTabActiveBg,
  errBannerColors,
  dangerBorder,
  moveBadgeBg,
  qtyDeltaColor,
} from '@/components/stock/stockUi';

const BRAND = STOCK_BRAND;

const MOVE_CFG: Record<string, { color: string; label: string }> = {
  purchase:   { color: '#059669', label: 'Purchase' },
  sale:       { color: '#6b7280', label: 'Sale' },
  waste:      { color: '#dc2626', label: 'Waste' },
  adjustment: { color: '#d97706', label: 'Adjustment' },
  reversal:   { color: '#3b82f6', label: 'Reversal' },
};

function moveCfg(type: string) {
  return MOVE_CFG[type] ?? { color: '#6b7280', label: type };
}

function itemStatus(row: MenuStockItem, isDark: boolean) {
  return trackedStockTone(row.tracked, row.on_hand ?? 0, row.threshold, isDark);
}

type OpType = 'stock-in' | 'waste' | 'adjustment';

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
    tableToolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    searchWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: c.border },
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
    cName:       { flex: 2.5, minWidth: 0, paddingHorizontal: 12 },
    cCat:        { flex: 1.2, minWidth: 70, paddingHorizontal: 8 },
    cOnHand:     { flex: 0.8, minWidth: 56, paddingHorizontal: 8 },
    cStatus:     { flex: 1.2, minWidth: 80, paddingHorizontal: 8 },
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
    cardHdr:     { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    cardHdrTxt:  { fontSize: 14, fontWeight: '800', color: c.heading },
    cardHdrSub:  { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
    mWhen: { flex: 1.1, minWidth: 90, paddingHorizontal: 14 },
    mType: { flex: 1.2, minWidth: 100, paddingHorizontal: 10, paddingVertical: 10 },
    mIng:  { flex: 2.5, minWidth: 0, paddingHorizontal: 12, paddingVertical: 12 },
    mQty:  { flex: 1, minWidth: 88, textAlign: 'right', paddingRight: 16 },
    movBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, alignSelf: 'flex-start' },
    movBadgeTxt: { fontSize: 12, fontWeight: '700' },
    histCard:    { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, gap: 6 },
    histMeta:    { fontSize: 11.5, color: c.textMuted },
    histRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
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
    err:      { fontSize: 12.5, color: '#dc2626', fontWeight: '600' },
    footer:   { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border },
    cancelBtn:{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    cancelTxt:{ fontSize: 14.5, fontWeight: '600', color: c.text },
    saveBtn:  { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: BRAND },
    saveTxt:  { fontSize: 14.5, fontWeight: '800', color: '#fff' },
    currentQty: { fontSize: 11.5, color: c.textMuted, marginTop: 3 },
  });
}

function MenuStockOpModal({
  visible, items, defaultId, defaultOp, onSave, onClose,
}: {
  visible: boolean;
  items: MenuStockItem[];
  defaultId?: number;
  defaultOp?: OpType;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const m = useMemo(() => mkM(c), [c]);

  const [op, setOp] = useState<OpType>(defaultOp ?? 'stock-in');
  const [stockMode, setStockMode] = useState<'add' | 'set'>('add');
  const [itemId, setItemId] = useState<number | null>(defaultId ?? null);
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) {
      setOp(defaultOp ?? 'stock-in');
      setStockMode('add');
      setItemId(defaultId ?? null);
      setQty('');
      setNotes('');
      setReference('');
      setError('');
    }
  }, [visible, defaultId, defaultOp]);

  const selected = items.find(i => i.id === itemId);
  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  async function save() {
    if (!itemId) { setError('Select a menu item'); return; }
    const q = parseInt(qty, 10);
    if (op === 'adjustment') {
      if (!qty || isNaN(q) || q === 0) { setError('Enter a non-zero quantity change'); return; }
    } else if (!qty || isNaN(q) || q <= 0) {
      setError('Enter a valid quantity'); return;
    }
    setSaving(true); setError('');
    try {
      if (op === 'stock-in') {
        await stockApi.update(itemId, {
          mode: stockMode,
          quantity: q,
          notes,
          reference: reference || undefined,
        });
      } else if (op === 'waste') {
        await stockApi.waste(itemId, { quantity: q, notes });
      } else {
        await stockApi.adjust(itemId, { quantity_change: q, notes });
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
            <Text style={m.hdrTitle}>Menu Stock Operation</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Ionicons name="close" size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={m.body}>
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
            <View style={m.field}>
              <Text style={m.label}>Menu Item *</Text>
              <TouchableOpacity style={m.picker} onPress={() => setShowPicker(p => !p)}>
                <Text style={[m.pickerTxt, !selected && { color: c.textMuted }]}>
                  {selected ? selected.name : 'Select item...'}
                </Text>
                <Ionicons name={showPicker ? 'chevron-up' : 'chevron-down'} size={14} color={c.textMuted} />
              </TouchableOpacity>
              {showPicker && (
                <View style={m.pickerDropdown}>
                  <TextInput style={m.input} value={search} onChangeText={setSearch} placeholder="Search..." placeholderTextColor={c.textMuted} />
                  <ScrollView style={{ maxHeight: 200 }}>
                    {filtered.map(i => (
                      <TouchableOpacity key={i.id} style={m.pickerItem} onPress={() => { setItemId(i.id); setShowPicker(false); setSearch(''); }}>
                        <Text style={m.pickerItemTxt}>{i.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            {op === 'stock-in' && (
              <View style={m.field}>
                <Text style={m.label}>Stock mode</Text>
                <View style={m.opRow}>
                  {(['add', 'set'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[m.opBtn, stockMode === mode && { backgroundColor: BRAND, borderColor: BRAND }]}
                      onPress={() => setStockMode(mode)}
                    >
                      <Text style={[m.opTxt, stockMode === mode && { color: '#fff', fontWeight: '700' }]}>
                        {mode === 'add' ? 'Add stock' : 'Set exact qty'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={m.field}>
              <TextInput
                style={m.input}
                value={qty}
                onChangeText={setQty}
                placeholder={op === 'adjustment' ? 'e.g. 5 or -2' : '0'}
                placeholderTextColor={c.textMuted}
                keyboardType="numeric"
              />
              {selected?.tracked && (
                <Text style={m.currentQty}>Current on hand: {selected.on_hand ?? 0}</Text>
              )}
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

function HistoryMovementRow({ mv, isDark, c, s }: { mv: StockHistoryRow | MenuStockMovement; isDark: boolean; c: ThemeColors; s: ReturnType<typeof mkS> }) {
  const cfg = moveCfg(mv.type);
  return (
    <View style={s.histCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.ingName}>{mv.item_name}</Text>
          <Text style={s.histMeta}>{mv.when}</Text>
        </View>
        <View style={[s.movBadge, { backgroundColor: moveBadgeBg(cfg.color, isDark) }]}>
          <Text style={[s.movBadgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <View style={s.histRow}>
        <Text style={{ fontWeight: '800', color: qtyDeltaColor(mv.quantity_change, isDark, c) }}>
          {mv.quantity_change > 0 ? '+' : ''}{mv.quantity_change}
        </Text>
        <Text style={s.histMeta}>{mv.quantity_before} → {mv.quantity_after}</Text>
        {mv.order_number ? <Text style={s.histMeta}>Order: {mv.order_number}</Text> : null}
      </View>
      {mv.notes ? <Text style={s.histMeta}>Notes: {mv.notes}</Text> : null}
      <Text style={s.histMeta}>By {mv.user_name}</Text>
    </View>
  );
}

// ─── Stock Item Manage Modal (parity with web stock/edit.blade.php) ───────────

type ManageTab = 'stockin' | 'adjust' | 'waste' | 'history';

function mkManage(c: ThemeColors, isDark: boolean) {
  const tabActive = stockTabActiveBg(isDark);
  return StyleSheet.create({
    overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet:       { backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 28, shadowOffset: { width: 0, height: -6 }, elevation: 20 },
    handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
    hdr:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    hdrLeft:     { flex: 1 },
    hdrTitle:    { fontSize: 17, fontWeight: '800', color: c.heading },
    hdrSub:      { fontSize: 12, color: c.textMuted, marginTop: 2 },
    closeBtn:    { width: 30, height: 30, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    summaryRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: c.surfaceAlt, borderBottomWidth: 1, borderBottomColor: c.border, flexWrap: 'wrap' },
    onHandPill:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    onHandVal:   { fontSize: 16, fontWeight: '900' },
    onHandLbl:   { fontSize: 11, fontWeight: '600', color: c.textMuted },
    trackRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
    trackLbl:    { fontSize: 12.5, fontWeight: '600', color: c.text },
    threshRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
    threshLbl:   { fontSize: 12.5, fontWeight: '600', color: c.text, flex: 1 },
    threshInput: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, fontSize: 14, color: c.heading, width: 90, textAlign: 'center' },
    saveThreshBtn:{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: BRAND },
    saveThreshTxt:{ fontSize: 12.5, fontWeight: '700', color: '#fff' },
    tabBar:      { flexDirection: 'row', gap: 0, borderBottomWidth: 1, borderBottomColor: c.border },
    tabBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive:{ borderBottomColor: BRAND },
    tabTxt:      { fontSize: 12.5, fontWeight: '600', color: c.textMuted },
    body:        { padding: 16, gap: 14 },
    field:       { gap: 5 },
    label:       { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    input:       { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14.5, color: c.heading },
    modeRow:     { flexDirection: 'row', gap: 8 },
    modeBtn:     { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceAlt },
    modeTxt:     { fontSize: 12.5, fontWeight: '600', color: c.text },
    hint:        { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
    err:         { fontSize: 12.5, color: '#dc2626', fontWeight: '600' },
    footer:      { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border },
    cancelBtn:   { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    cancelTxt:   { fontSize: 14, fontWeight: '600', color: c.text },
    saveBtn:     { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: BRAND },
    dangerBtn:   { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: '#dc2626' },
    saveTxt:     { fontSize: 14, fontWeight: '800', color: '#fff' },
    movRow:      { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border, gap: 4 },
    movTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    movType:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
    movTypeTxt:  { fontSize: 11, fontWeight: '700' },
    movMeta:     { fontSize: 11.5, color: c.textMuted },
    movQty:      { fontSize: 15, fontWeight: '900' },
    movRange:    { fontSize: 12, color: c.textMuted },
    emptyTxt:    { textAlign: 'center', padding: 24, color: c.textMuted, fontSize: 13 },
    loadWrap:    { paddingVertical: 20, alignItems: 'center' },
  });
}

function MOVE_CFG_LOCAL(type: string, isDark: boolean) {
  const map: Record<string, { color: string; label: string }> = {
    purchase:   { color: '#059669', label: 'Purchase' },
    sale:       { color: isDark ? '#888' : '#6b7280', label: 'Sale' },
    waste:      { color: '#dc2626', label: 'Waste' },
    adjustment: { color: '#d97706', label: 'Adjustment' },
    reversal:   { color: '#3b82f6', label: 'Reversal' },
  };
  return map[type] ?? { color: isDark ? '#888' : '#6b7280', label: type };
}

function fmt(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StockItemManageModal({
  visible, itemId, onSave, onClose,
}: {
  visible: boolean;
  itemId: number | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors: c, isDark } = useTheme();
  const mg = useMemo(() => mkManage(c, isDark), [c, isDark]);

  const [detail, setDetail]     = useState<StockItemDetail | null>(null);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState<ManageTab>('stockin');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Track / threshold
  const [trackStock, setTrackStock]       = useState(false);
  const [threshold, setThreshold]         = useState('0');
  const [savingTrack, setSavingTrack]     = useState(false);

  // Stock-in
  const [siMode, setSiMode]     = useState<'add' | 'set'>('add');
  const [siQty, setSiQty]       = useState('');
  const [siRef, setSiRef]       = useState('');
  const [siNotes, setSiNotes]   = useState('');

  // Adjust
  const [adjQty, setAdjQty]     = useState('');
  const [adjNotes, setAdjNotes] = useState('');

  // Waste
  const [wQty, setWQty]         = useState('');
  const [wNotes, setWNotes]     = useState('');

  const resetForms = () => {
    setSiMode('add'); setSiQty(''); setSiRef(''); setSiNotes('');
    setAdjQty(''); setAdjNotes('');
    setWQty(''); setWNotes('');
    setError('');
  };

  useEffect(() => {
    if (!visible || !itemId) return;
    setTab('stockin');
    resetForms();
    setDetail(null);
    setLoading(true);
    stockApi.show(itemId)
      .then(res => {
        const d = res.data as StockItemDetail;
        setDetail(d);
        setTrackStock(d.stock.track_stock);
        setThreshold(String(d.stock.low_stock_threshold));
      })
      .catch(() => setError('Failed to load item details'))
      .finally(() => setLoading(false));
  }, [visible, itemId]);

  async function saveTrackingSettings() {
    if (!itemId) return;
    setSavingTrack(true);
    setError('');
    try {
      await stockApi.update(itemId, {
        mode: 'add',
        quantity: 0,
        track_stock: trackStock,
        low_stock_threshold: parseInt(threshold, 10) || 0,
      });
      const res = await stockApi.show(itemId);
      setDetail(res.data as StockItemDetail);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save settings');
    } finally { setSavingTrack(false); }
  }

  async function doStockIn() {
    if (!itemId) return;
    const q = parseInt(siQty, 10);
    if (!siQty || isNaN(q) || q < 0) { setError('Enter a valid quantity (0 or more)'); return; }
    setSaving(true); setError('');
    try {
      await stockApi.update(itemId, {
        mode: siMode,
        quantity: q,
        track_stock: trackStock,
        low_stock_threshold: parseInt(threshold, 10) || 0,
        notes: siNotes || undefined,
        reference: siRef || undefined,
      });
      const res = await stockApi.show(itemId);
      setDetail(res.data as StockItemDetail);
      resetForms();
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Stock update failed');
    } finally { setSaving(false); }
  }

  async function doAdjust() {
    if (!itemId) return;
    const q = parseInt(adjQty, 10);
    if (!adjQty || isNaN(q) || q === 0) { setError('Enter a non-zero quantity change (e.g. 5 or -2)'); return; }
    setSaving(true); setError('');
    try {
      await stockApi.adjust(itemId, { quantity_change: q, notes: adjNotes || undefined });
      const res = await stockApi.show(itemId);
      setDetail(res.data as StockItemDetail);
      resetForms();
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Adjustment failed');
    } finally { setSaving(false); }
  }

  async function doWaste() {
    if (!itemId) return;
    const q = parseInt(wQty, 10);
    if (!wQty || isNaN(q) || q < 1) { setError('Enter a valid quantity (min: 1)'); return; }
    setSaving(true); setError('');
    try {
      await stockApi.waste(itemId, { quantity: q, notes: wNotes || undefined });
      const res = await stockApi.show(itemId);
      setDetail(res.data as StockItemDetail);
      resetForms();
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Waste record failed');
    } finally { setSaving(false); }
  }

  const onHand = detail?.stock.quantity_on_hand ?? 0;
  const tracked = detail?.stock.track_stock ?? false;
  const st = trackedStockTone(tracked, onHand, detail?.stock.low_stock_threshold ?? 0, isDark);

  const TABS: { key: ManageTab; label: string; icon: string }[] = [
    { key: 'stockin',  label: 'Stock In',   icon: 'arrow-down-circle-outline' },
    { key: 'adjust',   label: 'Adjust',     icon: 'swap-horizontal-outline' },
    { key: 'waste',    label: 'Waste',      icon: 'trash-outline' },
    { key: 'history',  label: 'History',    icon: 'time-outline' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={mg.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={mg.sheet}>
          <View style={mg.handle} />

          {/* Header */}
          <View style={mg.hdr}>
            <View style={mg.hdrLeft}>
              <Text style={mg.hdrTitle} numberOfLines={1}>
                {detail?.item.name ?? 'Manage Stock'}
              </Text>
              <Text style={mg.hdrSub}>{detail?.item.category_name ?? ''}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={mg.closeBtn}>
              <Ionicons name="close" size={18} color={c.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator color={BRAND} size="large" />
            </View>
          ) : (
            <>
              {/* On-hand summary */}
              <View style={mg.summaryRow}>
                <View style={[mg.onHandPill, { borderColor: st.color + '60', backgroundColor: st.bg }]}>
                  <Text style={[mg.onHandVal, { color: st.color }]}>{onHand}</Text>
                  <Text style={mg.onHandLbl}>on hand</Text>
                </View>
                <View style={[mg.onHandPill, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
                  <Text style={[{ fontSize: 12.5, fontWeight: '600', color: st.color }]}>{st.label}</Text>
                </View>
                <View style={mg.trackRow}>
                  <Text style={mg.trackLbl}>Track</Text>
                  <Switch
                    value={trackStock}
                    onValueChange={v => setTrackStock(v)}
                    trackColor={{ false: c.border, true: BRAND }}
                    thumbColor="#fff"
                  />
                </View>
              </View>

              {/* Threshold */}
              <View style={mg.threshRow}>
                <Text style={mg.threshLbl}>Low stock threshold</Text>
                <TextInput
                  style={mg.threshInput}
                  value={threshold}
                  onChangeText={setThreshold}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={c.textMuted}
                />
                <TouchableOpacity
                  style={[mg.saveThreshBtn, savingTrack && { opacity: 0.6 }]}
                  onPress={saveTrackingSettings}
                  disabled={savingTrack}
                >
                  {savingTrack
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={mg.saveThreshTxt}>Save</Text>}
                </TouchableOpacity>
              </View>

              {/* Tab bar */}
              <View style={mg.tabBar}>
                {TABS.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[mg.tabBtn, tab === t.key && mg.tabBtnActive]}
                    onPress={() => { setTab(t.key); setError(''); }}
                  >
                    <Ionicons name={t.icon as any} size={13} color={tab === t.key ? BRAND : c.textMuted} />
                    <Text style={[mg.tabTxt, tab === t.key && { color: BRAND, fontWeight: '700' }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                {/* Stock In tab */}
                {tab === 'stockin' && (
                  <View style={mg.body}>
                    <View style={mg.field}>
                      <Text style={mg.label}>Mode</Text>
                      <View style={mg.modeRow}>
                        {([['add', 'Add quantity'], ['set', 'Set exact quantity']] as const).map(([m, lbl]) => (
                          <TouchableOpacity
                            key={m}
                            style={[mg.modeBtn, siMode === m && { backgroundColor: BRAND, borderColor: BRAND }]}
                            onPress={() => setSiMode(m)}
                          >
                            <Text style={[mg.modeTxt, siMode === m && { color: '#fff', fontWeight: '700' }]}>{lbl}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={mg.field}>
                      <Text style={mg.label}>Quantity *</Text>
                      <TextInput
                        style={mg.input}
                        value={siQty}
                        onChangeText={setSiQty}
                        placeholder="0"
                        placeholderTextColor={c.textMuted}
                        keyboardType="number-pad"
                      />
                      <Text style={mg.hint}>Current on hand: {onHand}</Text>
                    </View>
                    <View style={mg.field}>
                      <Text style={mg.label}>Reference (optional)</Text>
                      <TextInput
                        style={mg.input}
                        value={siRef}
                        onChangeText={setSiRef}
                        placeholder="GRN / invoice no."
                        placeholderTextColor={c.textMuted}
                        maxLength={128}
                      />
                    </View>
                    <View style={mg.field}>
                      <Text style={mg.label}>Notes</Text>
                      <TextInput
                        style={[mg.input, { height: 72, textAlignVertical: 'top' }]}
                        value={siNotes}
                        onChangeText={setSiNotes}
                        placeholder="Optional note..."
                        placeholderTextColor={c.textMuted}
                        multiline
                        maxLength={2000}
                      />
                    </View>
                    {error ? <Text style={mg.err}>{error}</Text> : null}
                    <View style={mg.footer}>
                      <TouchableOpacity style={mg.cancelBtn} onPress={onClose}>
                        <Text style={mg.cancelTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[mg.saveBtn, saving && { opacity: 0.6 }]}
                        onPress={doStockIn}
                        disabled={saving}
                      >
                        {saving
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={mg.saveTxt}>Save stock</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Adjust tab */}
                {tab === 'adjust' && (
                  <View style={mg.body}>
                    <View style={mg.field}>
                      <Text style={mg.label}>Quantity change (+ or −) *</Text>
                      <TextInput
                        style={mg.input}
                        value={adjQty}
                        onChangeText={setAdjQty}
                        placeholder="e.g. 5 or -2"
                        placeholderTextColor={c.textMuted}
                        keyboardType="numbers-and-punctuation"
                      />
                      <Text style={mg.hint}>Current on hand: {onHand}</Text>
                    </View>
                    <View style={mg.field}>
                      <Text style={mg.label}>Notes</Text>
                      <TextInput
                        style={[mg.input, { height: 72, textAlignVertical: 'top' }]}
                        value={adjNotes}
                        onChangeText={setAdjNotes}
                        placeholder="Optional note..."
                        placeholderTextColor={c.textMuted}
                        multiline
                        maxLength={2000}
                      />
                    </View>
                    {error ? <Text style={mg.err}>{error}</Text> : null}
                    <View style={mg.footer}>
                      <TouchableOpacity style={mg.cancelBtn} onPress={onClose}>
                        <Text style={mg.cancelTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[mg.saveBtn, saving && { opacity: 0.6 }]}
                        onPress={doAdjust}
                        disabled={saving}
                      >
                        {saving
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={mg.saveTxt}>Adjust</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Waste tab */}
                {tab === 'waste' && (
                  <View style={mg.body}>
                    <View style={mg.field}>
                      <Text style={mg.label}>Quantity wasted *</Text>
                      <TextInput
                        style={mg.input}
                        value={wQty}
                        onChangeText={setWQty}
                        placeholder="Min: 1"
                        placeholderTextColor={c.textMuted}
                        keyboardType="number-pad"
                      />
                      <Text style={mg.hint}>Current on hand: {onHand}</Text>
                    </View>
                    <View style={mg.field}>
                      <Text style={mg.label}>Notes</Text>
                      <TextInput
                        style={[mg.input, { height: 72, textAlignVertical: 'top' }]}
                        value={wNotes}
                        onChangeText={setWNotes}
                        placeholder="Optional note..."
                        placeholderTextColor={c.textMuted}
                        multiline
                        maxLength={2000}
                      />
                    </View>
                    {error ? <Text style={mg.err}>{error}</Text> : null}
                    <View style={mg.footer}>
                      <TouchableOpacity style={mg.cancelBtn} onPress={onClose}>
                        <Text style={mg.cancelTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[mg.dangerBtn, saving && { opacity: 0.6 }]}
                        onPress={doWaste}
                        disabled={saving}
                      >
                        {saving
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={mg.saveTxt}>Record waste</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* History tab */}
                {tab === 'history' && (
                  detail?.movements.length === 0 ? (
                    <Text style={mg.emptyTxt}>No movements for this item yet.</Text>
                  ) : (
                    <>
                      {(detail?.movements ?? []).map((mv: StockItemMovement) => {
                        const cfg = MOVE_CFG_LOCAL(mv.type, isDark);
                        const delta = mv.quantity_change;
                        const deltaColor = delta > 0 ? (isDark ? '#14B51D' : '#059669') : delta < 0 ? (isDark ? '#FF3636' : '#dc2626') : c.textMuted;
                        return (
                          <View key={mv.id} style={mg.movRow}>
                            <View style={mg.movTop}>
                              <View style={{ flex: 1 }}>
                                <Text style={mg.movMeta}>{fmt(mv.created_at)}</Text>
                              </View>
                              <View style={[mg.movType, { backgroundColor: moveBadgeBg(cfg.color, isDark) }]}>
                                <Text style={[mg.movTypeTxt, { color: cfg.color }]}>{cfg.label}</Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 }}>
                              <Text style={[mg.movQty, { color: deltaColor }]}>
                                {delta > 0 ? '+' : ''}{delta}
                              </Text>
                              <Text style={mg.movRange}>{mv.quantity_before} → {mv.quantity_after}</Text>
                            </View>
                            {mv.notes ? <Text style={mg.movMeta}>Notes: {mv.notes}</Text> : null}
                            <Text style={mg.movMeta}>By {mv.user_name}</Text>
                          </View>
                        );
                      })}
                    </>
                  )
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function MenuStockPanel({
  onOpenStockIn, onOpenWaste,
}: {
  onOpenStockIn?: () => void;
  onOpenWaste?: () => void;
}) {
  const { colors: c, isDark } = useTheme();
  const s = useMemo(() => mkS(c, isDark), [c, isDark]);
  const wasteBorder = dangerBorder(isDark);
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const [data, setData] = useState<MenuStockData | null>(null);
  const [totalSummary, setTotalSummary] = useState<MenuStockData['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tracking, setTracking] = useState<'all' | 'on' | 'off'>('all');
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [history, setHistory] = useState<StockHistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);
  const [historyType, setHistoryType] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [showOp, setShowOp] = useState(false);
  const [opItemId, setOpItemId] = useState<number | undefined>();
  const [opType, setOpType] = useState<OpType>('stock-in');
  const [showManage, setShowManage]   = useState(false);
  const [manageItemId, setManageItemId] = useState<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await stockApi.index({
        stock_status: filter === 'all' ? 'all' : filter,
        category_id: categoryId ?? undefined,
        tracking: tracking === 'all' ? undefined : tracking,
      });
      setData(res.data);
      if (filter === 'all' && categoryId === null && tracking === 'all') {
        setTotalSummary(res.data.summary);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to load menu stock';
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, categoryId, tracking]);

  const loadHistory = useCallback(async (page = 1, append = false) => {
    setHistoryLoading(true);
    if (!append) setError('');
    try {
      const res = await stockApi.history({
        item_id: historyItemId ?? undefined,
        type: historyType ?? undefined,
        page,
      });
      const payload = res.data as StockHistoryData;
      setHistory(prev => append && prev
        ? { ...payload, data: [...prev.data, ...payload.data] }
        : payload);
      setHistoryPage(page);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to load menu history';
      if (!append) setError(msg);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyItemId, historyType]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab === 'movements') loadHistory(1, false);
  }, [tab, historyItemId, historyType, loadHistory]);

  function openStockIn(item?: MenuStockItem) {
    setOpItemId(item?.id);
    setOpType('stock-in');
    setShowOp(true);
    onOpenStockIn?.();
  }

  function openWaste(item?: MenuStockItem) {
    setOpItemId(item?.id);
    setOpType('waste');
    setShowOp(true);
    onOpenWaste?.();
  }

  const items = data?.items ?? [];
  const categories = data?.categories ?? [];
  const summary = data?.summary;
  const lowStockRows = data?.low_stock ?? [];
  const historyRows = history?.data ?? [];
  const historyItems = history?.items ?? items.map(i => ({ id: i.id, name: i.name }));
  const historyTypes = history?.types ?? ['purchase', 'sale', 'waste', 'adjustment', 'reversal'];

  const displayed = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const ts = totalSummary ?? summary;
  const statItems = [
    { icon: 'fast-food-outline', val: ts?.menu_item_count ?? 0, lbl: 'Items', color: '#2563eb' },
    { icon: 'checkbox-outline', val: ts?.tracked_count ?? 0, lbl: 'Tracked', color: '#0f8f73' },
    { icon: 'warning-outline', val: ts?.low_stock_count ?? 0, lbl: 'Low', color: '#d97706' },
    { icon: 'close-circle-outline', val: ts?.out_of_stock_count ?? 0, lbl: 'Out', color: '#dc2626' },
  ] as const;

  if (loading && !data) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={BRAND} />
        <Text style={{ marginTop: 10, color: c.textMuted, fontSize: 13 }}>Loading menu stock…</Text>
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
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
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
          <TouchableOpacity style={[s.tabBtn, tab === 'stock' && s.tabActive]} onPress={() => setTab('stock')}>
            <Ionicons name="fast-food-outline" size={14} color={tab === 'stock' ? BRAND : c.textMuted} />
            <Text style={[s.tabTxt, tab === 'stock' && { color: BRAND, fontWeight: '700' }]}>On-hand ({items.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, tab === 'movements' && s.tabActive]} onPress={() => setTab('movements')}>
            <Ionicons name="time-outline" size={14} color={tab === 'movements' ? BRAND : c.textMuted} />
            <Text style={[s.tabTxt, tab === 'movements' && { color: BRAND, fontWeight: '700' }]}>Menu history</Text>
          </TouchableOpacity>
        </View>

        {tab === 'stock' ? (
          <View style={s.card}>
            {lowStockRows.length > 0 && (
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text style={[s.cardHdrTxt, { marginBottom: 8 }]}>Low stock alerts</Text>
                {lowStockRows.slice(0, 6).map((row, i) => (
                  <View key={`${row.item_name}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <Text style={s.ingName}>{row.item_name}</Text>
                    <Text style={{ fontWeight: '700', color: isDark ? '#FDAF22' : '#d97706' }}>{row.on_hand} / {row.threshold}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={[s.tableToolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={s.searchWrap}>
                <Ionicons name="search" size={14} color={c.textMuted} />
                <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search menu item..." placeholderTextColor={c.textMuted} />
              </View>
              {categories.length > 0 && (
                <View style={s.filterChips}>
                  <TouchableOpacity style={[s.chip, !categoryId && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setCategoryId(null)}>
                    <Text style={[s.chipTxt, !categoryId && { color: '#fff' }]}>All categories</Text>
                  </TouchableOpacity>
                  {categories.map(cat => (
                    <TouchableOpacity key={cat.id} style={[s.chip, categoryId === cat.id && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setCategoryId(cat.id)}>
                      <Text style={[s.chipTxt, categoryId === cat.id && { color: '#fff' }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={s.filterChips}>
                {(['all', 'on', 'off'] as const).map(t => (
                  <TouchableOpacity key={t} style={[s.chip, tracking === t && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setTracking(t)}>
                    <Text style={[s.chipTxt, tracking === t && { color: '#fff' }]}>{t === 'all' ? 'All tracking' : t === 'on' ? 'Tracked' : 'Untracked'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.filterChips}>
                {([
                  ['all', 'All', items.length, filterChipColor('all', isDark, c)],
                  ['low', 'Low Stock', summary?.low_stock_count ?? 0, filterChipColor('low', isDark, c)],
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
              <Text style={[s.tCell, s.cName]}>Item</Text>
              {!isMobile && <Text style={[s.tCell, s.cCat]}>Category</Text>}
              <Text style={[s.tCell, s.cOnHand]}>On Hand</Text>
              <Text style={[s.tCell, s.cStatus]}>Status</Text>
              <Text style={[s.tCell, s.cAct, { textAlign: 'right' }]}>Actions</Text>
            </View>
            {displayed.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="fast-food-outline" size={36} color={c.textMuted} />
                <Text style={s.emptyTxt}>No menu items</Text>
              </View>
            ) : displayed.map((row, idx) => {
              const st = itemStatus(row, isDark);
              return (
                <View key={row.id} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                  <View style={s.cName}>
                    <Text style={s.ingName} numberOfLines={1}>{row.name}</Text>
                    {row.is_master ? <Text style={s.ingSku}>Master item</Text> : null}
                    {isMobile && <Text style={s.ingSku}>{row.category_name}</Text>}
                  </View>
                  {!isMobile && <Text style={[s.tCell, s.cCat]} numberOfLines={1}>{row.category_name}</Text>}
                  <Text style={[s.tCell, s.cOnHand, { fontWeight: '800', color: row.tracked && (row.on_hand ?? 0) <= 0 ? (isDark ? '#FF3636' : '#dc2626') : c.heading }]}>
                    {row.tracked ? (row.on_hand ?? 0) : '—'}
                  </Text>
                  <View style={s.cStatus}>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusTxt, { color: st.color }]}>{st.label}</Text>
                    </View>
                    {row.tracked && row.threshold > 0 && <Text style={s.minTxt}>Min: {row.threshold}</Text>}
                  </View>
                  <View style={[s.cAct, { flexDirection: 'row', gap: 5, justifyContent: 'flex-end' }]}>
                    <TouchableOpacity
                      style={[s.actBtn, { borderColor: BRAND + '60' }]}
                      onPress={() => { setManageItemId(row.id); setShowManage(true); }}
                    >
                      <Ionicons name="settings-outline" size={14} color={BRAND} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actBtn} onPress={() => openStockIn(row)}>
                      <Ionicons name="arrow-down-circle-outline" size={14} color={BRAND} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actBtn, { borderColor: wasteBorder }]} onPress={() => openWaste(row)}>
                      <Ionicons name="trash-outline" size={14} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={s.card}>
            <View style={s.cardHdr}>
              <Text style={s.cardHdrTxt}>Menu history</Text>
              <Text style={s.cardHdrSub}>Complete audit trail for menu stock</Text>
            </View>
            <View style={{ padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={[s.cardHdrSub, { marginBottom: 0 }]}>Item</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChips}>
                <TouchableOpacity style={[s.chip, !historyItemId && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setHistoryItemId(null)}>
                  <Text style={[s.chipTxt, !historyItemId && { color: '#fff' }]}>All items</Text>
                </TouchableOpacity>
                {historyItems.map(item => (
                  <TouchableOpacity key={item.id} style={[s.chip, historyItemId === item.id && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setHistoryItemId(item.id)}>
                    <Text style={[s.chipTxt, historyItemId === item.id && { color: '#fff' }]} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[s.cardHdrSub, { marginBottom: 0 }]}>Type</Text>
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
                {historyRows.map((mv) => (
                  <HistoryMovementRow key={mv.id} mv={mv} isDark={isDark} c={c} s={s} />
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
      </ScrollView>

      <MenuStockOpModal
        visible={showOp}
        items={items}
        defaultId={opItemId}
        defaultOp={opType}
        onSave={() => { setShowOp(false); load(true); }}
        onClose={() => setShowOp(false)}
      />
      <StockItemManageModal
        visible={showManage}
        itemId={manageItemId}
        onSave={() => load(true)}
        onClose={() => { setShowManage(false); setManageItemId(null); }}
      />
    </View>
  );
}
