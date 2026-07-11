/**
 * Reports — pixel-matched to csPos Restaurant Admin Web panel
 * restaurant.softwar.in/earning-report
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, TextInput, RefreshControl, Modal, Platform, Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  format, parse, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday, isSameDay,
} from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ordersApi } from '@/api/orders';
import client from '@/api/client';
import { buildCsv, downloadCsv } from '@/utils/export';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id:               number;
  order_number?:    string;
  created_at?:      string;
  date?:            string;
  customer?:        { id?: number; name?: string } | null;
  customer_name?:   string;
  order_type?:      string;
  type?:            string;
  table?:           { id?: number; name?: string } | null;
  table_name?:      string;
  grand_total?:     number;
  total?:           number;
  final_total?:     number;
  subtotal?:        number;
  tax_amount?:      number;
  discount_amount?: number;
  status:           string;
  payment_method?:  string;
  payment_status?:  string;
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
  { label: 'GST Report',      key: 'gst'      },
];

const PAYMENT_STATUSES = [
  { label: 'All Status', value: '' },
  { label: 'Paid',       value: 'paid'   },
  { label: 'Unpaid',     value: 'unpaid' },
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

    exportRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8,
                  justifyContent: 'flex-end', backgroundColor: c.surfaceAlt },
    exportBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5,
                  borderWidth: 1, borderColor: c.border, borderRadius: 6,
                  paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.surface },
    exportTxt:  { fontSize: 12.5, color: c.text, fontWeight: '600' },

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

    // ── Mobile bottom sheet (calendar / dropdown) ──────────────────────
    bsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    bsSheet:    { position: 'absolute', bottom: 0, left: 0, right: 0,
                  backgroundColor: c.surface,
                  borderTopLeftRadius: 20, borderTopRightRadius: 20,
                  overflow: 'hidden',
                  shadowColor: '#000', shadowOpacity: 0.2,
                  shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
                  elevation: 20 },
    bsHandle:   { width: 40, height: 4, borderRadius: 2,
                  backgroundColor: c.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
    bsTitle:    { fontSize: 15, fontWeight: '700', color: c.heading,
                  textAlign: 'center', paddingVertical: 12,
                  borderBottomWidth: 1, borderBottomColor: c.border },

    // ── Mobile order card ─────────────────────────────────────────────
    cardWrap:   { backgroundColor: c.surface, borderRadius: 14,
                  borderWidth: 1, borderColor: c.border,
                  marginHorizontal: 12, marginTop: 10,
                  overflow: 'hidden' },
    cardTop:    { flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14, paddingTop: 13, paddingBottom: 10,
                  borderBottomWidth: 1, borderBottomColor: c.border },
    cardOrderNo:{ fontSize: 15, fontWeight: '800', color: c.primary },
    cardBody:   { paddingHorizontal: 14, paddingVertical: 11, gap: 7 },
    cardRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardLabel:  { fontSize: 12.5, color: c.textMuted, flex: 1 },
    cardValue:  { fontSize: 12.5, color: c.text, fontWeight: '500' },
    cardFoot:   { flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14, paddingVertical: 10,
                  backgroundColor: c.surfaceAlt,
                  borderTopWidth: 1, borderTopColor: c.border },
    cardTotal:  { fontSize: 15, fontWeight: '800', color: c.heading },

    // ── GST summary cards ─────────────────────────────────────────────
    gstCardsWrap: { flexDirection: 'row', flexWrap: 'wrap',
                    paddingHorizontal: 10, paddingTop: 12, gap: 8 },
    gstCard:  { flex: 1, minWidth: '45%',
                backgroundColor: c.surface, borderRadius: 12,
                borderWidth: 1, borderColor: c.border,
                paddingHorizontal: 14, paddingVertical: 12 },
    gstCardLbl: { fontSize: 11, fontWeight: '600', color: c.textMuted,
                  textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    gstCardVal: { fontSize: 15, fontWeight: '800', color: c.heading },

    // ── GST invoice card (mobile) ─────────────────────────────────────
    gstInvWrap:   { backgroundColor: c.surface, borderRadius: 14,
                    borderWidth: 1, borderColor: c.border,
                    marginHorizontal: 12, marginTop: 10, overflow: 'hidden' },
    gstInvTop:    { flexDirection: 'row', alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 14, paddingTop: 13, paddingBottom: 10,
                    borderBottomWidth: 1, borderBottomColor: c.border },
    gstInvNo:     { fontSize: 15, fontWeight: '800', color: c.primary },
    gstInvBody:   { paddingHorizontal: 14, paddingVertical: 11, gap: 6 },
    gstInvRow:    { flexDirection: 'row', justifyContent: 'space-between',
                    alignItems: 'center' },
    gstInvLbl:    { fontSize: 12.5, color: c.textMuted },
    gstInvVal:    { fontSize: 12.5, color: c.text, fontWeight: '600' },
    gstInvFoot:   { paddingHorizontal: 14, paddingVertical: 10,
                    backgroundColor: c.surfaceAlt,
                    borderTopWidth: 1, borderTopColor: c.border },
    gstInvFootRow:{ flexDirection: 'row', justifyContent: 'space-between',
                    alignItems: 'center' },
    gstTotalLbl:  { fontSize: 13, color: c.textMuted },
    gstTotalVal:  { fontSize: 16, fontWeight: '800', color: c.heading },
    gstNoteBanner:{ marginHorizontal: 12, marginTop: 10, marginBottom: 4,
                    backgroundColor: c.surfaceAlt, borderRadius: 10,
                    borderWidth: 1, borderColor: c.border,
                    paddingHorizontal: 12, paddingVertical: 10 },
    gstNoteTxt:   { fontSize: 11.5, color: c.textMuted, lineHeight: 17 },

    // ── GST web table columns ─────────────────────────────────────────
    gCInv:    { flex: 1.2, minWidth: 90  },
    gCDate:   { flex: 1.4, minWidth: 100 },
    gCType:   { flex: 1,   minWidth: 70  },
    gCPay:    { flex: 1,   minWidth: 70  },
    gCSt:     { flex: 1,   minWidth: 70  },
    gCTax:    { flex: 1.2, minWidth: 80  },
    gCRate:   { flex: 0.8, minWidth: 55  },
    gCCgst:   { flex: 1,   minWidth: 70  },
    gCSgst:   { flex: 1,   minWidth: 70  },
    gCGst:    { flex: 1.1, minWidth: 80  },
    gCGrand:  { flex: 1.2, minWidth: 90  },
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
  const isMobileOS              = Platform.OS !== 'web';

  const selected  = value ? parse(value, 'yyyy-MM-dd', new Date()) : new Date();
  const [month, setMonth] = useState(() => {
    return value ? parse(value, 'yyyy-MM-dd', new Date()) : new Date();
  });

  function openCalendar() {
    if (isMobileOS) { setOpen(true); return; }
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
  const leading   = getDay(firstDay);

  const displayVal = value
    ? format(parse(value, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')
    : '';

  // Shared calendar body
  const CalendarBody = (
    <>
      <View style={s.calHead}>
        <Pressable style={s.calNavBtn} onPress={() => setMonth(m => subMonths(m, 1))}>
          <Ionicons name="chevron-back" size={18} color={c.text} />
        </Pressable>
        <Text style={s.calTitle}>{format(month, 'MMMM yyyy')}</Text>
        <Pressable style={s.calNavBtn} onPress={() => setMonth(m => addMonths(m, 1))}>
          <Ionicons name="chevron-forward" size={18} color={c.text} />
        </Pressable>
      </View>
      <View style={s.calWeekRow}>
        {WEEK_DAYS.map(d => <Text key={d} style={s.calWeekDay}>{d}</Text>)}
      </View>
      <View style={s.calGrid}>
        {Array.from({ length: leading }).map((_, i) => <View key={`b${i}`} style={s.calCell} />)}
        {days.map(d => {
          const sel = isSameDay(d, selected);
          const tod = isToday(d);
          return (
            <Pressable key={d.toISOString()}
              style={[s.calCell, sel && s.calCellSel, !sel && tod && s.calCellTod]}
              onPress={() => pickDay(d)}>
              <Text style={[s.calDayTxt, sel && s.calDaySel, !sel && tod && s.calDayTod]}>
                {format(d, 'd')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View style={s.col}>
      <Text style={s.fieldLbl}>{label}</Text>
      <Pressable ref={triggerRef} style={s.fieldBox} onPress={openCalendar}>
        <Ionicons name="calendar-outline" size={14} color={c.textMuted} />
        {displayVal
          ? <Text style={s.fieldTxt} numberOfLines={1}>{displayVal}</Text>
          : <Text style={s.fieldPh}  numberOfLines={1}>Select date</Text>}
      </Pressable>

      {isMobileOS ? (
        /* Mobile: bottom sheet */
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.bsBackdrop} onPress={() => setOpen(false)} />
          <View style={s.bsSheet}>
            <View style={s.bsHandle} />
            <Text style={s.bsTitle}>{label}</Text>
            {CalendarBody}
            <View style={{ height: 20 }} />
          </View>
        </Modal>
      ) : (
        /* Web: anchored popup */
        <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.ddOverlay} onPress={() => setOpen(false)}>
            <View style={[s.calPopup, { top: popupPos.top, left: popupPos.left }]}
              onStartShouldSetResponder={() => true}
              onTouchEnd={e => e.stopPropagation()}>
              {CalendarBody}
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function Dropdown({ value, onChange, options, label, placeholder, c, s }:
  { value: string; onChange: (v: string) => void;
    options: { label: string; value: string }[];
    label: string; placeholder: string;
    c: ThemeColors; s: ReturnType<typeof mk> }) {

  const [open, setOpen]         = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0, width: 200 });
  const triggerRef              = useRef<View>(null);
  const isMobileOS              = Platform.OS !== 'web';
  const sel = options.find(o => o.value === value);

  function openMenu() {
    if (isMobileOS) { setOpen(true); return; }
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setPopupPos({ top: y + h + 4, left: x, width: w });
      setOpen(true);
    });
  }

  const OptionsList = (
    <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
      {options.map(o => (
        <Pressable key={o.value}
          style={[s.dRow, o.value === value && s.dRowA]}
          onPress={() => { onChange(o.value); setOpen(false); }}>
          <Text style={[s.dTxt, o.value === value && s.dTxtA]}>{o.label}</Text>
          {o.value === value && <Ionicons name="checkmark" size={16} color={c.primary} />}
        </Pressable>
      ))}
    </ScrollView>
  );

  return (
    <View style={s.col}>
      <Text style={s.fieldLbl}>{label}</Text>
      <Pressable ref={triggerRef} style={s.fieldBox} onPress={openMenu}>
        {sel?.value
          ? <Text style={s.fieldTxt} numberOfLines={1}>{sel.label}</Text>
          : <Text style={s.fieldPh}  numberOfLines={1}>{placeholder}</Text>}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={c.textMuted} />
      </Pressable>

      {isMobileOS ? (
        /* Mobile: bottom sheet */
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.bsBackdrop} onPress={() => setOpen(false)} />
          <View style={s.bsSheet}>
            <View style={s.bsHandle} />
            <Text style={s.bsTitle}>{label}</Text>
            {OptionsList}
            <View style={{ height: 20 }} />
          </View>
        </Modal>
      ) : (
        /* Web: anchored popup */
        <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.ddOverlay} onPress={() => setOpen(false)}>
            <View style={[s.ddPopup, { top: popupPos.top, left: popupPos.left, width: popupPos.width }]}>
              {OptionsList}
            </View>
          </Pressable>
        </Modal>
      )}
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

