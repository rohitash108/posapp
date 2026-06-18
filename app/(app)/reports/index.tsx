/**
 * Reports — pixel-matched to csPos Restaurant Admin Web panel
 * restaurant.softwar.in/earning-report
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, TextInput, RefreshControl, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  format, parse, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday, isSameDay,
} from 'date-fns';
import { ordersApi } from '@/api/orders';
import client from '@/api/client';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id:              number;
  order_number?:   string;
  created_at?:     string;
  date?:           string;
  customer?:       { id?: number; name?: string } | null;
  customer_name?:  string;
  order_type?:     string;
  type?:           string;
  table?:          { id?: number; name?: string } | null;
  table_name?:     string;
  grand_total?:    number;
  total?:          number;
  final_total?:    number;
  status:          string;
  payment_method?: string;
}

interface Customer { id: number; name: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const TODAY = format(new Date(), 'yyyy-MM-dd');

const TABS = [
  { label: 'Earning Report',  key: 'earning'  },
  { label: 'Order Report',    key: 'order'    },
  { label: 'Sales Report',    key: 'sales'    },
  { label: 'Customer Report', key: 'customer' },
  { label: 'Payment Report',  key: 'payment'  },
];

const TAB_STATUS: Record<string, string> = {
  earning: 'completed', order: '', sales: '', customer: '', payment: '',
};

const PAYMENT_METHODS = [
  { label: 'All Methods',   value: ''              },
  { label: 'Cash',          value: 'cash'          },
  { label: 'Card',          value: 'card'          },
  { label: 'UPI',           value: 'upi'           },
  { label: 'Online',        value: 'online'        },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Other',         value: 'other'         },
];

const PER_PAGE_OPTIONS = [10, 25, 50];

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_LIGHT: Record<string, { bg: string; fg: string }> = {
  completed: { bg: '#d1fae5', fg: '#065f46' },
  paid:      { bg: '#d1fae5', fg: '#065f46' },
  pending:   { bg: '#fef3c7', fg: '#92400e' },
  preparing: { bg: '#dbeafe', fg: '#1e40af' },
  confirmed: { bg: '#ede9fe', fg: '#5b21b6' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
  draft:     { bg: '#f3f4f6', fg: '#374151' },
  unpaid:    { bg: '#ffedd5', fg: '#9a3412' },
};
const STATUS_DARK: Record<string, { bg: string; fg: string }> = {
  completed: { bg: '#064e3b', fg: '#6ee7b7' },
  paid:      { bg: '#064e3b', fg: '#6ee7b7' },
  pending:   { bg: '#78350f', fg: '#fcd34d' },
  preparing: { bg: '#1e3a5f', fg: '#93c5fd' },
  confirmed: { bg: '#4c1d95', fg: '#ddd6fe' },
  cancelled: { bg: '#7f1d1d', fg: '#fca5a5' },
  draft:     { bg: '#1f2937', fg: '#d1d5db' },
  unpaid:    { bg: '#431407', fg: '#fdba74' },
};
function statusClr(st: string, dark: boolean) {
  const m = dark ? STATUS_DARK : STATUS_LIGHT;
  return m[(st ?? '').toLowerCase()]
    ?? (dark ? { bg: '#1f2937', fg: '#9ca3af' } : { bg: '#f3f4f6', fg: '#6b7280' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rupee2 = (v: number) =>
  `₹${(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(s?: string) {
  if (!s) return '—';
  try { return format(new Date(s), 'dd MMM yyyy'); }
  catch { return s.slice(0, 10); }
}

function fmtType(t?: string) {
  const m: Record<string, string> = {
    dine_in: 'Dine In', takeaway: 'Takeaway',
    delivery: 'Delivery', online: 'Online', pos: 'POS',
  };
  return m[(t ?? '').toLowerCase()] ?? t ?? '—';
}

// ─── Style factory ────────────────────────────────────────────────────────────

function mk(c: ThemeColors) {
  // Mirrors the web panel's clean white/gray palette
  const R = 6;       // border-radius for inputs
  const PV = Platform.OS === 'ios' ? 10 : 8;  // input vertical padding

  return StyleSheet.create({
    shell: { flex: 1, backgroundColor: c.background },

    // ── Tab bar (exact web style: no icons, underline indicator) ──────────
    tabBar:  { backgroundColor: c.surface,
               borderBottomWidth: 1, borderBottomColor: c.border },
    tab:     { paddingHorizontal: 16, paddingVertical: 12,
               borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabAct:  { borderBottomColor: c.primary },
    tabTxt:  { fontSize: 13.5, fontWeight: '500', color: c.textMuted },
    tabTxtA: { color: c.primary, fontWeight: '700' },

    // ── Filter section (web: plain white card, NO header label) ──────────
    filterSection: { backgroundColor: c.surface,
                     borderBottomWidth: 1, borderBottomColor: c.border,
                     paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
                     gap: 10 },

    // Date row — two equal columns
    row2:     { flexDirection: 'row', gap: 12 },
    col:      { flex: 1 },
    fieldLbl: { fontSize: 11, fontWeight: '600', color: c.textMuted,
                marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },

    // Shared input / select skin (border + bg = web's light gray field)
    fieldBox: { flexDirection: 'row', alignItems: 'center', gap: 7,
                borderWidth: 1, borderColor: c.border, borderRadius: R,
                backgroundColor: c.surfaceAlt,
                paddingHorizontal: 10, paddingVertical: PV },
    fieldTxt: { flex: 1, fontSize: 13, color: c.text, padding: 0 },
    fieldPh:  { flex: 1, fontSize: 13, color: c.textMuted },

    // Action row — Apply (blue, pill) left, Reset (ghost) right
    actionRow: { flexDirection: 'row', gap: 8 },
    applyBtn:  { backgroundColor: c.primary, borderRadius: R,
                 paddingHorizontal: 22, paddingVertical: PV },
    applyTxt:  { color: '#fff', fontWeight: '700', fontSize: 13.5 },
    resetBtn:  { borderWidth: 1, borderColor: c.border, borderRadius: R,
                 paddingHorizontal: 16, paddingVertical: PV,
                 backgroundColor: c.surfaceAlt },
    resetTxt:  { color: c.text, fontWeight: '600', fontSize: 13.5 },

    // ── Search + Sort (web: full-width input | Sort by: Newest on right) ─
    searchSection: { flexDirection: 'row', alignItems: 'center', gap: 8,
                     paddingHorizontal: 16, paddingVertical: 10,
                     backgroundColor: c.surface,
                     borderBottomWidth: 1, borderBottomColor: c.border },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
                 borderWidth: 1, borderColor: c.border, borderRadius: R,
                 backgroundColor: c.surfaceAlt, paddingHorizontal: 10 },
    searchIn:  { flex: 1, fontSize: 13, color: c.text,
                 paddingVertical: PV },
    sortBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5,
                 borderWidth: 1, borderColor: c.border, borderRadius: R,
                 paddingHorizontal: 11, paddingVertical: PV,
                 backgroundColor: c.surfaceAlt },
    sortTxt:   { fontSize: 12.5, fontWeight: '600', color: c.text },

    // ── Table ─────────────────────────────────────────────────────────────
    tableWrap: { flex: 1 },
    // Header row — slightly darker bg matching web's #f9fafb
    thead: { flexDirection: 'row', alignItems: 'center',
             backgroundColor: c.surfaceAlt,
             borderBottomWidth: 1, borderBottomColor: c.border,
             paddingVertical: 9, paddingHorizontal: 14 },
    th:    { fontSize: 10.5, fontWeight: '800', color: c.textMuted,
             textTransform: 'uppercase', letterSpacing: 0.6 },
    // Data rows — pure surface bg (no alternating), bottom border only
    trow:  { flexDirection: 'row', alignItems: 'center',
             borderBottomWidth: 1, borderBottomColor: c.border,
             paddingVertical: 13, paddingHorizontal: 14,
             backgroundColor: c.surface },
    td:    { fontSize: 13, color: c.text },

    // Column widths — flex so table fills the full content area on any screen size
    cId:     { flex: 1,   minWidth: 80  },   // Order #
    cDate:   { flex: 1.6, minWidth: 110 },   // Date
    cCust:   { flex: 2,   minWidth: 100 },   // Customer
    cType:   { flex: 1.2, minWidth: 80  },   // Type
    cTable:  { flex: 1,   minWidth: 70  },   // Table
    cTotal:  { flex: 1.4, minWidth: 100 },   // Grand Total
    cStatus: { flex: 1.4, minWidth: 100 },   // Status

    // Status pill (web uses colored text + very light bg)
    pill:    { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3,
               alignSelf: 'flex-start' },
    pillTxt: { fontSize: 11.5, fontWeight: '700', textTransform: 'capitalize' },

    // ── Bottom bar ────────────────────────────────────────────────────────
    bottomWrap:  { backgroundColor: c.surface,
                   borderTopWidth: 1, borderTopColor: c.border },
    // Row 1: Show N entries + pagination
    paginRow:    { flexDirection: 'row', alignItems: 'center',
                   justifyContent: 'space-between',
                   paddingHorizontal: 14, paddingVertical: 10,
                   flexWrap: 'wrap', gap: 8 },
    ppGroup:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
    ppLbl:       { fontSize: 13, color: c.textMuted },
    ppChip:      { paddingHorizontal: 10, paddingVertical: 4,
                   borderRadius: 5, borderWidth: 1, borderColor: c.border },
    ppChipA:     { backgroundColor: c.primary, borderColor: c.primary },
    ppTxt:       { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    ppTxtA:      { color: '#fff' },
    pageGroup:   { flexDirection: 'row', gap: 3, alignItems: 'center', flexWrap: 'wrap' },
    pageChip:    { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5,
                   borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt,
                   flexDirection: 'row', alignItems: 'center', gap: 2 },
    pageChipA:   { backgroundColor: c.primary, borderColor: c.primary },
    pageChipDis: { opacity: 0.3 },
    pageTx:      { fontSize: 12.5, fontWeight: '600', color: c.text },
    pageATx:     { color: '#fff' },
    // Row 2: Period total
    periodRow:   { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'center',
                   paddingHorizontal: 14, paddingVertical: 9,
                   borderTopWidth: 1, borderTopColor: c.border,
                   backgroundColor: c.surfaceAlt },
    periodLbl:   { fontSize: 13, color: c.textMuted },
    periodVal:   { fontSize: 13.5, fontWeight: '800', color: c.heading },

    // ── Calendar picker ───────────────────────────────────────────────────
    calPopup:   { position: 'absolute', backgroundColor: c.surface,
                  borderRadius: 12, borderWidth: 1, borderColor: c.border,
                  width: 280, overflow: 'hidden',
                  shadowColor: '#000', shadowOpacity: 0.14,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  elevation: 10, zIndex: 999 },
    calHead:    { flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14, paddingVertical: 12,
                  borderBottomWidth: 1, borderBottomColor: c.border },
    calTitle:   { fontSize: 14, fontWeight: '700', color: c.heading },
    calNavBtn:  { padding: 4 },
    calWeekRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6 },
    calWeekDay: { flex: 1, textAlign: 'center', fontSize: 11,
                  fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    calGrid:    { flexDirection: 'row', flexWrap: 'wrap',
                  paddingHorizontal: 8, paddingBottom: 10 },
    calCell:    { width: `${100 / 7}%` as any, aspectRatio: 1,
                  alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
    calCellSel: { backgroundColor: c.primary },
    calCellTod: { borderWidth: 1.5, borderColor: c.primary },
    calDayTxt:  { fontSize: 13, color: c.text },
    calDaySel:  { color: '#fff', fontWeight: '700' },
    calDayTod:  { color: c.primary, fontWeight: '700' },
    calDayOut:  { color: c.border },

    // ── Dropdown — floating popup below the trigger ───────────────────────
    ddOverlay: { flex: 1 },                              // transparent, just catches taps
    ddPopup:   { position: 'absolute', backgroundColor: c.surface,
                 borderRadius: 10, borderWidth: 1, borderColor: c.border,
                 maxHeight: 280, overflow: 'hidden',
                 shadowColor: '#000', shadowOpacity: 0.14,
                 shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                 elevation: 10, zIndex: 999 },
    dRow:      { flexDirection: 'row', justifyContent: 'space-between',
                 alignItems: 'center',
                 paddingHorizontal: 14, paddingVertical: 12,
                 borderBottomWidth: 1, borderBottomColor: c.border },
    dRowA:     { backgroundColor: c.primary + '12' },
    dTxt:      { fontSize: 13.5, color: c.text },
    dTxtA:     { color: c.primary, fontWeight: '700' },

    // ── Loading / empty ───────────────────────────────────────────────────
    center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
    emptyTxt:  { fontSize: 14, color: c.textMuted, marginTop: 12, fontWeight: '500' },
  });
}

// ─── DateField ────────────────────────────────────────────────────────────────

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function DateField({ value, onChange, label, c, s }:
  { value: string; onChange: (v: string) => void;
    label: string; c: ThemeColors; s: ReturnType<typeof mk> }) {

  const [open, setOpen]         = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const triggerRef              = useRef<View>(null);

  // current calendar month shown
  const selected  = value ? parse(value, 'yyyy-MM-dd', new Date()) : new Date();
  const [month, setMonth] = useState(() => {
    return value ? parse(value, 'yyyy-MM-dd', new Date()) : new Date();
  });

  function openCalendar() {
    triggerRef.current?.measureInWindow((x, y, _w, h) => {
      setPopupPos({ top: y + h + 4, left: x });
      setOpen(true);
    });
  }

  function pickDay(d: Date) {
    onChange(format(d, 'yyyy-MM-dd'));
    setOpen(false);
  }

  const firstDay  = startOfMonth(month);
  const lastDay   = endOfMonth(month);
  const days      = eachDayOfInterval({ start: firstDay, end: lastDay });
  const leading   = getDay(firstDay); // blank cells before 1st

  const displayVal = value
    ? format(parse(value, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')
    : '';

  return (
    <View style={s.col}>
      <Text style={s.fieldLbl}>{label}</Text>

      <Pressable ref={triggerRef} style={s.fieldBox} onPress={openCalendar}>
        <Ionicons name="calendar-outline" size={14} color={c.textMuted} />
        {displayVal
          ? <Text style={s.fieldTxt} numberOfLines={1}>{displayVal}</Text>
          : <Text style={s.fieldPh}  numberOfLines={1}>Select date</Text>}
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.ddOverlay} onPress={() => setOpen(false)}>
          <View style={[s.calPopup, { top: popupPos.top, left: popupPos.left }]}
            // Prevent backdrop tap from firing when tapping inside calendar
            onStartShouldSetResponder={() => true}
            onTouchEnd={e => e.stopPropagation()}>

            {/* Month navigation */}
            <View style={s.calHead}>
              <Pressable style={s.calNavBtn} onPress={() => setMonth(m => subMonths(m, 1))}>
                <Ionicons name="chevron-back" size={18} color={c.text} />
              </Pressable>
              <Text style={s.calTitle}>{format(month, 'MMMM yyyy')}</Text>
              <Pressable style={s.calNavBtn} onPress={() => setMonth(m => addMonths(m, 1))}>
                <Ionicons name="chevron-forward" size={18} color={c.text} />
              </Pressable>
            </View>

            {/* Weekday headers */}
            <View style={s.calWeekRow}>
              {WEEK_DAYS.map(d => (
                <Text key={d} style={s.calWeekDay}>{d}</Text>
              ))}
            </View>

            {/* Day grid */}
            <View style={s.calGrid}>
              {/* Leading blanks */}
              {Array.from({ length: leading }).map((_, i) => (
                <View key={`b${i}`} style={s.calCell} />
              ))}
              {days.map(d => {
                const sel = isSameDay(d, selected);
                const tod = isToday(d);
                return (
                  <Pressable key={d.toISOString()} style={[s.calCell, sel && s.calCellSel, !sel && tod && s.calCellTod]}
                    onPress={() => pickDay(d)}>
                    <Text style={[s.calDayTxt, sel && s.calDaySel, !sel && tod && s.calDayTod]}>
                      {format(d, 'd')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function Dropdown({ value, onChange, options, label, placeholder, c, s }:
  { value: string; onChange: (v: string) => void;
    options: { label: string; value: string }[];
    label: string; placeholder: string;
    c: ThemeColors; s: ReturnType<typeof mk> }) {

  const [open, setOpen]       = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0, width: 200 });
  const triggerRef = useRef<View>(null);
  const sel = options.find(o => o.value === value);

  function openMenu() {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setPopupPos({ top: y + h + 4, left: x, width: w });
      setOpen(true);
    });
  }

  return (
    <View style={s.col}>
      <Text style={s.fieldLbl}>{label}</Text>

      {/* Trigger button */}
      <Pressable ref={triggerRef} style={s.fieldBox} onPress={openMenu}>
        {sel?.value
          ? <Text style={s.fieldTxt} numberOfLines={1}>{sel.label}</Text>
          : <Text style={s.fieldPh}  numberOfLines={1}>{placeholder}</Text>}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={c.textMuted} />
      </Pressable>

      {/* Floating popup — rendered in a transparent full-screen Modal */}
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        {/* Invisible full-screen backdrop — tap to dismiss */}
        <Pressable style={s.ddOverlay} onPress={() => setOpen(false)}>
          {/* Floating card below the trigger */}
          <View style={[s.ddPopup, {
            top:   popupPos.top,
            left:  popupPos.left,
            width: popupPos.width,
          }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {options.map(o => (
                <Pressable key={o.value}
                  style={[s.dRow, o.value === value && s.dRowA]}
                  onPress={() => { onChange(o.value); setOpen(false); }}>
                  <Text style={[s.dTxt, o.value === value && s.dTxtA]}>{o.label}</Text>
                  {o.value === value &&
                    <Ionicons name="checkmark" size={16} color={c.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Page pills ───────────────────────────────────────────────────────────────

function Pages({ page, last, go, s }: {
  page: number; last: number; go: (p: number) => void; s: ReturnType<typeof mk>;
}) {
  const ns: number[] = [];
  if (last <= 7) { for (let i = 1; i <= last; i++) ns.push(i); }
  else {
    const set = new Set([1, 2, page - 1, page, page + 1, last - 1, last]
      .filter(n => n >= 1 && n <= last));
    Array.from(set).sort((a, b) => a - b).forEach(n => ns.push(n));
  }
  return (
    <View style={s.pageGroup}>
      {ns.map((p, i) => {
        const gap = i > 0 && ns[i] - ns[i - 1] > 1;
        return (
          <React.Fragment key={p}>
            {gap && <Text style={s.pageTx}>…</Text>}
            <Pressable style={[s.pageChip, p === page && s.pageChipA]} onPress={() => go(p)}>
              <Text style={[s.pageTx, p === page && s.pageATx]}>{p}</Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { colors: c, isDark } = useTheme();
  const s = useMemo(() => mk(c), [c]);

  const [activeTab, setActiveTab] = useState(0);

  // Filter inputs (pre-filled with today — matches web default)
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate,   setEndDate]   = useState(TODAY);
  const [custId,    setCustId]    = useState('');
  const [payMethod, setPayMethod] = useState('');

  // Applied (sent to API after "Apply")
  const [aFrom, setAFrom] = useState(TODAY);
  const [aTo,   setATo]   = useState(TODAY);
  const [aCust, setACust] = useState('');
  const [aPay,  setAPay]  = useState('');

  const [search,    setSearch]    = useState('');
  const [sortOrd,   setSortOrd]   = useState<'newest' | 'oldest'>('newest');
  const [perPage,   setPerPage]   = useState(10);
  const [page,      setPage]      = useState(1);

  const [orders,      setOrders]      = useState<Order[]>([]);
  const [totalCount,  setTotalCount]  = useState(0);
  const [lastPage,    setLastPage]    = useState(1);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [customers,   setCustomers]   = useState<Customer[]>([]);

  // Load customer list
  useEffect(() => {
    client.get('/customers', { params: { per_page: 500 } })
      .then(res => {
        const raw = res.data;
        setCustomers(Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []);
      }).catch(() => {});
  }, []);

  const custOpts = useMemo(() => [
    { label: 'All Customers', value: '' },
    ...customers.map(x => ({ label: x.name, value: String(x.id) })),
  ], [customers]);

  // Fetch orders from API
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tabStatus = TAB_STATUS[TABS[activeTab].key] ?? '';
      const params: Parameters<typeof ordersApi.list>[0] = {
        page, per_page: perPage,
        sort: sortOrd === 'oldest' ? 'asc' : 'desc',
      };
      if (aFrom)     params.from           = aFrom;
      if (aTo)       params.to             = aTo;
      if (aCust)     params.customer_id    = aCust;
      if (aPay)      params.payment_method = aPay;
      if (tabStatus) params.status         = tabStatus;

      const { data: raw } = await ordersApi.list(params);
      const list: Order[] = Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw) ? raw : [];

      setOrders(list);
      setTotalCount(raw?.total ?? list.length);
      setLastPage(raw?.last_page ?? (raw?.total ? Math.ceil(raw.total / perPage) : 1) ?? 1);
      setPeriodTotal(list.reduce((s, o) =>
        s + Number(o.grand_total ?? o.total ?? o.final_total ?? 0), 0));
    } catch (e) { console.warn('[Reports]', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [activeTab, page, perPage, sortOrd, aFrom, aTo, aCust, aPay]);

  useEffect(() => { load(); }, [load]);

  // Client-side search filter
  const rows = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter(o =>
      (o.order_number ?? String(o.id)).toLowerCase().includes(q) ||
      (o.customer?.name ?? o.customer_name ?? '').toLowerCase().includes(q));
  }, [orders, search]);

  function apply() {
    setAFrom(startDate); setATo(endDate);
    setACust(custId);    setAPay(payMethod);
    setPage(1);
  }
  function reset() {
    setStartDate(TODAY); setEndDate(TODAY); setCustId(''); setPayMethod('');
    setAFrom(TODAY);     setATo(TODAY);     setACust(''); setAPay('');
    setPage(1);
  }

  const fromE = totalCount > 0 ? (page - 1) * perPage + 1 : 0;
  const toE   = Math.min(page * perPage, totalCount);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={s.shell}>

      {/* ══ Tabs ════════════════════════════════════════════════════════════ */}
      <View style={s.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 4 }}>
          {TABS.map((t, i) => (
            <Pressable key={t.key} style={[s.tab, activeTab === i && s.tabAct]}
              onPress={() => { setActiveTab(i); setPage(1); }}>
              <Text style={[s.tabTxt, activeTab === i && s.tabTxtA]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ══ Filters (no header label — matches web) ══════════════════════════
            Row 1: Start Date | End Date
            Row 2: Customer ▼ | Payment Method ▼
            Row 3: Apply · Reset                                              */}
      <View style={s.filterSection}>
        {/* Row 1 — dates (calendar picker) */}
        <View style={s.row2}>
          <DateField value={startDate} onChange={setStartDate} label="Start Date" c={c} s={s} />
          <DateField value={endDate}   onChange={setEndDate}   label="End Date"   c={c} s={s} />
        </View>

        {/* Row 2 — dropdowns */}
        <View style={s.row2}>
          <Dropdown value={custId}    onChange={setCustId}    options={custOpts}
            label="Customer" placeholder="All Customers" c={c} s={s} />
          <Dropdown value={payMethod} onChange={setPayMethod} options={PAYMENT_METHODS}
            label="Payment Method" placeholder="All Methods" c={c} s={s} />
        </View>

        {/* Row 3 — action buttons */}
        <View style={s.actionRow}>
          <Pressable style={s.applyBtn} onPress={apply}>
            <Text style={s.applyTxt}>Apply</Text>
          </Pressable>
          <Pressable style={s.resetBtn} onPress={reset}>
            <Text style={s.resetTxt}>Reset</Text>
          </Pressable>
        </View>
      </View>

      {/* ══ Search + Sort ════════════════════════════════════════════════════ */}
      <View style={s.searchSection}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color={c.textMuted} />
          <TextInput style={s.searchIn} value={search} onChangeText={setSearch}
            placeholder="Search by order # or customer…"
            placeholderTextColor={c.textMuted} />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color={c.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable style={s.sortBtn}
          onPress={() => setSortOrd(o => o === 'newest' ? 'oldest' : 'newest')}>
          <Ionicons name="swap-vertical-outline" size={14} color={c.text} />
          <Text style={s.sortTxt}>{sortOrd === 'newest' ? 'Newest' : 'Oldest'}</Text>
        </Pressable>
      </View>

      {/* ══ Table ════════════════════════════════════════════════════════════ */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <ScrollView style={s.tableWrap}
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={c.primary} />
          }>
          <View style={{ flex: 1 }}>

              {/* Header */}
              <View style={s.thead}>
                <Text style={[s.th, s.cId]}>Order #</Text>
                <Text style={[s.th, s.cDate]}>Date</Text>
                <Text style={[s.th, s.cCust]}>Customer</Text>
                <Text style={[s.th, s.cType]}>Type</Text>
                <Text style={[s.th, s.cTable]}>Table</Text>
                <Text style={[s.th, s.cTotal, { textAlign: 'right' }]}>Grand Total</Text>
                <Text style={[s.th, s.cStatus, { paddingLeft: 8 }]}>Status</Text>
              </View>

              {/* Rows */}
              {rows.length === 0 ? (
                <View style={s.center}>
                  <Ionicons name="receipt-outline" size={48} color={c.border} />
                  <Text style={s.emptyTxt}>No orders found</Text>
                </View>
              ) : rows.map(order => {
                const sc    = statusClr(order.status, isDark);
                const total = Number(order.grand_total ?? order.total ?? order.final_total ?? 0);
                return (
                  <View key={order.id} style={s.trow}>
                    {/* Order # — blue like web */}
                    <Text style={[s.td, s.cId, { fontWeight: '700', color: c.primary }]}
                      numberOfLines={1}>
                      #{order.order_number ?? order.id}
                    </Text>
                    <Text style={[s.td, s.cDate, { fontSize: 12.5 }]} numberOfLines={1}>
                      {fmtDate(order.created_at ?? order.date)}
                    </Text>
                    <Text style={[s.td, s.cCust]} numberOfLines={1}>
                      {order.customer?.name ?? order.customer_name ?? 'Walk-in'}
                    </Text>
                    <Text style={[s.td, s.cType, { fontSize: 12.5 }]} numberOfLines={1}>
                      {fmtType(order.order_type ?? order.type)}
                    </Text>
                    <Text style={[s.td, s.cTable, { fontSize: 12.5 }]} numberOfLines={1}>
                      {order.table?.name ?? order.table_name ?? '—'}
                    </Text>
                    <Text style={[s.td, s.cTotal, { fontWeight: '700', textAlign: 'right' }]}>
                      {rupee2(total)}
                    </Text>
                    <View style={[s.cStatus, { paddingLeft: 8 }]}>
                      <View style={[s.pill, { backgroundColor: sc.bg }]}>
                        <Text style={[s.pillTxt, { color: sc.fg }]}>{order.status}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

          </View>
        </ScrollView>
      )}

      {/* ══ Bottom bar ═══════════════════════════════════════════════════════ */}
      <View style={s.bottomWrap}>

        {/* Entries selector + Pagination — same row as web */}
        <View style={s.paginRow}>
          <View style={s.ppGroup}>
            <Text style={s.ppLbl}>Show</Text>
            {PER_PAGE_OPTIONS.map(n => (
              <Pressable key={n} style={[s.ppChip, perPage === n && s.ppChipA]}
                onPress={() => { setPerPage(n); setPage(1); }}>
                <Text style={[s.ppTxt, perPage === n && s.ppTxtA]}>{n}</Text>
              </Pressable>
            ))}
            <Text style={s.ppLbl}>entries</Text>
          </View>

          <View style={s.pageGroup}>
            <Pressable style={[s.pageChip, page <= 1 && s.pageChipDis]}
              onPress={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <Ionicons name="chevron-back" size={12} color={c.text} />
              <Text style={s.pageTx}>Prev</Text>
            </Pressable>

            <Pages page={page} last={lastPage} go={setPage} s={s} />

            <Pressable style={[s.pageChip, page >= lastPage && s.pageChipDis]}
              onPress={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage}>
              <Text style={s.pageTx}>Next</Text>
              <Ionicons name="chevron-forward" size={12} color={c.text} />
            </Pressable>
          </View>
        </View>

        {/* Period total — web: "Period total: N order(s), ₹X.XX" */}
        <View style={s.periodRow}>
          <Text style={s.periodLbl}>
            Period total:{' '}
            <Text style={{ fontWeight: '700', color: c.text }}>
              {rows.length} order{rows.length !== 1 ? 's' : ''}
            </Text>
          </Text>
          <Text style={s.periodVal}>{rupee2(periodTotal)}</Text>
        </View>

      </View>
    </View>
  );
}
