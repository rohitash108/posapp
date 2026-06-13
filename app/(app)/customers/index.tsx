import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, RefreshControl, Alert, ActivityIndicator,
  useWindowDimensions, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '@/api/client';
import type { Customer } from '@/types';

type ViewMode = 'grid' | 'list';
type FormData = { name: string; phone: string; email: string; address: string };

const BRAND = '#0f8f73';
const CARD_HDR = '#1B4D3E';

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

export default function CustomersScreen() {
  const { width } = useWindowDimensions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ name: '', phone: '', email: '', address: '' });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await client.get('/customers');
      const data = res.data?.data ?? res.data ?? [];
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to load customers';
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  });

  function openAdd() {
    setEditTarget(null);
    setForm({ name: '', phone: '', email: '', address: '' });
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setMenuOpenId(null);
    setEditTarget(c);
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    setSaving(true);
    try {
      if (editTarget) {
        await client.patch(`/customers/${editTarget.id}`, form);
      } else {
        await client.post('/customers', form);
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save customer');
    } finally { setSaving(false); }
  }

  function confirmDelete(c: Customer) {
    setMenuOpenId(null);
    Alert.alert(
      'Delete Customer',
      `Delete "${c.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(c.id);
            try {
              await client.delete(`/customers/${c.id}`);
              setCustomers(prev => prev.filter(x => x.id !== c.id));
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message ?? 'Failed to delete customer');
            } finally { setDeleting(null); }
          },
        },
      ]
    );
  }

  const PAD = 14;
  const GAP = 12;
  const numCols = width >= 1440 ? 4 : width >= 1100 ? 3 : width >= 760 ? 2 : 1;
  const cardWidth = Math.floor((width - PAD * 2 - GAP * (numCols - 1)) / numCols);

  const totalCustomers = customers.length;
  const withPhone = customers.filter(c => c.phone).length;
  const withOrders = customers.filter(c => (c.orders_count ?? 0) > 0).length;

  return (
    <Pressable style={s.shell} onPress={() => setMenuOpenId(null)}>
      {/* Top bar */}
      <View style={s.topbar}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput
            style={s.searchInput}
            placeholder="Search by name or phone..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#9ca3af"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={s.viewToggle}>
          <TouchableOpacity
            style={[s.toggleBtn, viewMode === 'grid' && s.toggleActive]}
            onPress={() => setViewMode('grid')}
          >
            <Ionicons name="grid-outline" size={15} color={viewMode === 'grid' ? '#fff' : '#6b7280'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, viewMode === 'list' && s.toggleActive]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? '#fff' : '#6b7280'} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Ionicons name="person-add-outline" size={16} color="#fff" />
          <Text style={s.addBtnTxt}>Add Customer</Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={s.statsBar}>
        <StatChip icon="people-outline" label="Total Customers" value={totalCustomers} color="#0f8f73" />
        <View style={s.statDivider} />
        <StatChip icon="call-outline" label="With Phone" value={withPhone} color="#3b82f6" />
        <View style={s.statDivider} />
        <StatChip icon="receipt-outline" label="Have Orders" value={withOrders} color="#f59e0b" />
      </View>

      {/* Error banner */}
      {error ? (
        <View style={s.errBanner}>
          <Ionicons name="alert-circle" size={14} color="#ef4444" />
          <Text style={s.errText}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={s.retryBtn}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Loading */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={BRAND} />
          <Text style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>Loading customers...</Text>
        </View>
      ) : viewMode === 'grid' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: PAD, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); }} tintColor={BRAND} />
          }
        >
          {filtered.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="people-outline" size={48} color="#d1d5db" />
              <Text style={s.emptyTitle}>{search ? 'No customers matched' : 'No customers yet'}</Text>
              <Text style={s.emptySub}>{search ? 'Try a different search term' : 'Add your first customer to get started'}</Text>
              {!search && (
                <TouchableOpacity style={s.emptyAddBtn} onPress={openAdd}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add Customer</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : filtered.map(c => (
            <CustomerCard
              key={c.id}
              customer={c}
              width={cardWidth}
              menuOpen={menuOpenId === c.id}
              onMenuToggle={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
              onEdit={() => openEdit(c)}
              onDelete={() => confirmDelete(c)}
              deleting={deleting === c.id}
            />
          ))}
        </ScrollView>
      ) : (
        /* List / Table view */
        <ScrollView
          style={{ flex: 1 }}
          horizontal={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); }} tintColor={BRAND} />
          }
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.table}>
              {/* Header */}
              <View style={[s.tRow, s.tHead]}>
                <Text style={[s.tCell, s.cId]}>  #</Text>
                <Text style={[s.tCell, s.cName]}>Customer</Text>
                <Text style={[s.tCell, s.cPhone]}>Phone</Text>
                <Text style={[s.tCell, s.cOrders]}>Orders</Text>
                <Text style={[s.tCell, s.cLast]}>Last Order</Text>
                <Text style={[s.tCell, s.cBal]}>Balance</Text>
                <Text style={[s.tCell, s.cStatus]}>Status</Text>
                <Text style={[s.tCell, s.cAct]}>Actions</Text>
              </View>
              {filtered.length === 0 ? (
                <View style={[s.emptyWrap, { width: 900 }]}>
                  <Text style={s.emptyTitle}>{search ? 'No customers matched' : 'No customers yet'}</Text>
                </View>
              ) : filtered.map((c, idx) => (
                <View key={c.id} style={[s.tRow, idx % 2 === 1 && s.tRowAlt]}>
                  <Text style={[s.tCell, s.cId, { color: '#9ca3af', fontSize: 12 }]}>
                    #{String(c.id).padStart(4, '0')}
                  </Text>
                  <View style={[s.cName, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }]}>
                    <View style={s.avatarSm}>
                      <Text style={s.avatarSmTxt}>{initials(c.name)}</Text>
                    </View>
                    <View>
                      <Text style={s.listName}>{c.name}</Text>
                      {c.email ? <Text style={s.listSub}>{c.email}</Text> : null}
                    </View>
                  </View>
                  <Text style={[s.tCell, s.cPhone]}>{c.phone ?? '—'}</Text>
                  <Text style={[s.tCell, s.cOrders, { fontWeight: '700', color: '#111827' }]}>{c.orders_count ?? 0}</Text>
                  <Text style={[s.tCell, s.cLast, { color: '#6b7280' }]}>{timeAgo(c.last_order_at)}</Text>
                  <Text style={[s.tCell, s.cBal, {
                    fontWeight: '700',
                    color: (c.balance ?? 0) >= 0 ? '#059669' : '#dc2626',
                  }]}>
                    ₹{(c.balance ?? 0).toFixed(2)}
                  </Text>
                  <View style={[s.cStatus, { justifyContent: 'center' }]}>
                    <View style={s.activeBadge}>
                      <View style={s.activeDot} />
                      <Text style={s.activeTxt}>Active</Text>
                    </View>
                  </View>
                  <View style={[s.cAct, { flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
                    <TouchableOpacity style={s.actBtn} onPress={() => openEdit(c)}>
                      <Ionicons name="create-outline" size={14} color="#374151" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actBtn, { backgroundColor: '#fff1f2', borderColor: '#fecaca' }]}
                      onPress={() => confirmDelete(c)}
                    >
                      {deleting === c.id
                        ? <ActivityIndicator size={12} color="#dc2626" />
                        : <Ionicons name="trash-outline" size={14} color="#dc2626" />}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* Add / Edit Modal */}
      <Modal visible={showForm} animationType="fade" transparent onRequestClose={() => setShowForm(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowForm(false)} />
          <View style={s.modalBox}>
            <View style={s.modalHdr}>
              <View style={s.modalTitleRow}>
                <View style={s.modalIcon}>
                  <Ionicons name={editTarget ? 'create-outline' : 'person-add-outline'} size={18} color="#fff" />
                </View>
                <Text style={s.modalTitle}>{editTarget ? 'Edit Customer' : 'New Customer'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowForm(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              {([
                { key: 'name', label: 'Full Name', required: true, kb: 'default' as const, placeholder: 'Customer name' },
                { key: 'phone', label: 'Phone Number', required: false, kb: 'phone-pad' as const, placeholder: '+91 98765 43210' },
                { key: 'email', label: 'Email Address', required: false, kb: 'email-address' as const, placeholder: 'email@example.com' },
                { key: 'address', label: 'Address', required: false, kb: 'default' as const, placeholder: 'Street, City' },
              ] as const).map(f => (
                <View key={f.key} style={s.fField}>
                  <Text style={s.fLabel}>{f.label}{f.required ? <Text style={{ color: '#dc2626' }}> *</Text> : ''}</Text>
                  <TextInput
                    style={s.fInput}
                    value={form[f.key]}
                    onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                    placeholder={f.placeholder}
                    keyboardType={f.kb}
                    placeholderTextColor="#9ca3af"
                    autoCapitalize={f.key === 'email' ? 'none' : 'words'}
                    multiline={f.key === 'address'}
                    numberOfLines={f.key === 'address' ? 2 : 1}
                  />
                </View>
              ))}
              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}>
                  <Text style={s.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveTxt}>{editTarget ? 'Update' : 'Save Customer'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Pressable>
  );
}

/* ─── CustomerCard ─────────────────────────────────────────────────────────── */

interface CardProps {
  customer: Customer;
  width: number;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function CustomerCard({ customer: c, width, menuOpen, onMenuToggle, onEdit, onDelete, deleting }: CardProps) {
  const bal = c.balance ?? 0;
  return (
    <View style={[s.card, { width }]}>
      {/* Card header */}
      <View style={s.cardHdr}>
        <View style={s.cardAvatar}>
          <Text style={s.cardAvatarTxt}>{initials(c.name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.cardName} numberOfLines={1}>{c.name}</Text>
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
            <View style={s.ordBadge}>
              <Text style={s.ordBadgeTxt}>{c.orders_count ?? 0} orders</Text>
            </View>
            <View style={s.idBadge}>
              <Text style={s.idBadgeTxt}>#{String(c.id).padStart(4, '0')}</Text>
            </View>
          </View>
        </View>
        {/* 3-dot menu */}
        <TouchableOpacity style={s.menuBtn} onPress={onMenuToggle} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={16} color="#a7f3d0" />
        </TouchableOpacity>
        {menuOpen && (
          <View style={s.dropdown}>
            <TouchableOpacity style={s.ddItem} onPress={onEdit}>
              <Ionicons name="create-outline" size={14} color="#374151" />
              <Text style={s.ddTxt}>Edit</Text>
            </TouchableOpacity>
            <View style={s.ddDivider} />
            <TouchableOpacity style={s.ddItem} onPress={onDelete}>
              {deleting
                ? <ActivityIndicator size={12} color="#dc2626" />
                : <Ionicons name="trash-outline" size={14} color="#dc2626" />}
              <Text style={[s.ddTxt, { color: '#dc2626' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Info rows */}
      <View style={s.cardBody}>
        <InfoRow icon="call-outline" label="Phone" value={c.phone ?? '—'} />
        <InfoRow icon="time-outline" label="Last Order" value={timeAgo(c.last_order_at)} />
        <InfoRow
          icon="wallet-outline"
          label="Balance"
          value={`₹${bal.toFixed(2)}`}
          valueStyle={{ color: bal >= 0 ? '#059669' : '#dc2626', fontWeight: '700' }}
        />
      </View>

      {/* Footer */}
      <View style={s.cardFooter}>
        <View style={s.activeBadge}>
          <View style={s.activeDot} />
          <Text style={s.activeTxt}>Active</Text>
        </View>
      </View>
    </View>
  );
}

function InfoRow({
  icon, label, value, valueStyle,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={12} color="#9ca3af" />
      <Text style={s.infoLbl}>{label}</Text>
      <Text style={[s.infoVal, valueStyle]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function StatChip({ icon, label, value, color }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={s.statChip}>
      <View style={[s.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View>
        <Text style={[s.statVal, { color }]}>{value}</Text>
        <Text style={s.statLbl}>{label}</Text>
      </View>
    </View>
  );
}

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Top bar */
  topbar: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f5f6f8', borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  searchInput: { flex: 1, fontSize: 13.5, color: '#111827' },
  viewToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  toggleActive: { backgroundColor: BRAND },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: BRAND, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13.5 },

  /* Stats bar */
  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    paddingHorizontal: 20, paddingVertical: 10, gap: 0,
  },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingVertical: 4 },
  statIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statVal: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statLbl: { fontSize: 11.5, color: '#6b7280', marginTop: 1 },
  statDivider: { width: 1, height: 36, backgroundColor: '#e5e7eb', marginHorizontal: 16 },

  /* Error banner */
  errBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderBottomWidth: 1, borderBottomColor: '#fecaca',
    paddingHorizontal: 14, paddingVertical: 9,
  },
  errText: { flex: 1, fontSize: 12.5, color: '#dc2626' },
  retryBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: '#dc2626' },
  retryTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },

  /* Empty state */
  emptyWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9ca3af' },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: BRAND, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10,
  },

  /* Customer card */
  card: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHdr: {
    backgroundColor: CARD_HDR,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 12,
    position: 'relative',
  },
  cardAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  cardAvatarTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
  cardName: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  ordBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
  },
  ordBadgeTxt: { fontSize: 11, color: '#d1fae5', fontWeight: '600' },
  idBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
  },
  idBadgeTxt: { fontSize: 11, color: '#a7f3d0', fontWeight: '600' },
  menuBtn: { padding: 4 },
  dropdown: {
    position: 'absolute', top: 50, right: 8, zIndex: 100,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    width: 140,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ddItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
  ddTxt: { fontSize: 13.5, color: '#374151', fontWeight: '500' },
  ddDivider: { height: 1, backgroundColor: '#f3f4f6' },

  /* Card body */
  cardBody: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoLbl: { fontSize: 12, color: '#9ca3af', width: 75 },
  infoVal: { flex: 1, fontSize: 12.5, color: '#374151' },

  /* Card footer */
  cardFooter: {
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: '#f0fdf4', borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  activeTxt: { fontSize: 11.5, fontWeight: '700', color: '#059669' },

  /* List / Table */
  table: { minWidth: 900 },
  tRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tHead: { backgroundColor: '#f9fafb', borderBottomColor: '#e5e7eb' },
  tRowAlt: { backgroundColor: '#fafafa' },
  tCell: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: '#374151' },
  cId: { width: 80 },
  cName: { width: 220 },
  cPhone: { width: 140 },
  cOrders: { width: 90, textAlign: 'center' },
  cLast: { width: 130 },
  cBal: { width: 110, textAlign: 'right' },
  cStatus: { width: 100 },
  cAct: { width: 100 },
  avatarSm: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center',
  },
  avatarSmTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  listName: { fontSize: 13.5, fontWeight: '600', color: '#111827' },
  listSub: { fontSize: 11.5, color: '#9ca3af', marginTop: 1 },
  actBtn: {
    width: 30, height: 30, borderRadius: 7, borderWidth: 1, borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center',
  },

  /* Modal */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  modalHdr: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f5f6f8', alignItems: 'center', justifyContent: 'center' },
  modalBody: { padding: 20, gap: 14 },
  fField: { gap: 6 },
  fLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  fInput: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14.5, color: '#111827',
  },
  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  cancelTxt: { fontSize: 14.5, fontWeight: '600', color: '#374151' },
  saveBtn: { flex: 2, backgroundColor: BRAND, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
});
