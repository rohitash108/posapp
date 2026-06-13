import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator, RefreshControl, Alert, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { couponsApi } from '@/api/coupons';
import type { Coupon } from '@/types';
import { useThemedScreen } from '@/theme/useThemedScreen';

function CouponForm({ coupon, onSave, onClose }: { coupon?: Coupon | null; onSave: () => void; onClose: () => void }) {
  const t = useThemedScreen();
  const [code, setCode]             = useState(coupon?.code ?? '');
  const [type, setType]             = useState<'percentage' | 'fixed'>(coupon?.discount_type ?? 'percentage');
  const [value, setValue]           = useState(coupon ? String(coupon.discount_value) : '');
  const [minOrder, setMinOrder]     = useState(coupon?.min_order_amount ? String(coupon.min_order_amount) : '');
  const [maxUses, setMaxUses]       = useState(coupon?.max_uses ? String(coupon.max_uses) : '');
  const [expires, setExpires]       = useState(coupon?.expires_at ? coupon.expires_at.substring(0, 10) : '');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  async function save() {
    if (!code.trim()) { setError('Code is required'); return; }
    if (!value || isNaN(Number(value))) { setError('Valid discount value is required'); return; }
    setLoading(true); setError('');
    try {
      const payload = {
        code: code.toUpperCase(),
        discount_type: type,
        discount_value: Number(value),
        min_order_amount: minOrder ? Number(minOrder) : undefined,
        max_uses: maxUses ? Number(maxUses) : undefined,
        expires_at: expires || undefined,
      };
      if (coupon?.id) await couponsApi.update(coupon.id, payload);
      else            await couponsApi.create(payload);
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={f.header}>
        <Text style={f.title}>{coupon ? 'Edit Coupon' : 'New Coupon'}</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View>
          <Text style={f.label}>Coupon Code *</Text>
          <TextInput style={[f.input, { fontFamily: 'monospace', letterSpacing: 2, textTransform: 'uppercase' }]} value={code} onChangeText={t => setCode(t.toUpperCase())} placeholder="e.g. SAVE20" placeholderTextColor="#9ca3af" autoCapitalize="characters" />
        </View>
        <View>
          <Text style={f.label}>Discount Type</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TouchableOpacity style={[f.typeChip, type === 'percentage' && t.chromeBtn, type === 'percentage' && { borderColor: t.colors.sidebar }]} onPress={() => setType('percentage')}>
              <Ionicons name="pricetag-outline" size={14} color={type === 'percentage' ? '#fff' : '#374151'} />
              <Text style={[f.typeText, type === 'percentage' && { color: '#fff', fontWeight: '800' }]}>Percentage</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[f.typeChip, type === 'fixed' && t.chromeBtn, type === 'fixed' && { borderColor: t.colors.sidebar }]} onPress={() => setType('fixed')}>
              <Text style={[f.typeText, type === 'fixed' && { color: '#fff', fontWeight: '800' }]}>₹ Fixed Amount</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View>
          <Text style={f.label}>Discount Value *</Text>
          <TextInput style={f.input} value={value} onChangeText={setValue} placeholder={type === 'percentage' ? '0 – 100' : '0.00'} placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />
        </View>
        <View>
          <Text style={f.label}>Min. Order Amount (₹)</Text>
          <TextInput style={f.input} value={minOrder} onChangeText={setMinOrder} placeholder="Optional" placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />
        </View>
        <View>
          <Text style={f.label}>Max Uses</Text>
          <TextInput style={f.input} value={maxUses} onChangeText={setMaxUses} placeholder="Unlimited" placeholderTextColor="#9ca3af" keyboardType="numeric" />
        </View>
        <View>
          <Text style={f.label}>Expiry Date</Text>
          <TextInput style={f.input} value={expires} onChangeText={setExpires} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
        </View>
        {!!error && <Text style={{ color: '#dc2626', fontSize: 12.5, fontWeight: '600' }}>{error}</Text>}
      </ScrollView>
      <View style={f.footer}>
        <TouchableOpacity style={f.cancelBtn} onPress={onClose}><Text style={f.cancelText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[f.saveBtn, t.chromeBtn]} onPress={save} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={f.saveText}>{coupon ? 'Update' : 'Create'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CouponsScreen() {
  const t = useThemedScreen();
  const [coupons, setCoupons]       = useState<Coupon[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing]        = useState<Coupon | null>(null);
  const [toggling, setToggling]      = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await couponsApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setCoupons(Array.isArray(data) ? data : []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  async function handleDelete(c: Coupon) {
    Alert.alert('Delete Coupon', `Delete coupon "${c.code}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await couponsApi.delete(c.id); load(); } catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Delete failed'); }
      }},
    ]);
  }

  async function handleToggle(c: Coupon) {
    setToggling(prev => new Set(prev).add(c.id));
    const newVal = !c.is_active;
    setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: newVal } : x));
    try { await couponsApi.toggle(c.id); } catch {
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !newVal } : x));
    } finally { setToggling(prev => { const n = new Set(prev); n.delete(c.id); return n; }); }
  }

  const filtered = coupons.filter(c => !search || c.code.toLowerCase().includes(search.toLowerCase()));
  const activeCount = coupons.filter(c => c.is_active).length;

  function isExpired(c: Coupon) {
    if (!c.expires_at) return false;
    return new Date(c.expires_at) < new Date();
  }

  return (
    <View style={[t.shell, { flex: 1 }]}>
      <View style={[s.statsBar, t.chrome]}>
        <View style={s.statItem}><Text style={[s.statNum, { color: '#C9A52A' }]}>{coupons.length}</Text><Text style={s.statLabel}>Total</Text></View>
        <View style={s.statDiv} />
        <View style={s.statItem}><Text style={[s.statNum, { color: '#16a34a' }]}>{activeCount}</Text><Text style={s.statLabel}>Active</Text></View>
        <View style={s.statDiv} />
        <View style={s.statItem}><Text style={[s.statNum, { color: '#6b7280' }]}>{coupons.length - activeCount}</Text><Text style={s.statLabel}>Inactive</Text></View>
      </View>
      <View style={s.topBar}>
        <View style={s.searchWrap}>
          <Ionicons name="pricetag-outline" size={15} color="#9ca3af" />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search by code..." placeholderTextColor="#9ca3af" autoCapitalize="characters" />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#9ca3af" /></TouchableOpacity> : null}
        </View>
        <TouchableOpacity style={[s.addBtn, t.chromeBtn]} onPress={() => { setEditing(null); setFormVisible(true); }}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#C9A52A" size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 10, paddingBottom: 32, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#C9A52A" />}
          renderItem={({ item: c }) => {
            const expired = isExpired(c);
            return (
              <View style={[s.card, !c.is_active && { opacity: 0.6 }, expired && { borderLeftColor: '#6b7280' }]}>
                <View style={s.cardTop}>
                  <View style={s.codeBox}>
                    <Text style={s.codeText}>{c.code}</Text>
                    {expired && <View style={s.expiredBadge}><Text style={s.expiredText}>EXPIRED</Text></View>}
                  </View>
                  <Switch value={!!c.is_active} onValueChange={() => handleToggle(c)} disabled={toggling.has(c.id)} trackColor={{ true: '#16a34a', false: '#e5e7eb' }} thumbColor="#fff" />
                </View>
                <View style={s.valueRow}>
                  <View style={[s.valuePill, { backgroundColor: c.discount_type === 'percentage' ? '#f0fdf4' : '#eff6ff' }]}>
                    <Text style={[s.valueText, { color: c.discount_type === 'percentage' ? '#16a34a' : '#2563eb' }]}>
                      {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                    </Text>
                  </View>
                  {c.min_order_amount && <Text style={s.meta}>Min: ₹{c.min_order_amount}</Text>}
                  {c.max_uses && <Text style={s.meta}>Max: {c.max_uses} uses</Text>}
                </View>
                <View style={s.cardBot}>
                  <View style={{ gap: 3 }}>
                    {c.used_count !== undefined && <Text style={s.usage}>Used {c.used_count ?? 0} times</Text>}
                    {c.expires_at && <Text style={[s.usage, expired && { color: '#dc2626', fontWeight: '700' }]}>Expires: {format(new Date(c.expires_at), 'dd MMM yyyy')}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={s.iconBtn} onPress={() => { setEditing(c); setFormVisible(true); }}>
                      <Ionicons name="pencil-outline" size={15} color="#2563eb" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.iconBtn, { backgroundColor: '#fef2f2' }]} onPress={() => handleDelete(c)}>
                      <Ionicons name="trash-outline" size={15} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 70, gap: 10 }}>
              <Ionicons name="pricetags-outline" size={40} color="#e5e7eb" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '600' }}>No coupons yet</Text>
              <TouchableOpacity style={[s.addBtn, t.chromeBtn]} onPress={() => { setEditing(null); setFormVisible(true); }}>
                <Ionicons name="add" size={16} color="#fff" /><Text style={s.addBtnText}>Create First Coupon</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormVisible(false)}>
        <CouponForm coupon={editing} onSave={() => { setFormVisible(false); load(); }} onClose={() => setFormVisible(false)} />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  statsBar:    { flexDirection: 'row', backgroundColor: '#1A2B1A', paddingHorizontal: 16, paddingVertical: 14 },
  statItem:    { flex: 1, alignItems: 'center' },
  statNum:     { fontSize: 22, fontWeight: '800' },
  statLabel:   { fontSize: 10, color: '#7A9A7A', marginTop: 2 },
  statDiv:     { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 4 },
  topBar:      { flexDirection: 'row', gap: 8, padding: 10, alignItems: 'center' },
  searchWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput: { flex: 1, fontSize: 13.5, color: '#111827' },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1A2B1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText:  { color: '#C9A52A', fontWeight: '800', fontSize: 13.5 },
  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#C9A52A', borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  codeBox:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeText:    { fontSize: 18, fontWeight: '900', color: '#111827', letterSpacing: 1.5, fontFamily: 'monospace' },
  expiredBadge: { backgroundColor: '#fef2f2', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  expiredText: { fontSize: 9.5, fontWeight: '800', color: '#dc2626' },
  valueRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  valuePill:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  valueText:   { fontSize: 13, fontWeight: '800' },
  meta:        { fontSize: 11.5, fontWeight: '600', color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  cardBot:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  usage:       { fontSize: 11.5, color: '#9ca3af' },
  iconBtn:     { width: 30, height: 30, borderRadius: 8, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
});
const f = StyleSheet.create({
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title:        { fontSize: 18, fontWeight: '800', color: '#111827' },
  label:        { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  input:        { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#fafafa' },
  typeChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#f3f4f6' },
  typeChipActive: { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' },
  typeText:     { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  footer:       { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  cancelText:   { fontWeight: '700', color: '#374151', fontSize: 14.5 },
  saveBtn:      { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: '#1A2B1A' },
  saveText:     { fontWeight: '800', color: '#C9A52A', fontSize: 14.5 },
});
