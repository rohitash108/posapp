/**
 * Customers Screen — CSPos Restaurant Admin (exact match)
 * Table (list) view default · Grid view option
 * Columns: #, Customer, Phone, Orders, Last Order, Balance, Status, Actions
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Modal,
  RefreshControl, Alert, ActivityIndicator, useWindowDimensions,
  Pressable, FlatList, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import client from '@/api/client';
import type { Customer } from '@/types';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

type ViewMode = 'list' | 'grid';
type FormData = { name: string; phone: string; email: string; address: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtLastOrder(iso?: string | null): string {
  if (!iso) return '—';
  try { return format(new Date(iso), 'dd MMM, yyyy'); }
  catch { return '—'; }
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function avatarColor(name: string): string {
  const COLORS = ['#1A2B1A', '#2563eb', '#0f766e', '#7e22ce', '#c2410c', '#0369a1', '#be185d'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const bg = avatarColor(name);
  return (
    <View style={[av.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[av.txt, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  txt:  { color: '#fff', fontWeight: '800' },
});

// ── Orders badge ──────────────────────────────────────────────────────────────
function OrdersBadge({ count }: { count: number }) {
  return (
    <View style={[ob.wrap, count === 0 && ob.wrapGray]}>
      <Text style={[ob.txt, count === 0 && ob.txtGray]}>{count}</Text>
    </View>
  );
}
const ob = StyleSheet.create({
  wrap:     { minWidth: 28, height: 24, borderRadius: 6, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  wrapGray: { backgroundColor: '#f3f4f6' },
  txt:      { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  txtGray:  { color: '#9ca3af' },
});

// ── Balance cell ──────────────────────────────────────────────────────────────
function BalanceCell({ balance }: { balance?: number | null }) {
  if (balance == null) return <Text style={bl.dash}>–</Text>;
  if (balance === 0)   return <Text style={bl.zero}>₹0.00</Text>;
  if (balance > 0)     return <Text style={bl.due}>Due ₹{balance.toFixed(2)}</Text>;
  // credit (negative means restaurant owes customer)
  return <Text style={bl.credit}>₹{Math.abs(balance).toFixed(2)}</Text>;
}
const bl = StyleSheet.create({
  dash:   { fontSize: 13, color: '#9ca3af' },
  zero:   { fontSize: 13, fontWeight: '600', color: '#16a34a' },
  due:    { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  credit: { fontSize: 13, fontWeight: '600', color: '#16a34a' },
});

// ── Customer Form Modal ───────────────────────────────────────────────────────
function CustomerFormModal({
  visible, editing, onClose, onSaved,
}: {
  visible: boolean;
  editing: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormData>({ name: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;

  useEffect(() => {
    if (visible) {
      setForm({
        name:    editing?.name    ?? '',
        phone:   editing?.phone   ?? '',
        email:   editing?.email   ?? '',
        address: editing?.address ?? '',
      });
    }
  }, [visible, editing]);

  async function save() {
    if (!form.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await client.patch(`/customers/${editing.id}`, form);
      } else {
        await client.post('/customers', form);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save customer');
    } finally { setSaving(false); }
  }

  const FIELDS = [
    { key: 'name'    as const, label: 'Full Name *',      kb: 'default'       as const, placeholder: 'Customer name'       },
    { key: 'phone'   as const, label: 'Phone Number',     kb: 'phone-pad'     as const, placeholder: '+91 98765 43210'     },
    { key: 'email'   as const, label: 'Email Address',    kb: 'email-address' as const, placeholder: 'email@example.com'   },
    { key: 'address' as const, label: 'Address',          kb: 'default'       as const, placeholder: 'Street, City'        },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={fm.backdrop} onPress={onClose}>
        <Pressable style={[fm.panel, isDesktop && fm.panelDesktop]} onPress={() => {}}>
          {/* Header */}
          <View style={fm.header}>
            <View style={fm.headerLeft}>
              <View style={fm.headerIcon}>
                <Ionicons name={editing ? 'create-outline' : 'person-add-outline'} size={16} color={GOLD} />
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
            {FIELDS.map(f => (
              <View key={f.key} style={fm.field}>
                <Text style={fm.label}>{f.label}</Text>
                <TextInput
                  style={[fm.input, f.key === 'address' && fm.textarea]}
                  value={form[f.key]}
                  onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                  placeholder={f.placeholder}
                  keyboardType={f.kb}
                  placeholderTextColor="#9ca3af"
                  autoCapitalize={f.key === 'email' ? 'none' : 'words'}
                  multiline={f.key === 'address'}
                  numberOfLines={f.key === 'address' ? 2 : 1}
                  textAlignVertical={f.key === 'address' ? 'top' : 'center'}
                />
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={fm.footer}>
            <Pressable style={({ pressed }) => [fm.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
              <Text style={fm.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [fm.saveBtn, saving && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
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

const fm = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel:        { width: '100%', maxHeight: '90%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
  panelDesktop: { width: 480, maxWidth: 480 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: FOREST },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon:   { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,165,42,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,165,42,0.25)' },
  headerTitle:  { fontSize: 15, fontWeight: '800', color: '#fff' },
  headerSub:    { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  closeBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  field:        { gap: 6 },
  label:        { fontSize: 13, fontWeight: '600', color: '#374151' },
  input:        { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#111827' },
  textarea:     { height: 70, paddingTop: 10 },
  footer:       { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fff' },
  cancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  cancelTxt:    { fontWeight: '700', color: '#374151', fontSize: 14 },
  saveBtn:      { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: FOREST },
  saveTxt:      { fontWeight: '800', color: '#fff', fontSize: 14 },
});

// ── Customer Card (grid view) ─────────────────────────────────────────────────
function CustomerCard({
  customer: c, onEdit, onDelete, deleting,
}: {
  customer: Customer; onEdit: () => void; onDelete: () => void; deleting: boolean;
}) {
  const bal = c.balance ?? 0;
  return (
    <View style={gv.card}>
      <View style={gv.cardTop}>
        <Avatar name={c.name} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={gv.name} numberOfLines={1}>{c.name}</Text>
          <Text style={gv.id}>#{String(c.customer_number ?? c.id).padStart(4, '0')}</Text>
        </View>
        <View style={[gv.statusBadge]}>
          <Text style={gv.statusTxt}>Active</Text>
        </View>
      </View>
      <View style={gv.cardBody}>
        <View style={gv.infoRow}>
          <Ionicons name="call-outline" size={12} color="#9ca3af" />
          <Text style={gv.infoVal}>{c.phone || '—'}</Text>
        </View>
        <View style={gv.infoRow}>
          <Ionicons name="receipt-outline" size={12} color="#9ca3af" />
          <Text style={gv.infoVal}>{c.orders_count ?? 0} orders · {fmtLastOrder(c.last_order_at)}</Text>
        </View>
        <View style={gv.infoRow}>
          <Ionicons name="wallet-outline" size={12} color="#9ca3af" />
          <BalanceCell balance={c.balance} />
        </View>
      </View>
      <View style={gv.cardActions}>
        <Pressable style={({ pressed }) => [gv.actionBtn, pressed && { opacity: 0.7 }]} onPress={onEdit}>
          <Ionicons name="create-outline" size={14} color={FOREST} />
          <Text style={gv.actionTxt}>Edit</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [gv.actionBtn, gv.deleteBtn, pressed && { opacity: 0.7 }]} onPress={onDelete}>
          {deleting ? <ActivityIndicator size={12} color="#dc2626" /> : <Ionicons name="trash-outline" size={14} color="#dc2626" />}
          <Text style={gv.deleteTxt}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const gv = StyleSheet.create({
  card:        { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  name:        { fontSize: 14, fontWeight: '700', color: '#111827' },
  id:          { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  statusTxt:   { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  cardBody:    { padding: 12, gap: 7 },
  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoVal:     { fontSize: 12.5, color: '#374151' },
  cardActions: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  actionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  actionTxt:   { fontSize: 12, fontWeight: '700', color: FOREST },
  deleteBtn:   { borderColor: '#fecaca', backgroundColor: '#fff1f2' },
  deleteTxt:   { fontSize: 12, fontWeight: '700', color: '#dc2626' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function CustomersScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;
  const numCols   = width >= 1400 ? 4 : width >= 1060 ? 3 : width >= 700 ? 2 : 1;

  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [viewMode,   setViewMode]   = useState<ViewMode>('list');
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState<Customer | null>(null);
  const [deleting,   setDeleting]   = useState<number | null>(null);

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
    const q = search.trim().toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  function openAdd()          { setEditing(null);  setShowForm(true); }
  function openEdit(c: Customer) { setEditing(c);  setShowForm(true); }

  function confirmDelete(c: Customer) {
    const doDelete = async () => {
      setDeleting(c.id);
      try {
        await client.delete(`/customers/${c.id}`);
        setCustomers(prev => prev.filter(x => x.id !== c.id));
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.message ?? 'Failed to delete');
      } finally { setDeleting(null); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${c.name}"? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert('Delete Customer', `Delete "${c.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  // ── Table row (list view) ─────────────────────────────────────────────────
  function TableRow({ c, idx }: { c: Customer; idx: number }) {
    const isWalkin = c.name.toLowerCase() === 'walk-in' || c.id === 1;
    const numStr   = `#${String(c.customer_number ?? c.id).padStart(4, '0')}`;
    return (
      <View style={[tbl.row, idx % 2 === 1 && tbl.rowAlt]}>
        {/* # */}
        <Text style={[tbl.cell, tbl.cId]}>{numStr}</Text>
        {/* Customer */}
        <View style={[tbl.cName, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }]}>
          <Avatar name={c.name} size={30} />
          <Text style={tbl.custName} numberOfLines={1}>{c.name}</Text>
        </View>
        {/* Phone */}
        <Text style={[tbl.cell, tbl.cPhone]}>{c.phone || '–'}</Text>
        {/* Orders */}
        <View style={[tbl.cOrders, { alignItems: 'center', justifyContent: 'center' }]}>
          <OrdersBadge count={c.orders_count ?? 0} />
        </View>
        {/* Last Order */}
        <Text style={[tbl.cell, tbl.cLast, { color: '#d97706', fontWeight: '500' }]}>
          {fmtLastOrder(c.last_order_at)}
        </Text>
        {/* Balance */}
        <View style={[tbl.cBal, { justifyContent: 'center' }]}>
          <BalanceCell balance={c.balance} />
        </View>
        {/* Status */}
        <View style={[tbl.cStatus, { justifyContent: 'center' }]}>
          <Text style={tbl.activeTxt}>Active</Text>
        </View>
        {/* Actions */}
        <View style={[tbl.cAct, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          {isWalkin ? (
            <Text style={{ color: '#d1d5db', fontSize: 16 }}>—</Text>
          ) : (
            <>
              <Pressable style={({ pressed }) => [tbl.actionBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="document-text-outline" size={14} color="#16a34a" />
              </Pressable>
              <Pressable style={({ pressed }) => [tbl.actionBtn, pressed && { opacity: 0.7 }]}
                onPress={() => openEdit(c)}>
                <Ionicons name="create-outline" size={14} color={GOLD} />
              </Pressable>
              <Pressable style={({ pressed }) => [tbl.actionBtn, tbl.deleteBtn, pressed && { opacity: 0.7 }]}
                onPress={() => confirmDelete(c)}>
                {deleting === c.id
                  ? <ActivityIndicator size={12} color="#dc2626" />
                  : <Ionicons name="trash-outline" size={14} color="#dc2626" />}
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Pressable style={{ flex: 1, backgroundColor: '#f4f6f9' }}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={s.headerTitle}>Customer</Text>
          <Pressable style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { setRefreshing(true); load(true); }}>
            {refreshing
              ? <ActivityIndicator size="small" color="#374151" />
              : <Ionicons name="refresh-outline" size={16} color="#374151" />}
          </Pressable>
        </View>

        <View style={s.headerRight}>
          {/* Grid / List toggle */}
          <View style={s.viewToggle}>
            <Pressable style={[s.toggleBtn, viewMode === 'grid' && s.toggleActive]}
              onPress={() => setViewMode('grid')}>
              <Ionicons name="grid-outline" size={15} color={viewMode === 'grid' ? '#fff' : '#6b7280'} />
            </Pressable>
            <Pressable style={[s.toggleBtn, viewMode === 'list' && s.toggleActive]}
              onPress={() => setViewMode('list')}>
              <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? '#fff' : '#6b7280'} />
            </Pressable>
          </View>

          {/* Search */}
          <View style={s.searchBox}>
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or phone"
              placeholderTextColor="#9ca3af"
            />
            {search
              ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={15} color="#9ca3af" /></Pressable>
              : <Ionicons name="search-outline" size={15} color="#9ca3af" />}
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
          <ActivityIndicator size="large" color={FOREST} />
          <Text style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>Loading customers...</Text>
        </View>
      ) : viewMode === 'list' ? (
        /* ── TABLE VIEW ── */
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={FOREST} />}>
          <View style={tbl.tableWrap}>
            {/* Table header */}
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
            {/* Rows */}
            {filtered.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="people-outline" size={40} color="#d1d5db" />
                <Text style={s.emptyTitle}>{search ? 'No customers matched' : 'No customers yet'}</Text>
              </View>
            ) : (
              filtered.map((c, idx) => <TableRow key={c.id} c={c} idx={idx} />)
            )}
          </View>
        </ScrollView>
      ) : (
        /* ── GRID VIEW ── */
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 10, flexDirection: 'row', flexWrap: 'wrap' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={FOREST} />}>
          {filtered.length === 0 ? (
            <View style={[s.emptyWrap, { flex: 1 }]}>
              <Ionicons name="people-outline" size={44} color="#d1d5db" />
              <Text style={s.emptyTitle}>{search ? 'No customers matched' : 'No customers yet'}</Text>
              {!search && (
                <Pressable style={({ pressed }) => [s.addBtn, { marginTop: 8 }, pressed && { opacity: 0.85 }]} onPress={openAdd}>
                  <Ionicons name="add" size={15} color="#fff" />
                  <Text style={s.addBtnTxt}>Add Customer</Text>
                </Pressable>
              )}
            </View>
          ) : (
            filtered.map(c => {
              const cardW = Math.floor((width - 24 - 10 * (numCols - 1)) / numCols);
              return (
                <View key={c.id} style={{ width: cardW }}>
                  <CustomerCard customer={c}
                    onEdit={() => openEdit(c)}
                    onDelete={() => confirmDelete(c)}
                    deleting={deleting === c.id} />
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
    </Pressable>
  );
}

// ── Table styles ──────────────────────────────────────────────────────────────
const tbl = StyleSheet.create({
  tableWrap: { backgroundColor: '#fff', marginHorizontal: 0, borderTopWidth: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  th:        { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 12 },
  row:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowAlt:    { backgroundColor: '#fafafa' },
  cell:      { fontSize: 13, color: '#374151', paddingHorizontal: 12, paddingVertical: 12 },
  cId:       { width: 80 },
  cName:     { flex: 1.8, paddingHorizontal: 12 },
  cPhone:    { flex: 1.2 },
  cOrders:   { width: 80, flexDirection: 'row' },
  cLast:     { flex: 1.2 },
  cBal:      { flex: 1.1, paddingHorizontal: 12 },
  cStatus:   { flex: 0.8, paddingHorizontal: 12 },
  cAct:      { width: 110, paddingHorizontal: 12, paddingVertical: 10 },

  custName:  { fontSize: 13.5, fontWeight: '600', color: '#111827' },
  activeTxt: { fontSize: 13, fontWeight: '600', color: '#16a34a' },

  actionBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { backgroundColor: '#fff1f2', borderColor: '#fecaca' },
});

// ── Header / shell styles ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  iconBtn:     { width: 30, height: 30, borderRadius: 7, backgroundColor: '#f5f6f8', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  viewToggle:  { flexDirection: 'row', borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  toggleBtn:   { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#fff' },
  toggleActive:{ backgroundColor: PRIMARY },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff', minWidth: 200 },
  searchInput: { fontSize: 13, color: '#111827', minWidth: 140 },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: FOREST, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnTxt:   { color: '#fff', fontWeight: '700', fontSize: 13 },

  loadWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingVertical: 80, gap: 10 },
  emptyTitle:{ fontSize: 15, fontWeight: '600', color: '#9ca3af' },
});
