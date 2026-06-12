import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator, RefreshControl, Alert, Switch, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { itemsApi } from '@/api/items';
import { categoriesApi } from '@/api/categories';
import type { MenuItem, Category } from '@/types';

interface ItemFormProps { item?: MenuItem | null; categories: Category[]; onSave: () => void; onClose: () => void; }
function ItemForm({ item, categories, onSave, onClose }: ItemFormProps) {
  const [name, setName]         = useState(item?.name ?? '');
  const [desc, setDesc]         = useState(item?.description ?? '');
  const [price, setPrice]       = useState(item ? String(item.price) : '');
  const [catId, setCatId]       = useState<number | undefined>(item?.category_id);
  const [veg, setVeg]           = useState(item?.is_veg ?? true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function save() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!price || isNaN(Number(price))) { setError('Valid price is required'); return; }
    setLoading(true); setError('');
    try {
      const payload = { name, description: desc, price: Number(price), category_id: catId, is_veg: veg };
      if (item?.id) await itemsApi.update(item.id, payload);
      else          await itemsApi.create(payload);
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={f.header}>
        <Text style={f.title}>{item ? 'Edit Item' : 'New Item'}</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View>
          <Text style={f.label}>Name *</Text>
          <TextInput style={f.input} value={name} onChangeText={setName} placeholder="e.g. Paneer Tikka" placeholderTextColor="#9ca3af" />
        </View>
        <View>
          <Text style={f.label}>Description</Text>
          <TextInput style={[f.input, { height: 70, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} placeholder="Optional" placeholderTextColor="#9ca3af" multiline />
        </View>
        <View>
          <Text style={f.label}>Price (₹) *</Text>
          <TextInput style={f.input} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />
        </View>
        <View>
          <Text style={f.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 8 }}>
            {categories.map(c => (
              <TouchableOpacity key={c.id} style={[f.catChip, catId === c.id && { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' }]} onPress={() => setCatId(c.id)}>
                <Text style={[f.catChipText, catId === c.id && { color: '#C9A52A', fontWeight: '800' }]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
          <View>
            <Text style={f.label}>Vegetarian</Text>
            <Text style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>Mark as vegetarian item</Text>
          </View>
          <Switch value={veg} onValueChange={setVeg} trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff" />
        </View>
        {!!error && <Text style={f.error}>{error}</Text>}
      </ScrollView>
      <View style={f.footer}>
        <TouchableOpacity style={f.cancelBtn} onPress={onClose}><Text style={f.cancelText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={f.saveBtn} onPress={save} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={f.saveText}>{item ? 'Update' : 'Create'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ItemsScreen() {
  const [items, setItems]           = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState<number | 'all'>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing]        = useState<MenuItem | null>(null);
  const [toggling, setToggling]      = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const [iRes, cRes] = await Promise.all([itemsApi.list(), categoriesApi.list()]);
      const iData = iRes.data?.data ?? iRes.data ?? [];
      const cData = cRes.data?.data ?? cRes.data ?? [];
      setItems(Array.isArray(iData) ? iData : []);
      setCategories(Array.isArray(cData) ? cData : []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  async function handleDelete(item: MenuItem) {
    Alert.alert('Delete Item', `Delete "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await itemsApi.delete(item.id); load(); } catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Delete failed'); }
      }},
    ]);
  }

  async function handleToggle(item: MenuItem) {
    setToggling(prev => new Set(prev).add(item.id));
    const newVal = !item.is_available;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: newVal } : i));
    try { await itemsApi.toggleAvailability(item.id, newVal); } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !newVal } : i));
    } finally { setToggling(prev => { const n = new Set(prev); n.delete(item.id); return n; }); }
  }

  const filtered = items.filter(i => {
    if (catFilter !== 'all' && i.category_id !== catFilter) return false;
    if (search) return i.name.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      <View style={s.topBar}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search items..." placeholderTextColor="#9ca3af" />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#9ca3af" /></TouchableOpacity> : null}
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { setEditing(null); setFormVisible(true); }}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
        <TouchableOpacity style={[s.filterChip, catFilter === 'all' && s.filterChipActive]} onPress={() => setCatFilter('all')}>
          <Text style={[s.filterText, catFilter === 'all' && s.filterTextActive]}>All ({items.length})</Text>
        </TouchableOpacity>
        {categories.map(c => {
          const cnt = items.filter(i => i.category_id === c.id).length;
          return (
            <TouchableOpacity key={c.id} style={[s.filterChip, catFilter === c.id && s.filterChipActive]} onPress={() => setCatFilter(c.id)}>
              <Text style={[s.filterText, catFilter === c.id && s.filterTextActive]}>{c.name} ({cnt})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#C9A52A" size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 10, paddingBottom: 32, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#C9A52A" />}
          renderItem={({ item }) => (
            <View style={[s.card, !item.is_available && { opacity: 0.65 }]}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={s.itemImg} />
              ) : (
                <View style={[s.itemImgPlaceholder, { backgroundColor: item.is_veg ? '#f0fdf4' : '#fef2f2' }]}>
                  <View style={[s.vegDot, { backgroundColor: item.is_veg ? '#16a34a' : '#dc2626', borderColor: item.is_veg ? '#16a34a' : '#dc2626' }]} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[s.vegDot, { backgroundColor: item.is_veg ? '#16a34a' : '#dc2626', borderColor: item.is_veg ? '#16a34a' : '#dc2626' }]} />
                  <Text style={s.itemName}>{item.name}</Text>
                </View>
                {item.category_name && <Text style={s.catBadge}>{item.category_name}</Text>}
                {item.description ? <Text style={s.itemDesc} numberOfLines={1}>{item.description}</Text> : null}
                <Text style={s.itemPrice}>₹{Number(item.price).toFixed(2)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Switch value={!!item.is_available} onValueChange={() => handleToggle(item)} disabled={toggling.has(item.id)} trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff" />
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <TouchableOpacity style={s.iconBtn} onPress={() => { setEditing(item); setFormVisible(true); }}>
                    <Ionicons name="pencil-outline" size={15} color="#2563eb" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.iconBtn, { backgroundColor: '#fef2f2' }]} onPress={() => handleDelete(item)}>
                    <Ionicons name="trash-outline" size={15} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 70, gap: 10 }}>
              <Ionicons name="fast-food-outline" size={40} color="#e5e7eb" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '600' }}>No items found</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => { setEditing(null); setFormVisible(true); }}>
                <Ionicons name="add" size={16} color="#fff" /><Text style={s.addBtnText}>Add First Item</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormVisible(false)}>
        <ItemForm item={editing} categories={categories} onSave={() => { setFormVisible(false); load(); }} onClose={() => setFormVisible(false)} />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  topBar:          { flexDirection: 'row', gap: 8, padding: 10, alignItems: 'center' },
  searchWrap:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput:     { flex: 1, fontSize: 13.5, color: '#111827' },
  addBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1A2B1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText:      { color: '#C9A52A', fontWeight: '800', fontSize: 13.5 },
  filterBar:       { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  filterChipActive: { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' },
  filterText:      { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  filterTextActive: { color: '#C9A52A', fontWeight: '800' },
  card:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  itemImg:         { width: 56, height: 56, borderRadius: 10 },
  itemImgPlaceholder: { width: 56, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  vegDot:          { width: 10, height: 10, borderRadius: 2, borderWidth: 1.5 },
  itemName:        { fontSize: 15, fontWeight: '800', color: '#111827', flex: 1 },
  catBadge:        { fontSize: 10.5, fontWeight: '700', color: '#C9A52A', backgroundColor: '#1A2B1A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start', marginTop: 3 },
  itemDesc:        { fontSize: 11.5, color: '#9ca3af', marginTop: 2 },
  itemPrice:       { fontSize: 16, fontWeight: '800', color: '#1A2B1A', marginTop: 4 },
  iconBtn:         { width: 30, height: 30, borderRadius: 8, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
});
const f = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title:      { fontSize: 18, fontWeight: '800', color: '#111827' },
  label:      { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  input:      { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#fafafa' },
  catChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  error:      { color: '#dc2626', fontSize: 12.5, fontWeight: '600' },
  footer:     { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  cancelText: { fontWeight: '700', color: '#374151', fontSize: 14.5 },
  saveBtn:    { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: '#1A2B1A' },
  saveText:   { fontWeight: '800', color: '#C9A52A', fontSize: 14.5 },
});
