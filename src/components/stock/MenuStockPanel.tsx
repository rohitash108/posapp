import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, RefreshControl, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { stockApi } from '@/api/stock';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { MenuStockData, MenuStockItem, StockHistoryData, StockHistoryRow } from '@/types';

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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await stockApi.index({
        stock_status: filter === 'all' ? 'all' : filter,
        category_id: categoryId ?? undefined,
        tracking: tracking === 'all' ? undefined : tracking,
        q: search || undefined,
      });
      setData(res.data);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to load menu stock';
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, categoryId, tracking, search]);

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

  const displayed = items;

  const statItems = [
    { icon: 'fast-food-outline', val: summary?.menu_item_count ?? 0, lbl: 'Items', color: '#2563eb' },
    { icon: 'checkbox-outline', val: summary?.tracked_count ?? 0, lbl: 'Tracked', color: '#0f8f73' },
    { icon: 'warning-outline', val: summary?.low_stock_count ?? 0, lbl: 'Low', color: '#d97706' },
    { icon: 'close-circle-outline', val: summary?.out_of_stock_count ?? 0, lbl: 'Out', color: '#dc2626' },
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
                <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search menu item..." placeholderTextColor={c.textMuted} onSubmitEditing={() => load()} />
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
    </View>
  );
}
