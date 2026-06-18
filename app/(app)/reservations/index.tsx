import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  TextInput, Modal, RefreshControl, Alert, ActivityIndicator,
  ScrollView, Platform, useWindowDimensions, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import client from '@/api/client';
import type { Reservation } from '@/types';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

// ── Design tokens ──────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

const STATUS_CFG: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  pending:   { color: '#d97706', bg: '#fef9ec', label: 'Pending',   icon: 'time-outline'             },
  confirmed: { color: '#2563eb', bg: '#eff6ff', label: 'Confirmed', icon: 'checkmark-circle-outline' },
  seated:    { color: '#7c3aed', bg: '#f5f3ff', label: 'Seated',    icon: 'restaurant-outline'       },
  cancelled: { color: '#dc2626', bg: '#fff1f2', label: 'Cancelled', icon: 'close-circle-outline'     },
  no_show:   { color: '#6b7280', bg: '#f3f4f6', label: 'No Show',   icon: 'person-remove-outline'    },
};

const FILTERS = ['all', 'pending', 'confirmed', 'seated', 'cancelled'] as const;

const STATUS_OPTIONS = [
  { value: 'pending',   label: 'Booked'    },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'seated',    label: 'Seated'    },
  { value: 'cancelled', label: 'Cancelled' },
];

