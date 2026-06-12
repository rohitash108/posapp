import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator, RefreshControl, Alert, Switch, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categoriesApi } from '@/api/categories';
import type { Category } from '@/types';

function CategoryForm({ cat, onSave, onClose }: { cat?: Category | null; onSave: () => void; onClose: () => void }) {
  const [name, setName]         = useState(cat?.name ?? '');
  const [desc, setDesc]         = useState(cat?.description ?? '');
  const [loading, setLoading]   = useState(false);
  const [error, setError]        = useState('');

  async function save() {
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true); setError('');
    try {
      if (cat?.id) await categoriesApi.update(cat.id, { name, description: desc });
      else         await categoriesApi.create({ name, description: desc });
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  }

  return (
    <View style={f.wrap}>
      <View style={f.header}>
        <Text style={f.title}>{cat ? 'Edit Category' : 'New Category'}</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
      </View>
      <View style={f.body}>
        <Text style={f.label}>Name *</Text>
        <TextInput style={f.input} value={name} onChangeText={setName} placeholder="e.g. Starters" placeholderTextColor="#9ca3af" />
        <Text style={f.label}>Description</Text>
        <TextInput style={[f.input, { height: 80, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} placeholder="Optional description" placeholderTextColor="#9ca3af" multiline />
        {!!error && <Text style={f.error}>{error}</Text>}
      </View>
      <View style={f.footer}>
        <TouchableOpacity style={f.cancelBtn} onPress={onClose}><Text style={f.cancelText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={f.saveBtn} onPress={save} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={f.saveText}>{cat ? 'Update' : 'Create'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing]        = useState<Category | null>(null);
  const [toggling, setToggling]      = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await categoriesApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setCategories(Array.isArray(data) ? data : []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  async function handleDelete(cat: Category) {
    Alert.alert('Delete Category', `Delete "${cat.name}"? This may affect linked items.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await categoriesApi.delete(cat.id); load(); } catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Delete failed'); }
      }},
    ]);
  }

  async function handleToggle(cat: Category) {
    setToggling(prev => new Set(prev).add(cat.id));
    const newVal = !cat.is_active;
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: newVal } : c));
    try { await categoriesApi.toggle(cat.id); } catch {
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: !newVal } : c));
    } finally { setToggling(prev => { const n = new Set(prev); n.delete(cat.id); return n; }); }
  }

  const filtered = categories.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      <View style={s.topBar}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={15} color="#9ca3af" />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search categories..." placeholderTextColor="#9ca3af" />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#9ca3af" /></TouchableOpacity> : null}
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { setEditing(null); setFormVisible(true); }}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={s.countRow}><Text style={s.countText}>{filtered.length} {filtered.length === 1 ? 'category' : 'categories'}</Text></View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#C9A52A" size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 10, paddingBottom: 32, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#C9A52A" />}
          renderItem={({ item: cat }) => (
            <View style={s.card}>
              <View style={[s.colorDot, { backgroundColor: cat.color || '#C9A52A' }]} />
              {cat.image_url ? <Image source={{ uri: cat.image_url }} style={s.catImg} /> : (
                <View style={[s.catImgPlaceholder, { backgroundColor: cat.color || '#1A2B1A' }]}>
                  <Text style={{ fontSize: 22 }}>{cat.name?.[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.catName}>{cat.name}</Text>
                {cat.description ? <Text style={s.catDesc} numberOfLines={1}>{cat.description}</Text> : null}
                <Text style={s.catMeta}>{cat.items_count ?? 0} items</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Switch value={!!cat.is_active} onValueChange={() => handleToggle(cat)} disabled={toggling.has(cat.id)} trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff" />
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <TouchableOpacity style={s.iconBtn} onPress={() => { setEditing(cat); setFormVisible(true); }}>
                    <Ionicons name="pencil-outline" size={15} color="#2563eb" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.iconBtn, { backgroundColor: '#fef2f2' }]} onPress={() => handleDelete(cat)}>
                    <Ionicons name="trash-outline" size={15} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 70, gap: 10 }}>
              <Ionicons name="folder-open-outline" size={40} color="#e5e7eb" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '600' }}>No categories yet</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => { setEditing(null); setFormVisible(true); }}>
                <Ionicons name="add" size={16} color="#fff" /><Text style={s.addBtnText}>Create First Category</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormVisible(false)}>
        <CategoryForm cat={editing} onSave={() => { setFormVisible(false); load(); }} onClose={() => setFormVisible(false)} />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  topBar:       { flexDirection: 'row', gap: 8, padding: 10, alignItems: 'center' },
  searchWrap:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput:  { flex: 1, fontSize: 13.5, color: '#111827' },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1A2B1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText:   { color: '#C9A52A', fontWeight: '800', fontSize: 13.5 },
  countRow:     { paddingHorizontal: 14, paddingVertical: 6 },
  countText:    { fontSize: 11.5, color: '#9ca3af', fontWeight: '600' },
  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  colorDot:     { width: 4, height: 40, borderRadius: 2, marginRight: 6 },
  catImg:       { width: 48, height: 48, borderRadius: 10 },
  catImgPlaceholder: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catName:      { fontSize: 15, fontWeight: '800', color: '#111827' },
  catDesc:      { fontSize: 11.5, color: '#9ca3af', marginTop: 2 },
  catMeta:      { fontSize: 11, color: '#C9A52A', fontWeight: '700', marginTop: 3 },
  iconBtn:      { width: 30, height: 30, borderRadius: 8, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
});
const f = StyleSheet.create({
  wrap:       { flex: 1, backgroundColor: '#fff' },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title:      { fontSize: 18, fontWeight: '800', color: '#111827' },
  body:       { flex: 1, padding: 16, gap: 8 },
  label:      { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#fafafa' },
  error:      { color: '#dc2626', fontSize: 12.5, fontWeight: '600' },
  footer:     { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  cancelText: { fontWeight: '700', color: '#374151', fontSize: 14.5 },
  saveBtn:    { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: '#1A2B1A' },
  saveText:   { fontWeight: '800', color: '#C9A52A', fontSize: 14.5 },
});
