import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, RefreshControl, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import client from '@/api/client';
import type { Reservation } from '@/types';

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  pending:   { color: '#d97706', bg: '#fef9ec', label: 'Pending'   },
  confirmed: { color: '#2563eb', bg: '#eff6ff', label: 'Confirmed' },
  seated:    { color: '#7c3aed', bg: '#f5f3ff', label: 'Seated'    },
  cancelled: { color: '#dc2626', bg: '#fff1f2', label: 'Cancelled' },
  no_show:   { color: '#6b7280', bg: '#f3f4f6', label: 'No Show'   },
};

export default function ReservationsScreen() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', guest_count: '2',
    reserved_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: '',
  });

  const load = useCallback(async () => {
    try {
      const res = await client.get('/reservations');
      const data = res.data?.data ?? res.data ?? [];
      setReservations(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.customer_name.trim()) { Alert.alert('Customer name required'); return; }
    setSaving(true);
    try {
      await client.post('/reservations', { ...form, guest_count: parseInt(form.guest_count, 10) || 2 });
      setShowForm(false);
      setForm({ customer_name: '', customer_phone: '', guest_count: '2', reserved_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"), notes: '' });
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  async function updateStatus(id: number, status: string) {
    try {
      await client.put(`/reservations/${id}`, { status });
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed');
    }
  }

  const filtered = activeFilter === 'all' ? reservations : reservations.filter(r => r.status === activeFilter);

  return (
    <View style={st.shell}>
      {/* Header */}
      <View style={st.topbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {(['all', 'pending', 'confirmed', 'seated', 'cancelled'] as const).map(s => {
            const cfg = s !== 'all' ? STATUS_CFG[s] : null;
            const active = activeFilter === s;
            const count = s === 'all' ? reservations.length : reservations.filter(r => r.status === s).length;
            return (
              <TouchableOpacity key={s} style={[st.filterChip, active && { backgroundColor: cfg?.color ?? '#1A2B1A', borderColor: cfg?.color ?? '#1A2B1A' }]} onPress={() => setActiveFilter(s)}>
                <Text style={[st.filterText, active && { color: '#fff' }]}>{s === 'all' ? 'All' : cfg?.label}</Text>
                <View style={[st.filterCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[st.filterCountText, active && { color: '#fff' }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity style={st.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={r => String(r.id)}
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#0f8f73" />}
        renderItem={({ item: r }) => {
          const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
          return (
            <View style={st.card}>
              <View style={st.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={st.customerName}>{r.customer_name}</Text>
                  {r.customer_phone && <Text style={st.customerPhone}>{r.customer_phone}</Text>}
                </View>
                <View style={[st.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[st.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
              <View style={st.cardMeta}>
                <View style={st.metaItem}>
                  <Ionicons name="calendar-outline" size={13} color="#6b7280" />
                  <Text style={st.metaText}>{format(new Date(r.reserved_at), 'dd MMM yyyy, hh:mm a')}</Text>
                </View>
                <View style={st.metaItem}>
                  <Ionicons name="people-outline" size={13} color="#6b7280" />
                  <Text style={st.metaText}>{r.guest_count} guests</Text>
                </View>
                {r.table_name && (
                  <View style={st.metaItem}>
                    <Ionicons name="grid-outline" size={13} color="#6b7280" />
                    <Text style={st.metaText}>{r.table_name}</Text>
                  </View>
                )}
              </View>
              {r.notes && <Text style={st.notes}>{r.notes}</Text>}
              {r.status === 'pending' && (
                <View style={st.actions}>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: '#2563eb' }]} onPress={() => updateStatus(r.id, 'confirmed')}>
                    <Text style={st.actionText}>Confirm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: '#7c3aed' }]} onPress={() => updateStatus(r.id, 'seated')}>
                    <Text style={st.actionText}>Seat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: '#ef4444' }]} onPress={() => updateStatus(r.id, 'cancelled')}>
                    <Text style={st.actionText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
              {r.status === 'confirmed' && (
                <View style={st.actions}>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: '#7c3aed', flex: 1 }]} onPress={() => updateStatus(r.id, 'seated')}>
                    <Text style={st.actionText}>Mark Seated</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: '#6b7280' }]} onPress={() => updateStatus(r.id, 'no_show')}>
                    <Text style={st.actionText}>No Show</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
            <Text style={st.emptyText}>{activeFilter === 'all' ? 'No reservations yet' : `No ${activeFilter} reservations`}</Text>
          </View>
        }
      />

      {/* Add reservation modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <View style={{ flex: 1, backgroundColor: '#f5f6f8' }}>
          <View style={st.modalHeader}>
            <Text style={st.modalTitle}>New Reservation</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
          </View>
          <ScrollView style={st.formBody} contentContainerStyle={{ gap: 14 }}>
            <View style={st.formField}>
              <Text style={st.formLabel}>Customer Name *</Text>
              <TextInput style={st.formInput} value={form.customer_name} onChangeText={v => setForm(p => ({ ...p, customer_name: v }))} placeholder="Full name" placeholderTextColor="#9ca3af" />
            </View>
            <View style={st.formField}>
              <Text style={st.formLabel}>Phone</Text>
              <TextInput style={st.formInput} value={form.customer_phone} onChangeText={v => setForm(p => ({ ...p, customer_phone: v }))} placeholder="Mobile number" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
            </View>
            <View style={st.formField}>
              <Text style={st.formLabel}>Guests</Text>
              <TextInput style={st.formInput} value={form.guest_count} onChangeText={v => setForm(p => ({ ...p, guest_count: v }))} keyboardType="number-pad" placeholderTextColor="#9ca3af" />
            </View>
            <View style={st.formField}>
              <Text style={st.formLabel}>Date & Time</Text>
              <TextInput style={st.formInput} value={form.reserved_at} onChangeText={v => setForm(p => ({ ...p, reserved_at: v }))} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor="#9ca3af" />
            </View>
            <View style={st.formField}>
              <Text style={st.formLabel}>Notes</Text>
              <TextInput style={[st.formInput, { height: 80, textAlignVertical: 'top' }]} value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} placeholder="Special requests..." multiline placeholderTextColor="#9ca3af" />
            </View>
            <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save Reservation</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  filterText: { fontSize: 12.5, fontWeight: '700', color: '#374151' },
  filterCount: { backgroundColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  filterCountText: { fontSize: 10.5, fontWeight: '700', color: '#374151' },
  addBtn: { width: 38, height: 38, backgroundColor: '#0f8f73', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12, gap: 10, paddingBottom: 30 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e5e7eb', gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  customerName: { fontSize: 15.5, fontWeight: '800', color: '#111827' },
  customerPhone: { fontSize: 12.5, color: '#6b7280', marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11.5, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12.5, color: '#374151', fontWeight: '500' },
  notes: { fontSize: 12.5, color: '#6b7280', fontStyle: 'italic', paddingTop: 4, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  actionText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  formBody: { flex: 1, padding: 16 },
  formField: { gap: 6 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  formInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  saveBtn: { backgroundColor: '#0f8f73', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
