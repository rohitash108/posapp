import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator, RefreshControl, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { inventoryApi } from '@/api/inventory';
import type { InventoryItem } from '@/types';

function AddMovementModal({ item, onSave, onClose }: { item: InventoryItem; onSave: () => void; onClose: () => void }) {
  const [type, setType]       = useState<'in' | 'out' | 'adjustment'>('in');
  const [qty, setQty]         = useState('');
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function save() {
    if (!qty || isNaN(Number(qty)) || Number(qty) <= 0) { setError('Enter valid quantity'); return; }
    setLoading(true); setError('');
    try {
      await inventoryApi.addMovement(item.id, { type, quantity: Number(qty), notes: note });
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  }

  const TYPES = [
    { value: 'in',         label: 'Stock In',    color: '#16a34a', icon: 'add-circle-outline' },
    { value: 'out',        label: 'Stock Out',   color: '#dc2626', icon: 'remove-circle-outline' },
    { value: 'adjustment', label: 'Adjustment',  color: '#d97706', icon: 'swap-horizontal-outline' },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={f.header}>
        <View>
          <Text style={f.title}>Add Movement</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.item_name} • Current: {item.quantity} {item.unit}</Text>
        </View>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
      </View>
      <View style={{ padding: 16, gap: 16 }}>
        <View>
          <Text style={f.label}>Movement Type</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {TYPES.map(t => (
              <TouchableOpacity key={t.value} style={[f.typeChip, type === t.value && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setType(t.value)}>
                <Ionicons name={t.icon as any} size={14} color={type === t.value ? '#fff' : t.color} />
                <Text style={[f.typeText, type === t.value && { color: '#fff', fontWeight: '800' }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View>
          <Text style={f.label}>Quantity *</Text>
          <TextInput style={f.input} value={qty} onChangeText={setQty} placeholder="0" placeholderTextColor="#9ca3af" keyboardType="numeric" />
        </View>
        <View>
          <Text style={f.label}>Note</Text>
          <TextInput style={[f.input, { height: 70, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder="Optional note..." placeholderTextColor="#9ca3af" multiline />
        </View>
        {!!error && <Text style={{ color: '#dc2626', fontSize: 12.5, fontWeight: '600' }}>{error}</Text>}
      </View>
      <View style={f.footer}>
        <TouchableOpacity style={f.cancelBtn} onPress={onClose}><Text style={f.cancelText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={f.saveBtn} onPress={save} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={f.saveText}>Save Movement</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function InventoryScreen() {
  const [items, setItems]           = useState<InventoryItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<'all' | 'low' | 'out'>('all');
  const [movItem, setMovItem]       = useState<InventoryItem | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await inventoryApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    if (filter === 'low') return i.quantity > 0 && i.quantity <= (i.min_quantity ?? 10);
    if (filter === 'out') return i.quantity <= 0;
    if (search) return i.item_name.toLowerCase().includes(search.toLowerCase());
    return true;
  }).filter(i => !search || i.item_name.toLowerCase().includes(search.toLowerCase()));

  const lowCount = items.filter(i => i.quantity > 0 && i.quantity <= (i.min_quantity ?? 10)).length;
  const outCount = items.filter(i => i.quantity <= 0).length;

  function getStockStatus(item: InventoryItem) {
    if (item.quantity <= 0) return { label: 'Out of Stock', color: '#dc2626', bg: '#fef2f2' };
    if (item.quantity <= (item.min_quantity ?? 10)) return { label: 'Low Stock', color: '#d97706', bg: '#fef9ec' };
    return { label: 'In Stock', color: '#16a34a', bg: '#f0fdf4' };
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      {/* Alert bar */}
      {(lowCount > 0 || outCount > 0) && (
        <View style={s.alertBar}>
          {outCount > 0 && (
            <View style={s.alertItem}><Ionicons name="alert-circle" size={14} color="#dc2626" /><Text style={[s.alertText, { color: '#dc2626' }]}>{outCount} out of stock</Text></View>
          )}
          {lowCount > 0 && (
            <View style={s.alertItem}><Ionicons name="warning-outline" size={14} color="#d97706" /><Text style={[s.alertText, { color: '#d97706' }]}>{lowCount} running low</Text></View>
          )}
        </View>
      )}
      <View style={s.topBar}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search inventory..." placeholderTextColor="#9ca3af" />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#9ca3af" /></TouchableOpacity> : null}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
        {([['all', 'All', items.length, '#1A2B1A'], ['low', 'Low Stock', lowCount, '#d97706'], ['out', 'Out of Stock', outCount, '#dc2626']] as const).map(([f2, label, cnt, color]) => (
          <TouchableOpacity key={f2} style={[s.filterChip, filter === f2 && { backgroundColor: color, borderColor: color }]} onPress={() => setFilter(f2)}>
            <Text style={[s.filterText, filter === f2 && { color: '#fff', fontWeight: '700' }]}>{label}</Text>
            <View style={[s.badge, filter === f2 && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={[s.badgeText, filter === f2 && { color: '#fff' }]}>{cnt}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#C9A52A" size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 10, paddingBottom: 32, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#C9A52A" />}
          renderItem={({ item }) => {
            const st = getStockStatus(item);
            const pct = item.min_quantity ? Math.min(100, (item.quantity / (item.min_quantity * 3)) * 100) : 80;
            return (
              <View style={[s.card, { borderLeftColor: st.color }]}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>{item.item_name}</Text>
                    {item.category_name && <Text style={s.catName}>{item.category_name}</Text>}
                  </View>
                  <View style={[s.statusChip, { backgroundColor: st.bg }]}>
                    <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <View style={s.qtyRow}>
                  <View>
                    <Text style={s.qtyNum}>{item.quantity} <Text style={s.unit}>{item.unit ?? 'units'}</Text></Text>
                    {item.min_quantity && <Text style={s.minQty}>Min: {item.min_quantity}</Text>}
                  </View>
                  <TouchableOpacity style={s.addStockBtn} onPress={() => setMovItem(item)}>
                    <Ionicons name="add-circle-outline" size={16} color="#1A2B1A" />
                    <Text style={s.addStockText}>Update Stock</Text>
                  </TouchableOpacity>
                </View>
                {/* Progress bar */}
                <View style={s.progressBg}>
                  <View style={[s.progressFill, { width: `${pct}%` as any, backgroundColor: st.color }]} />
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 70, gap: 10 }}>
              <Ionicons name="cube-outline" size={40} color="#e5e7eb" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '600' }}>No inventory items</Text>
            </View>
          }
        />
      )}
      <Modal visible={!!movItem} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMovItem(null)}>
        {movItem && <AddMovementModal item={movItem} onSave={() => { setMovItem(null); load(); }} onClose={() => setMovItem(null)} />}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  alertBar:    { flexDirection: 'row', gap: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fffbeb', borderBottomWidth: 1, borderBottomColor: '#fcd34d' },
  alertItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  alertText:   { fontSize: 12, fontWeight: '700' },
  topBar:      { flexDirection: 'row', gap: 8, padding: 10, alignItems: 'center' },
  searchWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput: { flex: 1, fontSize: 13.5, color: '#111827' },
  filterBar:   { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  filterText:  { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  badge:       { backgroundColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText:   { fontSize: 10.5, fontWeight: '700', color: '#6b7280' },
  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  itemName:    { fontSize: 15, fontWeight: '800', color: '#111827' },
  catName:     { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  statusChip:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  qtyRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  qtyNum:      { fontSize: 22, fontWeight: '900', color: '#111827' },
  unit:        { fontSize: 12, fontWeight: '500', color: '#9ca3af' },
  minQty:      { fontSize: 10.5, color: '#9ca3af' },
  addStockBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#86efac' },
  addStockText: { fontSize: 12.5, fontWeight: '700', color: '#1A2B1A' },
  progressBg:  { height: 4, backgroundColor: '#f3f4f6', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
});
const f = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title:      { fontSize: 18, fontWeight: '800', color: '#111827' },
  label:      { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  input:      { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#fafafa' },
  typeChip:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#f3f4f6' },
  typeText:   { fontSize: 12, fontWeight: '600', color: '#374151' },
  footer:     { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  cancelText: { fontWeight: '700', color: '#374151', fontSize: 14.5 },
  saveBtn:    { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: '#1A2B1A' },
  saveText:   { fontWeight: '800', color: '#C9A52A', fontSize: 14.5 },
});
