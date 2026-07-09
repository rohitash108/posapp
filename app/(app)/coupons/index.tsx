/**
 * Coupons Screen — csPos-parity redesign
 * Matches CouponsController (web) field names and business rules exactly.
 *
 * DB fields:  code, discount_type, discount_amount, valid_from, valid_to,
 *             is_active, max_uses, times_used
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, Modal,
  ActivityIndicator, RefreshControl, Switch,
  ScrollView, Pressable, useWindowDimensions, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { couponsApi } from '@/api/coupons';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { Coupon } from '@/types';

// ── Layout ────────────────────────────────────────────────────────────────────
const SIDEBAR_W = 220;
const GRID_PAD  = 16;
const GRID_GAP  = 10;

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

// ── Business logic helpers ────────────────────────────────────────────────────

function isExpired(c: Coupon): boolean {
  const expiry = c.valid_to ?? c.expires_at;
  if (!expiry) return false;
  return new Date(expiry + 'T23:59:59') < new Date();
}

function isNotStarted(c: Coupon): boolean {
  if (!c.valid_from) return false;
  return new Date(c.valid_from + 'T00:00:00') > new Date();
}

function isUsageExhausted(c: Coupon): boolean {
  const limit = c.max_uses ?? c.usage_limit;
  if (!limit) return false;
  const used = c.times_used ?? c.used_count ?? 0;
  return used >= limit;
}

function couponStatus(c: Coupon): 'active' | 'inactive' | 'expired' | 'not_started' | 'exhausted' {
  if (isExpired(c))       return 'expired';
  if (isUsageExhausted(c)) return 'exhausted';
  if (!c.is_active)       return 'inactive';
  if (isNotStarted(c))    return 'not_started';
  return 'active';
}

function usagePercent(c: Coupon): number | null {
  const used  = c.times_used ?? c.used_count ?? 0;
  const limit = c.max_uses   ?? c.usage_limit;
  if (!limit || limit === 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

function formatDateDisplay(d?: string): string {
  if (!d) return '—';
  try { return format(new Date(d + 'T00:00:00'), 'dd MMM yyyy'); }
  catch { return d; }
}

// ── Style factories ───────────────────────────────────────────────────────────

function mkS(c: ThemeColors) {
  return StyleSheet.create({
    pageHeader:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle:   { fontSize: 18, fontWeight: '800', color: c.heading },
    pageSub:     { fontSize: 11, color: c.textMuted, marginTop: 1 },
    addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.sidebar, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    addBtnTxt:   { color: '#fff', fontWeight: '800', fontSize: 13 },

    statsBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    statItem:    { flex: 1, alignItems: 'center', gap: 1 },
    statIcon:    { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
    statVal:     { fontSize: 14, fontWeight: '800' },
    statLbl:     { fontSize: 9, color: c.textMuted },
    statDivider: { width: 1, height: 28, backgroundColor: c.border },

    searchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border },
    searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surfaceAlt, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: c.border },
    searchInput: { flex: 1, fontSize: 13, color: c.heading },

    tabsRow:      { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, height: 48 },
    filterTab:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
    filterTabTxt: { fontSize: 12, fontWeight: '600', color: c.text },
    tabCount:     { backgroundColor: c.border, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
    tabCountTxt:  { fontSize: 10, fontWeight: '700', color: c.textMuted },

    resultRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 7, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    resultTxt:  { fontSize: 11.5, color: c.textMuted, fontWeight: '600' },
    clearAll:   { fontSize: 12, color: PRIMARY, textDecorationLine: 'underline' },
    loadWrap:   { paddingTop: 80, alignItems: 'center', gap: 12 },
    loadTxt:    { fontSize: 14, color: c.textMuted },
    emptyWrap:  { paddingTop: 70, alignItems: 'center', gap: 10 },
    emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    emptySub:   { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingHorizontal: 40 },
    emptyAddBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: c.sidebar, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
    emptyAddTxt:{ color: c.brand, fontWeight: '800', fontSize: 13.5 },

    modalBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    modalPanel:        { width: '100%', maxHeight: '95%', borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
    modalPanelDesktop: { width: 580, maxWidth: 580 },
  });
}

function mkCc(c: ThemeColors) {
  return StyleSheet.create({
    card:        { backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: c.brand, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, width: '100%' },
    cardFaded:   { opacity: 0.75 },
    top:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    codeTag:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fefce8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#fef08a' },
    codeText:    { fontSize: 14, fontWeight: '900', color: c.heading, letterSpacing: 1.2 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
    statusDot:   { width: 5, height: 5, borderRadius: 2.5 },
    statusTxt:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
    midRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
    valuePill:   { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8 },
    pillGold:    { backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a' },
    pillBlue:    { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
    valueTxt:    { fontSize: 13, fontWeight: '800' },
    metaChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surfaceAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
    metaTxt:     { fontSize: 11, fontWeight: '600', color: c.textMuted },
    progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    progressTrack:{ flex: 1, height: 5, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 5, borderRadius: 3, backgroundColor: '#16a34a' },
    progressTxt:  { fontSize: 10, fontWeight: '700', color: c.textMuted, width: 32, textAlign: 'right' },
    botRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 },
    metaLine:    { fontSize: 11.5, color: c.textMuted },
    actionsRow:  { flexDirection: 'row', gap: 8 },
    actionBtn:   { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  });
}

function mkFm(c: ThemeColors) {
  return StyleSheet.create({
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: c.sidebar },
    headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,165,42,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,165,42,0.25)' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
    headerSub:   { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
    closeBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    field:       { gap: 0 },
    label:       { fontSize: 11.5, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7 },
    labelHint:   { fontSize: 10, fontWeight: '400', color: c.textMuted, textTransform: 'none', letterSpacing: 0 },
    req:         { color: '#ef4444' },
    opt:         { color: c.textMuted, fontWeight: '400', textTransform: 'none', letterSpacing: 0, fontSize: 10 },
    hint:        { fontSize: 11, color: c.textMuted, marginTop: 5 },
    fieldError:  { fontSize: 11.5, color: '#dc2626', fontWeight: '600', marginTop: 4 },
    inputWrap:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.border, borderRadius: 11, backgroundColor: c.surfaceAlt, overflow: 'hidden' },
    inputError:  { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
    inputPrefix: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt, borderRightWidth: 1, borderRightColor: c.border },
    inputPrefixTxt: { fontSize: 14, fontWeight: '800', color: c.textMuted },
    input:       { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: c.heading },
    typeBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 11, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceAlt, position: 'relative' },
    typeBtnActive:{ backgroundColor: c.sidebar, borderColor: c.sidebar },
    typeBtnTxt:  { fontSize: 13, fontWeight: '600', color: c.text },
    typeBtnTxtActive: { color: '#fff', fontWeight: '700' },
    typeBtnIcon: { fontSize: 15, fontWeight: '800', color: c.textMuted },
    typeBtnCheck:{ position: 'absolute', top: 6, right: 8, width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(201,165,42,0.2)', alignItems: 'center', justifyContent: 'center' },
    errorBox:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fef2f2', borderRadius: 9, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
    errorTxt:    { color: '#dc2626', fontSize: 12.5, fontWeight: '600', flex: 1 },
    previewBox:  { gap: 8 },
    previewLabel:{ fontSize: 11.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    previewPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: c.sidebar, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    previewCode: { fontSize: 14, fontWeight: '900', color: '#fff', letterSpacing: 2 },
    previewVal:  { fontSize: 13, fontWeight: '700', color: c.brand },
    previewMeta: { fontSize: 11, color: c.textMuted },
    footer:      { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    cancelBtn:   { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 11, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    cancelTxt:   { fontWeight: '700', color: c.text, fontSize: 14 },
    saveBtn:     { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 11, backgroundColor: c.sidebar },
    saveTxt:     { fontWeight: '800', color: c.brand, fontSize: 14 },
  });
}

// ── Form ─────────────────────────────────────────────────────────────────────

interface FormState {
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_amount: string;
  valid_from: string;
  valid_to: string;
  max_uses: string;
  is_active: boolean;
}

const BLANK: FormState = {
  code: '', discount_type: 'percentage', discount_amount: '',
  valid_from: '', valid_to: '', max_uses: '', is_active: true,
};

function CouponForm({
  coupon,
  onSave,
  onClose,
}: {
  coupon?: Coupon | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const fm = useMemo(() => mkFm(c), [c]);

  const isEdit = !!coupon?.id;

  const [form, setForm] = useState<FormState>(
    coupon
      ? {
          code:            coupon.code,
          discount_type:   coupon.discount_type,
          discount_amount: String(coupon.discount_amount ?? coupon.discount_value ?? ''),
          valid_from:      coupon.valid_from ?? '',
          valid_to:        coupon.valid_to ?? coupon.expires_at ?? '',
          max_uses:        coupon.max_uses ? String(coupon.max_uses) : '',
          is_active:       coupon.is_active,
        }
      : { ...BLANK }
  );
  const [saving, setSaving]  = useState(false);
  const [errors, setErrors]  = useState<Record<string, string>>({});

  function field(key: keyof FormState) {
    return (val: string) => {
      setForm(p => ({ ...p, [key]: val }));
      if (errors[key]) setErrors(p => ({ ...p, [key]: '' }));
    };
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = 'Coupon code is required';
    if (!form.discount_amount || isNaN(Number(form.discount_amount))) e.discount_amount = 'Enter a valid amount';
    else if (Number(form.discount_amount) < 0) e.discount_amount = 'Amount cannot be negative';
    else if (form.discount_type === 'percentage' && Number(form.discount_amount) > 100) e.discount_amount = 'Percentage must be 1–100';
    if (form.valid_from && form.valid_to && form.valid_from > form.valid_to) e.valid_to = 'Expiry must be after start date';
    if (form.max_uses && (isNaN(Number(form.max_uses)) || Number(form.max_uses) < 1)) e.max_uses = 'Must be a positive number';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        code:            form.code.toUpperCase().trim(),
        discount_type:   form.discount_type,
        discount_amount: Number(form.discount_amount),
        valid_from:      form.valid_from  || undefined,
        valid_to:        form.valid_to    || undefined,
        max_uses:        form.max_uses    ? Number(form.max_uses) : undefined,
        is_active:       form.is_active,
      };
      if (isEdit) await couponsApi.update(coupon!.id, payload);
      else        await couponsApi.create(payload);
      onSave();
    } catch (e: any) {
      setErrors({ _: e?.response?.data?.message ?? 'Failed to save coupon' });
    } finally { setSaving(false); }
  }

  const discountPreview = form.discount_amount && !isNaN(Number(form.discount_amount))
    ? (form.discount_type === 'percentage' ? `${form.discount_amount}% OFF` : `₹${form.discount_amount} OFF`)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {/* Header */}
      <View style={fm.header}>
        <View style={fm.headerLeft}>
          <View style={fm.headerIcon}>
            <Ionicons name={isEdit ? 'pencil' : 'pricetag'} size={16} color={c.brand} />
          </View>
          <View>
            <Text style={fm.headerTitle}>{isEdit ? 'Edit Coupon' : 'New Coupon'}</Text>
            <Text style={fm.headerSub}>{isEdit ? `Editing ${coupon!.code}` : 'Create a discount code'}</Text>
          </View>
        </View>
        <Pressable style={({ pressed }) => [fm.closeBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, gap: 16 }}>

        {errors._ ? (
          <View style={fm.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
            <Text style={fm.errorTxt}>{errors._}</Text>
          </View>
        ) : null}

        {/* Coupon Code + Active toggle */}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Coupon Code <Text style={fm.req}>*</Text></Text>
            <View style={[fm.inputWrap, !!errors.code && fm.inputError]}>
              <View style={fm.inputPrefix}>
                <Ionicons name="pricetag-outline" size={15} color={c.textMuted} />
              </View>
              <TextInput
                style={[fm.input, { fontFamily: 'monospace', letterSpacing: 2, fontWeight: '800', fontSize: 15 }]}
                value={form.code}
                onChangeText={v => { field('code')(v.toUpperCase()); }}
                placeholder="e.g. SAVE20"
                placeholderTextColor={c.textMuted}
                autoCapitalize="characters"
              />
            </View>
            {errors.code ? <Text style={fm.fieldError}>{errors.code}</Text> : <Text style={fm.hint}>Customers enter this code at checkout</Text>}
          </View>
          <View style={[fm.field, { alignItems: 'center', marginTop: 30 }]}>
            <Text style={[fm.label, { textAlign: 'center', marginBottom: 8 }]}>Active</Text>
            <Switch
              value={form.is_active}
              onValueChange={v => setForm(p => ({ ...p, is_active: v }))}
              trackColor={{ true: '#16a34a', false: '#e5e7eb' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Discount Type */}
        <View style={fm.field}>
          <Text style={fm.label}>Discount Type <Text style={fm.req}>*</Text></Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            {(['percentage', 'fixed'] as const).map(t => (
              <Pressable
                key={t}
                style={[fm.typeBtn, form.discount_type === t && fm.typeBtnActive]}
                onPress={() => setForm(p => ({ ...p, discount_type: t }))}>
                <Text style={[fm.typeBtnIcon, form.discount_type === t && { color: c.brand }]}>
                  {t === 'percentage' ? '%' : '₹'}
                </Text>
                <Text style={[fm.typeBtnTxt, form.discount_type === t && fm.typeBtnTxtActive]}>
                  {t === 'percentage' ? 'Percentage' : 'Fixed Amount'}
                </Text>
                {form.discount_type === t && (
                  <View style={fm.typeBtnCheck}>
                    <Ionicons name="checkmark" size={11} color={c.brand} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Discount Amount */}
        <View style={fm.field}>
          <Text style={fm.label}>
            Discount Value <Text style={fm.req}>*</Text>
            {form.discount_type === 'percentage' && <Text style={fm.labelHint}> (1–100)</Text>}
          </Text>
          <View style={[fm.inputWrap, !!errors.discount_amount && fm.inputError]}>
            <View style={fm.inputPrefix}>
              <Text style={fm.inputPrefixTxt}>{form.discount_type === 'percentage' ? '%' : '₹'}</Text>
            </View>
            <TextInput
              style={fm.input}
              value={form.discount_amount}
              onChangeText={field('discount_amount')}
              placeholder={form.discount_type === 'percentage' ? '0–100' : '0.00'}
              placeholderTextColor={c.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
          {errors.discount_amount ? <Text style={fm.fieldError}>{errors.discount_amount}</Text> : null}
        </View>

        {/* Max Uses */}
        <View style={fm.field}>
          <Text style={fm.label}>Max Uses <Text style={fm.opt}>(leave empty for unlimited)</Text></Text>
          <View style={[fm.inputWrap, !!errors.max_uses && fm.inputError]}>
            <View style={fm.inputPrefix}>
              <Ionicons name="people-outline" size={14} color={c.textMuted} />
            </View>
            <TextInput
              style={fm.input}
              value={form.max_uses}
              onChangeText={field('max_uses')}
              placeholder="Unlimited"
              placeholderTextColor={c.textMuted}
              keyboardType="numeric"
            />
          </View>
          {errors.max_uses ? <Text style={fm.fieldError}>{errors.max_uses}</Text> : null}
        </View>

        {/* Valid From / Valid To */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Valid From</Text>
            {Platform.OS === 'web' ? (
              <View style={fm.inputWrap}>
                <View style={fm.inputPrefix}><Ionicons name="calendar-outline" size={14} color={c.textMuted} /></View>
                <input
                  type="date"
                  value={form.valid_from}
                  onChange={e => field('valid_from')((e.target as HTMLInputElement).value)}
                  style={{ flex: 1, padding: '12px', fontSize: 14, color: c.heading, border: 'none', outline: 'none', background: 'transparent' } as any}
                />
              </View>
            ) : (
              <View style={fm.inputWrap}>
                <View style={fm.inputPrefix}><Ionicons name="calendar-outline" size={14} color={c.textMuted} /></View>
                <TextInput style={fm.input} value={form.valid_from} onChangeText={field('valid_from')} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} />
              </View>
            )}
            <Text style={fm.hint}>Leave empty to activate immediately</Text>
          </View>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Expiry Date</Text>
            {Platform.OS === 'web' ? (
              <View style={[fm.inputWrap, !!errors.valid_to && fm.inputError]}>
                <View style={fm.inputPrefix}><Ionicons name="time-outline" size={14} color={c.textMuted} /></View>
                <input
                  type="date"
                  value={form.valid_to}
                  onChange={e => field('valid_to')((e.target as HTMLInputElement).value)}
                  style={{ flex: 1, padding: '12px', fontSize: 14, color: c.heading, border: 'none', outline: 'none', background: 'transparent' } as any}
                />
              </View>
            ) : (
              <View style={[fm.inputWrap, !!errors.valid_to && fm.inputError]}>
                <View style={fm.inputPrefix}><Ionicons name="time-outline" size={14} color={c.textMuted} /></View>
                <TextInput style={fm.input} value={form.valid_to} onChangeText={field('valid_to')} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} />
              </View>
            )}
            {errors.valid_to ? <Text style={fm.fieldError}>{errors.valid_to}</Text> : <Text style={fm.hint}>Leave empty for no expiry</Text>}
          </View>
        </View>

        {/* Preview */}
        {form.code.trim() && discountPreview ? (
          <View style={fm.previewBox}>
            <Text style={fm.previewLabel}>Preview</Text>
            <View style={fm.previewPill}>
              <Ionicons name="pricetag" size={13} color={c.brand} />
              <Text style={fm.previewCode}>{form.code.toUpperCase()}</Text>
              <Text style={fm.previewVal}>{discountPreview}</Text>
            </View>
            {(form.valid_from || form.valid_to) && (
              <Text style={fm.previewMeta}>
                {form.valid_from ? `From ${form.valid_from}` : 'Starts immediately'}
                {' · '}
                {form.valid_to ? `Expires ${form.valid_to}` : 'No expiry'}
              </Text>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Footer */}
      <View style={fm.footer}>
        <Pressable style={({ pressed }) => [fm.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
          <Text style={fm.cancelTxt}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [fm.saveBtn, pressed && { opacity: 0.85 }]}
          disabled={saving}
          onPress={save}>
          {saving
            ? <ActivityIndicator color={c.brand} size="small" />
            : <>
                <Ionicons name={isEdit ? 'checkmark-circle' : 'add-circle'} size={17} color={c.brand} />
                <Text style={fm.saveTxt}>{isEdit ? 'Update Coupon' : 'Create Coupon'}</Text>
              </>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ── Coupon Card ───────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active:      { label: 'ACTIVE',       bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#16a34a' },
  inactive:    { label: 'INACTIVE',     bg: '#f3f4f6', border: '#e5e7eb', text: '#6b7280', dot: '#9ca3af' },
  expired:     { label: 'EXPIRED',      bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#ef4444' },
  not_started: { label: 'NOT STARTED',  bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', dot: '#f97316' },
  exhausted:   { label: 'LIMIT REACHED',bg: '#fdf4ff', border: '#e9d5ff', text: '#7e22ce', dot: '#8b5cf6' },
};

function CouponCard({
  coupon: coup, toggling, onEdit, onDelete, onToggle,
}: {
  coupon: Coupon;
  toggling: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const { colors: c } = useTheme();
  const cc = useMemo(() => mkCc(c), [c]);

  const status  = couponStatus(coup);
  const cfg     = STATUS_CONFIG[status];
  const pct     = usagePercent(coup);
  const used    = coup.times_used ?? coup.used_count ?? 0;
  const limit   = coup.max_uses   ?? coup.usage_limit;
  const expiry  = coup.valid_to   ?? coup.expires_at;
  const amount  = coup.discount_amount ?? coup.discount_value ?? 0;

  return (
    <View style={[cc.card, status === 'expired' && cc.cardFaded, status === 'inactive' && cc.cardFaded]}>

      {/* Top: code + status badge + toggle */}
      <View style={cc.top}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={[cc.codeTag, status === 'expired' && { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' }]}>
            <Ionicons name="pricetag" size={11} color={status === 'expired' ? c.textMuted : c.brand} />
            <Text style={[cc.codeText, status === 'expired' && { color: c.textMuted }]}>{coup.code}</Text>
          </View>
          <View style={[cc.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <View style={[cc.statusDot, { backgroundColor: cfg.dot }]} />
            <Text style={[cc.statusTxt, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
        </View>
        {toggling
          ? <ActivityIndicator size="small" color={c.sidebar} style={{ marginLeft: 8 }} />
          : <Switch
              value={!!coup.is_active && !isExpired(coup)}
              onValueChange={onToggle}
              disabled={isExpired(coup) || isUsageExhausted(coup)}
              trackColor={{ true: '#16a34a', false: '#e5e7eb' }}
              thumbColor="#fff"
            />
        }
      </View>

      {/* Discount value chip + meta */}
      <View style={cc.midRow}>
        <View style={[cc.valuePill, coup.discount_type === 'percentage' ? cc.pillGold : cc.pillBlue]}>
          <Text style={[cc.valueTxt, coup.discount_type === 'percentage' ? { color: '#92400e' } : { color: PRIMARY }]}>
            {coup.discount_type === 'percentage' ? `${amount}% OFF` : `₹${amount} OFF`}
          </Text>
        </View>
        {coup.valid_from && (
          <View style={cc.metaChip}>
            <Ionicons name="calendar-outline" size={10} color={c.textMuted} />
            <Text style={cc.metaTxt}>From {formatDateDisplay(coup.valid_from)}</Text>
          </View>
        )}
        {limit ? (
          <View style={cc.metaChip}>
            <Ionicons name="people-outline" size={10} color={c.textMuted} />
            <Text style={cc.metaTxt}>{used}/{limit}</Text>
          </View>
        ) : null}
      </View>

      {/* Usage progress bar */}
      {pct !== null && (
        <View style={cc.progressWrap}>
          <View style={cc.progressTrack}>
            <View style={[
              cc.progressFill,
              { width: `${pct}%` as any },
              pct >= 100 && { backgroundColor: '#7c3aed' },
              pct >= 90  && pct < 100 && { backgroundColor: '#ef4444' },
              pct >= 60  && pct < 90  && { backgroundColor: '#d97706' },
            ]} />
          </View>
          <Text style={cc.progressTxt}>{pct}%</Text>
        </View>
      )}

      {/* Bottom: expiry info + actions */}
      <View style={cc.botRow}>
        <View style={{ gap: 3 }}>
          {!limit && (
            <Text style={cc.metaLine}>
              <Ionicons name="repeat-outline" size={11} color={c.textMuted} /> {used} total uses
            </Text>
          )}
          {expiry ? (
            <Text style={[cc.metaLine, status === 'expired' && { color: '#dc2626', fontWeight: '700' }]}>
              <Ionicons name="time-outline" size={11} color={status === 'expired' ? '#dc2626' : c.textMuted} />
              {' '}{status === 'expired' ? 'Expired' : 'Expires'} {formatDateDisplay(expiry)}
            </Text>
          ) : (
            <Text style={cc.metaLine}>No expiry date</Text>
          )}
        </View>
        <View style={cc.actionsRow}>
          <Pressable
            style={({ pressed }) => [cc.actionBtn, { backgroundColor: '#eff6ff' }, pressed && { opacity: 0.7 }]}
            onPress={onEdit}>
            <Ionicons name="pencil-outline" size={14} color={PRIMARY} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [cc.actionBtn, { backgroundColor: '#fef2f2' }, pressed && { opacity: 0.7 }]}
            onPress={onDelete}>
            <Ionicons name="trash-outline" size={14} color="#dc2626" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CouponsScreen() {
  const { colors: c } = useTheme();
  const s = useMemo(() => mkS(c), [c]);

  const [coupons,    setCoupons]    = useState<Coupon[]>([]);
  const [meta,       setMeta]       = useState({ total: 0, active: 0, inactive: 0, expired: 0 });
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState<Coupon | null>(null);
  const [toggling,   setToggling]   = useState<Set<number>>(new Set());
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const isDesktop = width >= 900;
  const hasSidebar = width >= 640;
  const contentW  = hasSidebar ? width - SIDEBAR_W : width;
  const numCols   = contentW >= 1200 ? 3 : contentW >= 720 ? 2 : 1;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await couponsApi.list();
      const data = res.data?.data ?? res.data ?? [];
      if (res.data?.meta) setMeta(res.data.meta);
      setCoupons(Array.isArray(data) ? data : []);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return coupons.filter(coup => {
      const st = couponStatus(coup);
      if (filter === 'active'   && st !== 'active')   return false;
      if (filter === 'inactive' && st !== 'inactive') return false;
      if (filter === 'expired'  && st !== 'expired')  return false;
      if (search) return coup.code.toLowerCase().includes(search.toLowerCase());
      return true;
    });
  }, [coupons, filter, search]);

  const statsTotal    = meta.total    || coupons.length;
  const statsActive   = meta.active   || coupons.filter(coup => couponStatus(coup) === 'active').length;
  const statsInactive = meta.inactive || coupons.filter(coup => couponStatus(coup) === 'inactive').length;
  const statsExpired  = meta.expired  || coupons.filter(coup => couponStatus(coup) === 'expired').length;

  async function handleDelete(coup: Coupon) {
    const doDelete = async () => {
      try { await couponsApi.delete(coup.id); load(true); }
      catch (e: any) {
        const msg = e?.response?.data?.message ?? 'Delete failed';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Error', msg);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete coupon "${coup.code}"? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert('Delete Coupon', `Delete coupon "${coup.code}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  async function handleToggle(coup: Coupon) {
    if (isExpired(coup) || isUsageExhausted(coup)) return;
    setToggling(prev => new Set(prev).add(coup.id));
    const newVal = !coup.is_active;
    setCoupons(prev => prev.map(x => x.id === coup.id ? { ...x, is_active: newVal } : x));
    try { await couponsApi.toggle(coup.id); }
    catch { setCoupons(prev => prev.map(x => x.id === coup.id ? { ...x, is_active: !newVal } : x)); }
    finally { setToggling(prev => { const n = new Set(prev); n.delete(coup.id); return n; }); }
  }

  function openCreate() { setEditing(null); setFormOpen(true); }
  function openEdit(coup: Coupon) { setEditing(coup); setFormOpen(true); }
  function afterSave() { setFormOpen(false); setEditing(null); load(true); }

  const FILTER_TABS = [
    { key: 'all'     as const, label: 'All',      count: statsTotal,    color: c.sidebar },
    { key: 'active'  as const, label: 'Active',   count: statsActive,   color: '#16a34a' },
    { key: 'inactive'as const, label: 'Inactive', count: statsInactive, color: '#6b7280' },
    { key: 'expired' as const, label: 'Expired',  count: statsExpired,  color: '#ef4444' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>

      {/* Header */}
      <View style={[s.pageHeader, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Coupons</Text>
          <Text style={s.pageSub}>{statsTotal} discount code{statsTotal !== 1 ? 's' : ''}</Text>
        </View>
        <Pressable style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85 }]} onPress={openCreate}>
          <Ionicons name="add" size={17} color="#fff" />
          <Text style={s.addBtnTxt}>New Coupon</Text>
        </Pressable>
      </View>

      {/* Stats bar */}
      <View style={s.statsBar}>
        {[
          { icon: 'pricetags-outline', val: statsTotal,    lbl: 'Total',    color: PRIMARY },
          { icon: 'checkmark-circle-outline', val: statsActive,  lbl: 'Active',   color: '#16a34a' },
          { icon: 'pause-circle-outline', val: statsInactive, lbl: 'Inactive', color: '#6b7280' },
          { icon: 'time-outline', val: statsExpired,  lbl: 'Expired',  color: '#ef4444' },
        ].map((st, i) => (
          <React.Fragment key={st.lbl}>
            {i > 0 && <View style={s.statDivider} />}
            <View style={s.statItem}>
              <View style={[s.statIcon, { backgroundColor: st.color + '18' }]}>
                <Ionicons name={st.icon as any} size={14} color={st.color} />
              </View>
              <Text style={[s.statVal, { color: st.color }]}>{st.val}</Text>
              <Text style={s.statLbl}>{st.lbl}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color={c.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search coupon code…"
            placeholderTextColor={c.textMuted}
            autoCapitalize="characters"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={c.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filter tabs */}
      <View style={s.tabsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' }}>
          {FILTER_TABS.map(tab => {
            const active = filter === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[s.filterTab, active && { backgroundColor: tab.color, borderColor: tab.color }]}
                onPress={() => setFilter(tab.key)}>
                <Text style={[s.filterTabTxt, active && { color: '#fff', fontWeight: '700' }]}>{tab.label}</Text>
                <View style={[s.tabCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.tabCountTxt, active && { color: '#fff' }]}>{tab.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Result count */}
      <View style={s.resultRow}>
        <Text style={s.resultTxt}>{filtered.length} coupon{filtered.length !== 1 ? 's' : ''}</Text>
        {(search || filter !== 'all') && (
          <Pressable onPress={() => { setSearch(''); setFilter('all'); }}>
            <Text style={s.clearAll}>Clear filters</Text>
          </Pressable>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color={c.sidebar} size="large" />
          <Text style={s.loadTxt}>Loading coupons…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          key={`coupon-grid-${numCols}`}
          numColumns={numCols}
          columnWrapperStyle={numCols > 1 ? { gap: GRID_GAP } : undefined}
          contentContainerStyle={{
            paddingHorizontal: GRID_PAD,
            paddingTop: 10,
            paddingBottom: 40,
            gap: numCols === 1 ? GRID_GAP : undefined,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={c.brand} />
          }
          renderItem={({ item: coup }) => (
            <View style={numCols > 1 ? { flex: 1, marginBottom: GRID_GAP } : undefined}>
              <CouponCard
                coupon={coup}
                toggling={toggling.has(coup.id)}
                onEdit={() => openEdit(coup)}
                onDelete={() => handleDelete(coup)}
                onToggle={() => handleToggle(coup)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="pricetags-outline" size={36} color={c.textMuted} />
              </View>
              <Text style={s.emptyTitle}>No coupons found</Text>
              <Text style={s.emptySub}>
                {search ? `No results for "${search}"` : 'Create discount codes for your customers.'}
              </Text>
              {!search && filter === 'all' && (
                <Pressable style={({ pressed }) => [s.emptyAddBtn, pressed && { opacity: 0.85 }]} onPress={openCreate}>
                  <Ionicons name="add" size={16} color={c.brand} />
                  <Text style={s.emptyAddTxt}>Create First Coupon</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}

      {/* Add/Edit Modal */}
      {Platform.OS !== 'web' ? (
        /* Mobile: full-screen slide modal — fixes ScrollView collapse on Android */
        <Modal
          visible={formOpen}
          animationType="slide"
          onRequestClose={() => { setFormOpen(false); setEditing(null); }}>
          <CouponForm
            coupon={editing}
            onSave={afterSave}
            onClose={() => { setFormOpen(false); setEditing(null); }}
          />
        </Modal>
      ) : (
        /* Web: centered overlay (unchanged) */
        <Modal
          visible={formOpen}
          transparent
          animationType="fade"
          onRequestClose={() => { setFormOpen(false); setEditing(null); }}>
          <Pressable style={s.modalBackdrop} onPress={() => { setFormOpen(false); setEditing(null); }}>
            <Pressable style={[s.modalPanel, isDesktop && s.modalPanelDesktop]} onPress={() => {}}>
              <CouponForm
                coupon={editing}
                onSave={afterSave}
                onClose={() => { setFormOpen(false); setEditing(null); }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
