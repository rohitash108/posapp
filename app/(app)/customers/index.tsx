import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '@/api/client';
import type { Customer } from '@/types';

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });

  const load = useCallback(async () => {
    try {
      const res = await client.get('/customers');
      const data = res.data?.data ?? res.data ?? [];
      setCustomers(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      await client.post('/customers', form);
      setShowForm(false);
      setForm({ name: '', phone: '', email: '', address: '' });
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save customer');
    } finally { setSaving(false); }
  }

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search) || (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={st.shell}>
      {/* Search + add */}
      <View style={st.topbar}>
        <View style={st.searchWrap}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput style={st.searchInput} placeholder="Search customers..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#9ca3af" /></TouchableOpacity> : null}
        </View>
        <TouchableOpacity style={st.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={st.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#0f8f73" />}
        renderItem={({ item: c }) => (
          <View style={st.card}>
            <View style={st.avatar}>
              <Text style={st.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{c.name}</Text>
              {c.phone && <Text style={st.sub}><Ionicons name="call-outline" size={11} color="#9ca3af" /> {c.phone}</Text>}
              {c.email && <Text style={st.sub}><Ionicons name="mail-outline" size={11} color="#9ca3af" /> {c.email}</Text>}
            </View>
            {c.balance != null && c.balance !== 0 && (
              <View style={[st.balanceBadge, { backgroundColor: c.balance >= 0 ? '#f0fdf4' : '#fff1f2' }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.balance >= 0 ? '#10b981' : '#ef4444' }}>
                  {c.balance >= 0 ? '+' : ''}₹{c.balance.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name="people-outline" size={40} color="#d1d5db" />
            <Text style={st.emptyText}>{search ? 'No customers found' : 'No customers yet'}</Text>
          </View>
        }
      />

      {/* Add customer modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <View style={{ flex: 1, backgroundColor: '#f5f6f8' }}>
          <View style={st.modalHeader}>
            <Text style={st.modalTitle}>New Customer</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
          </View>
          <View style={st.formBody}>
            {(['name', 'phone', 'email', 'address'] as const).map(field => (
              <View key={field} style={st.formField}>
                <Text style={st.formLabel}>{field.charAt(0).toUpperCase() + field.slice(1)}{field === 'name' ? ' *' : ''}</Text>
                <TextInput
                  style={st.formInput}
                  value={form[field]}
                  onChangeText={v => setForm(p => ({ ...p, [field]: v }))}
                  placeholder={field === 'phone' ? 'Mobile number' : field === 'email' ? 'email@example.com' : ''}
                  keyboardType={field === 'phone' ? 'phone-pad' : field === 'email' ? 'email-address' : 'default'}
                  placeholderTextColor="#9ca3af"
                  autoCapitalize={field === 'email' ? 'none' : 'words'}
                />
              </View>
            ))}
            <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save Customer</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },
  topbar: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f5f6f8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0f8f73', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  list: { padding: 12, gap: 8, paddingBottom: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0f8f73', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  balanceBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  formBody: { padding: 16, gap: 14 },
  formField: { gap: 6 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  formInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  saveBtn: { backgroundColor: '#0f8f73', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
