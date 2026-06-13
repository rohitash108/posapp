import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, RefreshControl, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import client from '@/api/client';
import type { Expense, ExpenseCategory } from '@/types';
import { useThemedScreen } from '@/theme/useThemedScreen';

const CAT_COLORS = ['#1A2B1A', '#0f8f73', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function ExpensesScreen() {
  const t = useThemedScreen();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', category_id: '', expense_date: format(new Date(), 'yyyy-MM-dd'), notes: '' });

  const load = useCallback(async () => {
    try {
      const [expRes, catRes] = await Promise.all([
        client.get('/expenses'),
        client.get('/expense-categories'),
      ]);
      const exp = expRes.data?.data ?? expRes.data ?? [];
      const cats = catRes.data?.data ?? catRes.data ?? [];
      setExpenses(Array.isArray(exp) ? exp : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.title.trim()) { Alert.alert('Title required'); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { Alert.alert('Valid amount required'); return; }
    setSaving(true);
    try {
      await client.post('/expenses', { ...form, amount: parseFloat(form.amount), category_id: form.category_id ? parseInt(form.category_id) : undefined });
      setShowForm(false);
      setForm({ title: '', amount: '', category_id: '', expense_date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  const totalToday = expenses
    .filter(e => e.expense_date === format(new Date(), 'yyyy-MM-dd'))
    .reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalAll = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <View style={[st.shell, t.shell]}>
      {/* Summary bar */}
      <View style={st.summary}>
        <View style={st.summaryCard}>
          <Text style={st.summaryLabel}>Today</Text>
          <Text style={st.summaryValue}>₹{totalToday.toFixed(2)}</Text>
        </View>
        <View style={[st.summaryCard, { backgroundColor: '#fff7ed' }]}>
          <Text style={st.summaryLabel}>Total</Text>
          <Text style={[st.summaryValue, { color: '#d97706' }]}>₹{totalAll.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={st.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={st.addBtnText}>Add Expense</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={e => String(e.id)}
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#0f8f73" />}
        renderItem={({ item: e }) => {
          const catIdx = categories.findIndex(c => c.id === e.category_id);
          const color = CAT_COLORS[catIdx % CAT_COLORS.length] === '#1A2B1A' ? t.colors.sidebar : (CAT_COLORS[catIdx % CAT_COLORS.length] ?? '#6b7280');
          return (
            <View style={st.card}>
              <View style={[st.catDot, { backgroundColor: color }]} />
              <View style={{ flex: 1 }}>
                <Text style={st.expTitle}>{e.title}</Text>
                <View style={st.expMeta}>
                  {e.category_name && <Text style={[st.catBadge, { color }]}>{e.category_name}</Text>}
                  <Text style={st.expDate}>{format(new Date(e.expense_date), 'dd MMM yyyy')}</Text>
                </View>
                {e.notes && <Text style={st.expNotes} numberOfLines={1}>{e.notes}</Text>}
              </View>
              <Text style={st.expAmount}>₹{(e.amount ?? 0).toFixed(2)}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name="wallet-outline" size={40} color="#d1d5db" />
            <Text style={st.emptyText}>No expenses recorded</Text>
          </View>
        }
      />

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <View style={{ flex: 1, backgroundColor: '#f5f6f8' }}>
          <View style={st.modalHeader}>
            <Text style={st.modalTitle}>Add Expense</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
          </View>
          <ScrollView style={st.formBody} contentContainerStyle={{ gap: 14 }}>
            <View style={st.formField}>
              <Text style={st.formLabel}>Title *</Text>
              <TextInput style={st.formInput} value={form.title} onChangeText={v => setForm(p => ({ ...p, title: v }))} placeholder="e.g. Gas cylinders" placeholderTextColor="#9ca3af" />
            </View>
            <View style={st.formField}>
              <Text style={st.formLabel}>Amount *</Text>
              <TextInput style={st.formInput} value={form.amount} onChangeText={v => setForm(p => ({ ...p, amount: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#9ca3af" />
            </View>
            <View style={st.formField}>
              <Text style={st.formLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {categories.map((cat, idx) => {
                  const color = CAT_COLORS[idx % CAT_COLORS.length];
                  const active = form.category_id === String(cat.id);
                  return (
                    <TouchableOpacity key={cat.id} style={[st.catChip, { borderColor: color }, active && { backgroundColor: color }]} onPress={() => setForm(p => ({ ...p, category_id: active ? '' : String(cat.id) }))}>
                      <Text style={[st.catChipText, { color: active ? '#fff' : color }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            <View style={st.formField}>
              <Text style={st.formLabel}>Date</Text>
              <TextInput style={st.formInput} value={form.expense_date} onChangeText={v => setForm(p => ({ ...p, expense_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
            </View>
            <View style={st.formField}>
              <Text style={st.formLabel}>Notes</Text>
              <TextInput style={[st.formInput, { height: 70, textAlignVertical: 'top' }]} value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} multiline placeholder="Optional notes..." placeholderTextColor="#9ca3af" />
            </View>
            <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save Expense</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f0f2f7' },
  summary: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', alignItems: 'center' },
  summaryCard: { flex: 1, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10 },
  summaryLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
  summaryValue: { fontSize: 16, fontWeight: '800', color: '#10b981', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#d97706', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  list: { padding: 12, gap: 8, paddingBottom: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  catDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  expTitle: { fontSize: 14.5, fontWeight: '700', color: '#111827' },
  expMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  catBadge: { fontSize: 11.5, fontWeight: '600' },
  expDate: { fontSize: 11.5, color: '#6b7280' },
  expNotes: { fontSize: 11.5, color: '#9ca3af', marginTop: 3, fontStyle: 'italic' },
  expAmount: { fontSize: 16, fontWeight: '800', color: '#d97706' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  formBody: { flex: 1, padding: 16 },
  formField: { gap: 6 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  formInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  catChipText: { fontSize: 12.5, fontWeight: '700' },
  saveBtn: { backgroundColor: '#d97706', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