// ── Add Reservation Modal ──────────────────────────────────────────────────────
function AddReservationModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors: c } = useTheme();
  const rm = useMemo(() => mkRm(c), [c]);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;

  const [form, setForm] = useState({
    customer_name:  '',
    customer_phone: '',
    date:           format(new Date(), 'yyyy-MM-dd'),
    time:           format(new Date(), 'HH:mm'),
    restaurant_table_id: '',
    guest_count:    '1',
    status:         'pending',
    notes:          '',
  });
  const [tables,  setTables]  = useState<{ id: number; name: string }[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [tableOpen,  setTableOpen]  = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  // Load tables when modal opens
  useEffect(() => {
    if (!visible) return;
    client.get('/tables').then(res => {
      const data = res.data?.data ?? res.data ?? [];
      setTables(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, [visible]);

  function resetForm() {
    setForm({ customer_name: '', customer_phone: '', date: format(new Date(), 'yyyy-MM-dd'), time: format(new Date(), 'HH:mm'), restaurant_table_id: '', guest_count: '1', status: 'pending', notes: '' });
    setErrors({});
  }

  function field(key: keyof typeof form) {
    return (val: string) => {
      setForm(p => ({ ...p, [key]: val }));
      if (errors[key]) setErrors(p => ({ ...p, [key]: '' }));
    };
  }

  async function save() {
    const e: Record<string, string> = {};
    if (!form.customer_name.trim()) e.customer_name = 'Customer name is required';
    if (!form.date)                  e.date          = 'Date is required';
    if (!form.guest_count || parseInt(form.guest_count) < 1) e.guest_count = 'Min 1 guest';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      const reserved_at = `${form.date}T${form.time || '00:00'}`;
      await client.post('/reservations', {
        customer_name:       form.customer_name.trim(),
        customer_phone:      form.customer_phone.trim() || undefined,
        reserved_at,
        restaurant_table_id: form.restaurant_table_id ? parseInt(form.restaurant_table_id) : undefined,
        guest_count:         parseInt(form.guest_count) || 1,
        status:              form.status,
        notes:               form.notes.trim() || undefined,
      });
      resetForm();
      onSaved();
      onClose();
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err?.response?.data?.message ?? 'Failed to save');
      else Alert.alert('Error', err?.response?.data?.message ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  const selectedTable  = tables.find(t => String(t.id) === form.restaurant_table_id);
  const selectedStatus = STATUS_OPTIONS.find(s => s.value === form.status);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={rm.backdrop} onPress={onClose}>
          <Pressable style={[rm.panel, isDesktop && rm.panelDesktop]} onPress={() => { setTableOpen(false); setStatusOpen(false); }}>

            {/* Header */}
            <View style={rm.header}>
              <View style={rm.headerLeft}>
                <View style={rm.headerIcon}>
                  <Ionicons name="calendar-outline" size={16} color={GOLD} />
                </View>
                <View>
                  <Text style={rm.headerTitle}>Add Reservation</Text>
                  <Text style={rm.headerSub}>Book a table for a customer</Text>
                </View>
              </View>
              <Pressable style={({ pressed }) => [rm.closeBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 18, gap: 14 }}
              keyboardShouldPersistTaps="handled">

              {/* Row 1: Customer Name | Phone */}
              <View style={rm.row}>
                <View style={[rm.field, { flex: 1 }]}>
                  <Text style={rm.label}>Customer name <Text style={rm.req}>*</Text></Text>
                  <View style={[rm.inputWrap, !!errors.customer_name && rm.inputError]}>
                    <View style={rm.prefix}><Ionicons name="person-outline" size={15} color={c.textMuted} /></View>
                    <TextInput style={rm.input} value={form.customer_name} onChangeText={field('customer_name')} placeholder="Customer name" placeholderTextColor={c.textMuted} />
                  </View>
                  {errors.customer_name ? <Text style={rm.fieldErr}>{errors.customer_name}</Text> : null}
                </View>
                <View style={[rm.field, { flex: 1 }]}>
                  <Text style={rm.label}>Customer phone</Text>
                  <View style={rm.inputWrap}>
                    <View style={rm.prefix}><Ionicons name="call-outline" size={15} color={c.textMuted} /></View>
                    <TextInput style={rm.input} value={form.customer_phone} onChangeText={field('customer_phone')} placeholder="Phone" placeholderTextColor={c.textMuted} keyboardType="phone-pad" />
                  </View>
                </View>
              </View>

              {/* Row 2: Date | Time */}
              <View style={rm.row}>
                <View style={[rm.field, { flex: 1 }]}>
                  <Text style={rm.label}>Date <Text style={rm.req}>*</Text></Text>
                  <View style={[rm.inputWrap, !!errors.date && rm.inputError]}>
                    <View style={rm.prefix}><Ionicons name="calendar-outline" size={15} color={c.textMuted} /></View>
                    {Platform.OS === 'web' ? (
                      <input type="date" value={form.date}
                        onChange={e => field('date')((e.target as HTMLInputElement).value)}
                        style={{ flex: 1, padding: '11px 12px', fontSize: 14, color: c.heading, border: 'none', outline: 'none', background: 'transparent', minWidth: 0 } as any} />
                    ) : (
                      <TextInput style={rm.input} value={form.date} onChangeText={field('date')} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} />
                    )}
                  </View>
                  {errors.date ? <Text style={rm.fieldErr}>{errors.date}</Text> : null}
                </View>
                <View style={[rm.field, { flex: 1 }]}>
                  <Text style={rm.label}>Time</Text>
                  <View style={rm.inputWrap}>
                    <View style={rm.prefix}><Ionicons name="time-outline" size={15} color={c.textMuted} /></View>
                    {Platform.OS === 'web' ? (
                      <input type="time" value={form.time}
                        onChange={e => field('time')((e.target as HTMLInputElement).value)}
                        style={{ flex: 1, padding: '11px 12px', fontSize: 14, color: c.heading, border: 'none', outline: 'none', background: 'transparent', minWidth: 0 } as any} />
                    ) : (
                      <TextInput style={rm.input} value={form.time} onChangeText={field('time')} placeholder="HH:MM" placeholderTextColor={c.textMuted} />
                    )}
                  </View>
                </View>
              </View>

              {/* Row 3: Table | No of Guests */}
              <View style={rm.row}>
                {/* Table dropdown */}
                <View style={[rm.field, { flex: 1 }]}>
                  <Text style={rm.label}>Table</Text>
                  <Pressable style={[rm.inputWrap, { justifyContent: 'space-between' }]} onPress={() => { setTableOpen(p => !p); setStatusOpen(false); }}>
                    <View style={rm.prefix}><Ionicons name="grid-outline" size={15} color={c.textMuted} /></View>
                    <Text style={[rm.input, { paddingVertical: 13, color: selectedTable ? c.heading : c.textMuted }]}>
                      {selectedTable ? selectedTable.name : 'Select'}
                    </Text>
                    <View style={{ paddingRight: 12 }}>
                      <Ionicons name={tableOpen ? 'chevron-up' : 'chevron-down'} size={14} color={c.textMuted} />
                    </View>
                  </Pressable>
                  {tableOpen && (
                    <View style={rm.dropdown}>
                      <Pressable style={rm.dropItem} onPress={() => { field('restaurant_table_id')(''); setTableOpen(false); }}>
                        <Text style={rm.dropItemTxt}>Select</Text>
                      </Pressable>
                      {tables.map(t => (
                        <Pressable key={t.id} style={[rm.dropItem, form.restaurant_table_id === String(t.id) && rm.dropItemActive]}
                          onPress={() => { field('restaurant_table_id')(String(t.id)); setTableOpen(false); }}>
                          <Text style={[rm.dropItemTxt, form.restaurant_table_id === String(t.id) && { color: GOLD, fontWeight: '700' }]}>{t.name}</Text>
                          {form.restaurant_table_id === String(t.id) && <Ionicons name="checkmark" size={13} color={GOLD} />}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                {/* No of Guests */}
                <View style={[rm.field, { flex: 1 }]}>
                  <Text style={rm.label}>No of Guests <Text style={rm.req}>*</Text></Text>
                  <View style={[rm.inputWrap, !!errors.guest_count && rm.inputError]}>
                    <View style={rm.prefix}><Ionicons name="people-outline" size={15} color={c.textMuted} /></View>
                    <TextInput style={rm.input} value={form.guest_count} onChangeText={field('guest_count')} keyboardType="number-pad" placeholder="1" placeholderTextColor={c.textMuted} />
                  </View>
                  {errors.guest_count ? <Text style={rm.fieldErr}>{errors.guest_count}</Text> : null}
                </View>
              </View>

              {/* Status dropdown */}
              <View style={rm.field}>
                <Text style={rm.label}>Status <Text style={rm.req}>*</Text></Text>
                <Pressable style={[rm.inputWrap, { justifyContent: 'space-between' }]} onPress={() => { setStatusOpen(p => !p); setTableOpen(false); }}>
                  <View style={rm.prefix}><Ionicons name="flag-outline" size={15} color={c.textMuted} /></View>
                  <Text style={[rm.input, { paddingVertical: 13, color: c.heading }]}>
                    {selectedStatus?.label ?? 'Booked'}
                  </Text>
                  <View style={{ paddingRight: 12 }}>
                    <Ionicons name={statusOpen ? 'chevron-up' : 'chevron-down'} size={14} color={c.textMuted} />
                  </View>
                </Pressable>
                {statusOpen && (
                  <View style={rm.dropdown}>
                    {STATUS_OPTIONS.map(s => (
                      <Pressable key={s.value} style={[rm.dropItem, form.status === s.value && rm.dropItemActive]}
                        onPress={() => { field('status')(s.value); setStatusOpen(false); }}>
                        <View style={[rm.statusDot, { backgroundColor: STATUS_CFG[s.value]?.color ?? '#6b7280' }]} />
                        <Text style={[rm.dropItemTxt, form.status === s.value && { color: GOLD, fontWeight: '700' }]}>{s.label}</Text>
                        {form.status === s.value && <Ionicons name="checkmark" size={13} color={GOLD} />}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Notes */}
              <View style={rm.field}>
                <Text style={rm.label}>Notes <Text style={rm.opt}>(optional)</Text></Text>
                <View style={[rm.inputWrap, { alignItems: 'flex-start' }]}>
                  <TextInput
                    style={[rm.input, { paddingTop: 12, minHeight: 90, textAlignVertical: 'top' }]}
                    value={form.notes}
                    onChangeText={field('notes')}
                    placeholder="Notes"
                    placeholderTextColor={c.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={rm.footer}>
              <Pressable style={({ pressed }) => [rm.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
                <Text style={rm.cancelTxt}>Close</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [rm.saveBtn, saving && { opacity: 0.6 }, pressed && { opacity: 0.85 }]} onPress={save} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={GOLD} size="small" />
                  : <>
                      <Ionicons name="checkmark-circle-outline" size={17} color={GOLD} />
                      <Text style={rm.saveTxt}>Save Reservation</Text>
                    </>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function ReservationsScreen() {
  const { colors: c } = useTheme();
  const st = useMemo(() => mkSt(c), [c]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [activeFilter, setActiveFilter] = useState<typeof FILTERS[number]>('all');

  const load = useCallback(async () => {
    try {
      const res  = await client.get('/reservations');
      const data = res.data?.data ?? res.data ?? [];
      setReservations(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: number, status: string) {
    try {
      await client.put(`/reservations/${id}`, { status });
      await load();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e?.response?.data?.message ?? 'Failed');
      else Alert.alert('Error', e?.response?.data?.message ?? 'Failed');
    }
  }

  const filtered = activeFilter === 'all'
    ? reservations
    : reservations.filter(r => r.status === activeFilter);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={st.header}>
        <View>
          <Text style={st.headerTitle}>Reservations</Text>
          <Text style={st.headerSub}>{reservations.length} reservation{reservations.length !== 1 ? 's' : ''}</Text>
        </View>
        <Pressable style={({ pressed }) => [st.addBtn, pressed && { opacity: 0.85 }]} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={17} color="#fff" />
          <Text style={st.addBtnTxt}>New</Text>
        </Pressable>
      </View>

      {/* Filter chips */}
      <View style={st.filtersWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' }}>
          {FILTERS.map(s => {
            const cfg    = s !== 'all' ? STATUS_CFG[s] : null;
            const active = activeFilter === s;
            const count  = s === 'all' ? reservations.length : reservations.filter(r => r.status === s).length;
            return (
              <Pressable
                key={s}
                style={({ pressed }) => [
                  st.filterChip,
                  active && { backgroundColor: cfg?.color ?? c.sidebar, borderColor: cfg?.color ?? c.sidebar },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setActiveFilter(s)}>
                {s !== 'all' && cfg && (
                  <Ionicons name={cfg.icon} size={11} color={active ? '#fff' : cfg.color} />
                )}
                <Text style={[st.filterTxt, active && { color: '#fff', fontWeight: '700' }]}>
                  {s === 'all' ? 'All' : cfg?.label}
                </Text>
                <View style={[st.filterBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[st.filterBadgeTxt, active && { color: '#fff' }]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={r => String(r.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 32, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor={c.brand}
          />
        }
        renderItem={({ item: r }) => {
          const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
          return (
            <View style={st.card}>
              <View style={st.cardTop}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={st.customerName}>{r.customer_name}</Text>
                  {r.customer_phone
                    ? <Text style={st.customerPhone}><Ionicons name="call-outline" size={11} color={c.textMuted} /> {r.customer_phone}</Text>
                    : null}
                </View>
                <View style={[st.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
                  <Ionicons name={cfg.icon} size={11} color={cfg.color} />
                  <Text style={[st.statusTxt, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>

              <View style={st.metaRow}>
                <View style={st.metaItem}>
                  <Ionicons name="calendar-outline" size={12} color={c.textMuted} />
                  <Text style={st.metaTxt}>{format(new Date(r.reserved_at), 'dd MMM yyyy, hh:mm a')}</Text>
                </View>
                <View style={st.metaItem}>
                  <Ionicons name="people-outline" size={12} color={c.textMuted} />
                  <Text style={st.metaTxt}>{r.guest_count} guests</Text>
                </View>
                {r.table_name
                  ? <View style={st.metaItem}>
                      <Ionicons name="grid-outline" size={12} color={c.textMuted} />
                      <Text style={st.metaTxt}>{r.table_name}</Text>
                    </View>
                  : null}
              </View>

              {r.notes
                ? <Text style={st.notes}>{r.notes}</Text>
                : null}

              {/* Actions */}
              {r.status === 'pending' && (
                <View style={st.actions}>
                  <Pressable style={({ pressed }) => [st.actionBtn, { backgroundColor: '#2563eb' }, pressed && { opacity: 0.8 }]} onPress={() => updateStatus(r.id, 'confirmed')}>
                    <Ionicons name="checkmark-outline" size={13} color="#fff" />
                    <Text style={st.actionTxt}>Confirm</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [st.actionBtn, { backgroundColor: '#7c3aed' }, pressed && { opacity: 0.8 }]} onPress={() => updateStatus(r.id, 'seated')}>
                    <Ionicons name="restaurant-outline" size={13} color="#fff" />
                    <Text style={st.actionTxt}>Seat</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [st.actionBtn, { backgroundColor: '#dc2626' }, pressed && { opacity: 0.8 }]} onPress={() => updateStatus(r.id, 'cancelled')}>
                    <Ionicons name="close-outline" size={13} color="#fff" />
                    <Text style={st.actionTxt}>Cancel</Text>
                  </Pressable>
                </View>
              )}
              {r.status === 'confirmed' && (
                <View style={st.actions}>
                  <Pressable style={({ pressed }) => [st.actionBtn, { backgroundColor: '#7c3aed', flex: 1 }, pressed && { opacity: 0.8 }]} onPress={() => updateStatus(r.id, 'seated')}>
                    <Ionicons name="restaurant-outline" size={13} color="#fff" />
                    <Text style={st.actionTxt}>Mark Seated</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [st.actionBtn, { backgroundColor: '#6b7280' }, pressed && { opacity: 0.8 }]} onPress={() => updateStatus(r.id, 'no_show')}>
                    <Ionicons name="person-remove-outline" size={13} color="#fff" />
                    <Text style={st.actionTxt}>No Show</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={st.empty}>
            <View style={st.emptyIcon}>
              <Ionicons name="calendar-outline" size={36} color={c.textMuted} />
            </View>
            <Text style={st.emptyTitle}>No reservations found</Text>
            <Text style={st.emptySub}>{activeFilter === 'all' ? 'Start booking tables for customers.' : `No ${activeFilter} reservations.`}</Text>
            {activeFilter === 'all' && (
              <Pressable style={({ pressed }) => [st.emptyAddBtn, pressed && { opacity: 0.85 }]} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={GOLD} />
                <Text style={st.emptyAddTxt}>Add First Reservation</Text>
              </Pressable>
            )}
          </View>
        }
      />

      <AddReservationModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSaved={load}
      />
    </View>
  );
}

// ── StyleSheet factory functions (theme-aware) ────────────────────────────────
function mkSt(c: ThemeColors) {
  return StyleSheet.create({
    header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    headerTitle:  { fontSize: 20, fontWeight: '800', color: c.heading },
    headerSub:    { fontSize: 12, color: c.textMuted, marginTop: 2 },
    addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.sidebar, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    addBtnTxt:    { color: '#fff', fontWeight: '800', fontSize: 13.5 },
    filtersWrap:  { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, height: 50 },
    filterChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
    filterTxt:    { fontSize: 12, fontWeight: '600', color: c.text },
    filterBadge:  { backgroundColor: c.border, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
    filterBadgeTxt:{ fontSize: 10, fontWeight: '700', color: c.textMuted },
    card:         { backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    cardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    customerName: { fontSize: 15, fontWeight: '800', color: c.heading },
    customerPhone:{ fontSize: 12, color: c.textMuted },
    statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
    statusTxt:    { fontSize: 11, fontWeight: '700' },
    metaRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    metaItem:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaTxt:      { fontSize: 12.5, color: c.text, fontWeight: '500' },
    notes:        { fontSize: 12.5, color: c.textMuted, fontStyle: 'italic', paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border },
    actions:      { flexDirection: 'row', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border },
    actionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    actionTxt:    { color: '#fff', fontSize: 12.5, fontWeight: '700' },
    empty:        { paddingTop: 70, alignItems: 'center', gap: 10 },
    emptyIcon:    { width: 72, height: 72, borderRadius: 36, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    emptyTitle:   { fontSize: 16, fontWeight: '700', color: c.text },
    emptySub:     { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingHorizontal: 40 },
    emptyAddBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: c.sidebar, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
    emptyAddTxt:  { color: c.brand, fontWeight: '800', fontSize: 13.5 },
  });
}

function mkRm(c: ThemeColors) {
  return StyleSheet.create({
    backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    panel:        { width: '100%', maxHeight: '92%', borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
    panelDesktop: { width: 580, maxWidth: 580 },
    header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: c.sidebar },
    headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon:   { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,165,42,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,165,42,0.25)' },
    headerTitle:  { fontSize: 15, fontWeight: '800', color: '#fff' },
    headerSub:    { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
    closeBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    row:          { flexDirection: 'row', gap: 10 },
    field:        { gap: 0 },
    label:        { fontSize: 11.5, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7 },
    req:          { color: '#ef4444' },
    opt:          { color: c.textMuted, fontWeight: '500', textTransform: 'none' },
    inputWrap:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.border, borderRadius: 11, backgroundColor: c.surfaceAlt, overflow: 'hidden' },
    inputError:   { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
    prefix:       { width: 40, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt, borderRightWidth: 1, borderRightColor: c.border },
    input:        { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: c.heading },
    fieldErr:     { fontSize: 11.5, color: '#dc2626', fontWeight: '600', marginTop: 4 },
    dropdown:     { position: 'absolute', top: 52, left: 0, right: 0, zIndex: 999, backgroundColor: c.surface, borderRadius: 11, borderWidth: 1.5, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 8, overflow: 'hidden' },
    dropItem:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    dropItemActive:{ backgroundColor: c.surfaceAlt },
    dropItemTxt:  { flex: 1, fontSize: 13.5, color: c.text, fontWeight: '600' },
    statusDot:    { width: 8, height: 8, borderRadius: 4 },
    footer:       { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    cancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 11, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    cancelTxt:    { fontWeight: '700', color: c.text, fontSize: 14 },
    saveBtn:      { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 11, backgroundColor: c.sidebar },
    saveTxt:      { fontWeight: '800', color: c.brand, fontSize: 14 },
  });
}