// ─── Mobile Order Card ────────────────────────────────────────────────────────

function OrderCard({ order, isDark, c, s }: {
  order: Order; isDark: boolean; c: ThemeColors; s: ReturnType<typeof mk>;
}) {
  const sc    = statusClr(order.status, isDark);
  const total = Number(order.grand_total ?? order.total ?? order.final_total ?? 0);
  const tableName = order.table?.name ?? order.table_name;
  return (
    <View style={s.cardWrap}>
      {/* Top: order # + status */}
      <View style={s.cardTop}>
        <Text style={s.cardOrderNo}>#{order.order_number ?? order.id}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: c.textMuted }}>
            {fmtDate(order.created_at ?? order.date)}
          </Text>
          <View style={[s.pill, { backgroundColor: sc.bg }]}>
            <Text style={[s.pillTxt, { color: sc.fg }]}>{order.status}</Text>
          </View>
        </View>
      </View>

      {/* Body: customer, type, table */}
      <View style={s.cardBody}>
        <View style={s.cardRow}>
          <Ionicons name="person-outline" size={13} color={c.textMuted} />
          <Text style={[s.cardValue, { flex: 1 }]} numberOfLines={1}>
            {order.customer?.name ?? order.customer_name ?? 'Walk-in'}
          </Text>
        </View>
        <View style={s.cardRow}>
          <Ionicons name="restaurant-outline" size={13} color={c.textMuted} />
          <Text style={s.cardValue}>{fmtType(order.order_type ?? order.type)}</Text>
          {!!tableName && (
            <>
              <Text style={{ color: c.border, fontSize: 12 }}>·</Text>
              <Ionicons name="grid-outline" size={12} color={c.textMuted} />
              <Text style={s.cardValue}>{tableName}</Text>
            </>
          )}
          {order.payment_method && (
            <>
              <Text style={{ color: c.border, fontSize: 12 }}>·</Text>
              <Ionicons name="card-outline" size={12} color={c.textMuted} />
              <Text style={s.cardValue}>{order.payment_method}</Text>
            </>
          )}
        </View>
      </View>

      {/* Footer: total */}
      <View style={s.cardFoot}>
        <Text style={{ fontSize: 12.5, color: c.textMuted }}>Grand Total</Text>
        <Text style={s.cardTotal}>{rupee2(total)}</Text>
      </View>
    </View>
  );
}

