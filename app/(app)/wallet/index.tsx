/**
 * Wallet — Customer Balance Management
 * List customers with due/credit balances · Receive Payment modal · Transaction history
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import client from '@/api/client';
import type { Customer } from '@/types';

// ── Tokens ────────────────────────────────────────────────────────────────────
const PRIMARY  = '#2563eb';
const DUE_RED  = '#dc2626';
const CREDIT_G = '#16a34a';
const BG       = '#f8fafc';
const CARD_BG  = '#ffffff';
const BORDER   = '#e2e8f0';
const TEXT_M   = '#64748b';
const TEXT_D   = '#1e293b';

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
function avatarColor(name: string) {
  const COLORS = ['#1e40af', '#0f766e', '#7e22ce', '#be185d', '#c2410c', '#0369a1', '#1A2B1A'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}
function fmtBalance(balance: number) {
  // balance < 0 → customer owes (Due); balance > 0 → customer has credit
  if (balance === 0) return { label: '₹0.00', color: TEXT_M, isDue: false };
  if (balance < 0)   return { label: `Due ₹${Math.abs(balance).toFixed(2)}`, color: DUE_RED, isDue: true };
  return { label: `Credit ₹${balance.toFixed(2)}`, color: CREDIT_G, isDue: false };
}
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return format(new Date(iso), 'dd MMM yyyy, h:mm a'); }
  catch { return '—'; }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type WalletCustomer = Customer & { orders_count?: number; last_order_at?: string | null };

type Transaction = {
  id: number;
  type: 'order_charge' | 'payment' | 'adjustment';
  amount: number;
  balance_after: number;
  notes?: string | null;
  order_id?: number | null;
  created_at?: string | null;
};

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name) }]}>
      <Text style={[s.avatarTxt, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

// ── Customer Row ──────────────────────────────────────────────────────────────
function CustomerRow({
  item,
  onPay,
  onHistory,
}: {
  item: WalletCustomer;
  onPay: (c: WalletCustomer) => void;
  onHistory: (c: WalletCustomer) => void;
}) {
  const bal = fmtBalance(item.balance ?? 0);
  return (
    <View style={s.row}>
      <Avatar name={item.name} />
      <View style={s.rowInfo}>
        <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
        {!!item.phone && <Text style={s.rowSub}>{item.phone}</Text>}
      </View>
      <View style={s.rowRight}>
        <Text style={[s.balAmt, { color: bal.color }]}>{bal.label}</Text>
        <View style={s.rowActions}>
          <Pressable style={s.histBtn} onPress={() => onHistory(item)}>
            <Ionicons name="time-outline" size={16} color={PRIMARY} />
          </Pressable>
          {bal.isDue && (
            <Pressable style={s.payBtn} onPress={() => onPay(item)}>
              <Ionicons name="wallet-outline" size={15} color="#fff" />
              <Text style={s.payBtnTxt}>Pay</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Receive Payment Modal ─────────────────────────────────────────────────────
function PayModal({
  visible,
  customer,
  onClose,
  onDone,
}: {
  visible: boolean;
  customer: WalletCustomer | null;
  onClose: () => void;
  onDone: (newBalance: number) => void;
}) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (visible) { setAmount(''); setNotes(''); setError(''); }
  }, [visible]);

  async function submit() {
    if (!customer?.id) return;
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setError('Enter a valid amount greater than 0'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await client.post(`/customers/${customer.id}/payment`, { amount: amt, notes: notes.trim() || undefined });
      onDone(res.data.balance);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to record payment. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return null;
  const bal = fmtBalance(customer.balance ?? 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pm.overlay} onPress={() => { Keyboard.dismiss(); onClose(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={pm.box} onPress={e => e.stopPropagation()}>
            {/* Header */}
            <View style={pm.header}>
              <View style={pm.iconWrap}>
                <Ionicons name="wallet" size={24} color={PRIMARY} />
              </View>
              <Text style={pm.title}>Receive payment</Text>
              <Pressable style={pm.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={20} color={TEXT_M} />
              </Pressable>
            </View>

            {/* Customer info */}
            <View style={pm.info}>
              <Text style={pm.infoRow}>
                Customer: <Text style={pm.infoStrong}>{customer.name}</Text>
              </Text>
              <Text style={pm.infoRow}>
                Current balance:{' '}
                <Text style={[pm.infoStrong, { color: bal.color }]}>{bal.label}</Text>
              </Text>
            </View>

            {/* Amount */}
            <Text style={pm.label}>Amount received (₹) <Text style={{ color: DUE_RED }}>*</Text></Text>
            <View style={pm.inputWrap}>
              <TextInput
                style={pm.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="e.g. 100"
                keyboardType="decimal-pad"
                placeholderTextColor="#94a3b8"
                returnKeyType="next"
              />
            </View>
            <Text style={pm.hint}>Recording a payment reduces the amount due. E.g. due ₹500, pay ₹100 → remaining due ₹400.</Text>

            {/* Notes */}
            <Text style={[pm.label, { marginTop: 14 }]}>Notes (optional)</Text>
            <View style={pm.inputWrap}>
              <TextInput
                style={pm.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Cash payment"
                placeholderTextColor="#94a3b8"
                returnKeyType="done"
                onSubmitEditing={submit}
              />
            </View>

            {!!error && <Text style={pm.error}>{error}</Text>}

            {/* Actions */}
            <View style={pm.actions}>
              <Pressable style={pm.cancelBtn} onPress={onClose} disabled={saving}>
                <Text style={pm.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[pm.recordBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={pm.recordTxt}>Record payment</Text>}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Transaction History Modal ─────────────────────────────────────────────────
function HistoryModal({
  visible,
  customer,
  onClose,
}: {
  visible: boolean;
  customer: WalletCustomer | null;
  onClose: () => void;
}) {
  const [loading, setLoading]   = useState(false);
  const [txns, setTxns]         = useState<Transaction[]>([]);
  const [custInfo, setCustInfo] = useState<{ name: string; balance: number } | null>(null);

  useEffect(() => {
    if (visible && customer) load();
  }, [visible, customer]);

  async function load() {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const res = await client.get(`/customers/${customer.id}/transactions`);
      setTxns(res.data.transactions ?? []);
      setCustInfo(res.data.customer ?? null);
    } catch {
      setTxns([]);
    } finally {
      setLoading(false);
    }
  }

  function txnIcon(type: string) {
    if (type === 'payment')      return { name: 'arrow-down-circle' as const, color: CREDIT_G };
    if (type === 'order_charge') return { name: 'arrow-up-circle'   as const, color: DUE_RED  };
    return { name: 'swap-horizontal' as const, color: PRIMARY };
  }
  function txnLabel(type: string) {
    if (type === 'payment')      return 'Payment received';
    if (type === 'order_charge') return 'Order charge';
    return 'Adjustment';
  }

  const bal = custInfo ? fmtBalance(custInfo.balance) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pm.overlay} onPress={onClose}>
        <Pressable style={[pm.box, { maxHeight: '80%', paddingBottom: 0 }]} onPress={e => e.stopPropagation()}>
          {/* Header */}
          <View style={pm.header}>
            <View style={[pm.iconWrap, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="time" size={22} color={CREDIT_G} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={pm.title}>{custInfo?.name ?? customer?.name ?? 'Transactions'}</Text>
              {bal && <Text style={[hm.balLine, { color: bal.color }]}>{bal.label}</Text>}
            </View>
            <Pressable style={pm.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={TEXT_M} />
            </Pressable>
          </View>

          {loading ? (
            <View style={hm.loader}><ActivityIndicator color={PRIMARY} /></View>
          ) : txns.length === 0 ? (
            <View style={hm.empty}>
              <Ionicons name="receipt-outline" size={40} color="#cbd5e1" />
              <Text style={hm.emptyTxt}>No transactions yet</Text>
            </View>
          ) : (
            <ScrollView style={{ marginBottom: 16 }} showsVerticalScrollIndicator={false}>
              {txns.map((t) => {
                const ic  = txnIcon(t.type);
                const afr = fmtBalance(t.balance_after);
                return (
                  <View key={t.id} style={hm.txnRow}>
                    <Ionicons name={ic.name} size={22} color={ic.color} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={hm.txnLabel}>{txnLabel(t.type)}</Text>
                      {!!t.notes && <Text style={hm.txnNote}>{t.notes}</Text>}
                      <Text style={hm.txnDate}>{fmtDate(t.created_at)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[hm.txnAmt, { color: t.type === 'payment' ? CREDIT_G : DUE_RED }]}>
                        {t.type === 'payment' ? '+' : '-'}₹{Math.abs(t.amount).toFixed(2)}
                      </Text>
                      <Text style={[hm.txnAfter, { color: afr.color }]}>{afr.label}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function WalletScreen() {
  const { width } = useWindowDimensions();
  const isLarge   = width >= 768;

  const [customers, setCustomers] = useState<WalletCustomer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<'all' | 'due' | 'credit'>('all');

  const [payTarget, setPayTarget]   = useState<WalletCustomer | null>(null);
  const [histTarget, setHistTarget] = useState<WalletCustomer | null>(null);

  const loadCustomers = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await client.get('/customers');
      const all = (res.data as WalletCustomer[]);
      // Wallet only manages registered customers (those in the customers table with a real id)
      // is_registered may be absent from older API responses — treat undefined as registered
      setCustomers(all.filter(c => c.is_registered !== false && c.id !== null));
    } catch {
      // silently fail on refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const totalDue    = useMemo(() => customers.filter(c => (c.balance ?? 0) < 0).reduce((a, c) => a + Math.abs(c.balance ?? 0), 0), [customers]);
  const totalCredit = useMemo(() => customers.filter(c => (c.balance ?? 0) > 0).reduce((a, c) => a + (c.balance ?? 0), 0), [customers]);
  const dueCount    = useMemo(() => customers.filter(c => (c.balance ?? 0) < 0).length, [customers]);

  const displayed = useMemo(() => {
    let list = [...customers];
    if (filter === 'due')    list = list.filter(c => (c.balance ?? 0) < 0);
    if (filter === 'credit') list = list.filter(c => (c.balance ?? 0) > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q));
    }
    // Sort by most due first, then credit, then zero
    list.sort((a, b) => (a.balance ?? 0) - (b.balance ?? 0));
    return list;
  }, [customers, filter, search]);

  function onPayDone(newBalance: number) {
    if (!payTarget) return;
    setCustomers(prev => prev.map(c => c.id === payTarget.id ? { ...c, balance: newBalance } : c));
    setPayTarget(null);
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={[s.header, isLarge && s.headerLarge]}>
        <View>
          <Text style={s.pageTitle}>Wallet</Text>
          <Text style={s.pageSubtitle}>Customer balance management</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, isLarge && s.contentLarge]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadCustomers(true)} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Stats */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { borderLeftColor: DUE_RED }]}>
            <Text style={[s.statAmt, { color: DUE_RED }]}>₹{totalDue.toFixed(2)}</Text>
            <Text style={s.statLabel}>Total Due</Text>
            <Text style={s.statCount}>{dueCount} customer{dueCount !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[s.statCard, { borderLeftColor: CREDIT_G }]}>
            <Text style={[s.statAmt, { color: CREDIT_G }]}>₹{totalCredit.toFixed(2)}</Text>
            <Text style={s.statLabel}>Total Credit</Text>
            <Text style={s.statCount}>{customers.filter(c => (c.balance ?? 0) > 0).length} customer{customers.filter(c => (c.balance ?? 0) > 0).length !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Filter tabs */}
        <View style={s.filterRow}>
          {(['all', 'due', 'credit'] as const).map(f => (
            <Pressable
              key={f}
              style={[s.filterTab, filter === f && s.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterTabTxt, filter === f && s.filterTabTxtActive]}>
                {f === 'all' ? 'All' : f === 'due' ? 'Due' : 'Credit'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={TEXT_M} style={{ marginRight: 8 }} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or phone…"
            placeholderTextColor="#94a3b8"
            returnKeyType="search"
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={TEXT_M} />
            </Pressable>
          )}
        </View>

        {/* List */}
        {displayed.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="wallet-outline" size={48} color="#cbd5e1" />
            <Text style={s.emptyTxt}>
              {filter !== 'all' ? `No ${filter} balances found` : 'No customers found'}
            </Text>
          </View>
        ) : (
          <View style={s.listCard}>
            {displayed.map((item, idx) => (
              <View key={item.id}>
                {idx > 0 && <View style={s.divider} />}
                <CustomerRow item={item} onPay={c => setPayTarget(c)} onHistory={c => setHistTarget(c)} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <PayModal
        visible={!!payTarget}
        customer={payTarget}
        onClose={() => setPayTarget(null)}
        onDone={onPayDone}
      />
      <HistoryModal
        visible={!!histTarget}
        customer={histTarget}
        onClose={() => setHistTarget(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: BG },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { backgroundColor: '#1A2B1A', paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  headerLarge:  { paddingTop: 24 },
  pageTitle:    { fontSize: 22, fontWeight: '800', color: '#fff' },
  pageSubtitle: { fontSize: 13, color: '#86efac', marginTop: 2 },
  content:      { padding: 16, paddingBottom: 32 },
  contentLarge: { maxWidth: 800, alignSelf: 'center', width: '100%' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: CARD_BG, borderRadius: 12, padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statAmt:   { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 12, color: TEXT_M, marginTop: 2 },
  statCount: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  filterRow: { flexDirection: 'row', backgroundColor: CARD_BG, borderRadius: 10, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: BORDER },
  filterTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  filterTabActive: { backgroundColor: PRIMARY },
  filterTabTxt:    { fontSize: 13, color: TEXT_M, fontWeight: '600' },
  filterTabTxtActive: { color: '#fff' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD_BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: BORDER, marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 14, color: TEXT_D },

  listCard: { backgroundColor: CARD_BG, borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  divider:  { height: 1, backgroundColor: BORDER, marginLeft: 60 },

  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  avatar:    { alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarTxt: { color: '#fff', fontWeight: '800' },
  rowInfo:   { flex: 1, marginRight: 8 },
  rowName:   { fontSize: 14, fontWeight: '700', color: TEXT_D },
  rowSub:    { fontSize: 12, color: TEXT_M, marginTop: 2 },
  rowRight:  { alignItems: 'flex-end' },
  balAmt:    { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  rowActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },

  histBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: CREDIT_G, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  payBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  empty:    { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTxt: { fontSize: 15, color: '#94a3b8', fontWeight: '600' },
});

const pm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  box: {
    backgroundColor: CARD_BG, borderRadius: 16,
    width: '100%', maxWidth: 440, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
  },
  title:    { flex: 1, fontSize: 18, fontWeight: '800', color: TEXT_D },
  closeBtn: { padding: 4 },

  info:       { backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 18 },
  infoRow:    { fontSize: 13, color: TEXT_M, marginBottom: 4 },
  infoStrong: { fontWeight: '700', color: TEXT_D },

  label:    { fontSize: 13, fontWeight: '700', color: TEXT_D, marginBottom: 6 },
  inputWrap: { borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: '#fff', marginBottom: 6 },
  input:    { padding: 12, fontSize: 14, color: TEXT_D },
  hint:     { fontSize: 11.5, color: TEXT_M, lineHeight: 16, marginTop: 2 },
  error:    { color: DUE_RED, fontSize: 12, marginTop: 10, fontWeight: '600' },

  actions:   { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: BORDER,
  },
  cancelTxt: { fontSize: 14, fontWeight: '700', color: TEXT_M },
  recordBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: PRIMARY,
  },
  recordTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

const hm = StyleSheet.create({
  balLine:   { fontSize: 12, fontWeight: '700', marginTop: 2 },
  loader:    { paddingVertical: 40, alignItems: 'center' },
  empty:     { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyTxt:  { fontSize: 14, color: '#94a3b8' },
  txnRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  txnLabel:  { fontSize: 13, fontWeight: '700', color: TEXT_D },
  txnNote:   { fontSize: 12, color: TEXT_M, marginTop: 2 },
  txnDate:   { fontSize: 11, color: '#94a3b8', marginTop: 3 },
  txnAmt:    { fontSize: 14, fontWeight: '800' },
  txnAfter:  { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
