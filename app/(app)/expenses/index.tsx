/**
 * Expenses Screen — CSPos-standard redesign
 * Forest-green header · Stats · Search · Date filters · Cards with edit/delete
 * Desktop side-panel form · Inline validation · Pressable throughout
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, Modal,
  RefreshControl, ActivityIndicator, ScrollView, Pressable,
  Platform, Alert, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  format, isToday, isYesterday, startOfWeek, startOfMonth, parseISO, subDays,
} from 'date-fns';
import client from '@/api/client';
import type { Expense, ExpenseCategory } from '@/types';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

// ── Category color palette ────────────────────────────────────────────────────
const CAT_PALETTE = [
  { bg: '#fef9ec', border: '#fcd34d', text: '#b45309', dot: '#d97706' },  // amber
  { bg: '#f0fdf4', border: '#86efac', text: '#15803d', dot: '#16a34a' },  // green
  { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', dot: PRIMARY      },  // blue
  { bg: '#fdf4ff', border: '#d8b4fe', text: '#7e22ce', dot: '#8b5cf6' },  // violet
  { bg: '#fff1f2', border: '#fda4af', text: '#be123c', dot: '#ef4444' },  // red
  { bg: '#f0f9ff', border: '#7dd3fc', text: '#0369a1', dot: '#0ea5e9' },  // sky
  { bg: '#fff7ed', border: '#fdba74', text: '#c2410c', dot: '#f97316' },  // orange
  { bg: '#fdf2f8', border: '#f0abfc', text: '#86198f', dot: '#d946ef' },  // pink
  { bg: '#f0fdfa', border: '#5eead4', text: '#0f766e', dot: '#14b8a6' },  // teal
];
function catPalette(idx: number) { return CAT_PALETTE[idx % CAT_PALETTE.length]; }

function fmtDate(d?: string) {
  if (!d) return '—';
  try {
    const dt = parseISO(d);
    if (isToday(dt))     return 'Today';
    if (isYesterday(dt)) return 'Yesterday';
    return format(dt, 'dd MMM yyyy');
  } catch { return d; }
}

const PAYMENT_METHODS = [
  { value: 'cash',         label: 'Cash',         icon: 'cash-outline'         },
  { value: 'card',         label: 'Card',          icon: 'card-outline'         },
  { value: 'upi',          label: 'UPI',           icon: 'phone-portrait-outline'},
  { value: 'bank_transfer',label: 'Bank Transfer', icon: 'business-outline'     },
  { value: 'other',        label: 'Other',         icon: 'ellipsis-horizontal-outline' },
] as const;

type FormState = {
  title: string;
  amount: string;
  tax_amount: string;
  payment_method: string;
  category_id: string;
  vendor_name: string;
  vendor_contact: string;
  receipt_number: string;
  is_recurring: boolean;
  expense_date: string;
  notes: string;
};
const BLANK_FORM: FormState = {
  title: '', amount: '', tax_amount: '0', payment_method: 'cash',
  category_id: '', vendor_name: '', vendor_contact: '',
  receipt_number: '', is_recurring: false,
  expense_date: format(new Date(), 'yyyy-MM-dd'), notes: '',
};

// ── Expense Form ──────────────────────────────────────────────────────────────
function ExpenseForm({
  editingExpense,
  categories,
  onSave,
  onClose,
}: {
  editingExpense: Expense | null;
  categories: ExpenseCategory[];
  onSave: () => void;
  onClose: () => void;
}) {
  const isEdit = !!editingExpense?.id;
  const [form,    setForm]    = useState<FormState>(
    editingExpense
      ? {
          title:          editingExpense.title,
          amount:         String(editingExpense.amount),
          tax_amount:     editingExpense.tax_amount != null ? String(editingExpense.tax_amount) : '0',
          payment_method: editingExpense.payment_method ?? 'cash',
          category_id:    editingExpense.category_id ? String(editingExpense.category_id) : '',
          vendor_name:    editingExpense.vendor_name ?? '',
          vendor_contact: editingExpense.vendor_contact ?? '',
          receipt_number: editingExpense.receipt_number ?? '',
          is_recurring:   editingExpense.is_recurring ?? false,
          expense_date:   editingExpense.expense_date,
          notes:          editingExpense.notes ?? '',
        }
      : { ...BLANK_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pmOpen,  setPmOpen]  = useState(false); // payment method dropdown open

  function field(key: keyof FormState) {
    return (val: string) => {
      setForm(p => ({ ...p, [key]: val }));
      if (errors[key]) setErrors(p => ({ ...p, [key]: '' }));
    };
  }
  function toggle(key: 'is_recurring') {
    setForm(p => ({ ...p, [key]: !p[key] }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.title.trim())                           e.title = 'Title is required';
    if (!form.amount || isNaN(parseFloat(form.amount))) e.amount = 'Enter a valid amount';
    if (parseFloat(form.amount) <= 0)                 e.amount = 'Amount must be greater than 0';
    if (!form.expense_date)                           e.expense_date = 'Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: any = {
        title:          form.title.trim(),
        amount:         parseFloat(form.amount),
        tax_amount:     form.tax_amount ? parseFloat(form.tax_amount) : 0,
        payment_method: form.payment_method || 'cash',
        category_id:    form.category_id ? parseInt(form.category_id) : undefined,
        vendor_name:    form.vendor_name.trim()    || undefined,
        vendor_contact: form.vendor_contact.trim() || undefined,
        receipt_number: form.receipt_number.trim() || undefined,
        is_recurring:   form.is_recurring,
        expense_date:   form.expense_date,
        notes:          form.notes.trim() || undefined,
      };
      if (isEdit) await client.put(`/expenses/${editingExpense!.id}`, payload);
      else        await client.post('/expenses', payload);
      onSave();
    } catch (e: any) {
      setErrors({ _: e?.response?.data?.message ?? 'Failed to save expense' });
    } finally { setSaving(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={fm.header}>
        <View style={fm.headerLeft}>
          <View style={fm.headerIcon}>
            <Ionicons name={isEdit ? 'pencil' : 'wallet'} size={16} color={GOLD} />
          </View>
          <View>
            <Text style={fm.headerTitle}>{isEdit ? 'Edit Expense' : 'Add Expense'}</Text>
            <Text style={fm.headerSub}>{isEdit ? `Editing ${editingExpense!.title}` : 'Record a new expense'}</Text>
          </View>
        </View>
        <Pressable style={({ pressed }) => [fm.closeBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 14 }}>

        {/* Global error */}
        {errors._ ? (
          <View style={fm.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
            <Text style={fm.errorTxt}>{errors._}</Text>
          </View>
        ) : null}

        {/* Row 1: Title | Date */}
        <View style={fm.row}>
          <View style={[fm.field, { flex: 1.6 }]}>
            <Text style={fm.label}>Title <Text style={fm.req}>*</Text></Text>
            <View style={[fm.inputWrap, !!errors.title && fm.inputError]}>
              <View style={fm.inputPrefix}>
                <Ionicons name="receipt-outline" size={15} color="#9ca3af" />
              </View>
              <TextInput
                style={fm.input}
                value={form.title}
                onChangeText={field('title')}
                placeholder="e.g. Gas cylinders…"
                placeholderTextColor="#9ca3af"
              />
            </View>
            {errors.title ? <Text style={fm.fieldError}>{errors.title}</Text> : null}
          </View>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Date <Text style={fm.req}>*</Text></Text>
            <View style={[fm.inputWrap, !!errors.expense_date && fm.inputError]}>
              <View style={fm.inputPrefix}>
                <Ionicons name="calendar-outline" size={15} color="#9ca3af" />
              </View>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={e => field('expense_date')((e.target as HTMLInputElement).value)}
                  style={{ flex: 1, padding: '12px', fontSize: 14, color: '#111827', border: 'none', outline: 'none', background: 'transparent' } as any}
                />
              ) : (
                <TextInput
                  style={fm.input}
                  value={form.expense_date}
                  onChangeText={field('expense_date')}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                />
              )}
            </View>
            {errors.expense_date ? <Text style={fm.fieldError}>{errors.expense_date}</Text> : null}
          </View>
        </View>

        {/* Row 2: Amount | Tax/GST | Payment Method */}
        <View style={fm.row}>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Amount <Text style={fm.req}>*</Text></Text>
            <View style={[fm.inputWrap, !!errors.amount && fm.inputError]}>
              <View style={fm.inputPrefix}>
                <Text style={fm.prefixSymbol}>₹</Text>
              </View>
              <TextInput
                style={fm.input}
                value={form.amount}
                onChangeText={field('amount')}
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
            {errors.amount ? <Text style={fm.fieldError}>{errors.amount}</Text> : null}
          </View>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Tax / GST</Text>
            <View style={fm.inputWrap}>
              <View style={fm.inputPrefix}>
                <Text style={fm.prefixSymbol}>₹</Text>
              </View>
              <TextInput
                style={fm.input}
                value={form.tax_amount}
                onChangeText={field('tax_amount')}
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <View style={[fm.field, { flex: 1.2 }]}>
            <Text style={fm.label}>Payment Method</Text>
            <Pressable
              style={[fm.inputWrap, { justifyContent: 'space-between' }]}
              onPress={() => setPmOpen(p => !p)}>
              <View style={fm.inputPrefix}>
                <Ionicons name={PAYMENT_METHODS.find(m => m.value === form.payment_method)?.icon as any ?? 'cash-outline'} size={15} color="#9ca3af" />
              </View>
              <Text style={[fm.input, { paddingVertical: 13, color: '#111827' }]}>
                {PAYMENT_METHODS.find(m => m.value === form.payment_method)?.label ?? 'Cash'}
              </Text>
              <View style={{ paddingRight: 12 }}>
                <Ionicons name={pmOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#9ca3af" />
              </View>
            </Pressable>
            {pmOpen && (
              <View style={fm.dropdown}>
                {PAYMENT_METHODS.map(m => (
                  <Pressable
                    key={m.value}
                    style={[fm.dropItem, form.payment_method === m.value && fm.dropItemActive]}
                    onPress={() => { field('payment_method')(m.value); setPmOpen(false); }}>
                    <Ionicons name={m.icon as any} size={14} color={form.payment_method === m.value ? GOLD : '#6b7280'} />
                    <Text style={[fm.dropItemTxt, form.payment_method === m.value && { color: GOLD, fontWeight: '700' }]}>{m.label}</Text>
                    {form.payment_method === m.value && <Ionicons name="checkmark" size={13} color={GOLD} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Row 3: Category | Vendor/Supplier */}
        <View style={fm.row}>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Category</Text>
            <View style={fm.catGrid}>
              <Pressable
                style={[fm.catChip, !form.category_id && fm.catChipSelected]}
                onPress={() => field('category_id')('')}>
                <Ionicons name="grid-outline" size={12} color={!form.category_id ? '#fff' : '#6b7280'} />
                <Text style={[fm.catChipTxt, !form.category_id && { color: '#fff', fontWeight: '700' }]}>None</Text>
              </Pressable>
              {categories.map((cat, idx) => {
                const pal    = catPalette(idx);
                const active = form.category_id === String(cat.id);
                return (
                  <Pressable
                    key={cat.id}
                    style={[
                      fm.catChip,
                      { backgroundColor: pal.bg, borderColor: pal.border },
                      active && { backgroundColor: pal.dot, borderColor: pal.dot },
                    ]}
                    onPress={() => field('category_id')(active ? '' : String(cat.id))}>
                    <View style={[fm.catDot, { backgroundColor: active ? '#fff' : pal.dot }]} />
                    <Text style={[fm.catChipTxt, { color: active ? '#fff' : pal.text }, active && { fontWeight: '700' }]}>
                      {cat.name}
                    </Text>
                    {active && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Vendor / Supplier</Text>
            <View style={fm.inputWrap}>
              <View style={fm.inputPrefix}>
                <Ionicons name="storefront-outline" size={15} color="#9ca3af" />
              </View>
              <TextInput
                style={fm.input}
                value={form.vendor_name}
                onChangeText={field('vendor_name')}
                placeholder="Supplier or vendor name"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
        </View>

        {/* Row 4: Vendor Contact | Receipt/Invoice No. */}
        <View style={fm.row}>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Vendor Contact</Text>
            <View style={fm.inputWrap}>
              <View style={fm.inputPrefix}>
                <Ionicons name="call-outline" size={15} color="#9ca3af" />
              </View>
              <TextInput
                style={fm.input}
                value={form.vendor_contact}
                onChangeText={field('vendor_contact')}
                placeholder="Phone / email"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
              />
            </View>
          </View>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Receipt / Invoice No.</Text>
            <View style={fm.inputWrap}>
              <View style={fm.inputPrefix}>
                <Ionicons name="document-text-outline" size={15} color="#9ca3af" />
              </View>
              <TextInput
                style={fm.input}
                value={form.receipt_number}
                onChangeText={field('receipt_number')}
                placeholder="INV-001"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
        </View>

        {/* Row 5: Attachment placeholder */}
        <View style={fm.field}>
          <Text style={fm.label}>Attachment <Text style={fm.opt}>(optional)</Text></Text>
          <View style={fm.attachBox}>
            <Ionicons name="cloud-upload-outline" size={22} color="#9ca3af" />
            <Text style={fm.attachTxt}>JPG, PNG or PDF · max 2 MB</Text>
            <Text style={fm.attachHint}>File upload available in the web admin panel</Text>
          </View>
        </View>

        {/* Row 6: Recurring Expense toggle */}
        <View style={fm.field}>
          <Pressable style={fm.recurringRow} onPress={() => toggle('is_recurring')}>
            <View style={[fm.checkbox, form.is_recurring && fm.checkboxChecked]}>
              {form.is_recurring && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={fm.recurringLabel}>Recurring Expense</Text>
              <Text style={fm.recurringHint}>Mark if this expense repeats regularly (rent, subscriptions…)</Text>
            </View>
            {form.is_recurring && (
              <View style={fm.recurringBadge}>
                <Ionicons name="repeat-outline" size={12} color={GOLD} />
                <Text style={fm.recurringBadgeTxt}>Recurring</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Row 7: Notes */}
        <View style={fm.field}>
          <Text style={fm.label}>Notes <Text style={fm.opt}>(optional)</Text></Text>
          <View style={[fm.inputWrap, fm.textareaWrap]}>
            <TextInput
              style={[fm.input, fm.textarea]}
              value={form.notes}
              onChangeText={field('notes')}
              placeholder="Add any additional notes…"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Preview */}
        {form.amount && !isNaN(parseFloat(form.amount)) && parseFloat(form.amount) > 0 ? (
          <View style={fm.preview}>
            <Text style={fm.previewLbl}>Expense Summary</Text>
            <View style={fm.previewRow}>
              <Text style={fm.previewTitle} numberOfLines={1}>{form.title || 'Untitled'}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={fm.previewAmt}>₹{parseFloat(form.amount).toFixed(2)}</Text>
                {form.tax_amount && parseFloat(form.tax_amount) > 0
                  ? <Text style={{ fontSize: 11, color: '#9ca3af' }}>+₹{parseFloat(form.tax_amount).toFixed(2)} tax</Text>
                  : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              <Text style={fm.previewDate}>{fmtDate(form.expense_date)}</Text>
              {form.category_id
                ? <Text style={fm.previewDate}>· {categories.find(c => String(c.id) === form.category_id)?.name ?? ''}</Text>
                : null}
              {form.payment_method
                ? <Text style={fm.previewDate}>· {PAYMENT_METHODS.find(m => m.value === form.payment_method)?.label}</Text>
                : null}
              {form.is_recurring
                ? <Text style={[fm.previewDate, { color: GOLD }]}>· Recurring</Text>
                : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Footer */}
      <View style={fm.footer}>
        <Pressable
          style={({ pressed }) => [fm.cancelBtn, pressed && { opacity: 0.7 }]}
          onPress={onClose}>
          <Text style={fm.cancelTxt}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [fm.saveBtn, pressed && { opacity: 0.85 }]}
          disabled={saving}
          onPress={handleSave}>
          {saving
            ? <ActivityIndicator color={GOLD} size="small" />
            : <>
                <Ionicons name={isEdit ? 'checkmark-circle' : 'add-circle'} size={17} color={GOLD} />
                <Text style={fm.saveTxt}>{isEdit ? 'Update Expense' : 'Save Expense'}</Text>
              </>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({
  expense,
  onConfirm,
  onCancel,
}: { expense: Expense; onConfirm: () => void; onCancel: () => void }) {
  const [deleting, setDeleting] = useState(false);
  async function go() {
    setDeleting(true);
    try {
      await client.delete(`/expenses/${expense.id}`);
      onConfirm();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e?.response?.data?.message ?? 'Delete failed');
      else Alert.alert('Error', e?.response?.data?.message ?? 'Delete failed');
      setDeleting(false);
    }
  }
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <Pressable style={dm.backdrop} onPress={() => !deleting && onCancel()}>
        <Pressable style={dm.panel} onPress={() => {}}>
          <View style={dm.iconWrap}>
            <Ionicons name="trash-outline" size={26} color="#dc2626" />
          </View>
          <Text style={dm.title}>Delete Expense?</Text>
          <Text style={dm.body}>
            "<Text style={{ fontWeight: '700', color: '#374151' }}>{expense.title}</Text>" will be permanently removed.
          </Text>
          <View style={dm.divider} />
          <View style={dm.btnRow}>
            <Pressable style={({ pressed }) => [dm.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onCancel} disabled={deleting}>
              <Text style={dm.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [dm.deleteBtn, pressed && { opacity: 0.8 }]} onPress={go} disabled={deleting}>
              {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={dm.deleteTxt}>Delete</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Expense Card ──────────────────────────────────────────────────────────────
function ExpenseCard({
  expense: e,
  catIdx,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  catIdx: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pal = catPalette(catIdx >= 0 ? catIdx : 8);
  return (
    <View style={[ec.card, { borderLeftColor: pal.dot }]}>
      <View style={ec.top}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={ec.title} numberOfLines={1}>{e.title}</Text>
          <View style={ec.metaRow}>
            {e.category_name ? (
              <View style={[ec.catBadge, { backgroundColor: pal.bg, borderColor: pal.border }]}>
                <View style={[ec.catDot, { backgroundColor: pal.dot }]} />
                <Text style={[ec.catTxt, { color: pal.text }]}>{e.category_name}</Text>
              </View>
            ) : null}
            <View style={ec.dateBadge}>
              <Ionicons name="calendar-outline" size={11} color="#9ca3af" />
              <Text style={ec.dateTxt}>{fmtDate(e.expense_date)}</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={ec.amount}>₹{(e.amount ?? 0).toFixed(2)}</Text>
          {e.tax_amount && e.tax_amount > 0
            ? <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>+₹{e.tax_amount.toFixed(2)} tax</Text>
            : null}
        </View>
      </View>
      {/* Extra meta */}
      <View style={ec.metaExtra}>
        {e.payment_method ? (
          <View style={ec.pmBadge}>
            <Ionicons name="cash-outline" size={10} color="#6b7280" />
            <Text style={ec.pmTxt}>{PAYMENT_METHODS.find(m => m.value === e.payment_method)?.label ?? e.payment_method}</Text>
          </View>
        ) : null}
        {e.vendor_name ? (
          <View style={ec.pmBadge}>
            <Ionicons name="storefront-outline" size={10} color="#6b7280" />
            <Text style={ec.pmTxt} numberOfLines={1}>{e.vendor_name}</Text>
          </View>
        ) : null}
        {e.receipt_number ? (
          <View style={ec.pmBadge}>
            <Ionicons name="document-text-outline" size={10} color="#6b7280" />
            <Text style={ec.pmTxt}>{e.receipt_number}</Text>
          </View>
        ) : null}
        {e.is_recurring ? (
          <View style={[ec.pmBadge, { backgroundColor: 'rgba(201,165,42,0.1)', borderColor: 'rgba(201,165,42,0.3)' }]}>
            <Ionicons name="repeat-outline" size={10} color={GOLD} />
            <Text style={[ec.pmTxt, { color: GOLD }]}>Recurring</Text>
          </View>
        ) : null}
      </View>
      {e.notes ? (
        <Text style={ec.notes} numberOfLines={2}>
          <Ionicons name="chatbubble-ellipses-outline" size={11} color="#d1d5db" /> {e.notes}
        </Text>
      ) : null}
      <View style={ec.actions}>
        <Pressable style={({ pressed }) => [ec.actionBtn, ec.editBtn, pressed && { opacity: 0.7 }]} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={13} color={PRIMARY} />
          <Text style={ec.editTxt}>Edit</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [ec.actionBtn, ec.deleteBtn, pressed && { opacity: 0.7 }]} onPress={onDelete}>
          <Ionicons name="trash-outline" size={13} color="#dc2626" />
          <Text style={ec.deleteTxt}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ExpensesScreen() {
  const [expenses,   setExpenses]   = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState<Expense | null>(null);
  const [delTarget,  setDelTarget]  = useState<Expense | null>(null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  // Filter state
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const monthStr = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const [dateFrom,    setDateFrom]    = useState(monthStr);
  const [dateTo,      setDateTo]      = useState(todayStr);
  const [catFilter,   setCatFilter]   = useState('');   // category_id or ''
  const [pmFilter,    setPmFilter]    = useState('');   // payment_method or ''
  // Applied filter (only changes when Filter button pressed)
  const [appliedFrom, setAppliedFrom] = useState(monthStr);
  const [appliedTo,   setAppliedTo]   = useState(todayStr);
  const [appliedCat,  setAppliedCat]  = useState('');
  const [appliedPm,   setAppliedPm]   = useState('');
  // Dropdown open states
  const [catOpen, setCatOpen] = useState(false);
  const [pmOpen2, setPmOpen2] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [expRes, catRes] = await Promise.all([
        client.get('/expenses'),
        client.get('/expense-categories'),
      ]);
      const exp  = expRes.data?.data ?? expRes.data ?? [];
      const cats = catRes.data?.data ?? catRes.data ?? [];
      setExpenses(Array.isArray(exp)  ? exp  : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function applyFilter() {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    setAppliedCat(catFilter);
    setAppliedPm(pmFilter);
    setCatOpen(false);
    setPmOpen2(false);
  }

  function resetFilter() {
    setDateFrom(monthStr);
    setDateTo(todayStr);
    setCatFilter('');
    setPmFilter('');
    setAppliedFrom(monthStr);
    setAppliedTo(todayStr);
    setAppliedCat('');
    setAppliedPm('');
    setCatOpen(false);
    setPmOpen2(false);
  }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (e.expense_date) {
        try {
          const d = parseISO(e.expense_date);
          if (appliedFrom && d < parseISO(appliedFrom)) return false;
          if (appliedTo   && d > parseISO(appliedTo))   return false;
        } catch {}
      }
      if (appliedCat && String(e.category_id) !== appliedCat) return false;
      if (appliedPm  && e.payment_method !== appliedPm)        return false;
      return true;
    });
  }, [expenses, appliedFrom, appliedTo, appliedCat, appliedPm]);

  const todayTotal = useMemo(() =>
    expenses.filter(e => { try { return isToday(parseISO(e.expense_date)); } catch { return false; } })
            .reduce((s, e) => s + (e.amount ?? 0), 0), [expenses]);
  const monthTotal = useMemo(() => {
    const now = new Date();
    return expenses.filter(e => { try { return parseISO(e.expense_date) >= startOfMonth(now); } catch { return false; } })
                   .reduce((s, e) => s + (e.amount ?? 0), 0);
  }, [expenses]);
  const periodTotal = useMemo(() => filtered.reduce((s, e) => s + (e.amount ?? 0), 0), [filtered]);
  const taxPaid     = useMemo(() => filtered.reduce((s, e) => s + (e.tax_amount ?? 0), 0), [filtered]);

  function getCatIdx(e: Expense) { return categories.findIndex(c => c.id === e.category_id); }
  function openCreate() { setEditing(null); setFormOpen(true); }
  function openEdit(e: Expense) { setEditing(e); setFormOpen(true); }
  function afterSave() { setFormOpen(false); setEditing(null); load(true); }
  function afterDelete() { setDelTarget(null); load(true); }

  const selectedCatName = catFilter ? (categories.find(c => String(c.id) === catFilter)?.name ?? 'Category') : 'All Categories';
  const selectedPmName  = pmFilter  ? (PAYMENT_METHODS.find(m => m.value === pmFilter)?.label ?? 'Method') : 'All Methods';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Pressable style={{ flex: 1, backgroundColor: '#f0f2f7' }} onPress={() => { setCatOpen(false); setPmOpen2(false); }}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Expenses</Text>
          <Text style={s.headerSub}>Track and manage all restaurant expenses</Text>
        </View>
        <View style={s.headerBtns}>
          <Pressable style={({ pressed }) => [s.outlineBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/(app)/expense-report')}>
            <Ionicons name="bar-chart-outline" size={14} color="#374151" />
            <Text style={s.outlineBtnTxt}>Report</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.goldOutlineBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="folder-outline" size={14} color={GOLD} />
            <Text style={s.goldOutlineTxt}>Categories</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85 }]} onPress={openCreate}>
            <Ionicons name="add-circle-outline" size={15} color="#fff" />
            <Text style={s.addBtnTxt}>Add Expense</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Stats cards ── */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <View style={s.statCardTop}>
            <Ionicons name="wallet-outline" size={20} color={GOLD} />
            <Text style={[s.statCardLbl, { color: GOLD }]}>Period Total</Text>
          </View>
          <Text style={[s.statCardAmt, { color: GOLD }]}>₹{periodTotal.toFixed(2)}</Text>
        </View>
        <View style={[s.statCard, s.statCardBorder]}>
          <View style={s.statCardTop}>
            <Ionicons name="receipt-outline" size={20} color={GOLD} />
            <Text style={[s.statCardLbl, { color: GOLD }]}>Tax Paid</Text>
          </View>
          <Text style={[s.statCardAmt, { color: GOLD }]}>₹{taxPaid.toFixed(2)}</Text>
        </View>
        <View style={[s.statCard, s.statCardBorder]}>
          <View style={s.statCardTop}>
            <Ionicons name="today-outline" size={20} color="#6b7280" />
            <Text style={s.statCardLbl}>Today</Text>
          </View>
          <Text style={s.statCardAmt}>₹{todayTotal.toFixed(2)}</Text>
        </View>
        <View style={[s.statCard, s.statCardBorder, { borderRightWidth: 0 }]}>
          <View style={s.statCardTop}>
            <Ionicons name="calendar-outline" size={20} color="#16a34a" />
            <Text style={[s.statCardLbl, { color: '#16a34a' }]}>This Month</Text>
          </View>
          <Text style={[s.statCardAmt, { color: '#16a34a' }]}>₹{monthTotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* ── Filter bar ── */}
      <View style={s.filterBar}>
        <View style={s.filterField}>
          <Text style={s.filterLbl}>From</Text>
          {Platform.OS === 'web' ? (
            <input type="date" value={dateFrom}
              onChange={e => setDateFrom((e.target as HTMLInputElement).value)}
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#111827', backgroundColor: '#fff', cursor: 'pointer', outline: 'none' }} />
          ) : (
            <TextInput style={s.filterInput} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
          )}
        </View>
        <View style={s.filterField}>
          <Text style={s.filterLbl}>To</Text>
          {Platform.OS === 'web' ? (
            <input type="date" value={dateTo}
              onChange={e => setDateTo((e.target as HTMLInputElement).value)}
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#111827', backgroundColor: '#fff', cursor: 'pointer', outline: 'none' }} />
          ) : (
            <TextInput style={s.filterInput} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
          )}
        </View>

        {/* Category dropdown */}
        <View style={[s.filterField, { zIndex: 100 }]}>
          <Text style={s.filterLbl}>Category</Text>
          <Pressable style={s.filterDropBtn} onPress={e => { e.stopPropagation?.(); setCatOpen(p => !p); setPmOpen2(false); }}>
            <Text style={s.filterDropTxt} numberOfLines={1}>{selectedCatName}</Text>
            <Ionicons name={catOpen ? 'chevron-up' : 'chevron-down'} size={13} color="#6b7280" />
          </Pressable>
          {catOpen && (
            <View style={s.dropMenu}>
              <Pressable style={[s.dropItem, !catFilter && s.dropItemActive]} onPress={() => { setCatFilter(''); setCatOpen(false); }}>
                <Text style={[s.dropItemTxt, !catFilter && s.dropItemTxtActive]}>All Categories</Text>
                {!catFilter && <Ionicons name="checkmark" size={13} color={FOREST} />}
              </Pressable>
              {categories.map(c => (
                <Pressable key={c.id} style={[s.dropItem, catFilter === String(c.id) && s.dropItemActive]}
                  onPress={() => { setCatFilter(String(c.id)); setCatOpen(false); }}>
                  <Text style={[s.dropItemTxt, catFilter === String(c.id) && s.dropItemTxtActive]}>{c.name}</Text>
                  {catFilter === String(c.id) && <Ionicons name="checkmark" size={13} color={FOREST} />}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Payment dropdown */}
        <View style={[s.filterField, { zIndex: 99 }]}>
          <Text style={s.filterLbl}>Payment</Text>
          <Pressable style={s.filterDropBtn} onPress={e => { e.stopPropagation?.(); setPmOpen2(p => !p); setCatOpen(false); }}>
            <Text style={s.filterDropTxt} numberOfLines={1}>{selectedPmName}</Text>
            <Ionicons name={pmOpen2 ? 'chevron-up' : 'chevron-down'} size={13} color="#6b7280" />
          </Pressable>
          {pmOpen2 && (
            <View style={s.dropMenu}>
              <Pressable style={[s.dropItem, !pmFilter && s.dropItemActive]} onPress={() => { setPmFilter(''); setPmOpen2(false); }}>
                <Text style={[s.dropItemTxt, !pmFilter && s.dropItemTxtActive]}>All Methods</Text>
                {!pmFilter && <Ionicons name="checkmark" size={13} color={FOREST} />}
              </Pressable>
              {PAYMENT_METHODS.map(m => (
                <Pressable key={m.value} style={[s.dropItem, pmFilter === m.value && s.dropItemActive]}
                  onPress={() => { setPmFilter(m.value); setPmOpen2(false); }}>
                  <Ionicons name={m.icon as any} size={13} color={pmFilter === m.value ? FOREST : '#6b7280'} />
                  <Text style={[s.dropItemTxt, pmFilter === m.value && s.dropItemTxtActive]}>{m.label}</Text>
                  {pmFilter === m.value && <Ionicons name="checkmark" size={13} color={FOREST} />}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Pressable style={({ pressed }) => [s.filterBtn, pressed && { opacity: 0.85 }]} onPress={applyFilter}>
          <Text style={s.filterBtnTxt}>Filter</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [s.resetBtn, pressed && { opacity: 0.7 }]} onPress={resetFilter}>
          <Text style={s.resetBtnTxt}>Reset</Text>
        </Pressable>
      </View>

      {/* ── Result count ── */}
      {filtered.length > 0 && (
        <View style={s.resultRow}>
          <Text style={s.resultTxt}>{filtered.length} expense{filtered.length !== 1 ? 's' : ''}</Text>
          <Text style={s.resultAmt}>₹{periodTotal.toFixed(2)}</Text>
        </View>
      )}

      {/* ── List ── */}
      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color={FOREST} size="large" />
          <Text style={s.loadTxt}>Loading expenses…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={e => String(e.id)}
          contentContainerStyle={{ padding: 10, gap: 8, paddingBottom: 40, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={FOREST} />
          }
          renderItem={({ item: e }) => (
            <ExpenseCard expense={e} catIdx={getCatIdx(e)}
              onEdit={() => openEdit(e)} onDelete={() => setDelTarget(e)} />
          )}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="wallet-outline" size={44} color={GOLD} />
              <Text style={s.emptyTitle}>No expenses found for this period.</Text>
              <Pressable style={({ pressed }) => [s.emptyAddBtn, pressed && { opacity: 0.85 }]} onPress={openCreate}>
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={s.emptyAddTxt}>Add First Expense</Text>
              </Pressable>
            </View>
          }
        />
      )}

      {/* ── Add/Edit Modal ── */}
      <Modal visible={formOpen} transparent animationType="fade"
        onRequestClose={() => { setFormOpen(false); setEditing(null); }}>
        <Pressable style={s.modalBackdrop} onPress={() => { setFormOpen(false); setEditing(null); }}>
          <Pressable style={[s.modalPanel, isDesktop && s.modalPanelDesktop]} onPress={() => {}}>
            <ExpenseForm editingExpense={editing} categories={categories}
              onSave={afterSave} onClose={() => { setFormOpen(false); setEditing(null); }} />
          </Pressable>
        </Pressable>
      </Modal>

      {delTarget && (
        <DeleteModal expense={delTarget} onConfirm={afterDelete} onCancel={() => setDelTarget(null)} />
      )}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Header
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle:   { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub:     { fontSize: 12, color: GOLD, marginTop: 2, fontWeight: '600' },
  headerBtns:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  outlineBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  outlineBtnTxt: { fontSize: 13, fontWeight: '700', color: '#374151' },
  goldOutlineBtn:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: GOLD, backgroundColor: '#fff' },
  goldOutlineTxt:{ fontSize: 13, fontWeight: '700', color: GOLD },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: FOREST, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnTxt:     { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Stats
  statsRow:      { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  statCard:      { flex: 1, paddingVertical: 16, paddingHorizontal: 14 },
  statCardBorder:{ borderLeftWidth: 1, borderLeftColor: '#e5e7eb' },
  statCardTop:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  statCardLbl:   { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4 },
  statCardAmt:   { fontSize: 20, fontWeight: '800', color: '#111827' },

  // Filter bar
  filterBar:     { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterField:   { gap: 4, position: 'relative' },
  filterLbl:     { fontSize: 10.5, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  filterInput:   { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#111827', minWidth: 120 },
  filterDropBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', minWidth: 130 },
  filterDropTxt: { flex: 1, fontSize: 13, color: '#374151' },
  filterBtn:     { backgroundColor: FOREST, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8, alignSelf: 'flex-end' },
  filterBtnTxt:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  resetBtn:      { borderWidth: 1.5, borderColor: GOLD, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-end' },
  resetBtnTxt:   { color: GOLD, fontWeight: '700', fontSize: 13 },

  // Dropdown
  dropMenu:       { position: 'absolute', top: 60, left: 0, minWidth: 160, zIndex: 999, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 10, overflow: 'hidden' },
  dropItem:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropItemActive: { backgroundColor: '#f0fdf4' },
  dropItemTxt:    { flex: 1, fontSize: 13, color: '#374151' },
  dropItemTxtActive: { fontWeight: '700', color: FOREST },

  // Result
  resultRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  resultTxt:   { fontSize: 11.5, color: '#9ca3af', fontWeight: '600' },
  resultAmt:   { fontSize: 12, fontWeight: '800', color: '#374151' },

  // Load / empty
  loadWrap:    { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadTxt:     { fontSize: 14, color: '#9ca3af' },
  emptyWrap:   { paddingTop: 70, alignItems: 'center', gap: 14 },
  emptyTitle:  { fontSize: 14, fontWeight: '600', color: GOLD, textAlign: 'center', paddingHorizontal: 40 },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: FOREST, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  emptyAddTxt: { color: '#fff', fontWeight: '700', fontSize: 13.5 },

  // Modal
  modalBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalPanel:        { width: '100%', maxHeight: '95%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
  modalPanelDesktop: { width: 640, maxWidth: 640 },
});

// Expense card styles
const ec = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderLeftWidth: 4, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  top:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title:      { fontSize: 15, fontWeight: '700', color: '#111827' },
  metaRow:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 5 },
  catBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  catDot:     { width: 7, height: 7, borderRadius: 3.5 },
  catTxt:     { fontSize: 11, fontWeight: '700' },
  dateBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateTxt:    { fontSize: 11.5, color: '#9ca3af' },
  amount:     { fontSize: 18, fontWeight: '900', color: GOLD, flexShrink: 0 },
  metaExtra:  { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  pmBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb' },
  pmTxt:      { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  notes:      { fontSize: 12, color: '#9ca3af', marginTop: 8, fontStyle: 'italic', lineHeight: 17 },
  actions:    { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  editBtn:    { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  editTxt:    { fontSize: 12, fontWeight: '700', color: PRIMARY },
  deleteBtn:  { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  deleteTxt:  { fontSize: 12, fontWeight: '700', color: '#dc2626' },
});

// Form styles
const fm = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: FOREST },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,165,42,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,165,42,0.25)' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  closeBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

  field:       { gap: 0 },
  label:       { fontSize: 11.5, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7 },
  req:         { color: '#ef4444' },
  opt:         { color: '#9ca3af', fontWeight: '500', textTransform: 'none' },
  hint:        { fontSize: 11, color: '#9ca3af', marginTop: 5 },

  inputWrap:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 11, backgroundColor: '#fafafa', overflow: 'hidden' },
  inputError:  { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
  inputPrefix: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  prefixSymbol:{ fontSize: 15, fontWeight: '800', color: '#6b7280' },
  input:       { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#111827' },

  textareaWrap:{ alignItems: 'flex-start' },
  textarea:    { paddingTop: 12, minHeight: 80, textAlignVertical: 'top' },

  catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  catChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  catChipSelected: { backgroundColor: FOREST, borderColor: FOREST },
  catDot:      { width: 7, height: 7, borderRadius: 3.5 },
  catChipTxt:  { fontSize: 12.5, fontWeight: '600', color: '#374151' },

  preview:     { backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  previewLbl:  { fontSize: 10, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  previewRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewTitle:{ fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  previewAmt:  { fontSize: 18, fontWeight: '900', color: GOLD },
  previewDate: { fontSize: 12, color: '#9ca3af', marginTop: 4 },

  errorBox:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fef2f2', borderRadius: 9, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
  errorTxt:    { color: '#dc2626', fontSize: 12.5, fontWeight: '600', flex: 1 },
  fieldError:  { fontSize: 11.5, color: '#dc2626', fontWeight: '600', marginTop: 4 },

  row:         { flexDirection: 'row', gap: 10 },

  dropdown:    { position: 'absolute', top: 52, left: 0, right: 0, zIndex: 999, backgroundColor: '#fff', borderRadius: 11, borderWidth: 1.5, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 8, overflow: 'hidden' },
  dropItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropItemActive: { backgroundColor: '#fef9ec' },
  dropItemTxt: { flex: 1, fontSize: 13.5, color: '#374151', fontWeight: '600' },

  attachBox:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#e5e7eb', borderStyle: 'dashed', borderRadius: 11, padding: 14, backgroundColor: '#fafafa' },
  attachTxt:   { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  attachHint:  { fontSize: 11, color: '#d1d5db', marginTop: 1 },

  recurringRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fafafa' },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: FOREST, borderColor: FOREST },
  recurringLabel:  { fontSize: 14, fontWeight: '700', color: '#374151' },
  recurringHint:   { fontSize: 11.5, color: '#9ca3af', marginTop: 2 },
  recurringBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(201,165,42,0.1)', borderWidth: 1, borderColor: 'rgba(201,165,42,0.3)' },
  recurringBadgeTxt: { fontSize: 11, fontWeight: '700', color: GOLD },

  footer:      { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fff' },
  cancelBtn:   { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 11, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  cancelTxt:   { fontWeight: '700', color: '#374151', fontSize: 14 },
  saveBtn:     { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 11, backgroundColor: FOREST },
  saveTxt:     { fontWeight: '800', color: GOLD, fontSize: 14 },
});

// Delete modal styles
const dm = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel:      { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 340, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30, elevation: 20 },
  iconWrap:   { alignItems: 'center', paddingTop: 28, paddingBottom: 4 },
  title:      { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center', marginTop: 10, paddingHorizontal: 24 },
  body:       { fontSize: 13.5, color: '#6b7280', textAlign: 'center', marginTop: 7, lineHeight: 20, paddingHorizontal: 24, paddingBottom: 22 },
  divider:    { height: 1, backgroundColor: '#f3f4f6' },
  btnRow:     { flexDirection: 'row' },
  cancelBtn:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRightWidth: 1, borderRightColor: '#f3f4f6' },
  cancelTxt:  { fontSize: 15, fontWeight: '600', color: '#374151' },
  deleteBtn:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 15, backgroundColor: '#dc2626' },
  deleteTxt:  { fontSize: 15, fontWeight: '800', color: '#fff' },
});
