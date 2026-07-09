/**
 * Invoices Screen — CSPos Restaurant Admin (exact match)
 * Table layout (desktop) · Cards (mobile) · Stats · Search · Filters · Mark as Paid · Print
 */
import React, {
  useEffect, useState, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ScrollView,
  TextInput, Modal, ActivityIndicator, Platform, Pressable,
  useWindowDimensions, FlatList, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { invoicesApi } from '@/api/invoices';
import { buildCsv, downloadCsv } from '@/utils/export';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { Invoice, PaymentMethod } from '@/types';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

// ── Config ────────────────────────────────────────────────────────────────────
const PAY_CFG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  paid:    { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Paid'    },
  unpaid:  { color: '#ef4444', bg: '#fef2f2', border: '#fca5a5', label: 'Unpaid'  },
  pending: { color: '#d97706', bg: '#fef9ec', border: '#fcd34d', label: 'Pending' },
  partial: { color: PRIMARY,   bg: '#eff6ff', border: '#93c5fd', label: 'Partial' },
};
function pCfg(s?: string) { return PAY_CFG[s ?? ''] ?? PAY_CFG.unpaid; }

const DATE_PRESETS = [
  { key: 'all',       label: 'All Time'   },
  { key: 'today',     label: 'Today'      },
  { key: 'yesterday', label: 'Yesterday'  },
  { key: 'week',      label: 'This Week'  },
  { key: 'month',     label: 'This Month' },
];

const STATUS_TABS = [
  { key: 'all',     label: 'All'     },
  { key: 'paid',    label: 'Paid'    },
  { key: 'unpaid',  label: 'Unpaid'  },
  { key: 'partial', label: 'Partial' },
];

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: any }[] = [
  { key: 'cash',  label: 'Cash',  icon: 'cash-outline'                  },
  { key: 'card',  label: 'Card',  icon: 'card-outline'                  },
  { key: 'upi',   label: 'UPI',   icon: 'phone-portrait-outline'        },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline'   },
];

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in:  'Dine In',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

function fmtDate(dt?: string) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isToday(d))     return format(d, 'dd MMM yyyy');
  if (isYesterday(d)) return `Yesterday`;
  return format(d, 'dd MMM yyyy');
}

function fmtDateTime(dt?: string) {
  if (!dt) return '—';
  return format(new Date(dt), 'dd MMM yyyy, hh:mm a');
}

// ── Style factories ───────────────────────────────────────────────────────────