// ─── GST Invoice Card (mobile) ────────────────────────────────────────────────

function GstInvoiceCard({ order, isDark, c, s }: {
  order: Order; isDark: boolean; c: ThemeColors; s: ReturnType<typeof mk>;
}) {
  const sc       = statusClr(order.payment_status ?? order.status, isDark);
  const taxable  = Math.max(0, (order.subtotal ?? 0) - (order.discount_amount ?? 0));
  const gst      = order.tax_amount ?? 0;
  const cgst     = Math.round(gst / 2 * 100) / 100;
  const sgst     = Math.round(gst / 2 * 100) / 100;
  const grandTot = Number(order.grand_total ?? order.total ?? 0);
  const gstRate  = taxable > 0 && gst > 0 ? `${Math.round(gst / taxable * 10000) / 100}%` : '—';
  const pm       = order.payment_method ?? 'Other';

  return (
    <View style={s.gstInvWrap}>
      {/* Top: invoice # + payment status */}
      <View style={s.gstInvTop}>
        <Text style={s.gstInvNo}>#{order.order_number ?? order.id}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: c.textMuted }}>
            {fmtDate(order.created_at ?? order.date)}
          </Text>
          <View style={[s.pill, { backgroundColor: sc.bg }]}>
            <Text style={[s.pillTxt, { color: sc.fg }]}>
              {(order.payment_status ?? order.status).replace('_', ' ')}
            </Text>
          </View>
        </View>
      </View>

      {/* Body: type, payment, GST breakdown */}
      <View style={s.gstInvBody}>
        <View style={s.gstInvRow}>
          <Text style={s.gstInvLbl}>Type / Payment</Text>
          <Text style={s.gstInvVal}>
            {fmtType(order.order_type ?? order.type)} · {pm.charAt(0).toUpperCase() + pm.slice(1)}
          </Text>
        </View>
        <View style={[s.gstInvRow, { marginTop: 4,
          paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border }]}>
          <Text style={s.gstInvLbl}>Taxable Value</Text>
          <Text style={s.gstInvVal}>{rupee2(taxable)}</Text>
        </View>
        <View style={s.gstInvRow}>
          <Text style={s.gstInvLbl}>GST Rate</Text>
          <Text style={s.gstInvVal}>{gstRate}</Text>
        </View>
        <View style={s.gstInvRow}>
          <Text style={s.gstInvLbl}>CGST</Text>
          <Text style={s.gstInvVal}>{rupee2(cgst)}</Text>
        </View>
        <View style={s.gstInvRow}>
          <Text style={s.gstInvLbl}>SGST</Text>
          <Text style={s.gstInvVal}>{rupee2(sgst)}</Text>
        </View>
      </View>

      {/* Footer: total GST + grand total */}
      <View style={s.gstInvFoot}>
        <View style={s.gstInvFootRow}>
          <Text style={s.gstTotalLbl}>Total GST</Text>
          <Text style={[s.gstInvVal, { color: '#dc2626' }]}>{rupee2(gst)}</Text>
        </View>
        <View style={[s.gstInvFootRow, { marginTop: 4 }]}>
          <Text style={s.gstTotalLbl}>Grand Total</Text>
          <Text style={s.gstTotalVal}>{rupee2(grandTot)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { colors: c, isDark } = useTheme();
  const s        = useMemo(() => mk(c), [c]);
  const insets   = useSafeAreaInsets();
  useWindowDimensions(); // keeps layout reflows on resize
  const isMobile = Platform.OS !== 'web';

  const [activeTab, setActiveTab] = useState(0);

  // Filter inputs (pre-filled with today — matches web default)
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate,   setEndDate]   = useState(TODAY);
  const [custId,    setCustId]    = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payStatus, setPayStatus] = useState('');

  // Applied (sent to API after "Apply")
  const [aFrom,      setAFrom]      = useState(TODAY);
  const [aTo,        setATo]        = useState(TODAY);
  const [aCust,      setACust]      = useState('');
  const [aPay,       setAPay]       = useState('');
  const [aPayStatus, setAPayStatus] = useState('');

  const [search,    setSearch]    = useState('');
  const [sortOrd,   setSortOrd]   = useState<'newest' | 'oldest'>('newest');
  const [perPage,   setPerPage]   = useState(10);
  const [page,      setPage]      = useState(1);

  const [orders,      setOrders]      = useState<Order[]>([]);
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
      if (aFrom)       params.from           = aFrom;
      if (aTo)         params.to             = aTo;
      if (aCust)       params.customer_id    = aCust;
      if (aPay)        params.payment_method = aPay;
      if (tabStatus)   params.status         = tabStatus;
      if (aPayStatus)  params.payment_status = aPayStatus;

      const { data: raw } = await ordersApi.list(params);
      const list: Order[] = Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw) ? raw : [];

      setOrders(list);
      setLastPage(raw?.last_page ?? (raw?.total ? Math.ceil(raw.total / perPage) : 1) ?? 1);
      setPeriodTotal(list.reduce((s, o) =>
        s + Number(o.grand_total ?? o.total ?? o.final_total ?? 0), 0));
    } catch (e) { console.warn('[Reports]', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [activeTab, page, perPage, sortOrd, aFrom, aTo, aCust, aPay, aPayStatus]);

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
    setAPayStatus(payStatus);
    setPage(1);
  }
  function reset() {
    setStartDate(TODAY); setEndDate(TODAY); setCustId(''); setPayMethod(''); setPayStatus('');
    setAFrom(TODAY);     setATo(TODAY);     setACust(''); setAPay('');       setAPayStatus('');
    setPage(1);
  }

  const tabLabel = TABS[activeTab]?.label ?? 'Report';

  function handleExportCsv() {
    const headers = ['Order #', 'Date', 'Customer', 'Type', 'Payment Method', 'Status', 'Total'];
    const csvRows = rows.map(o => [
      o.order_number ?? String(o.id),
      fmtDate(o.created_at ?? o.date),
      o.customer?.name ?? o.customer_name ?? '',
      fmtType(o.order_type ?? o.type),
      o.payment_method ?? '',
      o.status ?? '',
      Number(o.grand_total ?? o.total ?? o.final_total ?? 0).toFixed(2),
    ]);
    const filename = `${tabLabel.replace(/\s+/g, '_')}_${aFrom}_to_${aTo}.csv`;
    downloadCsv(filename, buildCsv(headers, csvRows));
  }

  function handleExportPdf() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
    } else {
      Alert.alert('Export PDF', 'PDF export is available on the web version.');
    }
  }

  const isGst = TABS[activeTab]?.key === 'gst';

  // GST summary computed from current page data
  const gstSummary = useMemo(() => {
    if (!isGst) return null;
    const totalTaxable  = orders.reduce((acc, o) =>
      acc + Math.max(0, (o.subtotal ?? 0) - (o.discount_amount ?? 0)), 0);
    const totalGst      = orders.reduce((acc, o) => acc + (o.tax_amount ?? 0), 0);
    const totalAmount   = orders.reduce((acc, o) =>
      acc + Number(o.grand_total ?? o.total ?? 0), 0);
    return {
      totalTaxable, totalGst,
      totalCgst:  Math.round(totalGst / 2 * 100) / 100,
      totalSgst:  Math.round(totalGst / 2 * 100) / 100,
      totalAmount,
      count: orders.length,
    };
  }, [isGst, orders]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={s.shell}>

      {/* ══ Tabs ════════════════════════════════════════════════════════════ */}
      <View style={[s.tabBar, isMobile && { paddingTop: insets.top }]}>
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

      {/* ══ Filters ══════════════════════════════════════════════════════════ */}
      <View style={s.filterSection}>
        {/* Row 1 — dates */}
        <View style={s.row2}>
          <DateField value={startDate} onChange={setStartDate} label="Start Date" c={c} s={s} />
          <DateField value={endDate}   onChange={setEndDate}   label="End Date"   c={c} s={s} />
        </View>

        {/* Row 2 — dropdowns (GST tab gets Payment Status instead of Customer) */}
        <View style={s.row2}>
          {isGst ? (
            <>
              <Dropdown value={payMethod} onChange={setPayMethod} options={PAYMENT_METHODS}
                label="Payment Method" placeholder="All Methods" c={c} s={s} />
              <Dropdown value={payStatus} onChange={setPayStatus} options={PAYMENT_STATUSES}
                label="Payment Status" placeholder="All Status" c={c} s={s} />
            </>
          ) : (
            <>
              <Dropdown value={custId}    onChange={setCustId}    options={custOpts}
                label="Customer" placeholder="All Customers" c={c} s={s} />
              <Dropdown value={payMethod} onChange={setPayMethod} options={PAYMENT_METHODS}
                label="Payment Method" placeholder="All Methods" c={c} s={s} />
            </>
          )}
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
            placeholder={isGst ? 'Search by invoice #…' : 'Search by order # or customer…'}
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

      {/* ══ Content ══════════════════════════════════════════════════════════ */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : isGst ? (
        /* ─────────── GST Report view ─────────── */
        <ScrollView
          style={s.tableWrap}
          contentContainerStyle={{ paddingBottom: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={c.primary} />
          }>

          {/* Summary cards */}
          {gstSummary && gstSummary.count > 0 && (
            <View style={s.gstCardsWrap}>
              {[
                { label: 'Invoices',      val: String(gstSummary.count),                         color: c.heading    },
                { label: 'Taxable Value', val: rupee2(gstSummary.totalTaxable),                  color: c.heading    },
                { label: 'CGST',          val: rupee2(gstSummary.totalCgst),                     color: '#d97706'    },
                { label: 'SGST',          val: rupee2(gstSummary.totalSgst),                     color: '#d97706'    },
                { label: 'Total GST',     val: rupee2(gstSummary.totalGst),                      color: '#dc2626'    },
                { label: 'Grand Total',   val: rupee2(gstSummary.totalAmount),                   color: '#16a34a'    },
              ].map(card => (
                <View key={card.label} style={s.gstCard}>
                  <Text style={s.gstCardLbl}>{card.label}</Text>
                  <Text style={[s.gstCardVal, { color: card.color }]}>{card.val}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Invoice cards (mobile) / table (web) */}
          {isMobile ? (
            rows.length === 0 ? (
              <View style={s.center}>
                <Ionicons name="receipt-outline" size={48} color={c.border} />
                <Text style={s.emptyTxt}>No tax invoices found</Text>
              </View>
            ) : (
              <>
                {rows.map(order => (
                  <GstInvoiceCard key={order.id} order={order} isDark={isDark} c={c} s={s} />
                ))}
                {/* CA note */}
                <View style={s.gstNoteBanner}>
                  <Text style={s.gstNoteTxt}>
                    ℹ️  CGST & SGST = 50% each of total GST (intrastate).
                    Taxable Value = Subtotal − Discount. Verify with your CA before GST filing.
                  </Text>
                </View>
              </>
            )
          ) : (
            /* Web: horizontal scrollable GST table */
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: 950 }}>
                <View style={s.thead}>
                  <Text style={[s.th, s.gCInv]}>Invoice #</Text>
                  <Text style={[s.th, s.gCDate]}>Date</Text>
                  <Text style={[s.th, s.gCType]}>Type</Text>
                  <Text style={[s.th, s.gCPay]}>Payment</Text>
                  <Text style={[s.th, s.gCSt]}>Status</Text>
                  <Text style={[s.th, s.gCTax, { textAlign: 'right' }]}>Taxable</Text>
                  <Text style={[s.th, s.gCRate, { textAlign: 'right' }]}>GST%</Text>
                  <Text style={[s.th, s.gCCgst, { textAlign: 'right' }]}>CGST</Text>
                  <Text style={[s.th, s.gCSgst, { textAlign: 'right' }]}>SGST</Text>
                  <Text style={[s.th, s.gCGst,  { textAlign: 'right' }]}>Total GST</Text>
                  <Text style={[s.th, s.gCGrand, { textAlign: 'right' }]}>Grand Total</Text>
                </View>
                {rows.length === 0 ? (
                  <View style={s.center}>
                    <Ionicons name="receipt-outline" size={48} color={c.border} />
                    <Text style={s.emptyTxt}>No tax invoices found</Text>
                  </View>
                ) : rows.map(order => {
                  const taxable = Math.max(0, (order.subtotal ?? 0) - (order.discount_amount ?? 0));
                  const gst     = order.tax_amount ?? 0;
                  const cgst    = Math.round(gst / 2 * 100) / 100;
                  const sgst    = Math.round(gst / 2 * 100) / 100;
                  const grand   = Number(order.grand_total ?? order.total ?? 0);
                  const rate    = taxable > 0 && gst > 0 ? `${Math.round(gst / taxable * 10000) / 100}%` : '—';
                  const psc     = statusClr(order.payment_status ?? order.status, isDark);
                  const pm      = order.payment_method ?? 'Other';
                  return (
                    <View key={order.id} style={s.trow}>
                      <Text style={[s.td, s.gCInv, { fontWeight: '700', color: c.primary }]} numberOfLines={1}>
                        #{order.order_number ?? order.id}
                      </Text>
                      <Text style={[s.td, s.gCDate, { fontSize: 12 }]} numberOfLines={1}>
                        {fmtDate(order.created_at ?? order.date)}
                      </Text>
                      <Text style={[s.td, s.gCType, { fontSize: 12 }]} numberOfLines={1}>
                        {fmtType(order.order_type ?? order.type)}
                      </Text>
                      <Text style={[s.td, s.gCPay, { fontSize: 12 }]} numberOfLines={1}>
                        {pm.charAt(0).toUpperCase() + pm.slice(1)}
                      </Text>
                      <View style={s.gCSt}>
                        <View style={[s.pill, { backgroundColor: psc.bg }]}>
                          <Text style={[s.pillTxt, { color: psc.fg }]}>
                            {(order.payment_status ?? order.status).replace('_', ' ')}
                          </Text>
                        </View>
                      </View>
                      <Text style={[s.td, s.gCTax, { textAlign: 'right' }]}>{rupee2(taxable)}</Text>
                      <Text style={[s.td, s.gCRate, { textAlign: 'right', color: c.textMuted, fontSize: 12 }]}>{rate}</Text>
                      <Text style={[s.td, s.gCCgst, { textAlign: 'right' }]}>{rupee2(cgst)}</Text>
                      <Text style={[s.td, s.gCSgst, { textAlign: 'right' }]}>{rupee2(sgst)}</Text>
                      <Text style={[s.td, s.gCGst,  { textAlign: 'right', fontWeight: '700', color: '#dc2626' }]}>{rupee2(gst)}</Text>
                      <Text style={[s.td, s.gCGrand, { textAlign: 'right', fontWeight: '800' }]}>{rupee2(grand)}</Text>
                    </View>
                  );
                })}
                {/* Grand total footer row */}
                {gstSummary && gstSummary.count > 0 && (
                  <View style={[s.trow, { backgroundColor: c.surfaceAlt }]}>
                    <Text style={[s.td, s.gCInv, { fontWeight: '800' }]}>Grand Total</Text>
                    <Text style={[s.td, s.gCDate]} />
                    <Text style={[s.td, s.gCType]} />
                    <Text style={[s.td, s.gCPay]} />
                    <Text style={[s.td, s.gCSt, { fontSize: 12, color: c.textMuted }]}>
                      {gstSummary.count} invoice{gstSummary.count !== 1 ? 's' : ''}
                    </Text>
                    <Text style={[s.td, s.gCTax,  { textAlign: 'right', fontWeight: '700' }]}>{rupee2(gstSummary.totalTaxable)}</Text>
                    <Text style={[s.td, s.gCRate]} />
                    <Text style={[s.td, s.gCCgst, { textAlign: 'right', fontWeight: '700' }]}>{rupee2(gstSummary.totalCgst)}</Text>
                    <Text style={[s.td, s.gCSgst, { textAlign: 'right', fontWeight: '700' }]}>{rupee2(gstSummary.totalSgst)}</Text>
                    <Text style={[s.td, s.gCGst,  { textAlign: 'right', fontWeight: '800', color: '#dc2626' }]}>{rupee2(gstSummary.totalGst)}</Text>
                    <Text style={[s.td, s.gCGrand, { textAlign: 'right', fontWeight: '800', color: '#16a34a' }]}>{rupee2(gstSummary.totalAmount)}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </ScrollView>
      ) : isMobile ? (
        /* ─────────── Mobile: order card list ─────────── */
        <ScrollView
          style={s.tableWrap}
          contentContainerStyle={{ paddingBottom: 12 }}
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={c.primary} />
          }>
          {rows.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="receipt-outline" size={48} color={c.border} />
              <Text style={s.emptyTxt}>No orders found</Text>
            </View>
          ) : rows.map(order => (
            <OrderCard key={order.id} order={order} isDark={isDark} c={c} s={s} />
          ))}
        </ScrollView>
      ) : (
        /* ─────────── Web: order table ─────────── */
        <ScrollView style={s.tableWrap}
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={c.primary} />
          }>
          <View style={{ flex: 1 }}>
            <View style={s.thead}>
              <Text style={[s.th, s.cId]}>Order #</Text>
              <Text style={[s.th, s.cDate]}>Date</Text>
              <Text style={[s.th, s.cCust]}>Customer</Text>
              <Text style={[s.th, s.cType]}>Type</Text>
              <Text style={[s.th, s.cTable]}>Table</Text>
              <Text style={[s.th, s.cTotal, { textAlign: 'right' }]}>Grand Total</Text>
              <Text style={[s.th, s.cStatus, { paddingLeft: 8 }]}>Status</Text>
            </View>
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
                  <Text style={[s.td, s.cId, { fontWeight: '700', color: c.primary }]} numberOfLines={1}>
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

        {isMobile ? (
          /* Mobile: entries + pagination stacked */
          <>
            <View style={[s.paginRow, { justifyContent: 'center' }]}>
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
            </View>
            <View style={[s.paginRow, { justifyContent: 'center', paddingTop: 0 }]}>
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
          </>
        ) : (
          /* Web: single row */
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
        )}

        {/* Period total */}
        <View style={s.periodRow}>
          <Text style={s.periodLbl}>
            Period total:{' '}
            <Text style={{ fontWeight: '700', color: c.text }}>
              {rows.length} {isGst ? 'invoice' : 'order'}{rows.length !== 1 ? 's' : ''}
            </Text>
          </Text>
          <Text style={s.periodVal}>{rupee2(periodTotal)}</Text>
        </View>

        {/* Export row */}
        <View style={s.exportRow}>
          <Pressable style={({ pressed }) => [s.exportBtn, pressed && { opacity: 0.7 }]}
            onPress={handleExportCsv}>
            <Ionicons name="download-outline" size={14} color={c.text} />
            <Text style={s.exportTxt}>Export Excel</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.exportBtn, pressed && { opacity: 0.7 }]}
            onPress={handleExportPdf}>
            <Ionicons name="document-text-outline" size={14} color={c.text} />
            <Text style={s.exportTxt}>Export PDF</Text>
          </Pressable>
        </View>

      </View>
    </View>
  );
}
