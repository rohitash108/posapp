/**
 * Customers Screen — exact match of CSPos Restaurant Admin
 * Columns: #, Customer (name+email), Phone, Orders, Last Order, Balance, Status, Actions
 * Actions: Receive Payment (green wallet) · Edit (yellow pencil) · Delete (red trash)
 * Grid view: card with same info + three actions
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Modal,
  RefreshControl, Alert, ActivityIndicator, useWindowDimensions,
  Pressable, Platform, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import client from '@/api/client';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { Customer } from '@/types';

// ── Design tokens ──────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';
const DUE_RED = '#dc2626';
const CRE_GRN = '#16a34a';

type ViewMode = 'list' | 'grid';
type FormData = {
  name: string; phone: string; email: string; address: string;
  date_of_birth: string; gender: string; status: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try { return format(new Date(iso), 'dd MMM, yyyy'); }
  catch { return '—'; }
}
function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
function avatarColor(name: string): string {
  const COLORS = ['#1A2B1A', '#2563eb', '#0f766e', '#7e22ce', '#c2410c', '#0369a1', '#be185d'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}
// balance < 0 → customer owes (Due); balance > 0 → customer has credit
function balanceInfo(balance?: number | null) {
  const b = balance ?? 0;
  if (b === 0) return { label: '₹0.00', color: '#9ca3af', isDue: false };
  if (b < 0)  return { label: `Due ₹${Math.abs(b).toFixed(2)}`, color: DUE_RED, isDue: true };
  return { label: `Credit ₹${b.toFixed(2)}`, color: CRE_GRN, isDue: false };
}

// ── Style factories ────────────────────────────────────────────────────────────

function mkPm(c: ThemeColors) {
  return StyleSheet.create({
    overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box:       { backgroundColor: c.surface, borderRadius: 16, width: '100%', maxWidth: 440, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
    hdr:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    hdrIcon:   { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' },
    hdrTitle:  { flex: 1, fontSize: 17, fontWeight: '800', color: c.heading },
    closeBtn:  { padding: 4 },
    info:      { backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 14, marginBottom: 18, gap: 4 },
    infoRow:   { fontSize: 13, color: c.textMuted },
    infoBold:  { fontWeight: '700', color: c.heading },
    label:     { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 6 },
    inputWrap: { borderWidth: 1.5, borderColor: c.border, borderRadius: 10, backgroundColor: c.surfaceAlt, marginBottom: 6 },
    input:     { padding: 12, fontSize: 14, color: c.heading },
    hint:      { fontSize: 11.5, color: c.textMuted, lineHeight: 16, marginTop: 2 },
    error:     { color: DUE_RED, fontSize: 12, marginTop: 10, fontWeight: '600' },
    actions:   { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: c.border },
    cancelTxt: { fontSize: 14, fontWeight: '700', color: c.textMuted },
    recordBtn: { flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: PRIMARY },
    recordTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
}

function mkFm(c: ThemeColors) {
  return StyleSheet.create({
    backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    panel:         { width: '100%', maxHeight: '90%', borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
    panelDesktop:  { width: 500, maxWidth: 500 },
    header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: c.sidebar },
    headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon:    { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,165,42,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,165,42,0.25)' },
    headerTitle:   { fontSize: 15, fontWeight: '800', color: '#fff' },
    headerSub:     { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
    closeBtn:      { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    field:         { gap: 6 },
    label:         { fontSize: 13, fontWeight: '600', color: c.text },
    inputWrap:     { borderWidth: 1.5, borderColor: c.border, borderRadius: 10, backgroundColor: c.surfaceAlt },
    textareaWrap:  { height: 80 },
    input:         { paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: c.heading, backgroundColor: 'transparent' },
    textarea:      { height: 80, paddingTop: 10 },
    segRow:        { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    segBtn:        { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceAlt },
    segBtnActive:  { borderColor: PRIMARY, backgroundColor: '#eff6ff' },
    segBtnDanger:  { borderColor: DUE_RED, backgroundColor: '#fef2f2' },
    segTxt:        { fontSize: 13, fontWeight: '600', color: c.textMuted },
    segTxtActive:  { color: PRIMARY },
    segTxtDanger:  { color: DUE_RED },
    footer:        { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    cancelBtn:     { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: c.border },
    cancelTxt:     { fontWeight: '700', color: c.text, fontSize: 14 },
    saveBtn:       { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: c.sidebar },
    saveTxt:       { fontWeight: '800', color: '#fff', fontSize: 14 },
  });
}

function mkGv(c: ThemeColors) {
  return StyleSheet.create({
    card:        { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    name:        { fontSize: 14, fontWeight: '700', color: c.heading },
    id:          { fontSize: 11, color: c.textMuted, marginTop: 1 },
    cardBody:    { padding: 12, gap: 7 },
    infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoVal:     { fontSize: 12.5, color: c.text, flex: 1 },
    cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border },
    actionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRightWidth: 1, borderRightColor: c.border },
    payBtn:      { backgroundColor: '#f0fdf4' },
    editBtn:     { backgroundColor: '#fefce8' },
    delBtn:      { backgroundColor: '#fff1f2', borderRightWidth: 0 },
    payTxt:      { fontSize: 12, fontWeight: '700', color: CRE_GRN },
    editTxt:     { fontSize: 12, fontWeight: '700', color: '#b45309' },
    delTxt:      { fontSize: 12, fontWeight: '700', color: DUE_RED },
  });
}

function mkTbl(c: ThemeColors) {
  return StyleSheet.create({
    tableWrap:  { backgroundColor: c.surface },
    headerRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border },
    th:         { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 12 },
    row:        { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border },
    rowAlt:     { backgroundColor: c.surfaceAlt },
    cell:       { fontSize: 13, color: c.text, paddingHorizontal: 12, paddingVertical: 12 },
    cId:        { width: 72 },
    cName:      { flex: 1.8, paddingHorizontal: 12 },
    cPhone:     { flex: 1.1 },
    cOrders:    { width: 76, flexDirection: 'row' },
    cLast:      { flex: 1.2 },
    cBal:       { flex: 1.1, paddingHorizontal: 12 },
    cStatus:    { flex: 0.9, paddingHorizontal: 12 },
    cAct:       { width: 116, paddingHorizontal: 10, paddingVertical: 10 },
    custName:   { fontSize: 13.5, fontWeight: '600', color: c.heading },
    custEmail:  { fontSize: 11, color: c.textMuted, marginTop: 1 },
    dash:       { fontSize: 12, color: c.border },
    actBtn:     { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    actPay:     { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
    actEdit:    { backgroundColor: '#fef9c3', borderColor: '#fef3c7' },
    actDel:     { backgroundColor: '#fff1f2', borderColor: '#fecaca' },
  });
}

function mkDc(c: ThemeColors) {
  return StyleSheet.create({
    overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    box:       { backgroundColor: c.surface, borderRadius: 16, width: '100%', maxWidth: 380, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
    iconWrap:  { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: '#fecaca' },
    title:     { fontSize: 18, fontWeight: '800', color: c.heading, marginBottom: 8 },
    message:   { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    name:      { fontWeight: '700', color: c.heading },
    actions:   { flexDirection: 'row', gap: 12, width: '100%' },
    cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, alignItems: 'center' },
    cancelTxt: { fontSize: 14, fontWeight: '600', color: c.text },
    deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: DUE_RED },
    deleteTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
}

function mkS(c: ThemeColors) {
  return StyleSheet.create({
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    headerTitle: { fontSize: 20, fontWeight: '800', color: c.heading },
    iconBtn:     { width: 30, height: 30, borderRadius: 7, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    viewToggle:  { flexDirection: 'row', borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    toggleBtn:   { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: c.surface },
    toggleActive:{ backgroundColor: PRIMARY },
    searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: c.surface, minWidth: 200 },
    searchInput: { fontSize: 13, color: c.heading, minWidth: 140 },
    addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.sidebar, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
    addBtnTxt:   { color: '#fff', fontWeight: '700', fontSize: 13 },
    loadWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyWrap:   { alignItems: 'center', paddingVertical: 80, gap: 10 },
    emptyTitle:  { fontSize: 15, fontWeight: '600', color: c.textMuted },
  });
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <View style={[av.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name) }]}>
      <Text style={[av.txt, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  txt:  { color: '#fff', fontWeight: '800' },
});

// ── Balance cell ───────────────────────────────────────────────────────────────
function BalanceCell({ balance }: { balance?: number | null }) {
  const info = balanceInfo(balance);
  return <Text style={[bl.txt, { color: info.color }]}>{info.label}</Text>;
}
const bl = StyleSheet.create({ txt: { fontSize: 13, fontWeight: '700' } });

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  const isActive = !status || status === 'active';
  return (
    <View style={[sb.wrap, !isActive && sb.wrapDis]}>
      <Text style={[sb.txt, !isActive && sb.txtDis]}>{isActive ? 'Active' : 'Disabled'}</Text>
    </View>
  );
}
const sb = StyleSheet.create({
  wrap:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', alignSelf: 'flex-start' },
  wrapDis:{ backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  txt:    { fontSize: 11, fontWeight: '700', color: CRE_GRN },
  txtDis: { color: '#9ca3af' },
});

// ── Orders badge ───────────────────────────────────────────────────────────────
function OrdersBadge({ count }: { count: number }) {
  return (
    <View style={[ob.wrap, count === 0 && ob.wrapGray]}>
      <Text style={[ob.txt, count === 0 && ob.txtGray]}>{count}</Text>
    </View>
  );
}
const ob = StyleSheet.create({
  wrap:     { minWidth: 28, height: 24, borderRadius: 6, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  wrapGray: { backgroundColor: '#f3f4f6' },
  txt:      { fontSize: 12, fontWeight: '700', color: PRIMARY },
  txtGray:  { color: '#9ca3af' },
});

// ── Receive Payment Modal ──────────────────────────────────────────────────────
function ReceivePaymentModal({
  visible, customer, onClose, onDone,
}: {
  visible: boolean; customer: Customer | null;
  onClose: () => void; onDone: (newBalance: number) => void;
}) {
  const { colors: c } = useTheme();
  const pm = useMemo(() => mkPm(c), [c]);

  const [amount, setAmount] = useState('');
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (visible) { setAmount(''); setNotes(''); setError(''); } }, [visible]);

  async function submit() {
    if (!customer) return;
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setError('Enter a valid amount greater than 0'); return; }
    setSaving(true); setError('');
    try {
      const res = await client.post(`/customers/${customer.id}/payment`, { amount: amt, notes: notes.trim() || undefined });
      onDone(res.data.balance);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to record payment');
    } finally { setSaving(false); }
  }

  if (!customer) return null;
  const info = balanceInfo(customer.balance);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pm.overlay} onPress={() => { Keyboard.dismiss(); onClose(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={pm.box} onPress={e => e.stopPropagation()}>
            <View style={pm.hdr}>
              <View style={pm.hdrIcon}><Ionicons name="wallet" size={20} color={CRE_GRN} /></View>
              <Text style={pm.hdrTitle}>Receive payment</Text>
              <Pressable style={pm.closeBtn} onPress={onClose}><Ionicons name="close" size={20} color={c.textMuted} /></Pressable>
            </View>
            <View style={pm.info}>
              <Text style={pm.infoRow}>Customer: <Text style={pm.infoBold}>{customer.name}</Text></Text>
              <Text style={pm.infoRow}>
                Current balance:{' '}
                <Text style={[pm.infoBold, { color: info.color }]}>{info.label}</Text>
              </Text>
            </View>
            <Text style={pm.label}>Amount received (₹) <Text style={{ color: DUE_RED }}>*</Text></Text>
            <View style={pm.inputWrap}>
              <TextInput style={pm.input} value={amount} onChangeText={setAmount}
                placeholder="e.g. 100" keyboardType="decimal-pad" placeholderTextColor={c.textMuted} />
            </View>
            <Text style={pm.hint}>Recording a payment reduces the amount due. E.g. due ₹500, pay ₹100 → remaining due ₹400.</Text>
            <Text style={[pm.label, { marginTop: 14 }]}>Notes (optional)</Text>
            <View style={pm.inputWrap}>
              <TextInput style={pm.input} value={notes} onChangeText={setNotes}
                placeholder="e.g. Cash payment" placeholderTextColor={c.textMuted} returnKeyType="done" onSubmitEditing={submit} />
            </View>
            {!!error && <Text style={pm.error}>{error}</Text>}
            <View style={pm.actions}>
              <Pressable style={pm.cancelBtn} onPress={onClose} disabled={saving}>
                <Text style={pm.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[pm.recordBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={pm.recordTxt}>Record payment</Text>}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Customer Form Modal ────────────────────────────────────────────────────────
function CustomerFormModal({
  visible, editing, onClose, onSaved,
}: {
  visible: boolean; editing: Customer | null;
  onClose: () => void; onSaved: () => void;
}) {
  const { colors: c } = useTheme();
  const fm = useMemo(() => mkFm(c), [c]);

  const [form, setForm] = useState<FormData>({
    name: '', phone: '', email: '', address: '', date_of_birth: '', gender: '', status: 'active',
  });
  const [saving, setSaving] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;

  useEffect(() => {
    if (visible) {
      setForm({
        name:          editing?.name          ?? '',
        phone:         editing?.phone         ?? '',
        email:         editing?.email         ?? '',
        address:       editing?.address       ?? '',
        date_of_birth: editing?.date_of_birth ?? '',
        gender:        editing?.gender        ?? '',
        status:        editing?.status        ?? 'active',
      });
    }
  }, [visible, editing]);

  function set(key: keyof FormData, val: string) { setForm(p => ({ ...p, [key]: val })); }

  async function save() {
    if (!form.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name:          form.name.trim(),
        phone:         form.phone.trim()  || null,
        email:         form.email.trim()  || null,
        address:       form.address.trim() || null,
        date_of_birth: form.date_of_birth.trim() || null,
        gender:        form.gender        || null,
        status:        form.status,
      };
      if (editing) {
        await client.patch(`/customers/${editing.id}`, payload);
      } else {
        await client.post('/customers', payload);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save customer');
    } finally { setSaving(false); }
  }

  const TEXT_FIELDS = [
    { key: 'name'          as const, label: 'Full Name *',    kb: 'default'       as const, placeholder: 'Customer name'     },
    { key: 'phone'         as const, label: 'Phone Number',   kb: 'phone-pad'     as const, placeholder: '+91 98765 43210'   },
    { key: 'email'         as const, label: 'Email Address',  kb: 'email-address' as const, placeholder: 'email@example.com' },
    { key: 'address'       as const, label: 'Address',        kb: 'default'       as const, placeholder: 'Street, City'      },
    { key: 'date_of_birth' as const, label: 'Date of Birth',  kb: 'default'       as const, placeholder: 'YYYY-MM-DD'        },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={fm.backdrop} onPress={onClose}>
        <Pressable style={[fm.panel, isDesktop && fm.panelDesktop]} onPress={() => {}}>
          {/* Header */}
          <View style={fm.header}>
            <View style={fm.headerLeft}>
              <View style={fm.headerIcon}>
                <Ionicons name={editing ? 'create-outline' : 'person-add-outline'} size={16} color={c.brand} />
              </View>
              <View>
                <Text style={fm.headerTitle}>{editing ? 'Edit Customer' : 'New Customer'}</Text>
                <Text style={fm.headerSub}>{editing ? 'Update customer details' : 'Add a new customer'}</Text>
              </View>
            </View>
            <Pressable style={({ pressed }) => [fm.closeBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled">
            {TEXT_FIELDS.map(f => (
              <View key={f.key} style={fm.field}>
                <Text style={fm.label}>{f.label}</Text>
                <View style={[fm.inputWrap, f.key === 'address' && fm.textareaWrap]}>
                  <TextInput
                    style={[fm.input, f.key === 'address' && fm.textarea]}
                    value={form[f.key]}
                    onChangeText={v => set(f.key, v)}
                    placeholder={f.placeholder}
                    keyboardType={f.kb}
                    placeholderTextColor={c.textMuted}
                    autoCapitalize={f.key === 'email' ? 'none' : 'words'}
                    multiline={f.key === 'address'}
                    numberOfLines={f.key === 'address' ? 2 : 1}
                    textAlignVertical={f.key === 'address' ? 'top' : 'center'}
                  />
                </View>
              </View>
            ))}

            {/* Gender */}
            <View style={fm.field}>
              <Text style={fm.label}>Gender</Text>
              <View style={fm.segRow}>
                {(['', 'Male', 'Female', 'Other'] as const).map(g => (
                  <Pressable
                    key={g}
                    style={[fm.segBtn, form.gender === g && fm.segBtnActive]}
                    onPress={() => set('gender', g)}
                  >
                    <Text style={[fm.segTxt, form.gender === g && fm.segTxtActive]}>
                      {g === '' ? 'Not set' : g}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Status */}
            <View style={fm.field}>
              <Text style={fm.label}>Status</Text>
              <View style={fm.segRow}>
                {(['active', 'disabled'] as const).map(st => (
                  <Pressable
                    key={st}
                    style={[fm.segBtn, form.status === st && (st === 'active' ? fm.segBtnActive : fm.segBtnDanger)]}
                    onPress={() => set('status', st)}
                  >
                    <Text style={[fm.segTxt, form.status === st && (st === 'active' ? fm.segTxtActive : fm.segTxtDanger)]}>
                      {st === 'active' ? 'Active' : 'Disabled'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={fm.footer}>
            <Pressable style={({ pressed }) => [fm.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
              <Text style={fm.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [fm.saveBtn, saving && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
              onPress={save} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveTxt}>{editing ? 'Update' : 'Save Customer'}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Customer Card (grid view) ──────────────────────────────────────────────────
function CustomerCard({
  customer: cust, index, isRegistered, onEdit, onDelete, onPay, deleting,
}: {
  customer: Customer; index: number; isRegistered: boolean;
  onEdit: () => void; onDelete: () => void; onPay: () => void; deleting: boolean;
}) {
  const { colors: c } = useTheme();
  const gv = useMemo(() => mkGv(c), [c]);

  const bal = balanceInfo(cust.balance);
  const numStr = `#${String(index + 1).padStart(4, '0')}`;
  return (
    <View style={gv.card}>
      <View style={gv.cardTop}>
        <Avatar name={cust.name} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={gv.name} numberOfLines={1}>{cust.name}</Text>
          <Text style={gv.id}>{numStr}</Text>
        </View>
        <StatusBadge status={cust.status} />
      </View>
      <View style={gv.cardBody}>
        <View style={gv.infoRow}>
          <Ionicons name="call-outline" size={12} color={c.textMuted} />
          <Text style={gv.infoVal}>{cust.phone || '—'}</Text>
        </View>
        {!!cust.email && (
          <View style={gv.infoRow}>
            <Ionicons name="mail-outline" size={12} color={c.textMuted} />
            <Text style={gv.infoVal} numberOfLines={1}>{cust.email}</Text>
          </View>
        )}
        <View style={gv.infoRow}>
          <Ionicons name="receipt-outline" size={12} color={c.textMuted} />
          <Text style={gv.infoVal}>{cust.orders_count ?? 0} orders · {fmtDate(cust.last_order_at)}</Text>
        </View>
        <View style={gv.infoRow}>
          <Ionicons name="wallet-outline" size={12} color={c.textMuted} />
          <Text style={[gv.infoVal, { color: bal.color, fontWeight: '700' }]}>{bal.label}</Text>
        </View>
      </View>
      {isRegistered ? (
        <View style={gv.cardActions}>
          <Pressable style={({ pressed }) => [gv.actionBtn, gv.payBtn, pressed && { opacity: 0.7 }]} onPress={onPay}>
            <Ionicons name="wallet-outline" size={13} color={CRE_GRN} />
            <Text style={gv.payTxt}>Pay</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [gv.actionBtn, gv.editBtn, pressed && { opacity: 0.7 }]} onPress={onEdit}>
            <Ionicons name="create-outline" size={13} color="#b45309" />
            <Text style={gv.editTxt}>Edit</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [gv.actionBtn, gv.delBtn, pressed && { opacity: 0.7 }]} onPress={onDelete}>
            {deleting ? <ActivityIndicator size={12} color={DUE_RED} /> : <Ionicons name="trash-outline" size={13} color={DUE_RED} />}
            <Text style={gv.delTxt}>Delete</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[gv.cardActions, { justifyContent: 'center', paddingVertical: 10 }]}>
          <Text style={{ fontSize: 12, color: c.textMuted }}>From orders only — not registered</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function CustomersScreen() {
  const { colors: c } = useTheme();
  const s   = useMemo(() => mkS(c), [c]);
  const tbl = useMemo(() => mkTbl(c), [c]);
  const dc  = useMemo(() => mkDc(c), [c]);

  const { width } = useWindowDimensions();
  const numCols = width >= 1400 ? 4 : width >= 1060 ? 3 : width >= 700 ? 2 : 1;

  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [search,       setSearch]       = useState('');
  const [viewMode,     setViewMode]     = useState<ViewMode>('list');
  const [showForm,     setShowForm]     = useState(false);
  const [editing,      setEditing]      = useState<Customer | null>(null);
  const [deleting,     setDeleting]     = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [payTarget,    setPayTarget]    = useState<Customer | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await client.get('/customers');
      const data = res.data?.data ?? res.data ?? [];
      setCustomers(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.trim().toLowerCase().replace(/\s/g, '');
    return customers.filter(cust =>
      cust.name.toLowerCase().replace(/\s/g, '').includes(q) ||
      (cust.phone ?? '').replace(/\s/g, '').includes(q) ||
      (cust.email ?? '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  function isReg(cust: Customer) { return cust.is_registered !== false; }

  function openAdd()                   { setEditing(null); setShowForm(true); }
  function openEdit(cust: Customer)    { if (isReg(cust) && cust.id) { setEditing(cust); setShowForm(true); } }
  function openPay(cust: Customer)     { if (isReg(cust) && cust.id) setPayTarget(cust); }
  function confirmDelete(cust: Customer) { if (isReg(cust) && cust.id) setDeleteTarget(cust); }

  async function doDelete() {
    if (!deleteTarget?.id) return;
    const id   = deleteTarget.id;
    const name = deleteTarget.name;
    setDeleting(id);
    setDeleteTarget(null);
    try {
      await client.delete(`/customers/${id}`);
      setCustomers(prev => prev.filter(x => x.id !== id));
      Toast.show({
        type: 'success',
        text1: 'Customer deleted',
        text2: `"${name}" has been removed successfully.`,
        position: 'bottom',
        visibilityTime: 3000,
      });
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Delete failed',
        text2: e?.response?.data?.message ?? 'Failed to delete customer.',
        position: 'bottom',
        visibilityTime: 4000,
      });
    } finally { setDeleting(null); }
  }

  function onPayDone(newBalance: number) {
    if (!payTarget?.id) return;
    const id = payTarget.id;
    setCustomers(prev => prev.map(cust => cust.id === id ? { ...cust, balance: newBalance } : cust));
    setPayTarget(null);
  }

  // ── Table row (list view) — uses tbl/c from closure ────────────────────────
  function TableRow({ cust, idx }: { cust: Customer; idx: number }) {
    const numStr = `#${String(idx + 1).padStart(4, '0')}`;
    return (
      <View style={[tbl.row, idx % 2 === 1 && tbl.rowAlt]}>
        <Text style={[tbl.cell, tbl.cId]}>{numStr}</Text>
        <View style={[tbl.cName, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }]}>
          <Avatar name={cust.name} size={30} />
          <View style={{ flex: 1 }}>
            <Text style={tbl.custName} numberOfLines={1}>{cust.name}</Text>
            {!!cust.email && <Text style={tbl.custEmail} numberOfLines={1}>{cust.email}</Text>}
          </View>
        </View>
        <Text style={[tbl.cell, tbl.cPhone]}>{cust.phone || '–'}</Text>
        <View style={[tbl.cOrders, { alignItems: 'center', justifyContent: 'center' }]}>
          <OrdersBadge count={cust.orders_count ?? 0} />
        </View>
        <Text style={[tbl.cell, tbl.cLast, cust.last_order_at ? { color: '#d97706', fontWeight: '500' } : { color: c.textMuted }]}>
          {fmtDate(cust.last_order_at)}
        </Text>
        <View style={[tbl.cBal, { justifyContent: 'center' }]}>
          {cust.balance != null ? <BalanceCell balance={cust.balance} /> : <Text style={tbl.dash}>–</Text>}
        </View>
        <View style={[tbl.cStatus, { justifyContent: 'center' }]}>
          <StatusBadge status={cust.status} />
        </View>
        <View style={[tbl.cAct, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
          {!isReg(cust) ? (
            <Text style={tbl.dash}>—</Text>
          ) : (
            <>
              <Pressable style={({ pressed }) => [tbl.actBtn, tbl.actPay, pressed && { opacity: 0.7 }]}
                onPress={() => openPay(cust)}>
                <Ionicons name="wallet-outline" size={14} color={CRE_GRN} />
              </Pressable>
              <Pressable style={({ pressed }) => [tbl.actBtn, tbl.actEdit, pressed && { opacity: 0.7 }]}
                onPress={() => openEdit(cust)}>
                <Ionicons name="create-outline" size={14} color="#b45309" />
              </Pressable>
              <Pressable style={({ pressed }) => [tbl.actBtn, tbl.actDel, pressed && { opacity: 0.7 }]}
                onPress={() => confirmDelete(cust)}>
                {deleting === cust.id
                  ? <ActivityIndicator size={12} color={DUE_RED} />
                  : <Ionicons name="trash-outline" size={14} color={DUE_RED} />}
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Pressable style={{ flex: 1, backgroundColor: c.background }}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={s.headerTitle}>Customer</Text>
          <Pressable style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { setRefreshing(true); load(true); }}>
            {refreshing
              ? <ActivityIndicator size="small" color={c.text} />
              : <Ionicons name="refresh-outline" size={16} color={c.text} />}
          </Pressable>
        </View>
        <View style={s.headerRight}>
          {/* Grid / List toggle */}
          <View style={s.viewToggle}>
            <Pressable style={[s.toggleBtn, viewMode === 'grid' && s.toggleActive]}
              onPress={() => setViewMode('grid')}>
              <Ionicons name="grid-outline" size={15} color={viewMode === 'grid' ? '#fff' : c.textMuted} />
            </Pressable>
            <Pressable style={[s.toggleBtn, viewMode === 'list' && s.toggleActive]}
              onPress={() => setViewMode('list')}>
              <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? '#fff' : c.textMuted} />
            </Pressable>
          </View>
          {/* Search */}
          <View style={s.searchBox}>
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or phone"
              placeholderTextColor={c.textMuted}
            />
            {search
              ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={15} color={c.textMuted} /></Pressable>
              : <Ionicons name="search-outline" size={15} color={c.textMuted} />}
          </View>
          {/* Add New */}
          <Pressable style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85 }]} onPress={openAdd}>
            <Ionicons name="add-circle-outline" size={15} color="#fff" />
            <Text style={s.addBtnTxt}>Add New</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color={c.sidebar} />
          <Text style={{ marginTop: 10, color: c.textMuted, fontSize: 13 }}>Loading customers...</Text>
        </View>
      ) : viewMode === 'list' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={c.brand} />}>
          <View style={tbl.tableWrap}>
            <View style={tbl.headerRow}>
              <Text style={[tbl.th, tbl.cId]}>#</Text>
              <Text style={[tbl.th, tbl.cName]}>Customer</Text>
              <Text style={[tbl.th, tbl.cPhone]}>Phone</Text>
              <Text style={[tbl.th, tbl.cOrders, { textAlign: 'center' }]}>Orders</Text>
              <Text style={[tbl.th, tbl.cLast]}>Last Order</Text>
              <Text style={[tbl.th, tbl.cBal]}>Balance</Text>
              <Text style={[tbl.th, tbl.cStatus]}>Status</Text>
              <Text style={[tbl.th, tbl.cAct]}>Actions</Text>
            </View>
            {filtered.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="people-outline" size={40} color={c.textMuted} />
                <Text style={s.emptyTitle}>{search ? 'No customers matched' : 'No customers yet'}</Text>
              </View>
            ) : (
              filtered.map((cust, idx) => <TableRow key={cust.id ?? `od_${idx}`} cust={cust} idx={idx} />)
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 10, flexDirection: 'row', flexWrap: 'wrap' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={c.brand} />}>
          {filtered.length === 0 ? (
            <View style={[s.emptyWrap, { flex: 1 }]}>
              <Ionicons name="people-outline" size={44} color={c.textMuted} />
              <Text style={s.emptyTitle}>{search ? 'No customers matched' : 'No customers yet'}</Text>
            </View>
          ) : (
            filtered.map((cust, idx) => {
              const cardW = Math.floor((width - 24 - 10 * (numCols - 1)) / numCols);
              return (
                <View key={cust.id ?? `od_${idx}`} style={{ width: cardW }}>
                  <CustomerCard
                    customer={cust} index={idx}
                    isRegistered={isReg(cust)}
                    onEdit={() => openEdit(cust)}
                    onDelete={() => confirmDelete(cust)}
                    onPay={() => openPay(cust)}
                    deleting={deleting === cust.id}
                  />
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Form modal */}
      <CustomerFormModal
        visible={showForm}
        editing={editing}
        onClose={() => setShowForm(false)}
        onSaved={() => load(true)}
      />

      {/* Receive payment modal */}
      <ReceivePaymentModal
        visible={!!payTarget}
        customer={payTarget}
        onClose={() => setPayTarget(null)}
        onDone={onPayDone}
      />

      {/* Delete confirmation modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={dc.overlay} onPress={() => setDeleteTarget(null)}>
          <Pressable style={dc.box} onPress={() => {}}>
            <View style={dc.iconWrap}>
              <Ionicons name="trash-outline" size={28} color={DUE_RED} />
            </View>
            <Text style={dc.title}>Delete Customer</Text>
            <Text style={dc.message}>
              Are you sure you want to delete{'\n'}
              <Text style={dc.name}>"{deleteTarget?.name}"</Text>?{'\n'}
              This cannot be undone.
            </Text>
            <View style={dc.actions}>
              <Pressable style={dc.cancelBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={dc.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={dc.deleteBtn} onPress={doDelete}>
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={dc.deleteTxt}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Pressable>
  );
}