function mkS(c: ThemeColors) {
  return StyleSheet.create({
    header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    headerTitle:  { fontSize: 20, fontWeight: '800', color: c.heading },
    iconBtn:      { width: 32, height: 32, borderRadius: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    exportBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    exportBtnTxt: { fontSize: 13, fontWeight: '600', color: c.text },
    exportMenu:   { position: 'absolute', top: '100%', right: 0, marginTop: 4, backgroundColor: c.surface, borderRadius: 8, borderWidth: 1, borderColor: c.border, minWidth: 140, zIndex: 50, elevation: 4 },
    exportMenuItem:{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
    exportMenuTxt:{ fontSize: 13, color: c.text },
    filterRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    filterTools:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
    searchBox:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: c.border, width: 240, maxWidth: 240, flexGrow: 0, flexShrink: 0 },
    searchBoxMobile: { flex: 1, width: '100%', maxWidth: '100%' },
    searchInput:  { flex: 1, fontSize: 13, color: c.heading, paddingVertical: 0 },
    filterBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    filterBtnTxt: { fontSize: 13, fontWeight: '600', color: c.text },
    filterDot:    { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.sidebar },
    iconBtn2:     { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    sortBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    sortBtnTxt:   { fontSize: 13, fontWeight: '600', color: c.text },
    dropMenu:     { position: 'absolute', top: 38, left: 0, minWidth: 150, zIndex: 999, backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 10, overflow: 'hidden' },
    dropItem:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    dropItemActive:{ backgroundColor: c.surfaceAlt },
    dropItemTxt:  { fontSize: 13, color: c.text },
    loadWrap:    { paddingTop: 80, alignItems: 'center', gap: 12 },
    loadTxt:     { fontSize: 14, color: c.textMuted },
    emptyWrap:   { paddingVertical: 60, alignItems: 'center', gap: 10 },
    emptyTitle:  { fontSize: 15, fontWeight: '600', color: c.textMuted },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modalPanel:    { width: 600, maxWidth: '95%', maxHeight: '90%', borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
  });
}

function mkTr(c: ThemeColors) {
  return StyleSheet.create({
    tableWrap:  { backgroundColor: c.surface, marginHorizontal: 12, marginTop: 12, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    headerRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    th:         { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border },
    rowAlt:     { backgroundColor: c.surfaceAlt },
    cell:       { flexDirection: 'row', alignItems: 'center' },
    cellTxt:    { fontSize: 13.5, color: c.text },
    invNo:      { fontSize: 13.5, fontWeight: '600', color: c.heading },
    orderNo:    { fontSize: 11, color: c.textMuted, marginTop: 1 },
    amtTxt:     { fontSize: 13.5, fontWeight: '600', color: c.heading },
    statusTxt:  { fontSize: 13.5, fontWeight: '600' },
    actions:    { width: 80, alignItems: 'center', justifyContent: 'center' },
    actionBtn:  { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    paidBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, width: 'auto', backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
    paidBtnTxt: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
    footer:     { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surfaceAlt, borderTopWidth: 1, borderTopColor: c.border },
    footerTxt:  { fontSize: 12, color: c.textMuted },
  });
}

function mkPg(c: ThemeColors) {
  return StyleSheet.create({
    wrap:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    left:         { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 },
    entriesInput: { width: 44, borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, color: c.heading, textAlign: 'center', backgroundColor: c.surfaceAlt },
    entriesLbl:   { fontSize: 13, color: c.textMuted },
    showingTxt:   { fontSize: 12.5, color: c.brand, fontWeight: '600' },
    numBar:       { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
    numBtn:       { width: 28, height: 28, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
    numBtnArrow:  { backgroundColor: c.surface },
    numBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
    numBtnTxt:    { fontSize: 12, fontWeight: '600', color: c.text },
    numBtnTxtActive: { color: '#fff' },
  });
}

function mkCd(c: ThemeColors) {
  return StyleSheet.create({
    card:        { backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    top:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    invNo:       { fontSize: 15, fontWeight: '800', color: c.heading },
    orderNo:     { fontSize: 11, color: c.textMuted, marginTop: 2 },
    badge:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
    badgeTxt:    { fontSize: 11, fontWeight: '700' },
    mid:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    customer:    { fontSize: 12.5, fontWeight: '600', color: c.text },
    tableTag:    { fontSize: 11, fontWeight: '600', color: c.textMuted },
    date:        { fontSize: 11, color: c.textMuted, flexShrink: 0 },
    bot:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    methodChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surfaceAlt, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
    methodTxt:   { fontSize: 10, fontWeight: '600', color: c.textMuted },
    typeChip:    { backgroundColor: '#f0f9ff', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
    typeChipTxt: { fontSize: 10, fontWeight: '600', color: '#0284c7' },
    itemChip:    { backgroundColor: '#eff6ff', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
    itemChipTxt: { fontSize: 10, fontWeight: '600', color: PRIMARY },
    total:       { fontSize: 17, fontWeight: '800', color: c.brand },
  });
}

function mkDt(c: ThemeColors) {
  return StyleSheet.create({
    header:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border, borderLeftWidth: 4 },
    invNo:        { fontSize: 17, fontWeight: '800', color: c.heading },
    orderNo:      { fontSize: 12, color: c.textMuted, marginTop: 3 },
    statusBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', marginTop: 2 },
    statusTxt:    { fontSize: 11, fontWeight: '800' },
    closeBtn:     { width: 30, height: 30, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    accent:       { height: 3 },
    section:      { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    sectionLbl:   { fontSize: 10.5, fontWeight: '800', color: c.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
    infoGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    infoItem:     { minWidth: 140 },
    infoLbl:      { fontSize: 10.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
    infoVal:      { fontSize: 13.5, fontWeight: '600', color: c.heading },
    tableHeader:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border, marginBottom: 2 },
    tHCell:       { fontSize: 10, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    tableRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
    qtyBox:       { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    qtyTxt:       { fontSize: 11, fontWeight: '800' },
    itemName:     { fontSize: 13, fontWeight: '600', color: c.heading },
    cellTxt:      { fontSize: 12, color: c.textMuted },
    amtTxt:       { fontSize: 13, fontWeight: '700', color: c.text },
    sumRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
    sumLbl:       { fontSize: 13, color: c.textMuted },
    sumVal:       { fontSize: 13, fontWeight: '600', color: c.text },
    couponBadge:  { backgroundColor: '#fef9ec', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#fcd34d' },
    couponCode:   { fontSize: 10, fontWeight: '700', color: '#d97706' },
    totalRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 6, borderTopWidth: 1.5, borderTopColor: c.border },
    totalLbl:     { fontSize: 15, fontWeight: '800', color: c.sidebar },
    totalVal:     { fontSize: 18, fontWeight: '800', color: PRIMARY },
    markPaidBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14 },
    markPaidTxt:       { color: '#fff', fontWeight: '800', fontSize: 15 },
    markPaidPanel:     { backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
    markPaidPanelTitle:{ fontSize: 13, fontWeight: '700', color: c.text },
    pmChip:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
    pmChipTxt:    { fontSize: 13, fontWeight: '600', color: c.textMuted },
    cancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
    cancelTxt:    { fontSize: 14, fontWeight: '700', color: c.textMuted },
    confirmPaidBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: '#16a34a' },
    confirmPaidTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
    printBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.sidebar, borderRadius: 12, paddingVertical: 14 },
    printTxt:     { color: c.brand, fontWeight: '800', fontSize: 15 },
  });
}

// ── Print ─────────────────────────────────────────────────────────────────────
function printInvoice(inv: Invoice, restaurant: any) {
  if (Platform.OS !== 'web') return;
  const rows = (inv.items ?? []).map(i =>
    `<tr>
      <td style="padding:5px 0">${(i as any).item_name ?? (i as any).name ?? ''}</td>
      <td align="center" style="padding:5px 4px">${i.quantity}</td>
      <td align="right" style="padding:5px 0">₹${Number(i.unit_price).toFixed(2)}</td>
      <td align="right" style="padding:5px 0">₹${Number(i.total_price).toFixed(2)}</td>
    </tr>`
  ).join('');

  const gstLine = restaurant?.gst_number
    ? `<div style="font-size:10px;color:#666;margin:2px 0">GSTIN: ${restaurant.gst_number}</div>` : '';
  const tableLine = inv.table_name
    ? `<div style="font-size:10px;color:#666;margin:2px 0">Table: ${inv.table_name}${inv.waiter_name ? ' &nbsp;|&nbsp; Waiter: ' + inv.waiter_name : ''}</div>` : '';
  const orderTypeLine = inv.order_type
    ? `<div style="font-size:10px;color:#666;margin:2px 0">Type: ${ORDER_TYPE_LABELS[inv.order_type] ?? inv.order_type}</div>` : '';
  const couponLine = inv.coupon_code && Number(inv.coupon_discount) > 0
    ? `<tr><td>Coupon (${inv.coupon_code})</td><td align="right" style="color:#16a34a">-₹${Number(inv.coupon_discount).toFixed(2)}</td></tr>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Invoice ${inv.invoice_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;max-width:380px;margin:0 auto;padding:16px}
h2{text-align:center;font-size:15px;letter-spacing:2px;margin-bottom:3px}
.sub{text-align:center;font-size:10px;color:#555;line-height:1.6;margin-bottom:10px}
hr{border:none;border-top:1px dashed #bbb;margin:8px 0}
table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;font-size:9px;text-transform:uppercase;color:#888;padding:4px 0;border-bottom:1px solid #ddd}
.total-row td{font-size:14px;font-weight:bold;padding-top:8px}
.footer{text-align:center;font-size:10px;color:#aaa;margin-top:14px}
@media print{body{max-width:100%;padding:0}}
</style></head><body>
<h2>${restaurant?.name ?? 'RESTAURANT'}</h2>
<div class="sub">${restaurant?.address ?? ''}${restaurant?.phone ? '<br>' + restaurant.phone : ''}</div>
${gstLine}
<hr>
<b style="font-size:11px">Invoice: ${inv.invoice_number}</b>
<div style="font-size:10px;color:#666;margin:3px 0">
  Order: #${inv.order_number ?? '—'} &nbsp;|&nbsp; ${inv.created_at ? format(new Date(inv.created_at), 'dd MMM yyyy, hh:mm a') : ''}
</div>
<div style="font-size:10px;color:#666;margin:2px 0">Customer: ${inv.customer_name || 'Walk-in'}${inv.customer_phone ? ' (' + inv.customer_phone + ')' : ''}</div>
${tableLine}${orderTypeLine}
<hr>
<table>
  <thead><tr><th>Item</th><th align="center">Qty</th><th align="right">Rate</th><th align="right">Amt</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<hr>
<table>
  <tr><td>Subtotal</td><td align="right">₹${Number(inv.subtotal ?? 0).toFixed(2)}</td></tr>
  ${Number(inv.tax_amount) > 0 ? `<tr><td>Tax / GST</td><td align="right">₹${Number(inv.tax_amount).toFixed(2)}</td></tr>` : ''}
  ${Number(inv.discount_amount) > 0 ? `<tr><td>Discount</td><td align="right" style="color:#16a34a">-₹${Number(inv.discount_amount).toFixed(2)}</td></tr>` : ''}
  ${couponLine}
  <tr class="total-row"><td><b>TOTAL</b></td><td align="right"><b>₹${Number(inv.total).toFixed(2)}</b></td></tr>
</table>
<hr>
<div style="font-size:10px">Payment: ${(inv.payment_method ?? '—').toUpperCase()} &nbsp;|&nbsp; ${pCfg(inv.payment_status).label.toUpperCase()}</div>
<div class="footer">Thank you for visiting!</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;
  const w = window.open('', '_blank', 'width=440,height=680');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Invoice Card (mobile) ─────────────────────────────────────────────────────
function InvoiceCard({ inv, onPress }: { inv: Invoice; onPress: () => void }) {
  const { colors: c } = useTheme();
  const cd = useMemo(() => mkCd(c), [c]);

  const cfg = pCfg(inv.payment_status);
  return (
    <Pressable
      style={({ pressed }) => [cd.card, { borderLeftColor: cfg.color }, pressed && { opacity: 0.82 }]}
      onPress={onPress}>
      <View style={cd.top}>
        <View style={{ flex: 1 }}>
          <Text style={cd.invNo}>{inv.invoice_number}</Text>
          <Text style={cd.orderNo}>Order #{inv.order_number ?? '—'}</Text>
        </View>
        <View style={[cd.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[cd.badgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <View style={cd.mid}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
          <Ionicons name="person-outline" size={12} color={c.textMuted} />
          <Text style={cd.customer} numberOfLines={1}>{inv.customer_name || 'Walk-in'}</Text>
          {inv.table_name ? (
            <>
              <Text style={{ color: c.border, fontSize: 11 }}>·</Text>
              <Ionicons name="grid-outline" size={11} color={c.textMuted} />
              <Text style={cd.tableTag}>{inv.table_name}</Text>
            </>
          ) : null}
        </View>
        <Text style={cd.date}>{fmtDate(inv.created_at)}</Text>
      </View>
      <View style={cd.bot}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          {inv.payment_method ? (
            <View style={cd.methodChip}>
              <Ionicons name="card-outline" size={10} color={c.textMuted} />
              <Text style={cd.methodTxt}>{inv.payment_method.toUpperCase()}</Text>
            </View>
          ) : null}
          {inv.order_type ? (
            <View style={cd.typeChip}>
              <Text style={cd.typeChipTxt}>{ORDER_TYPE_LABELS[inv.order_type] ?? inv.order_type}</Text>
            </View>
          ) : null}
          {(inv.items?.length ?? 0) > 0 && (
            <View style={cd.itemChip}>
              <Text style={cd.itemChipTxt}>{inv.items!.length} item{inv.items!.length !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
        <Text style={cd.total}>₹{Number(inv.total).toFixed(2)}</Text>
      </View>
    </Pressable>
  );
}

// ── Desktop Table Row ─────────────────────────────────────────────────────────
function TableRow({
  inv, idx, onView, onMarkPaid,
}: {
  inv: Invoice;
  idx: number;
  onView: () => void;
  onMarkPaid: () => void;
}) {
  const { colors: c } = useTheme();
  const tr = useMemo(() => mkTr(c), [c]);

  const cfg = pCfg(inv.payment_status);
  return (
    <Pressable
      style={({ pressed }) => [
        tr.row,
        idx % 2 === 1 && tr.rowAlt,
        pressed && { backgroundColor: c.surfaceAlt },
      ]}
      onPress={onView}>
      {/* Invoice ID */}
      <View style={[tr.cell, { flex: 1.4 }]}>
        <Text style={tr.invNo}>{inv.invoice_number ?? inv.order_number ?? `Order ${inv.id}`}</Text>
      </View>
      {/* Customer */}
      <Text style={[tr.cellTxt, { flex: 1.1 }]} numberOfLines={1}>
        {inv.customer_name || 'Walk-in'}
      </Text>
      {/* Date */}
      <Text style={[tr.cellTxt, { flex: 1 }]}>
        {fmtDate(inv.created_at)}
      </Text>
      {/* Order Type */}
      <Text style={[tr.cellTxt, { flex: 0.9 }]}>
        {inv.order_type ? ORDER_TYPE_LABELS[inv.order_type] : 'Dine in'}
      </Text>
      {/* Amount */}
      <Text style={[tr.amtTxt, { width: 100 }]}>
        ₹{Number(inv.total).toFixed(2)}
      </Text>
      {/* Status */}
      <View style={{ width: 100 }}>
        <Text style={[tr.statusTxt, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
      {/* Actions */}
      <View style={tr.actions}>
        <Pressable
          style={({ pressed }) => [tr.actionBtn, pressed && { opacity: 0.7 }]}
          onPress={(e) => { e.stopPropagation?.(); onView(); }}>
          <Ionicons name="eye-outline" size={17} color={c.textMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ── Invoice Detail ────────────────────────────────────────────────────────────
function InvoiceDetail({
  inv, restaurant, onClose, onUpdated,
}: {
  inv: Invoice;
  restaurant: any;
  onClose: () => void;
  onUpdated: (updated: Invoice) => void;
}) {
  const { colors: c } = useTheme();
  const dt = useMemo(() => mkDt(c), [c]);

  const cfg = pCfg(inv.payment_status);
  const [saving,         setSaving]         = useState(false);
  const [showMarkPaid,   setShowMarkPaid]   = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState<PaymentMethod>(inv.payment_method ?? 'cash');

  const canMarkPaid = inv.payment_status !== 'paid';

  const handleMarkPaid = useCallback(async () => {
    setSaving(true);
    try {
      const res = await invoicesApi.markAsPaid(inv.id, markPaidMethod);
      const updated: Invoice = res.data?.data ?? res.data ?? {
        ...inv, payment_status: 'paid', payment_method: markPaidMethod,
      };
      onUpdated(updated);
      setShowMarkPaid(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Failed to update payment status.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }, [inv, markPaidMethod, onUpdated]);

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {/* Header */}
      <View style={[dt.header, { borderLeftColor: cfg.color }]}>
        <View style={{ flex: 1 }}>
          <Text style={dt.invNo}>{inv.invoice_number}</Text>
          <Text style={dt.orderNo}>Order #{inv.order_number ?? '—'}</Text>
        </View>
        <View style={[dt.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[dt.statusTxt, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <Pressable style={({ pressed }) => [dt.closeBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
          <Ionicons name="close" size={18} color={c.text} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[dt.accent, { backgroundColor: cfg.color }]} />

        {/* Info grid */}
        <View style={dt.section}>
          <Text style={dt.sectionLbl}>Details</Text>
          <View style={dt.infoGrid}>
            <View style={dt.infoItem}>
              <Text style={dt.infoLbl}>Customer</Text>
              <Text style={dt.infoVal}>{inv.customer_name || 'Walk-in'}</Text>
            </View>
            {inv.customer_phone ? (
              <View style={dt.infoItem}>
                <Text style={dt.infoLbl}>Phone</Text>
                <Text style={dt.infoVal}>{inv.customer_phone}</Text>
              </View>
            ) : null}
            <View style={dt.infoItem}>
              <Text style={dt.infoLbl}>Date & Time</Text>
              <Text style={dt.infoVal}>{fmtDateTime(inv.created_at)}</Text>
            </View>
            <View style={dt.infoItem}>
              <Text style={dt.infoLbl}>Payment Method</Text>
              <Text style={dt.infoVal}>{inv.payment_method ? inv.payment_method.toUpperCase() : '—'}</Text>
            </View>
            {inv.order_type ? (
              <View style={dt.infoItem}>
                <Text style={dt.infoLbl}>Order Type</Text>
                <Text style={dt.infoVal}>{ORDER_TYPE_LABELS[inv.order_type] ?? inv.order_type}</Text>
              </View>
            ) : null}
            {inv.table_name ? (
              <View style={dt.infoItem}>
                <Text style={dt.infoLbl}>Table</Text>
                <Text style={dt.infoVal}>{inv.table_name}</Text>
              </View>
            ) : null}
            {inv.waiter_name ? (
              <View style={dt.infoItem}>
                <Text style={dt.infoLbl}>Waiter</Text>
                <Text style={dt.infoVal}>{inv.waiter_name}</Text>
              </View>
            ) : null}
            {restaurant?.gst_number ? (
              <View style={dt.infoItem}>
                <Text style={dt.infoLbl}>GSTIN</Text>
                <Text style={dt.infoVal}>{restaurant.gst_number}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Items table */}
        {(inv.items?.length ?? 0) > 0 && (
          <View style={dt.section}>
            <Text style={dt.sectionLbl}>Items ({inv.items!.length})</Text>
            <View style={dt.tableHeader}>
              <Text style={[dt.tHCell, { flex: 1 }]}>Item</Text>
              <Text style={[dt.tHCell, { width: 32, textAlign: 'center' }]}>Qty</Text>
              <Text style={[dt.tHCell, { width: 68, textAlign: 'right' }]}>Rate</Text>
              <Text style={[dt.tHCell, { width: 76, textAlign: 'right' }]}>Amount</Text>
            </View>
            {inv.items!.map((item, idx) => (
              <View key={idx} style={[dt.tableRow, idx % 2 === 1 && { backgroundColor: c.surfaceAlt }]}>
                <View style={[dt.qtyBox, { backgroundColor: cfg.bg }]}>
                  <Text style={[dt.qtyTxt, { color: cfg.color }]}>{item.quantity}</Text>
                </View>
                <Text style={[dt.itemName, { flex: 1 }]} numberOfLines={2}>
                  {(item as any).item_name ?? (item as any).name ?? ''}
                </Text>
                <Text style={[dt.cellTxt, { width: 68, textAlign: 'right' }]}>
                  ₹{Number(item.unit_price).toFixed(2)}
                </Text>
                <Text style={[dt.amtTxt, { width: 76, textAlign: 'right' }]}>
                  ₹{Number(item.total_price).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Summary */}
        <View style={dt.section}>
          <Text style={dt.sectionLbl}>Summary</Text>
          <View style={dt.sumRow}>
            <Text style={dt.sumLbl}>Subtotal</Text>
            <Text style={dt.sumVal}>₹{Number(inv.subtotal ?? 0).toFixed(2)}</Text>
          </View>
          {Number(inv.tax_amount) > 0 && (
            <View style={dt.sumRow}>
              <Text style={dt.sumLbl}>Tax / GST</Text>
              <Text style={dt.sumVal}>₹{Number(inv.tax_amount).toFixed(2)}</Text>
            </View>
          )}
          {Number(inv.discount_amount) > 0 && (
            <View style={dt.sumRow}>
              <Text style={dt.sumLbl}>Discount</Text>
              <Text style={[dt.sumVal, { color: '#16a34a' }]}>-₹{Number(inv.discount_amount).toFixed(2)}</Text>
            </View>
          )}
          {inv.coupon_code && Number(inv.coupon_discount) > 0 && (
            <View style={dt.sumRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={dt.sumLbl}>Coupon</Text>
                <View style={dt.couponBadge}>
                  <Text style={dt.couponCode}>{inv.coupon_code}</Text>
                </View>
              </View>
              <Text style={[dt.sumVal, { color: '#16a34a' }]}>-₹{Number(inv.coupon_discount).toFixed(2)}</Text>
            </View>
          )}
          <View style={dt.totalRow}>
            <Text style={dt.totalLbl}>TOTAL</Text>
            <Text style={dt.totalVal}>₹{Number(inv.total).toFixed(2)}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 10 }}>
          {canMarkPaid && (
            !showMarkPaid ? (
              <Pressable
                style={({ pressed }) => [dt.markPaidBtn, pressed && { opacity: 0.85 }]}
                onPress={() => setShowMarkPaid(true)}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={dt.markPaidTxt}>Mark as Paid</Text>
              </Pressable>
            ) : (
              <View style={dt.markPaidPanel}>
                <Text style={dt.markPaidPanelTitle}>Select Payment Method</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {PAYMENT_METHODS.map(pm => (
                    <Pressable
                      key={pm.key}
                      style={[
                        dt.pmChip,
                        markPaidMethod === pm.key && { backgroundColor: c.sidebar, borderColor: c.sidebar },
                      ]}
                      onPress={() => setMarkPaidMethod(pm.key)}>
                      <Ionicons
                        name={pm.icon}
                        size={14}
                        color={markPaidMethod === pm.key ? c.brand : c.textMuted}
                      />
                      <Text style={[
                        dt.pmChipTxt,
                        markPaidMethod === pm.key && { color: c.brand, fontWeight: '700' },
                      ]}>{pm.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <Pressable
                    style={({ pressed }) => [dt.cancelBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => setShowMarkPaid(false)}>
                    <Text style={dt.cancelTxt}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [dt.confirmPaidBtn, pressed && { opacity: 0.85 }]}
                    disabled={saving}
                    onPress={handleMarkPaid}>
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <Ionicons name="checkmark" size={16} color="#fff" />
                          <Text style={dt.confirmPaidTxt}>Confirm Paid</Text>
                        </>
                    }
                  </Pressable>
                </View>
              </View>
            )
          )}

          {Platform.OS === 'web' && (
            <Pressable
              style={({ pressed }) => [dt.printBtn, pressed && { opacity: 0.8 }]}
              onPress={() => printInvoice(inv, restaurant)}>
              <Ionicons name="print-outline" size={17} color={c.brand} />
              <Text style={dt.printTxt}>Print Invoice</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function PageNumBar({
  page, totalPages, onPage,
}: { page: number; totalPages: number; onPage: (p: number) => void }) {
  const { colors: c } = useTheme();
  const pg = useMemo(() => mkPg(c), [c]);

  const maxPages = Math.min(totalPages, 8);
  const pageList = Array.from({ length: maxPages }, (_, i) => i + 1);
  return (
    <View style={pg.numBar}>
      <Pressable style={[pg.numBtn, pg.numBtnArrow]} onPress={() => page > 1 && onPage(page - 1)} disabled={page <= 1}>
        <Ionicons name="chevron-back" size={12} color={page <= 1 ? c.border : c.text} />
      </Pressable>
      {pageList.map(p => (
        <Pressable key={p} style={[pg.numBtn, page === p && pg.numBtnActive]} onPress={() => onPage(p)}>
          <Text style={[pg.numBtnTxt, page === p && pg.numBtnTxtActive]}>{p}</Text>
        </Pressable>
      ))}
      {totalPages > 8 && <Text style={pg.numBtnTxt}>…</Text>}
      <Pressable style={[pg.numBtn, pg.numBtnArrow]} onPress={() => page < totalPages && onPage(page + 1)} disabled={page >= totalPages}>
        <Ionicons name="chevron-forward" size={12} color={page >= totalPages ? c.border : c.text} />
      </Pressable>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function InvoicesScreen() {
  const { colors: c } = useTheme();
  const s  = useMemo(() => mkS(c), [c]);
  const tr = useMemo(() => mkTr(c), [c]);
  const pg = useMemo(() => mkPg(c), [c]);

  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [perPage,    setPerPage]    = useState(10);

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortOrder,    setSortOrder]    = useState<'newest' | 'oldest'>('newest');
  const [sortOpen,     setSortOpen]     = useState(false);
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [exportOpen,   setExportOpen]   = useState(false);

  const [selected,   setSelected]   = useState<Invoice | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const { restaurant } = useAppStore();
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const isDesktop = width >= 900;
  const isMobile  = width < 640;

  const load = useCallback(async (opts?: {
    pg?: number; pp?: number; silent?: boolean;
    status?: string; q?: string;
  }) => {
    const pg2  = opts?.pg     ?? page;
    const pp2  = opts?.pp     ?? perPage;
    const sts  = opts?.status !== undefined ? opts.status : statusFilter;
    const srch = opts?.q      !== undefined ? opts.q      : search;
    if (!opts?.silent) setLoading(true);
    try {
      const params: Record<string, any> = { page: pg2, per_page: pp2 };
      if (sts)        params.payment_status = sts;
      if (srch.trim()) params.search        = srch.trim();
      const res  = await invoicesApi.list(params);
      const raw  = res.data;
      const data = raw?.data ?? raw ?? [];
      setInvoices(Array.isArray(data) ? data : []);
      if (raw?.meta?.total != null)       setTotal(raw.meta.total);
      else if (raw?.total != null)        setTotal(raw.total);
      else                                setTotal(Array.isArray(data) ? data.length : 0);
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [page, perPage, statusFilter, search]);

  useEffect(() => { load(); }, []);

  function goPage(p: number) { setPage(p); load({ pg: p }); }
  function changePerPage(n: number) { setPerPage(n); setPage(1); load({ pg: 1, pp: n }); }
  function doRefresh() { setRefreshing(true); load({ silent: true }); }

  function handleExport() {
    const headers = ['Invoice #', 'Order', 'Customer', 'Table', 'Total', 'Status', 'Date'];
    const rows = filtered.map(inv => [
      inv.invoice_number,
      inv.order_number ?? inv.order_id,
      inv.customer_name ?? '',
      inv.table_name ?? '',
      inv.total,
      inv.payment_status ?? '',
      inv.created_at ?? '',
    ]);
    downloadCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(headers, rows));
    setExportOpen(false);
  }

  const filtered = useMemo(() => {
    let list = [...invoices];
    if (statusFilter) list = list.filter(inv => inv.payment_status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(inv =>
        (inv.invoice_number ?? '').toLowerCase().includes(q) ||
        (inv.customer_name  ?? '').toLowerCase().includes(q) ||
        (inv.order_number   ?? '').toLowerCase().includes(q) ||
        (inv.table_name     ?? '').toLowerCase().includes(q)
      );
    }
    if (sortOrder === 'oldest') list.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
    else list.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    return list;
  }, [invoices, search, statusFilter, sortOrder]);

  const totalPages   = Math.max(1, Math.ceil((total || filtered.length) / perPage));
  const fromNum      = Math.max(1, (page - 1) * perPage + 1);
  const toNum        = Math.min(total || filtered.length, page * perPage);
  const displayTotal = total || filtered.length;

  const handleUpdated = useCallback((updated: Invoice) => {
    setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
    setSelected(updated);
  }, []);

  function openDetail(inv: Invoice) { setSelected(inv); setShowDetail(true); }

  const STATUS_OPTIONS = [
    { key: '', label: 'All' },
    { key: 'paid', label: 'Paid' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'pending', label: 'Pending' },
    { key: 'partial', label: 'Partial' },
  ];

  return (
    <Pressable style={{ flex: 1, backgroundColor: c.background }} onPress={() => { setSortOpen(false); setFilterOpen(false); }}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={s.headerTitle}>Invoices</Text>
          <Pressable style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]} onPress={doRefresh}>
            {refreshing
              ? <ActivityIndicator size="small" color={c.text} />
              : <Ionicons name="refresh-outline" size={16} color={c.text} />}
          </Pressable>
        </View>
        <View style={{ position: 'relative' }}>
          <Pressable style={({ pressed }) => [s.exportBtn, pressed && { opacity: 0.8 }]} onPress={() => setExportOpen(o => !o)}>
            <Ionicons name="arrow-up-circle-outline" size={14} color={c.text} />
            <Text style={s.exportBtnTxt}>Export</Text>
            <Ionicons name="chevron-down" size={12} color={c.text} />
          </Pressable>
          {exportOpen && (
            <View style={s.exportMenu}>
              <Pressable style={s.exportMenuItem} onPress={handleExport}>
                <Ionicons name="document-text-outline" size={14} color={c.text} />
                <Text style={s.exportMenuTxt}>Export CSV</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* ── Search + filter bar ── */}
      <View style={[s.filterRow, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[s.searchBox, isMobile && s.searchBoxMobile]}>
          <Ionicons name="search-outline" size={15} color={c.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={v => {
              setSearch(v);
              setPage(1);
              if ((load as any)._searchTimer) clearTimeout((load as any)._searchTimer);
              (load as any)._searchTimer = setTimeout(() => load({ pg: 1, q: v }), 400);
            }}
            placeholder="Search invoices…"
            placeholderTextColor={c.textMuted}
          />
          {search ? (
            <Pressable onPress={() => {
              setSearch('');
              setPage(1);
              load({ pg: 1, q: '' });
            }} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={c.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={[s.filterTools, isMobile && { justifyContent: 'flex-start' }]}>
          {/* Filter dropdown */}
          <View style={{ position: 'relative', zIndex: 100 }}>
            <Pressable style={({ pressed }) => [s.filterBtn, filterOpen && { borderColor: c.sidebar }, pressed && { opacity: 0.8 }]}
              onPress={e => { e.stopPropagation?.(); setFilterOpen(p => !p); setSortOpen(false); }}>
              <Ionicons name="funnel-outline" size={14} color={c.text} />
              <Text style={s.filterBtnTxt}>Filter</Text>
              {statusFilter ? <View style={s.filterDot} /> : null}
            </Pressable>
            {filterOpen && (
              <View style={s.dropMenu}>
                {STATUS_OPTIONS.map(o => (
                  <Pressable key={o.key} style={[s.dropItem, statusFilter === o.key && s.dropItemActive]}
                    onPress={() => { setStatusFilter(o.key); setFilterOpen(false); setPage(1); load({ pg: 1, status: o.key }); }}>
                    {o.key ? (
                      <Text style={[s.dropItemTxt, { color: PAY_CFG[o.key]?.color ?? c.text }, statusFilter === o.key && { fontWeight: '700' }]}>{o.label}</Text>
                    ) : (
                      <Text style={[s.dropItemTxt, statusFilter === '' && { fontWeight: '700', color: c.sidebar }]}>All Statuses</Text>
                    )}
                    {statusFilter === o.key && <Ionicons name="checkmark" size={13} color={c.sidebar} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Sort dropdown */}
          <View style={{ position: 'relative', zIndex: 99 }}>
            <Pressable style={({ pressed }) => [s.sortBtn, pressed && { opacity: 0.8 }]}
              onPress={e => { e.stopPropagation?.(); setSortOpen(p => !p); setFilterOpen(false); }}>
              <Text style={s.sortBtnTxt}>Sort: {sortOrder === 'newest' ? 'Newest' : 'Oldest'}</Text>
              <Ionicons name={sortOpen ? 'chevron-up' : 'chevron-down'} size={12} color={c.text} />
            </Pressable>
            {sortOpen && (
              <View style={[s.dropMenu, { right: 0, left: 'auto' as any, minWidth: 130 }]}>
                {(['newest', 'oldest'] as const).map(o => (
                  <Pressable key={o} style={[s.dropItem, sortOrder === o && s.dropItemActive]}
                    onPress={() => { setSortOrder(o); setSortOpen(false); }}>
                    <Text style={[s.dropItemTxt, sortOrder === o && { fontWeight: '700', color: c.sidebar }]}>{o === 'newest' ? 'Newest' : 'Oldest'}</Text>
                    {sortOrder === o && <Ionicons name="checkmark" size={13} color={c.sidebar} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── Table ── */}
      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color={c.sidebar} size="large" />
          <Text style={s.loadTxt}>Loading invoices…</Text>
        </View>
      ) : isDesktop ? (
        <ScrollView style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={c.brand} />}>
          <View style={tr.tableWrap}>
            {/* Header */}
            <View style={tr.headerRow}>
              <Text style={[tr.th, { flex: 1.4 }]}>Invoice ID</Text>
              <Text style={[tr.th, { flex: 1.1 }]}>Customer</Text>
              <Text style={[tr.th, { flex: 1 }]}>Date</Text>
              <Text style={[tr.th, { flex: 0.9 }]}>Order Type</Text>
              <Text style={[tr.th, { width: 100 }]}>Amount</Text>
              <Text style={[tr.th, { width: 100 }]}>Status</Text>
              <Text style={[tr.th, { width: 80, textAlign: 'center' }]}>Actions</Text>
            </View>
            {/* Rows */}
            {filtered.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="document-text-outline" size={36} color={c.textMuted} />
                <Text style={s.emptyTitle}>No invoices found</Text>
              </View>
            ) : (
              filtered.map((inv, idx) => (
                <TableRow key={inv.id} inv={inv} idx={idx}
                  onView={() => openDetail(inv)}
                  onMarkPaid={() => openDetail(inv)} />
              ))
            )}
            {/* Footer pagination */}
            {filtered.length > 0 && (
              <View style={pg.wrap}>
                <View style={pg.left}>
                  <TextInput
                    style={pg.entriesInput}
                    value={String(perPage)}
                    onChangeText={v => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) changePerPage(n); }}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                  <Text style={pg.entriesLbl}>Entries</Text>
                  <Text style={pg.showingTxt}>
                    Showing {fromNum} to {toNum} of {displayTotal} results
                  </Text>
                </View>
                <PageNumBar page={page} totalPages={totalPages} onPage={goPage} />
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        /* Mobile card list */
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 10, paddingBottom: 40, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={c.brand} />}
          renderItem={({ item }) => <InvoiceCard inv={item} onPress={() => openDetail(item)} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="document-text-outline" size={36} color={c.textMuted} />
              <Text style={s.emptyTitle}>No invoices found</Text>
            </View>
          }
        />
      )}

      {/* Detail modal */}
      <Modal visible={showDetail} animationType={isDesktop ? 'fade' : 'slide'}
        transparent={isDesktop} presentationStyle={isDesktop ? undefined : 'pageSheet'}
        onRequestClose={() => setShowDetail(false)}>
        {isDesktop ? (
          <Pressable style={s.modalBackdrop} onPress={() => setShowDetail(false)}>
            <Pressable style={s.modalPanel} onPress={() => {}}>
              {selected && (
                <InvoiceDetail inv={selected} restaurant={restaurant}
                  onClose={() => setShowDetail(false)} onUpdated={handleUpdated} />
              )}
            </Pressable>
          </Pressable>
        ) : (
          selected && (
            <InvoiceDetail inv={selected} restaurant={restaurant}
              onClose={() => setShowDetail(false)} onUpdated={handleUpdated} />
          )
        )}
      </Modal>
    </Pressable>
  );
}
