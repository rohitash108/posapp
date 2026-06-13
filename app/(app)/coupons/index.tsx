/**
 * Coupons Screen — Professional redesign
 * Forest-green header · Stats · Cards · Desktop side-panel form · Pressable throughout
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, Modal,
  ActivityIndicator, RefreshControl, Alert, Switch,
  ScrollView, Pressable, useWindowDimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { couponsApi } from '@/api/coupons';
import type { Coupon } from '@/types';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

// ── Helpers ───────────────────────────────────────────────────────────────────
function isExpired(c: Coupon) {
  if (!c.expires_at) return false;
  return new Date(c.expires_at) < new Date();
}

function usagePercent(c: Coupon) {
  const used  = c.used_count ?? c.usage_count ?? 0;
  const limit = c.max_uses   ?? c.usage_limit;
  if (!limit || limit === 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ── Coupon Form ───────────────────────────────────────────────────────────────
interface FormProps {
  coupon?: Coupon | null;
  onSave: () => void;
  onClose: () => void;
  inPanel?: boolean;  // true = inside desktop side panel, no modal chrome
}

function CouponForm({ coupon, onSave, onClose, inPanel }: FormProps) {
  const [code,     setCode]     = useState(coupon?.code ?? '');
  const [type,     setType]     = useState<'percentage' | 'fixed'>(coupon?.discount_type ?? 'percentage');
  const [value,    setValue]    = useState(coupon ? String(coupon.discount_value) : '');
  const [minOrder, setMinOrder] = useState(coupon?.min_order_amount ? String(coupon.min_order_amount) : '');
  const [maxUses,  setMaxUses]  = useState(coupon?.max_uses ? String(coupon.max_uses) : '');
  const [expires,  setExpires]  = useState(coupon?.expires_at ? coupon.expires_at.substring(0, 10) : '');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function save() {
    if (!code.trim())              { setError('Coupon code is required'); return; }
    if (!value || isNaN(Number(value))) { setError('Enter a valid discount value'); return; }
    if (type === 'percentage' && (Number(value) <= 0 || Number(value) > 100)) {
      setError('Percentage must be between 1 and 100'); return;
    }
    setLoading(true); setError('');
    try {
      const payload = {
        code:              code.toUpperCase().trim(),
        discount_type:     type,
        discount_value:    Number(value),
        min_order_amount:  minOrder ? Number(minOrder) : undefined,
        max_uses:          maxUses  ? Number(maxUses)  : undefined,
        expires_at:        expires  || undefined,
      };
      if (coupon?.id) await couponsApi.update(coupon.id, payload);
      else            await couponsApi.create(payload);
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save coupon');
    } finally { setLoading(false); }
  }

  const isEdit = !!coupon?.id;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Form header */}
      <View style={fm.header}>
        <View style={fm.headerLeft}>
          <View style={fm.headerIcon}>
            <Ionicons name={isEdit ? 'pencil' : 'pricetag'} size={16} color={GOLD} />
          </View>
          <View>
            <Text style={fm.headerTitle}>{isEdit ? 'Edit Coupon' : 'New Coupon'}</Text>
            <Text style={fm.headerSub}>{isEdit ? `Editing ${coupon.code}` : 'Create a discount code'}</Text>
          </View>
        </View>
        <Pressable style={({ pressed }) => [fm.closeBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
          <Ionicons name="close" size={20} color="#6b7280" />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 18, gap: 16 }}>

        {/* Coupon Code */}
        <View style={fm.field}>
          <Text style={fm.label}>Coupon Code <Text style={{ color: '#ef4444' }}>*</Text></Text>
          <View style={fm.codeInputWrap}>
            <Ionicons name="pricetag-outline" size={16} color="#9ca3af" style={{ marginLeft: 12 }} />
            <TextInput
              style={fm.codeInput}
              value={code}
              onChangeText={v => setCode(v.toUpperCase())}
              placeholder="e.g. SAVE20"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
            />
          </View>
          <Text style={fm.hint}>Customers will enter this code at checkout</Text>
        </View>

        {/* Discount Type */}
        <View style={fm.field}>
          <Text style={fm.label}>Discount Type</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Pressable
              style={[fm.typeBtn, type === 'percentage' && fm.typeBtnActive]}
              onPress={() => setType('percentage')}>
              <Ionicons
                name="pricetag-outline"
                size={15}
                color={type === 'percentage' ? GOLD : '#6b7280'}
              />
              <Text style={[fm.typeBtnTxt, type === 'percentage' && fm.typeBtnTxtActive]}>
                Percentage
              </Text>
              {type === 'percentage' && (
                <View style={fm.typeBtnCheck}>
                  <Ionicons name="checkmark" size={11} color={GOLD} />
                </View>
              )}
            </Pressable>
            <Pressable
              style={[fm.typeBtn, type === 'fixed' && fm.typeBtnActive]}
              onPress={() => setType('fixed')}>
              <Text style={[fm.typeBtnIcon, type === 'fixed' && { color: GOLD }]}>₹</Text>
              <Text style={[fm.typeBtnTxt, type === 'fixed' && fm.typeBtnTxtActive]}>
                Fixed Amount
              </Text>
              {type === 'fixed' && (
                <View style={fm.typeBtnCheck}>
                  <Ionicons name="checkmark" size={11} color={GOLD} />
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Discount Value */}
        <View style={fm.field}>
          <Text style={fm.label}>Discount Value <Text style={{ color: '#ef4444' }}>*</Text></Text>
          <View style={fm.inputWrap}>
            <View style={fm.inputPrefix}>
              <Text style={fm.inputPrefixTxt}>{type === 'percentage' ? '%' : '₹'}</Text>
            </View>
            <TextInput
              style={fm.input}
              value={value}
              onChangeText={setValue}
              placeholder={type === 'percentage' ? '0 – 100' : '0.00'}
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Min Order & Max Uses row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Min Order (₹)</Text>
            <View style={fm.inputWrap}>
              <View style={fm.inputPrefix}>
                <Text style={fm.inputPrefixTxt}>₹</Text>
              </View>
              <TextInput
                style={fm.input}
                value={minOrder}
                onChangeText={setMinOrder}
                placeholder="Any"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <View style={[fm.field, { flex: 1 }]}>
            <Text style={fm.label}>Max Uses</Text>
            <View style={fm.inputWrap}>
              <View style={fm.inputPrefix}>
                <Ionicons name="people-outline" size={13} color="#9ca3af" />
              </View>
              <TextInput
                style={fm.input}
                value={maxUses}
                onChangeText={setMaxUses}
                placeholder="∞"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Expiry Date */}
        <View style={fm.field}>
          <Text style={fm.label}>Expiry Date</Text>
          <View style={fm.inputWrap}>
            <View style={fm.inputPrefix}>
              <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
            </View>
            <TextInput
              style={fm.input}
              value={expires}
              onChangeText={setExpires}
              placeholder="YYYY-MM-DD (optional)"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* Error */}
        {!!error && (
          <View style={fm.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#dc2626" />
            <Text style={fm.errorTxt}>{error}</Text>
          </View>
        )}

        {/* Preview pill */}
        {code.trim() && value ? (
          <View style={fm.previewBox}>
            <Text style={fm.previewLabel}>Preview</Text>
            <View style={fm.previewPill}>
              <Ionicons name="pricetag" size={13} color={GOLD} />
              <Text style={fm.previewCode}>{code.toUpperCase()}</Text>
              <Text style={fm.previewVal}>
                {type === 'percentage' ? `${value}% OFF` : `₹${value} OFF`}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Footer */}
      <View style={fm.footer}>
        <Pressable style={({ pressed }) => [fm.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
          <Text style={fm.cancelTxt}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [fm.saveBtn, pressed && { opacity: 0.85 }]}
          disabled={loading}
          onPress={save}>
          {loading
            ? <ActivityIndicator color={GOLD} size="small" />
            : <>
                <Ionicons name={isEdit ? 'checkmark-circle' : 'add-circle'} size={17} color={GOLD} />
                <Text style={fm.saveTxt}>{isEdit ? 'Update Coupon' : 'Create Coupon'}</Text>
              </>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ── Coupon Card ───────────────────────────────────────────────────────────────
function CouponCard({
  coupon: c, toggling, onEdit, onDelete, onToggle,
}: {
  coupon: Coupon;
  toggling: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const expired = isExpired(c);
  const pct     = usagePercent(c);
  const used    = c.used_count ?? c.usage_count ?? 0;
  const limit   = c.max_uses   ?? c.usage_limit;
  const inactive = !c.is_active;

  return (
    <View style={[
      cc.card,
      expired  && cc.cardExpired,
      inactive && cc.cardInactive,
    ]}>
      {/* Top row: code + toggle */}
      <View style={cc.top}>
        <View style={cc.codeRow}>
          <View style={[cc.codeTag, expired && { backgroundColor: '#f3f4f6' }]}>
            <Ionicons name="pricetag" size={11} color={expired ? '#9ca3af' : GOLD} />
            <Text style={[cc.codeText, expired && { color: '#9ca3af' }]}>{c.code}</Text>
          </View>
          {expired && (
            <View style={cc.expiredBadge}>
              <Text style={cc.expiredTxt}>EXPIRED</Text>
            </View>
          )}
          {!c.is_active && !expired && (
            <View style={cc.inactiveBadge}>
              <Text style={cc.inactiveTxt}>INACTIVE</Text>
            </View>
          )}
        </View>
        {toggling
          ? <ActivityIndicator size="small" color={FOREST} />
          : <Switch
              value={!!c.is_active}
              onValueChange={onToggle}
              trackColor={{ true: '#16a34a', false: '#e5e7eb' }}
              thumbColor="#fff"
            />
        }
      </View>

      {/* Discount value + meta chips */}
      <View style={cc.midRow}>
        <View style={[cc.valuePill, c.discount_type === 'percentage' ? cc.pillGreen : cc.pillBlue]}>
          <Text style={[cc.valueTxt, c.discount_type === 'percentage' ? cc.valueTxtGreen : cc.valueTxtBlue]}>
            {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
          </Text>
        </View>
        {c.min_order_amount ? (
          <View style={cc.metaChip}>
            <Ionicons name="bag-handle-outline" size={10} color="#6b7280" />
            <Text style={cc.metaTxt}>Min ₹{c.min_order_amount}</Text>
          </View>
        ) : null}
        {limit ? (
          <View style={cc.metaChip}>
            <Ionicons name="people-outline" size={10} color="#6b7280" />
            <Text style={cc.metaTxt}>{used}/{limit} uses</Text>
          </View>
        ) : null}
      </View>

      {/* Usage progress bar */}
      {pct !== null && (
        <View style={cc.progressWrap}>
          <View style={cc.progressTrack}>
            <View style={[
              cc.progressFill,
              { width: `${pct}%` as any },
              pct >= 90 && { backgroundColor: '#ef4444' },
              pct >= 60 && pct < 90 && { backgroundColor: '#d97706' },
            ]} />
          </View>
          <Text style={cc.progressTxt}>{pct}% used</Text>
        </View>
      )}

      {/* Bottom row: expiry + actions */}
      <View style={cc.botRow}>
        <View style={{ gap: 2 }}>
          {!limit && (
            <Text style={cc.usageTxt}>
              <Ionicons name="repeat-outline" size={11} color="#9ca3af" /> {used} total uses
            </Text>
          )}
          {c.expires_at ? (
            <Text style={[cc.expiryTxt, expired && cc.expiryExpired]}>
              <Ionicons name="time-outline" size={11} color={expired ? '#dc2626' : '#9ca3af'} />
              {' '}{expired ? 'Expired' : 'Expires'} {format(new Date(c.expires_at), 'dd MMM yyyy')}
            </Text>
          ) : (
            <Text style={cc.usageTxt}>No expiry</Text>
          )}
        </View>
        <View style={cc.actionsRow}>
          <Pressable
            style={({ pressed }) => [cc.actionBtn, cc.actionEdit, pressed && { opacity: 0.7 }]}
            onPress={onEdit}>
            <Ionicons name="pencil-outline" size={14} color={PRIMARY} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [cc.actionBtn, cc.actionDelete, pressed && { opacity: 0.7 }]}
            onPress={onDelete}>
            <Ionicons name="trash-outline" size={14} color="#dc2626" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function CouponsScreen() {
  const [coupons,    setCoupons]    = useState<Coupon[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState<Coupon | null>(null);
  const [toggling,   setToggling]   = useState<Set<number>>(new Set());
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await couponsApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setCoupons(Array.isArray(data) ? data : []);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return coupons.filter(c => {
      if (filter === 'active'   && (!c.is_active || isExpired(c))) return false;
      if (filter === 'inactive' && c.is_active)  return false;
      if (filter === 'expired'  && !isExpired(c)) return false;
      if (search) return c.code.toLowerCase().includes(search.toLowerCase());
      return true;
    });
  }, [coupons, filter, search]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const activeCount   = useMemo(() => coupons.filter(c => c.is_active && !isExpired(c)).length, [coupons]);
  const expiredCount  = useMemo(() => coupons.filter(c => isExpired(c)).length,                  [coupons]);
  const inactiveCount = coupons.length - activeCount - expiredCount;

  // ── Actions ───────────────────────────────────────────────────────────────────
  async function handleDelete(c: Coupon) {
    if (Platform.OS === 'web') {
      if (!window.confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
      try { await couponsApi.delete(c.id); load(true); }
      catch (e: any) { window.alert(e?.response?.data?.message ?? 'Delete failed'); }
    } else {
      Alert.alert('Delete Coupon', `Delete coupon "${c.code}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await couponsApi.delete(c.id); load(true); }
          catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Delete failed'); }
        }},
      ]);
    }
  }

  async function handleToggle(c: Coupon) {
    setToggling(prev => new Set(prev).add(c.id));
    const newVal = !c.is_active;
    setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: newVal } : x));
    try { await couponsApi.toggle(c.id); }
    catch { setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !newVal } : x)); }
    finally {
      setToggling(prev => { const n = new Set(prev); n.delete(c.id); return n; });
    }
  }

  function openCreate() { setEditing(null); setFormOpen(true); }
  function openEdit(c: Coupon) { setEditing(c); setFormOpen(true); }
  function afterSave() { setFormOpen(false); setEditing(null); load(true); }

  // ── Filter tabs ───────────────────────────────────────────────────────────────
  const FILTER_TABS = [
    { key: 'all',      label: 'All',      count: coupons.length,  color: '#fff',    activeColor: FOREST },
    { key: 'active',   label: 'Active',   count: activeCount,     color: '#16a34a', activeColor: '#16a34a' },
    { key: 'inactive', label: 'Inactive', count: inactiveCount,   color: '#9ca3af', activeColor: '#6b7280' },
    { key: 'expired',  label: 'Expired',  count: expiredCount,    color: '#ef4444', activeColor: '#ef4444' },
  ] as const;

  // ── List content ──────────────────────────────────────────────────────────────
  const ListContent = (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={s.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Coupons</Text>
          <Text style={s.pageSub}>{coupons.length} discount code{coupons.length !== 1 ? 's' : ''}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85 }]}
          onPress={openCreate}>
          <Ionicons name="add" size={17} color="#fff" />
          <Text style={s.addBtnTxt}>New Coupon</Text>
        </Pressable>
      </View>

      {/* Stats bar */}
      <View style={s.statsBar}>
        <View style={s.statItem}>
          <View style={[s.statIcon, { backgroundColor: '#2563eb18' }]}>
            <Ionicons name="pricetags-outline" size={14} color={PRIMARY} />
          </View>
          <Text style={[s.statVal, { color: PRIMARY }]}>{coupons.length}</Text>
          <Text style={s.statLbl}>Total</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <View style={[s.statIcon, { backgroundColor: '#16a34a18' }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#16a34a" />
          </View>
          <Text style={[s.statVal, { color: '#16a34a' }]}>{activeCount}</Text>
          <Text style={s.statLbl}>Active</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <View style={[s.statIcon, { backgroundColor: '#6b728018' }]}>
            <Ionicons name="pause-circle-outline" size={14} color="#6b7280" />
          </View>
          <Text style={[s.statVal, { color: '#6b7280' }]}>{inactiveCount}</Text>
          <Text style={s.statLbl}>Inactive</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <View style={[s.statIcon, { backgroundColor: '#ef444418' }]}>
            <Ionicons name="time-outline" size={14} color="#ef4444" />
          </View>
          <Text style={[s.statVal, { color: '#ef4444' }]}>{expiredCount}</Text>
          <Text style={s.statLbl}>Expired</Text>
        </View>
      </View>

      {/* Search + filter tabs */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color="#9ca3af" />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search coupon code…"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={s.tabsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' }}>
          {FILTER_TABS.map(tab => {
            const active = filter === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={({ pressed }) => [
                  s.filterTab,
                  active && { backgroundColor: tab.activeColor, borderColor: tab.activeColor },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setFilter(tab.key)}>
                <Text style={[s.filterTabTxt, active && { color: '#fff', fontWeight: '700' }]}>
                  {tab.label}
                </Text>
                <View style={[s.tabCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.tabCountTxt, active && { color: '#fff' }]}>{tab.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Result count */}
      <View style={s.resultRow}>
        <Text style={s.resultTxt}>{filtered.length} coupon{filtered.length !== 1 ? 's' : ''}</Text>
        {(search || filter !== 'all') && (
          <Pressable onPress={() => { setSearch(''); setFilter('all'); }}>
            <Text style={s.clearAll}>Clear filters</Text>
          </Pressable>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color={FOREST} size="large" />
          <Text style={s.loadTxt}>Loading coupons…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 10, paddingBottom: 40, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={GOLD}
            />
          }
          renderItem={({ item: c }) => (
            <CouponCard
              coupon={c}
              toggling={toggling.has(c.id)}
              onEdit={() => openEdit(c)}
              onDelete={() => handleDelete(c)}
              onToggle={() => handleToggle(c)}
            />
          )}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="pricetags-outline" size={36} color="#94a3b8" />
              </View>
              <Text style={s.emptyTitle}>No coupons found</Text>
              <Text style={s.emptySub}>
                {search ? `No results for "${search}"` : 'Create discount codes for your customers.'}
              </Text>
              {!search && filter === 'all' && (
                <Pressable
                  style={({ pressed }) => [s.emptyAddBtn, pressed && { opacity: 0.85 }]}
                  onPress={openCreate}>
                  <Ionicons name="add" size={16} color={GOLD} />
                  <Text style={s.emptyAddTxt}>Create First Coupon</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </View>
  );

  // ── Both desktop & mobile: full-page list + centered modal ───────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f7' }}>
      {ListContent}

      <Modal
        visible={formOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { setFormOpen(false); setEditing(null); }}>
        <Pressable
          style={s.modalBackdrop}
          onPress={() => { setFormOpen(false); setEditing(null); }}>
          <Pressable
            style={[s.modalPanel, isDesktop && s.modalPanelDesktop]}
            onPress={() => {}}>
            <CouponForm
              coupon={editing}
              onSave={afterSave}
              onClose={() => { setFormOpen(false); setEditing(null); }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Header
  pageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pageTitle:  { fontSize: 18, fontWeight: '800', color: '#111827' },
  pageSub:    { fontSize: 11, color: '#6b7280', marginTop: 1 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: FOREST, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnTxt:  { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Stats
  statsBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  statItem:    { flex: 1, alignItems: 'center', gap: 1 },
  statIcon:    { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  statVal:     { fontSize: 14, fontWeight: '800' },
  statLbl:     { fontSize: 9, color: '#6b7280' },
  statDivider: { width: 1, height: 28, backgroundColor: '#e5e7eb' },

  // Search
  searchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#f8fafc', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },

  // Filter tabs
  tabsRow:      { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', height: 48 },
  filterTab:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  filterTabTxt: { fontSize: 12, fontWeight: '600', color: '#374151' },
  tabCount:     { backgroundColor: '#e5e7eb', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
  tabCountTxt:  { fontSize: 10, fontWeight: '700', color: '#6b7280' },

  // Result / load / empty
  resultRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  resultTxt:  { fontSize: 11.5, color: '#9ca3af', fontWeight: '600' },
  clearAll:   { fontSize: 12, color: PRIMARY, textDecorationLine: 'underline' },
  loadWrap:   { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadTxt:    { fontSize: 14, color: '#9ca3af' },
  emptyWrap:  { paddingTop: 70, alignItems: 'center', gap: 10 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub:   { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: FOREST, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  emptyAddTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },

  // Centered modal
  modalBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalPanel:        { width: '100%', maxHeight: '95%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
  modalPanelDesktop: { width: 560, maxWidth: 560 },
});

// Coupon card styles
const cc = StyleSheet.create({
  card:         { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9', borderLeftWidth: 4, borderLeftColor: GOLD, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardExpired:  { borderLeftColor: '#9ca3af', backgroundColor: '#fafafa' },
  cardInactive: { opacity: 0.7 },
  top:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  codeRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeTag:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fefce8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#fef08a' },
  codeText:     { fontSize: 16, fontWeight: '900', color: '#111827', letterSpacing: 1.5, fontFamily: 'monospace' },
  expiredBadge: { backgroundColor: '#fef2f2', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#fecaca' },
  expiredTxt:   { fontSize: 9, fontWeight: '800', color: '#dc2626', letterSpacing: 0.5 },
  inactiveBadge:{ backgroundColor: '#f3f4f6', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  inactiveTxt:  { fontSize: 9, fontWeight: '800', color: '#9ca3af', letterSpacing: 0.5 },
  midRow:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  valuePill:    { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8 },
  pillGreen:    { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  pillBlue:     { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  valueTxt:     { fontSize: 13, fontWeight: '800' },
  valueTxtGreen:{ color: '#16a34a' },
  valueTxtBlue: { color: PRIMARY },
  metaChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
  metaTxt:      { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressTrack:{ flex: 1, height: 5, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: '#16a34a' },
  progressTxt:  { fontSize: 10, fontWeight: '700', color: '#9ca3af', width: 54, textAlign: 'right' },
  botRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  usageTxt:     { fontSize: 11.5, color: '#9ca3af' },
  expiryTxt:    { fontSize: 11.5, color: '#9ca3af' },
  expiryExpired:{ color: '#dc2626', fontWeight: '700' },
  actionsRow:   { flexDirection: 'row', gap: 8 },
  actionBtn:    { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionEdit:   { backgroundColor: '#eff6ff' },
  actionDelete: { backgroundColor: '#fef2f2' },
});

// Form styles
const fm = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: FOREST },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,165,42,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,165,42,0.25)' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  closeBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  field:       { gap: 0 },
  label:       { fontSize: 11.5, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7 },
  hint:        { fontSize: 11, color: '#9ca3af', marginTop: 5 },
  codeInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 11, backgroundColor: '#fafafa', overflow: 'hidden' },
  codeInput:   { flex: 1, paddingHorizontal: 10, paddingVertical: 12, fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: 2, fontFamily: 'monospace' },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 11, backgroundColor: '#fafafa', overflow: 'hidden' },
  inputPrefix: { width: 38, height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  inputPrefixTxt: { fontSize: 14, fontWeight: '800', color: '#6b7280' },
  input:       { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#111827' },
  typeBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 11, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#f3f4f6', position: 'relative' },
  typeBtnActive: { backgroundColor: FOREST, borderColor: FOREST },
  typeBtnTxt:  { fontSize: 13, fontWeight: '600', color: '#374151' },
  typeBtnTxtActive: { color: '#fff', fontWeight: '700' },
  typeBtnIcon: { fontSize: 15, fontWeight: '800', color: '#6b7280' },
  typeBtnCheck:{ position: 'absolute', top: 6, right: 8, width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(201,165,42,0.2)', alignItems: 'center', justifyContent: 'center' },
  errorBox:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fef2f2', borderRadius: 9, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
  errorTxt:    { color: '#dc2626', fontSize: 12.5, fontWeight: '600', flex: 1 },
  previewBox:  { gap: 8 },
  previewLabel:{ fontSize: 11.5, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#1A2B1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  previewCode: { fontSize: 14, fontWeight: '900', color: '#fff', letterSpacing: 2, fontFamily: 'monospace' },
  previewVal:  { fontSize: 13, fontWeight: '700', color: GOLD },
  footer:      { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cancelBtn:   { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 11, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  cancelTxt:   { fontWeight: '700', color: '#374151', fontSize: 14 },
  saveBtn:     { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 11, backgroundColor: FOREST },
  saveTxt:     { fontWeight: '800', color: GOLD, fontSize: 14 },
});
