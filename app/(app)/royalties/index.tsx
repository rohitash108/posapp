/**
 * Royalty Management — csPos web parity
 * Uses /api/mobile/royalties (RoyaltyService on backend)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal, TextInput,
  ActivityIndicator, RefreshControl, Alert, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { royaltiesApi } from '@/api/royalties';
import type { RoyaltyMeta, RoyaltyPreview, RoyaltyRequest } from '@/types';
import { useRestaurantAdmin } from '@/hooks/useRestaurantAdmin';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: format(new Date(2024, i, 1), 'MMMM'),
}));

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending:  { bg: 'rgba(253,175,34,0.15)', text: '#FDAF22' },
  approved: { bg: 'rgba(20,181,29,0.15)',  text: '#14B51D' },
  rejected: { bg: 'rgba(255,54,54,0.15)',   text: '#FF3636' },
};

function fmtMoney(sym: string, n: number) {
  return `${sym}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function apiError(e: any, fallback: string) {
  const msg = e?.response?.data?.message;
  const errors = e?.response?.data?.errors;
  if (errors && typeof errors === 'object') {
    const first = Object.values(errors).flat()[0];
    if (typeof first === 'string') return first;
  }
  return msg || fallback;
}

export default function RoyaltiesScreen() {
  const { colors: c, isDark } = useTheme();
  const isRestaurantAdmin = useRestaurantAdmin();
  const s = useMemo(() => mkS(c, isDark), [c, isDark]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState<RoyaltyRequest[]>([]);
  const [meta, setMeta] = useState<RoyaltyMeta | null>(null);
  const [toast, setToast] = useState('');

  const [showSubmit, setShowSubmit] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTarget, setEditTarget] = useState<RoyaltyRequest | null>(null);

  const now = new Date();
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [notes, setNotes] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [preview, setPreview] = useState<RoyaltyPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const years = useMemo(() => Array.from({ length: 6 }, (_, i) => now.getFullYear() - i), [now]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await royaltiesApi.list();
      setRequests(res.data?.data ?? []);
      setMeta(res.data?.meta ?? null);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        showToast('Only restaurant administrators can access royalty management.');
      } else {
        showToast(apiError(e, 'Could not load royalty data.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const loadPreview = useCallback(async (month: number, year: number) => {
    setPreviewLoading(true);
    try {
      const res = await royaltiesApi.preview(month, year);
      setPreview(res.data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showSubmit) return;
    loadPreview(periodMonth, periodYear);
  }, [showSubmit, periodMonth, periodYear, loadPreview]);

  function openSubmit() {
    setPeriodMonth(now.getMonth() + 1);
    setPeriodYear(now.getFullYear());
    setNotes('');
    setShowSubmit(true);
  }

  function openEdit(req: RoyaltyRequest) {
    setEditTarget(req);
    setEditNotes(req.notes ?? '');
    setShowEdit(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await royaltiesApi.submit({
        period_month: periodMonth,
        period_year: periodYear,
        notes: notes.trim() || undefined,
      });
      setShowSubmit(false);
      showToast('Royalty request submitted successfully.');
      await load(true);
    } catch (e: any) {
      Alert.alert('Submit failed', apiError(e, 'Could not submit royalty request.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleResubmit(req: RoyaltyRequest) {
    setSaving(true);
    try {
      await royaltiesApi.submit({
        period_month: req.period_month,
        period_year: req.period_year,
        notes: req.notes ?? undefined,
      });
      showToast('Royalty request resubmitted successfully.');
      await load(true);
    } catch (e: any) {
      Alert.alert('Resubmit failed', apiError(e, 'Could not resubmit royalty request.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    if (!editTarget) return;
    setSaving(true);
    try {
      await royaltiesApi.updateNotes(editTarget.id, editNotes.trim() || undefined);
      setShowEdit(false);
      showToast('Royalty request updated successfully.');
      await load(true);
    } catch (e: any) {
      Alert.alert('Update failed', apiError(e, 'Could not update royalty request.'));
    } finally {
      setSaving(false);
    }
  }

  const sym = meta?.currency_symbol ?? '₹';
  const previewData = preview ?? meta?.current_preview ?? null;

  if (loading) {
    return (
      <View style={[s.shell, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={s.loadTxt}>Loading royalty data…</Text>
      </View>
    );
  }

  if (!isRestaurantAdmin) {
    return (
      <View style={[s.shell, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Ionicons name="lock-closed-outline" size={40} color={c.textMuted} />
        <Text style={[s.title, { marginTop: 12, textAlign: 'center' }]}>Restaurant admin only</Text>
        <Text style={[s.subtitle, { textAlign: 'center', marginTop: 6 }]}>
          Royalty management is available to restaurant administrators only, matching the csPos web app.
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.shell, { paddingTop: insets.top }]}>
      {!!toast && (
        <View style={s.toast}>
          <Ionicons name="information-circle" size={16} color="#fff" />
          <Text style={s.toastTxt}>{toast}</Text>
        </View>
      )}

      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Royalty</Text>
          <Text style={s.subtitle}>Submit monthly royalty requests calculated from your paid sales</Text>
        </View>
        <Pressable style={s.primaryBtn} onPress={openSubmit}>
          <Ionicons name="add-circle-outline" size={16} color="#fff" />
          <Text style={s.primaryBtnTxt}>Submit Royalty Request</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isWide ? 20 : 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={c.primary} />}
      >
        {meta && (
          <View style={s.summaryCard}>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Royalty rate</Text>
              <Text style={s.summaryValue}>{meta.effective_percentage.toFixed(2)}%</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Calculation basis</Text>
              <View style={s.basisBadge}>
                <Text style={s.basisBadgeTxt}>{meta.calculation_basis_label}</Text>
              </View>
            </View>
            <View style={s.summaryDivider} />
            <View style={[s.summaryItem, { flex: 1.4 }]}>
              <Text style={s.summaryLabel}>This month (calculated)</Text>
              <Text style={s.summaryValue}>{fmtMoney(sym, meta.current_preview.royalty_amount)}</Text>
              <Text style={s.summaryHint}>
                from {fmtMoney(sym, meta.current_preview.sales_base)} sales
              </Text>
            </View>
          </View>
        )}

        <View style={s.tableCard}>
          {requests.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="ribbon-outline" size={36} color={c.textMuted} />
              <Text style={s.emptyTxt}>No royalty requests yet.</Text>
            </View>
          ) : (
            requests.map((req) => {
              const st = STATUS_STYLE[req.status] ?? STATUS_STYLE.pending;
              return (
                <View key={req.id} style={s.row}>
                  <View style={s.rowMain}>
                    <Text style={s.rowPeriod}>{req.period_label}</Text>
                    <Text style={s.rowMeta}>
                      {fmtMoney(sym, req.reference_sales_amount)} sales · {req.royalty_percentage.toFixed(2)}% · {req.calculation_basis_label}
                    </Text>
                    <Text style={s.rowAmount}>{fmtMoney(sym, req.royalty_amount)}</Text>
                    {req.notes ? <Text style={s.rowNotes} numberOfLines={2}>{req.notes}</Text> : null}
                    {req.rejection_reason ? (
                      <Text style={s.rejection} numberOfLines={3}>Rejected: {req.rejection_reason}</Text>
                    ) : null}
                    {req.admin_notes ? (
                      <Text style={s.rowNotes} numberOfLines={3}>Admin: {req.admin_notes}</Text>
                    ) : null}
                    <Text style={s.rowDate}>
                      Submitted {req.created_at ? format(new Date(req.created_at), 'dd MMM yyyy') : '—'}
                      {req.submitted_by_name ? ` · ${req.submitted_by_name}` : ''}
                      {req.reviewed_at ? ` · Reviewed ${format(new Date(req.reviewed_at), 'dd MMM yyyy')}` : ''}
                    </Text>
                  </View>
                  <View style={s.rowSide}>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusTxt, { color: st.text }]}>{req.status_label}</Text>
                    </View>
                    {req.can_edit_notes && (
                      <Pressable style={s.outlineBtn} onPress={() => openEdit(req)}>
                        <Text style={s.outlineBtnTxt}>Edit notes</Text>
                      </Pressable>
                    )}
                    {req.can_resubmit && (
                      <Pressable style={[s.outlineBtn, s.warnBtn]} disabled={saving} onPress={() => handleResubmit(req)}>
                        <Text style={[s.outlineBtnTxt, { color: '#E65100' }]}>Resubmit</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Submit modal */}
      <Modal visible={showSubmit} transparent animationType="fade" onRequestClose={() => setShowSubmit(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setShowSubmit(false)}>
          <Pressable style={s.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={s.modalTitle}>Submit Royalty Request</Text>
            <View style={s.pickerRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Month</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
                  {MONTHS.map((m) => (
                    <Pressable key={m.value}
                      style={[s.chip, periodMonth === m.value && s.chipActive]}
                      onPress={() => setPeriodMonth(m.value)}>
                      <Text style={[s.chipTxt, periodMonth === m.value && s.chipTxtActive]}>{m.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
            <Text style={s.fieldLabel}>Year</Text>
            <View style={s.chipRow}>
              {years.map((y) => (
                <Pressable key={y} style={[s.chip, periodYear === y && s.chipActive]} onPress={() => setPeriodYear(y)}>
                  <Text style={[s.chipTxt, periodYear === y && s.chipTxtActive]}>{y}</Text>
                </Pressable>
              ))}
            </View>

            <View style={s.previewBox}>
              <Text style={s.previewLabel}>Calculated royalty (read-only)</Text>
              {previewLoading ? (
                <ActivityIndicator color={c.primary} style={{ marginVertical: 8 }} />
              ) : previewData ? (
                <>
                  <Text style={s.previewAmount}>{fmtMoney(sym, previewData.royalty_amount)}</Text>
                  <Text style={s.previewMeta}>
                    {previewData.royalty_percentage.toFixed(2)}% of {fmtMoney(sym, previewData.sales_base)}
                    {previewData.calculation_basis_label ? ` (${previewData.calculation_basis_label})` : ''}
                  </Text>
                </>
              ) : (
                <Text style={s.previewMeta}>Could not load calculated royalty.</Text>
              )}
            </View>

            <Text style={s.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={s.textArea}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes for the reviewer…"
              placeholderTextColor={c.textMuted}
              multiline
              maxLength={2000}
            />

            <View style={s.modalActions}>
              <Pressable style={s.cancelBtn} onPress={() => setShowSubmit(false)}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={s.primaryBtn} disabled={saving} onPress={handleSubmit}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={s.primaryBtnTxt}>Submit for Approval</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit notes modal */}
      <Modal visible={showEdit} transparent animationType="fade" onRequestClose={() => setShowEdit(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setShowEdit(false)}>
          <Pressable style={s.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={s.modalTitle}>Edit Notes</Text>
            <Text style={s.modalHint}>Royalty amount is calculated automatically and cannot be edited.</Text>
            <TextInput
              style={s.textArea}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Notes"
              placeholderTextColor={c.textMuted}
              multiline
              maxLength={2000}
            />
            <View style={s.modalActions}>
              <Pressable style={s.cancelBtn} onPress={() => setShowEdit(false)}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={s.primaryBtn} disabled={saving} onPress={handleSaveNotes}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={s.primaryBtnTxt}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function mkS(c: ThemeColors, isDark: boolean) {
  const card = isDark ? '#121212' : c.surface;
  const border = isDark ? '#1e1e1e' : c.border;
  return StyleSheet.create({
    shell:     { flex: 1, backgroundColor: isDark ? '#0a0a0a' : c.background },
    toast:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.primary, padding: 12 },
    toastTxt:  { flex: 1, color: '#fff', fontWeight: '600', fontSize: 13 },
    header:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: border, backgroundColor: card, flexWrap: 'wrap' },
    title:     { fontSize: 20, fontWeight: '800', color: isDark ? '#fff' : c.heading },
    subtitle:  { fontSize: 12.5, color: c.textMuted, marginTop: 4, maxWidth: 520 },
    primaryBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
    primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
    loadTxt:   { marginTop: 12, color: c.textMuted, fontSize: 14 },
    summaryCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, backgroundColor: card, borderRadius: 12, borderWidth: 1, borderColor: border, padding: 16, marginBottom: 14 },
    summaryItem: { minWidth: 120 },
    summaryDivider: { width: 1, height: 36, backgroundColor: border },
    summaryLabel: { fontSize: 11, color: c.textMuted, marginBottom: 4 },
    summaryValue: { fontSize: 16, fontWeight: '800', color: isDark ? '#fff' : c.heading },
    summaryHint:  { fontSize: 11, color: c.textMuted, marginTop: 2 },
    basisBadge:   { alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(13,118,225,0.15)' : '#eff6ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    basisBadgeTxt:{ fontSize: 11, fontWeight: '700', color: c.primary },
    tableCard:    { backgroundColor: card, borderRadius: 12, borderWidth: 1, borderColor: border, overflow: 'hidden' },
    row:          { flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: border },
    rowMain:      { flex: 1, minWidth: 0 },
    rowSide:      { alignItems: 'flex-end', gap: 8, maxWidth: 140 },
    rowPeriod:    { fontSize: 14, fontWeight: '800', color: isDark ? '#fff' : c.heading },
    rowMeta:      { fontSize: 11.5, color: c.textMuted, marginTop: 3 },
    rowAmount:    { fontSize: 15, fontWeight: '800', color: c.primary, marginTop: 4 },
    rowNotes:     { fontSize: 12, color: c.text, marginTop: 6 },
    rejection:    { fontSize: 11.5, color: c.danger, marginTop: 4 },
    rowDate:      { fontSize: 10.5, color: c.textMuted, marginTop: 6 },
    statusBadge:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    statusTxt:    { fontSize: 11, fontWeight: '700' },
    outlineBtn:   { borderWidth: 1, borderColor: c.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
    warnBtn:      { borderColor: '#E65100' },
    outlineBtnTxt:{ fontSize: 11, fontWeight: '700', color: c.primary },
    empty:        { alignItems: 'center', paddingVertical: 48, gap: 10 },
    emptyTxt:     { fontSize: 14, color: c.textMuted },
    modalBackdrop:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modalBox:     { width: '100%', maxWidth: 440, backgroundColor: card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: border },
    modalTitle:   { fontSize: 17, fontWeight: '800', color: isDark ? '#fff' : c.heading, marginBottom: 8 },
    modalHint:    { fontSize: 12, color: c.textMuted, marginBottom: 12 },
    fieldLabel:   { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 6, marginTop: 8 },
    pickerRow:    { marginBottom: 4 },
    chipScroll:   { maxHeight: 44 },
    chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip:         { borderWidth: 1, borderColor: border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginRight: 6, marginBottom: 6, backgroundColor: isDark ? '#0f0f0f' : c.surfaceAlt },
    chipActive:   { backgroundColor: c.primary, borderColor: c.primary },
    chipTxt:      { fontSize: 12, fontWeight: '600', color: c.text },
    chipTxtActive:{ color: '#fff' },
    previewBox:   { backgroundColor: isDark ? '#0f0f0f' : c.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: border, padding: 14, marginTop: 10, marginBottom: 4 },
    previewLabel: { fontSize: 11, color: c.textMuted, marginBottom: 4 },
    previewAmount:{ fontSize: 24, fontWeight: '900', color: isDark ? '#fff' : c.heading },
    previewMeta:  { fontSize: 12, color: c.textMuted, marginTop: 4 },
    textArea:     { borderWidth: 1, borderColor: border, borderRadius: 10, padding: 12, minHeight: 88, textAlignVertical: 'top', color: isDark ? '#fff' : c.heading, backgroundColor: isDark ? '#0f0f0f' : c.surfaceAlt, fontSize: 14 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
    cancelBtn:    { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: border },
    cancelBtnTxt: { fontWeight: '700', color: c.textMuted },
  });
}
