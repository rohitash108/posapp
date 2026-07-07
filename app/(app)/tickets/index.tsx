/**
 * Tickets — Support Ticket Management
 * Restaurant Admin can: View · Create · Edit · Reply · Update Status · Close · Delete
 * Desktop: side-by-side list + detail panel
 * Mobile: premium card list + slide-up detail sheet (Zendesk/Freshdesk style)
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, FlatList, Pressable, StyleSheet, ScrollView,
  TextInput, Modal, ActivityIndicator, RefreshControl, Alert, Platform,
  useWindowDimensions, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNow } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ticketsApi } from '@/api/tickets';
import { useTicketBadgeStore } from '@/store/ticketBadgeStore';
import { useAppStore } from '@/store/appStore';
import type { Ticket, TicketReply, TicketStatus, TicketPriority } from '@/types';
import { useThemedScreen } from '@/theme/useThemedScreen';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

// ── Config ─────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<TicketStatus, { color: string; bg: string; label: string; icon: any }> = {
  open:        { color: '#2563eb', bg: '#eff6ff', label: 'Open',        icon: 'radio-button-on-outline'   },
  in_progress: { color: '#d97706', bg: '#fef9ec', label: 'In Progress', icon: 'sync-outline'               },
  resolved:    { color: '#16a34a', bg: '#f0fdf4', label: 'Resolved',    icon: 'checkmark-circle-outline'   },
  closed:      { color: '#6b7280', bg: '#f3f4f6', label: 'Closed',      icon: 'lock-closed-outline'        },
};

const PRIORITY_CFG: Record<TicketPriority, { color: string; label: string; icon: any }> = {
  low:    { color: '#6b7280', label: 'Low',    icon: 'arrow-down-outline'   },
  medium: { color: '#2563eb', label: 'Medium', icon: 'remove-outline'       },
  high:   { color: '#d97706', label: 'High',   icon: 'arrow-up-outline'     },
  urgent: { color: '#dc2626', label: 'Urgent', icon: 'alert-circle-outline' },
};

const CATEGORIES = [
  { key: 'general',         label: 'General'         },
  { key: 'billing',         label: 'Billing'         },
  { key: 'technical',       label: 'Technical'       },
  { key: 'feature_request', label: 'Feature Request' },
];

const STATUS_FILTERS: Array<TicketStatus | 'all'> = ['all', 'open', 'in_progress', 'resolved', 'closed'];

const NEXT_STATUSES: Record<TicketStatus, TicketStatus[]> = {
  open:        ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved:    ['open', 'closed'],
  closed:      ['open'],
};

function fmtDate(s?: string) {
  if (!s) return '—';
  try { return format(new Date(s), 'dd MMM yyyy, hh:mm a'); }
  catch { return s; }
}
function fmtAgo(s?: string) {
  if (!s) return '';
  try { return formatDistanceToNow(new Date(s), { addSuffix: true }); }
  catch { return ''; }
}

// ── Style factories ───────────────────────────────────────────────────────────

function mkSc(c: ThemeColors) {
  return StyleSheet.create({
    // ── Desktop header ─────────────────────────────────────────────────
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    headerTitle: { fontSize: 20, fontWeight: '800', color: c.heading },
    headerSub:   { fontSize: 12, color: c.brand, marginTop: 2, fontWeight: '600' },
    newBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.sidebar, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
    newBtnTxt:   { color: '#fff', fontWeight: '700', fontSize: 13 },

    // ── Desktop stats row ─────────────────────────────────────────────
    statsRow:    { flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    statCard:    { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
    statIconWrap:{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    statLbl:     { fontSize: 10, color: c.textMuted, fontWeight: '600' },
    statVal:     { fontSize: 18, fontWeight: '800' },

    // ── Desktop filter bar ────────────────────────────────────────────
    filterBar:   { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    searchInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: c.heading, minWidth: 160 },
    applyBtn:    { alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    applyBtnTxt: { fontWeight: '700', fontSize: 13, color: c.heading },

    empty:    { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyTxt: { fontSize: 14, fontWeight: '600', color: c.brand },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalPanel:    { width: 720, maxWidth: '95%', maxHeight: '90%', borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },

    // ── Mobile header ─────────────────────────────────────────────────
    mHeader:      { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 18, paddingBottom: 14 },
    mHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    mHeaderTitle: { fontSize: 24, fontWeight: '900', color: c.heading, letterSpacing: -0.5 },
    mHeaderSub:   { fontSize: 12, color: c.brand, marginTop: 3, fontWeight: '600', lineHeight: 16 },
    mNewBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.sidebar, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, shadowColor: c.sidebar, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
    mNewBtnTxt:   { color: '#fff', fontWeight: '800', fontSize: 13 },

    // ── Mobile stats ──────────────────────────────────────────────────
    mStatsScroll: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    mStatCard:    { alignItems: 'center', borderRadius: 14, padding: 12, minWidth: 76, gap: 5 },
    mStatIconWrap:{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    mStatVal:     { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
    mStatLbl:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },

    // ── Mobile filter section ─────────────────────────────────────────
    mFilterToggle:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    mFilterLabel: { fontSize: 13.5, fontWeight: '700', color: c.heading },
    mFilterBadge: { backgroundColor: c.sidebar, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    mFilterBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
    mFilterPanel: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
    mFilterRow2:  { flexDirection: 'row', gap: 10 },
    mSearchBox:   { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, borderWidth: 1.5, borderColor: c.border },
    mSearchInput: { flex: 1, fontSize: 14, color: c.heading, fontWeight: '500', paddingVertical: 0 },
    mApplyBtn:    { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: c.sidebar },
    mApplyBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    mResetBtn:    { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border },
    mResetBtnTxt: { color: c.text, fontWeight: '700', fontSize: 14 },

    // ── Bottom sheet (mobile dropdown) ────────────────────────────────
    bsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    bsSheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20 },
    bsHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center', marginTop: 10, marginBottom: 2 },
    bsTitle:    { fontSize: 14, fontWeight: '800', color: c.heading, textAlign: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border },
    bsItem:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border },
    bsItemActive:{ backgroundColor: c.primary + '08' },
    bsItemTxt:  { fontSize: 15, color: c.text, fontWeight: '500' },
    bsItemTxtA: { color: c.primary, fontWeight: '700' },
    bsBottom:   { height: 30 },
  });
}

function mkFd(c: ThemeColors) {
  return StyleSheet.create({
    lbl:          { fontSize: 10.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    btn:          { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: c.surface, minWidth: 130 },
    btnTxt:       { flex: 1, fontSize: 13, color: c.text },
    menu:         { position: 'absolute', top: 60, left: 0, minWidth: 160, zIndex: 999, backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 10, overflow: 'hidden' },
    item:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    itemActive:   { backgroundColor: c.surfaceAlt },
    itemTxt:      { flex: 1, fontSize: 13, color: c.text },
    itemTxtActive:{ fontWeight: '700', color: c.sidebar },
    // Mobile trigger
    mBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: c.surfaceAlt },
    mBtnTxt:      { flex: 1, fontSize: 13.5, color: c.text, fontWeight: '500' },
  });
}

function mkTr(c: ThemeColors) {
  return StyleSheet.create({
    header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.surfaceAlt, borderBottomWidth: 1, borderBottomColor: c.border },
    hCell:        { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    cell:         { fontSize: 13, color: c.text },
    cellNum:      { width: 70 },
    cellFrom:     { flex: 1.2 },
    cellAssignee: { flex: 1.2 },
    cellDate:     { flex: 1.2 },
    cellPriority: { flex: 1, alignItems: 'flex-start' as const },
    cellStatus:   { flex: 1.2, alignItems: 'flex-start' as const },
    cellActions:  { width: 80, alignItems: 'flex-end' as const },
    subject:      { fontSize: 13, fontWeight: '700', color: c.heading },
    catLabel:     { fontSize: 10, color: c.textMuted, marginTop: 1 },
    badge:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    badgeTxt:     { fontSize: 11, fontWeight: '600' },
    viewBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    viewTxt:      { fontSize: 11, fontWeight: '700', color: c.sidebar },
  });
}

// ── Mobile premium card styles ─────────────────────────────────────────────────
function mkMc(c: ThemeColors) {
  return StyleSheet.create({
    card:         { backgroundColor: c.surface, borderRadius: 16, marginHorizontal: 14, marginTop: 10, overflow: 'hidden', borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    cardSelected: { borderColor: c.primary, shadowOpacity: 0.12 },
    accentBar:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    inner:        { padding: 14, paddingLeft: 18 },
    row1:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
    ticketNum:    { fontSize: 11.5, fontWeight: '700', color: c.textMuted, letterSpacing: 0.2 },
    statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    statusPillTxt:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
    subject:      { fontSize: 15, fontWeight: '700', color: c.heading, lineHeight: 21, marginBottom: 5 },
    desc:         { fontSize: 13, color: c.textMuted, lineHeight: 19, marginBottom: 11 },
    metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
    priorityPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
    priorityDot:  { width: 6, height: 6, borderRadius: 3 },
    priorityTxt:  { fontSize: 11, fontWeight: '700' },
    catPill:      { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: c.surfaceAlt },
    catTxt:       { fontSize: 11, color: c.textMuted, fontWeight: '600' },
    replyRow:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
    replyTxt:     { fontSize: 11, color: c.textMuted },
    separator:    { flex: 1 },
    timeAgo:      { fontSize: 11.5, color: c.textMuted, fontWeight: '500' },
    chevron:      { position: 'absolute', right: 14, bottom: 14 },
  });
}

function mkRb(c: ThemeColors) {
  return StyleSheet.create({
    wrap:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
    wrapStaff:  { flexDirection: 'row' },
    wrapUser:   { flexDirection: 'row-reverse' },
    avatar:     { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
    avatarStaff:{ backgroundColor: c.sidebar },
    avatarUser: { backgroundColor: '#0D76E1' },
    bubble:     { flex: 1, borderRadius: 12, padding: 10, maxWidth: '85%' },
    bubbleStaff:{ backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderTopLeftRadius: 2 },
    bubbleUser: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderTopRightRadius: 2 },
    bubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    bubbleName: { fontSize: 11, fontWeight: '700', color: c.text },
    bubbleTime: { fontSize: 10, color: c.textMuted },
    bubbleMsg:  { fontSize: 13.5, color: c.heading, lineHeight: 20 },
  });
}

function mkDp(c: ThemeColors) {
  return StyleSheet.create({
    header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.sidebar },
    headerTitle: { fontSize: 14, fontWeight: '800', color: c.brand },
    headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
    headerBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

    metaCard:    { margin: 12, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, gap: 8 },
    metaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
    statusText:  { fontSize: 12, fontWeight: '700' },
    priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1, backgroundColor: c.surface },
    priorityText:  { fontSize: 12, fontWeight: '700' },
    categoryBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
    categoryText:  { fontSize: 12, color: c.text, fontWeight: '500' },
    dateRow:     { flexDirection: 'row', justifyContent: 'space-between' },
    dateLabel:   { fontSize: 12, color: c.textMuted },
    dateVal:     { fontSize: 12, color: c.text, fontWeight: '500' },

    section:        { marginHorizontal: 12, marginBottom: 12, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
    sectionTitle:   { fontSize: 11, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
    descText:       { fontSize: 14, color: c.text, lineHeight: 22 },

    statusBtnRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusActionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    statusActionText: { fontSize: 12.5, fontWeight: '700' },

    noReplies:     { alignItems: 'center', gap: 8, paddingVertical: 20 },
    noRepliesText: { fontSize: 13, color: c.textMuted, textAlign: 'center' },

    replyBox:  { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, alignItems: 'flex-end' },
    replyInput:{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.heading, borderWidth: 1, borderColor: c.border, maxHeight: 100 },
    sendBtn:   { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    closedBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: c.surfaceAlt, borderTopWidth: 1, borderTopColor: c.border },
    closedBannerText: { fontSize: 12.5, color: c.textMuted, flex: 1 },
  });
}

function mkEf(c: ThemeColors) {
  return StyleSheet.create({
    field:      { gap: 7 },
    label:      { fontSize: 13, fontWeight: '600', color: c.text },
    input:      { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.heading },
    textarea:   { height: 110, textAlignVertical: 'top', paddingTop: 12 },
    optRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border },
    optText:    { fontSize: 12.5, fontWeight: '600', color: c.text },
    saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 8 },
    saveBtnText:{ fontSize: 15, fontWeight: '800', color: c.brand },
  });
}

function mkCf(c: ThemeColors) {
  return StyleSheet.create({
    backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    panel:        { width: '100%', maxHeight: '90%', borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
    panelDesktop: { width: 580, maxWidth: 580 },

    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: c.sidebar },
    headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,165,42,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,165,42,0.25)' },
    headerTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
    headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
    closeBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

    footer:      { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    cancelBtn:   { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 11, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    cancelTxt:   { fontWeight: '700', color: c.text, fontSize: 14 },
    submitBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 11, backgroundColor: c.sidebar },
    submitTxt:   { fontWeight: '800', color: c.brand, fontSize: 14 },
  });
}

// ── Mobile Premium TicketCard ──────────────────────────────────────────────────
function TicketCard({
  ticket, selected, onPress,
}: { ticket: Ticket; selected: boolean; onPress: () => void }) {
  const { colors: c } = useTheme();
  const mc = useMemo(() => mkMc(c), [c]);

  const sc = STATUS_CFG[ticket.status] ?? STATUS_CFG.open;
  const pc = PRIORITY_CFG[ticket.priority as TicketPriority] ?? PRIORITY_CFG.medium;
  const catLabel = CATEGORIES.find(cat => cat.key === ticket.category)?.label;

  return (
    <Pressable
      style={({ pressed }) => [mc.card, selected && mc.cardSelected, pressed && { opacity: 0.92 }]}
      onPress={onPress}
    >
      {/* Left accent bar */}
      <View style={[mc.accentBar, { backgroundColor: sc.color }]} />

      <View style={mc.inner}>
        {/* Row 1: ticket # + status pill */}
        <View style={mc.row1}>
          <Text style={mc.ticketNum}>
            #{ticket.ticket_number ?? ticket.id}
          </Text>
          <View style={[mc.statusPill, { backgroundColor: sc.bg }]}>
            <Ionicons name={sc.icon} size={11} color={sc.color} />
            <Text style={[mc.statusPillTxt, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>

        {/* Subject */}
        <Text style={mc.subject} numberOfLines={2}>{ticket.subject}</Text>

        {/* Description */}
        <Text style={mc.desc} numberOfLines={2}>{ticket.description}</Text>

        {/* Meta row */}
        <View style={mc.metaRow}>
          {/* Priority pill */}
          <View style={[mc.priorityPill, { backgroundColor: pc.color + '14' }]}>
            <View style={[mc.priorityDot, { backgroundColor: pc.color }]} />
            <Text style={[mc.priorityTxt, { color: pc.color }]}>{pc.label}</Text>
          </View>

          {/* Category */}
          {!!catLabel && (
            <View style={mc.catPill}>
              <Text style={mc.catTxt}>{catLabel}</Text>
            </View>
          )}

          {/* Reply count */}
          {(ticket.replies_count ?? 0) > 0 && (
            <View style={mc.replyRow}>
              <Ionicons name="chatbubble-outline" size={11} color={c.textMuted} />
              <Text style={mc.replyTxt}>{ticket.replies_count}</Text>
            </View>
          )}

          <View style={mc.separator} />

          {/* Time ago */}
          <Text style={mc.timeAgo}>{fmtAgo(ticket.created_at)}</Text>
        </View>
      </View>

      {/* Chevron hint */}
      <View style={mc.chevron}>
        <Ionicons name="chevron-forward" size={14} color={c.border} />
      </View>
    </Pressable>
  );
}

// ── Reply bubble ───────────────────────────────────────────────────────────────
function ReplyBubble({ reply }: { reply: TicketReply }) {
  const { colors: c } = useTheme();
  const rb = useMemo(() => mkRb(c), [c]);

  const isStaff = !!reply.is_staff;
  return (
    <View style={[rb.wrap, isStaff ? rb.wrapStaff : rb.wrapUser]}>
      <View style={[rb.avatar, isStaff ? rb.avatarStaff : rb.avatarUser]}>
        <Ionicons name={isStaff ? 'headset-outline' : 'person-outline'} size={14} color="#fff" />
      </View>
      <View style={[rb.bubble, isStaff ? rb.bubbleStaff : rb.bubbleUser]}>
        <View style={rb.bubbleHeader}>
          <Text style={rb.bubbleName}>{reply.user_name ?? (isStaff ? 'Support' : 'You')}</Text>
          <Text style={rb.bubbleTime}>{fmtAgo(reply.created_at)}</Text>
        </View>
        <Text style={rb.bubbleMsg}>{reply.message}</Text>
      </View>
    </View>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────────
function TicketDetail({
  ticket, onClose, onUpdated, onDeleted,
}: {
  ticket: Ticket; onClose?: () => void;
  onUpdated: (t: Ticket) => void; onDeleted: (id: number) => void;
}) {
  const t = useThemedScreen();
  const c = t.colors;
  const dp = useMemo(() => mkDp(c), [c]);
  const ef = useMemo(() => mkEf(c), [c]);

  const { user } = useAppStore();
  const [detail, setDetail]     = useState<Ticket>(ticket);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({
    subject:     ticket.subject,
    description: ticket.description,
    priority:    ticket.priority,
    category:    ticket.category ?? 'general',
  });
  const [editSaving, setEditSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ticketsApi.show(ticket.id);
      const data: Ticket = res.data?.data ?? res.data;
      setDetail(data);
      onUpdated(data);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, [ticket.id]);

  useEffect(() => { reload(); }, [ticket.id]);

  async function sendReply() {
    const msg = replyText.trim();
    if (!msg) return;
    setSending(true);
    try {
      await ticketsApi.reply(ticket.id, msg);
      setReplyText('');
      await reload();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not send reply.');
    } finally { setSending(false); }
  }

  async function changeStatus(status: TicketStatus) {
    try {
      await ticketsApi.updateStatus(ticket.id, status);
      await reload();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not update status.');
    }
  }

  async function saveEdit() {
    if (detail.status === 'closed') {
      Alert.alert('Ticket Closed', 'This ticket has been closed and can no longer be updated.');
      setEditing(false); return;
    }
    if (!editForm.subject.trim())     { Alert.alert('Subject required'); return; }
    if (!editForm.description.trim()) { Alert.alert('Description required'); return; }
    setEditSaving(true);
    try {
      await ticketsApi.update(ticket.id, editForm);
      setEditing(false);
      await reload();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not update ticket.');
    } finally { setEditSaving(false); }
  }

  function confirmDelete() {
    const doDelete = async () => {
      try {
        await ticketsApi.delete(ticket.id);
        onDeleted(ticket.id);
        onClose?.();
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.message ?? 'Could not delete ticket.');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this ticket? This action cannot be undone.')) doDelete();
    } else {
      Alert.alert('Delete Ticket', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  const sc = STATUS_CFG[detail.status] ?? STATUS_CFG.open;
  const pc = PRIORITY_CFG[detail.priority as TicketPriority] ?? PRIORITY_CFG.medium;
  const nextStatuses = NEXT_STATUSES[detail.status] ?? [];

  if (editing) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[dp.header, t.chrome]}>
          <View style={{ flex: 1 }}>
            <Text style={dp.headerTitle}>Edit Ticket</Text>
            {detail.ticket_number && <Text style={dp.headerSub}>#{detail.ticket_number}</Text>}
          </View>
          <Pressable style={({ pressed }) => [dp.headerBtn, pressed && { opacity: 0.7 }]} onPress={() => setEditing(false)}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1, backgroundColor: c.surfaceAlt }} contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={ef.field}>
            <Text style={ef.label}>Subject *</Text>
            <TextInput style={ef.input} value={editForm.subject}
              onChangeText={v => setEditForm(p => ({ ...p, subject: v }))}
              placeholder="Brief summary of the issue" placeholderTextColor={c.textMuted} />
          </View>
          <View style={ef.field}>
            <Text style={ef.label}>Description *</Text>
            <TextInput style={[ef.input, ef.textarea]} value={editForm.description}
              onChangeText={v => setEditForm(p => ({ ...p, description: v }))}
              placeholder="Describe the issue in detail..." placeholderTextColor={c.textMuted}
              multiline textAlignVertical="top" />
          </View>
          <View style={ef.field}>
            <Text style={ef.label}>Priority</Text>
            <View style={ef.optRow}>
              {(Object.keys(PRIORITY_CFG) as TicketPriority[]).map(p => (
                <Pressable key={p}
                  style={({ pressed }) => [ef.optBtn, editForm.priority === p && { backgroundColor: PRIORITY_CFG[p].color, borderColor: PRIORITY_CFG[p].color }, pressed && { opacity: 0.8 }]}
                  onPress={() => setEditForm(prev => ({ ...prev, priority: p }))}>
                  <Text style={[ef.optText, editForm.priority === p && { color: '#fff' }]}>{PRIORITY_CFG[p].label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={ef.field}>
            <Text style={ef.label}>Category</Text>
            <View style={ef.optRow}>
              {CATEGORIES.map(cat => (
                <Pressable key={cat.key}
                  style={({ pressed }) => [ef.optBtn, editForm.category === cat.key && { backgroundColor: c.sidebar, borderColor: c.sidebar }, pressed && { opacity: 0.8 }]}
                  onPress={() => setEditForm(prev => ({ ...prev, category: cat.key }))}>
                  <Text style={[ef.optText, editForm.category === cat.key && { color: c.brand }]}>{cat.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [ef.saveBtn, t.chromeBtn, editSaving && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
            onPress={saveEdit} disabled={editSaving}>
            {editSaving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={ef.saveBtnText}>Save Changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[dp.header, t.chrome]}>
        <View style={{ flex: 1 }}>
          <Text style={dp.headerTitle} numberOfLines={1}>{detail.subject}</Text>
          {detail.ticket_number && <Text style={dp.headerSub}>#{detail.ticket_number}</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {detail.status !== 'closed' && (
            <Pressable style={({ pressed }) => [dp.headerBtn, pressed && { opacity: 0.7 }]} onPress={() => setEditing(true)}>
              <Ionicons name="create-outline" size={18} color="#fff" />
            </Pressable>
          )}
          <Pressable style={({ pressed }) => [dp.headerBtn, { backgroundColor: 'rgba(220,38,38,0.25)' }, pressed && { opacity: 0.7 }]} onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={18} color="#fca5a5" />
          </Pressable>
          {onClose && (
            <Pressable style={({ pressed }) => [dp.headerBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: c.surfaceAlt }}
        contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {loading && <View style={{ paddingTop: 10, alignItems: 'center' }}><ActivityIndicator size="small" color={c.brand} /></View>}

        <View style={dp.metaCard}>
          <View style={dp.metaRow}>
            <View style={[dp.statusBadge, { backgroundColor: sc.bg, borderColor: sc.color + '40' }]}>
              <Ionicons name={sc.icon} size={13} color={sc.color} />
              <Text style={[dp.statusText, { color: sc.color }]}>{sc.label}</Text>
            </View>
            <View style={[dp.priorityBadge, { borderColor: pc.color + '40' }]}>
              <Ionicons name={pc.icon} size={12} color={pc.color} />
              <Text style={[dp.priorityText, { color: pc.color }]}>{pc.label}</Text>
            </View>
            {detail.category && (
              <View style={dp.categoryBadge}>
                <Text style={dp.categoryText}>{CATEGORIES.find(cat => cat.key === detail.category)?.label ?? detail.category}</Text>
              </View>
            )}
          </View>
          <View style={dp.dateRow}><Text style={dp.dateLabel}>Opened</Text><Text style={dp.dateVal}>{fmtDate(detail.created_at)}</Text></View>
          {detail.updated_at && detail.updated_at !== detail.created_at && (
            <View style={dp.dateRow}><Text style={dp.dateLabel}>Updated</Text><Text style={dp.dateVal}>{fmtDate(detail.updated_at)}</Text></View>
          )}
          {detail.assignee_name && <View style={dp.dateRow}><Text style={dp.dateLabel}>Assigned to</Text><Text style={dp.dateVal}>{detail.assignee_name}</Text></View>}
          {detail.reporter_name && <View style={dp.dateRow}><Text style={dp.dateLabel}>Reported by</Text><Text style={dp.dateVal}>{detail.reporter_name}</Text></View>}
        </View>

        <View style={dp.section}>
          <Text style={dp.sectionTitle}>Description</Text>
          <Text style={dp.descText}>{detail.description}</Text>
        </View>

        {nextStatuses.length > 0 && (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>Update Status</Text>
            <View style={dp.statusBtnRow}>
              {nextStatuses.map(s => {
                const cfg = STATUS_CFG[s];
                return (
                  <Pressable key={s}
                    style={({ pressed }) => [dp.statusActionBtn, { borderColor: cfg.color, backgroundColor: cfg.bg }, pressed && { opacity: 0.8 }]}
                    onPress={() => changeStatus(s)}>
                    <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                    <Text style={[dp.statusActionText, { color: cfg.color }]}>Mark {cfg.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={dp.section}>
          <Text style={dp.sectionTitle}>
            Replies {(detail.replies?.length ?? 0) > 0 ? `(${detail.replies!.length})` : ''}
          </Text>
          {!detail.replies || detail.replies.length === 0 ? (
            <View style={dp.noReplies}>
              <Ionicons name="chatbubbles-outline" size={28} color={c.border} />
              <Text style={dp.noRepliesText}>No replies yet. Be the first to reply.</Text>
            </View>
          ) : (
            detail.replies.map(r => <ReplyBubble key={r.id} reply={r} />)
          )}
        </View>
      </ScrollView>

      {detail.status !== 'closed' ? (
        <View style={dp.replyBox}>
          <TextInput style={dp.replyInput} placeholder="Write a reply..." value={replyText}
            onChangeText={setReplyText} placeholderTextColor={c.textMuted} multiline maxLength={2000} />
          <Pressable
            style={({ pressed }) => [dp.sendBtn, t.chromeBtn, (!replyText.trim() || sending) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
            onPress={sendReply} disabled={!replyText.trim() || sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      ) : (
        <View style={dp.closedBanner}>
          <Ionicons name="lock-closed-outline" size={14} color={c.textMuted} />
          <Text style={dp.closedBannerText}>This ticket is closed. Reopen it to add replies.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Create ticket modal ────────────────────────────────────────────────────────
function CreateTicketModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: (t: Ticket) => void;
}) {
  const t = useThemedScreen();
  const c = t.colors;
  const cf = useMemo(() => mkCf(c), [c]);
  const ef = useMemo(() => mkEf(c), [c]);

  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium', category: 'general' });
  const [saving, setSaving] = useState(false);

  function resetForm() { setForm({ subject: '', description: '', priority: 'medium', category: 'general' }); }

  async function submit() {
    if (!form.subject.trim())     { Alert.alert('Subject is required'); return; }
    if (!form.description.trim()) { Alert.alert('Description is required'); return; }
    setSaving(true);
    try {
      const res = await ticketsApi.create(form);
      const created: Ticket = res.data?.data ?? res.data;
      onCreated(created);
      resetForm();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not create ticket.');
    } finally { setSaving(false); }
  }

  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;
  const isMobileOS = Platform.OS !== 'web';

  // Shared form body
  const formBody = (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={ef.field}>
        <Text style={ef.label}>Subject <Text style={{ color: '#ef4444' }}>*</Text></Text>
        <TextInput style={ef.input} value={form.subject}
          onChangeText={v => setForm(p => ({ ...p, subject: v }))}
          placeholder="Brief summary of your issue" placeholderTextColor={c.textMuted} />
      </View>
      <View style={ef.field}>
        <Text style={ef.label}>Description <Text style={{ color: '#ef4444' }}>*</Text></Text>
        <TextInput style={[ef.input, ef.textarea]} value={form.description}
          onChangeText={v => setForm(p => ({ ...p, description: v }))}
          placeholder="Describe the issue in detail..." placeholderTextColor={c.textMuted}
          multiline textAlignVertical="top" />
      </View>
      <View style={ef.field}>
        <Text style={ef.label}>Priority</Text>
        <View style={ef.optRow}>
          {(Object.keys(PRIORITY_CFG) as TicketPriority[]).map(p => (
            <Pressable key={p}
              style={({ pressed }) => [ef.optBtn, form.priority === p && { backgroundColor: PRIORITY_CFG[p].color, borderColor: PRIORITY_CFG[p].color }, pressed && { opacity: 0.8 }]}
              onPress={() => setForm(prev => ({ ...prev, priority: p }))}>
              <Ionicons name={PRIORITY_CFG[p].icon} size={12} color={form.priority === p ? '#fff' : PRIORITY_CFG[p].color} />
              <Text style={[ef.optText, form.priority === p && { color: '#fff' }]}>{PRIORITY_CFG[p].label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={ef.field}>
        <Text style={ef.label}>Category</Text>
        <View style={ef.optRow}>
          {CATEGORIES.map(cat => (
            <Pressable key={cat.key}
              style={({ pressed }) => [ef.optBtn, form.category === cat.key && { backgroundColor: c.sidebar, borderColor: c.sidebar }, pressed && { opacity: 0.8 }]}
              onPress={() => setForm(prev => ({ ...prev, category: cat.key }))}>
              <Text style={[ef.optText, form.category === cat.key && { color: c.brand }]}>{cat.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const formHeader = (
    <View style={cf.header}>
      <View style={cf.headerLeft}>
        <View style={cf.headerIcon}>
          <Ionicons name="headset-outline" size={16} color={c.brand} />
        </View>
        <View>
          <Text style={cf.headerTitle}>New Support Ticket</Text>
          <Text style={cf.headerSub}>Submit an issue to our support team</Text>
        </View>
      </View>
      <Pressable onPress={onClose} style={({ pressed }) => [cf.closeBtn, pressed && { opacity: 0.7 }]}>
        <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
      </Pressable>
    </View>
  );

  const formFooter = (
    <View style={cf.footer}>
      <Pressable style={({ pressed }) => [cf.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
        <Text style={cf.cancelTxt}>Cancel</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [cf.submitBtn, saving && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
        onPress={submit} disabled={saving}>
        {saving
          ? <ActivityIndicator color={c.brand} size="small" />
          : <><Ionicons name="add-circle-outline" size={17} color={c.brand} /><Text style={cf.submitTxt}>Submit Ticket</Text></>}
      </Pressable>
    </View>
  );

  // Mobile: full-screen slide modal (fixes ScrollView collapse bug on Android)
  if (isMobileOS) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surface }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {formHeader}
          {formBody}
          {formFooter}
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // Web: centered overlay (unchanged)
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={cf.backdrop} onPress={onClose}>
          <Pressable style={[cf.panel, isDesktop && cf.panelDesktop]} onPress={() => {}}>
            {formHeader}
            {formBody}
            <View style={cf.footer}>
              <Pressable style={({ pressed }) => [cf.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
                <Text style={cf.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [cf.submitBtn, saving && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
                onPress={submit} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={c.brand} size="small" />
                  : <><Ionicons name="add-circle-outline" size={17} color={c.brand} /><Text style={cf.submitTxt}>Submit Ticket</Text></>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Tab options ────────────────────────────────────────────────────────────────
const TAB_OPTIONS = [
  { key: 'all',        label: 'All visible tickets' },
  { key: 'mine',       label: 'My Tickets'          },
  { key: 'unassigned', label: 'Unassigned'          },
];

// ── Desktop FilterDropdown ─────────────────────────────────────────────────────
function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string;
  options: { key: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const { colors: c } = useTheme();
  const fd = useMemo(() => mkFd(c), [c]);
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.key === value);
  return (
    <View style={{ gap: 3, position: 'relative', zIndex: 200 }}>
      <Text style={fd.lbl}>{label}</Text>
      <Pressable style={fd.btn} onPress={e => { e.stopPropagation?.(); setOpen(p => !p); }}>
        <Text style={fd.btnTxt} numberOfLines={1}>{selected?.label ?? 'Any'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={c.textMuted} />
      </Pressable>
      {open && (
        <View style={fd.menu}>
          {options.map(o => (
            <Pressable key={o.key} style={[fd.item, value === o.key && fd.itemActive]}
              onPress={() => { onChange(o.key); setOpen(false); }}>
              <Text style={[fd.itemTxt, value === o.key && fd.itemTxtActive]}>{o.label}</Text>
              {value === o.key && <Ionicons name="checkmark" size={12} color={c.sidebar} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Mobile BottomSheet Picker ──────────────────────────────────────────────────
function MobileDropdown({ label, value, options, onChange, sc }: {
  label: string; value: string;
  options: { key: string; label: string }[];
  onChange: (v: string) => void;
  sc: ReturnType<typeof mkSc>;
}) {
  const { colors: c } = useTheme();
  const fd = useMemo(() => mkFd(c), [c]);
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.key === value);
  return (
    <>
      <Pressable style={fd.mBtn} onPress={() => setOpen(true)}>
        <Text style={fd.mBtnTxt} numberOfLines={1}>{selected?.label ?? 'Any'}</Text>
        <Ionicons name="chevron-down" size={14} color={c.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={sc.bsBackdrop} onPress={() => setOpen(false)} />
        <View style={sc.bsSheet}>
          <View style={sc.bsHandle} />
          <Text style={sc.bsTitle}>{label}</Text>
          <ScrollView bounces={false}>
            {options.map(o => (
              <Pressable key={o.key}
                style={[sc.bsItem, o.key === value && sc.bsItemActive]}
                onPress={() => { onChange(o.key); setOpen(false); }}>
                <Text style={[sc.bsItemTxt, o.key === value && sc.bsItemTxtA]}>{o.label}</Text>
                {o.key === value && <Ionicons name="checkmark-circle" size={18} color={c.primary ?? '#2563eb'} />}
              </Pressable>
            ))}
          </ScrollView>
          <View style={sc.bsBottom} />
        </View>
      </Modal>
    </>
  );
}

// ── Table row (desktop) ────────────────────────────────────────────────────────
function TableRow({ ticket, onView }: { ticket: Ticket; onView: () => void }) {
  const { colors: c } = useTheme();
  const tr = useMemo(() => mkTr(c), [c]);
  const sc2 = STATUS_CFG[ticket.status] ?? STATUS_CFG.open;
  const pc  = PRIORITY_CFG[ticket.priority as TicketPriority] ?? PRIORITY_CFG.medium;
  return (
    <View style={tr.row}>
      <Text style={[tr.cell, { width: 70 }]}>#{ticket.ticket_number ?? ticket.id}</Text>
      <View style={{ flex: 2.5, justifyContent: 'center' }}>
        <Text style={tr.subject} numberOfLines={1}>{ticket.subject}</Text>
        {ticket.category ? <Text style={tr.catLabel}>{CATEGORIES.find(cat => cat.key === ticket.category)?.label ?? ticket.category}</Text> : null}
      </View>
      <Text style={[tr.cell, { flex: 1.2 }]} numberOfLines={1}>{ticket.reporter_name ?? '—'}</Text>
      <View style={tr.cellPriority}>
        <View style={[tr.badge, { backgroundColor: pc.color + '15', borderColor: pc.color + '40' }]}>
          <Ionicons name={pc.icon} size={10} color={pc.color} />
          <Text style={[tr.badgeTxt, { color: pc.color }]}>{pc.label}</Text>
        </View>
      </View>
      <View style={tr.cellStatus}>
        <View style={[tr.badge, { backgroundColor: sc2.bg, borderColor: sc2.color + '40' }]}>
          <Ionicons name={sc2.icon} size={10} color={sc2.color} />
          <Text style={[tr.badgeTxt, { color: sc2.color }]}>{sc2.label}</Text>
        </View>
      </View>
      <Text style={[tr.cell, { flex: 1.2 }]} numberOfLines={1}>{ticket.assignee_name ?? '—'}</Text>
      <Text style={[tr.cell, { flex: 1.2 }]}>{ticket.created_at ? format(new Date(ticket.created_at), 'dd MMM yyyy') : '—'}</Text>
      <View style={tr.cellActions}>
        <Pressable style={({ pressed }) => [tr.viewBtn, pressed && { opacity: 0.7 }]} onPress={onView}>
          <Ionicons name="eye-outline" size={13} color={c.sidebar} />
          <Text style={tr.viewTxt}>View</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function TicketsScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;
  const isMobile  = !isDesktop && Platform.OS !== 'web';
  const insets    = useSafeAreaInsets();

  const { colors: c } = useTheme();
  const sc = useMemo(() => mkSc(c), [c]);
  const tr = useMemo(() => mkTr(c), [c]);

  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected]     = useState<Ticket | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [tabFilter,      setTabFilter]      = useState('all');
  const [statusFilter,   setStatusFilter]   = useState('any');
  const [priorityFilter, setPriorityFilter] = useState('any');
  const [search,         setSearch]         = useState('');
  const [appliedTab,      setAppliedTab]      = useState('all');
  const [appliedStatus,   setAppliedStatus]   = useState('any');
  const [appliedPriority, setAppliedPriority] = useState('any');
  const [appliedSearch,   setAppliedSearch]   = useState('');

  const load = useCallback(async () => {
    try {
      const res = await ticketsApi.list({ per_page: 100 });
      const data = res.data?.data ?? res.data ?? [];
      setTickets(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  useFocusEffect(useCallback(() => {
    load();
    ticketsApi.notificationsMarkRead()
      .then(() => useTicketBadgeStore.getState().setUnreadCount(0))
      .catch(() => {});
  }, [load]));

  function applyFilter() {
    setAppliedTab(tabFilter);
    setAppliedStatus(statusFilter);
    setAppliedPriority(priorityFilter);
    setAppliedSearch(search);
    if (isMobile) setShowFilters(false);
  }

  function resetFilter() {
    setTabFilter('all'); setStatusFilter('any'); setPriorityFilter('any'); setSearch('');
    setAppliedTab('all'); setAppliedStatus('any'); setAppliedPriority('any'); setAppliedSearch('');
  }

  const filtered = tickets.filter(tk => {
    if (appliedStatus !== 'any'   && tk.status   !== appliedStatus)   return false;
    if (appliedPriority !== 'any' && tk.priority  !== appliedPriority) return false;
    const q = appliedSearch.trim().toLowerCase();
    if (q && !tk.subject.toLowerCase().includes(q) && !tk.description.toLowerCase().includes(q)
          && !(tk.ticket_number ?? '').toLowerCase().includes(q))      return false;
    return true;
  });

  const countFor = (s: string) =>
    s === 'all' ? tickets.length : tickets.filter(tk => tk.status === s).length;

  const activeFilterCount = [appliedStatus !== 'any', appliedPriority !== 'any', !!appliedSearch.trim()].filter(Boolean).length;

  function handleSelect(tk: Ticket) { setSelected(tk); if (!isDesktop) setShowDetail(true); }
  function handleUpdated(updated: Ticket) {
    setSelected(updated);
    setTickets(prev => prev.map(tk => tk.id === updated.id ? { ...tk, ...updated } : tk));
  }
  function handleDeleted(id: number) {
    setTickets(prev => prev.filter(tk => tk.id !== id));
    setSelected(null); setShowDetail(false);
  }
  function handleCreated(tk: Ticket) {
    setTickets(prev => [tk, ...prev]);
    setSelected(tk);
    if (!isDesktop) setShowDetail(true);
  }

  const statusOptions   = [{ key: 'any', label: 'Any' }, { key: 'open', label: 'Open' }, { key: 'in_progress', label: 'In Progress' }, { key: 'resolved', label: 'Resolved' }, { key: 'closed', label: 'Closed' }];
  const priorityOptions = [{ key: 'any', label: 'Any' }, { key: 'low', label: 'Low' }, { key: 'medium', label: 'Medium' }, { key: 'high', label: 'High' }, { key: 'urgent', label: 'Urgent' }];

  const STAT_ITEMS = [
    { key: 'all',         label: 'Total',       color: '#2563eb', bg: '#eff6ff', icon: 'ticket-outline'           as const },
    { key: 'open',        label: 'Open',        color: '#2563eb', bg: '#eff6ff', icon: 'radio-button-on-outline'  as const },
    { key: 'in_progress', label: 'In Progress', color: '#d97706', bg: '#fef9ec', icon: 'sync-outline'             as const },
    { key: 'resolved',    label: 'Resolved',    color: '#16a34a', bg: '#f0fdf4', icon: 'checkmark-circle-outline' as const },
    { key: 'closed',      label: 'Closed',      color: '#6b7280', bg: '#f3f4f6', icon: 'lock-closed-outline'      as const },
  ];

  const tableHeader = (
    <View style={tr.header}>
      <Text style={[tr.hCell, tr.cellNum]}>#</Text>
      <Text style={[tr.hCell, { flex: 2.5 }]}>Subject</Text>
      <Text style={[tr.hCell, tr.cellFrom]}>From</Text>
      <Text style={[tr.hCell, { flex: 1 }]}>Priority</Text>
      <Text style={[tr.hCell, { flex: 1.2 }]}>Status</Text>
      <Text style={[tr.hCell, tr.cellAssignee]}>Assignee</Text>
      <Text style={[tr.hCell, tr.cellDate]}>Created</Text>
      <Text style={[tr.hCell, { width: 80 }]}>Actions</Text>
    </View>
  );

  // ─── Mobile Layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>

        {/* ── Mobile Header ── */}
        <View style={[sc.mHeader, { paddingTop: insets.top + 14 }]}>
          <View style={sc.mHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={sc.mHeaderTitle}>Support Tickets</Text>
              <Text style={sc.mHeaderSub}>Raise issues to the platform admin team</Text>
            </View>
            <Pressable style={({ pressed }) => [sc.mNewBtn, pressed && { opacity: 0.85 }]} onPress={() => setShowCreate(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={sc.mNewBtnTxt}>New</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Stats — horizontal scroll ── */}
        <View style={sc.mStatsScroll}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
            {STAT_ITEMS.map(s => (
              <View key={s.key} style={[sc.mStatCard, { backgroundColor: s.bg, borderWidth: 1, borderColor: s.color + '20' }]}>
                <View style={[sc.mStatIconWrap, { backgroundColor: '#fff' }]}>
                  <Ionicons name={s.icon} size={20} color={s.color} />
                </View>
                <Text style={[sc.mStatVal, { color: s.color }]}>{countFor(s.key)}</Text>
                <Text style={[sc.mStatLbl, { color: s.color }]}>{s.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Filter toggle row ── */}
        <Pressable style={sc.mFilterToggle} onPress={() => setShowFilters(p => !p)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="options-outline" size={18} color={c.text} />
            <Text style={sc.mFilterLabel}>Filters</Text>
            {activeFilterCount > 0 && (
              <View style={sc.mFilterBadge}>
                <Text style={sc.mFilterBadgeTxt}>{activeFilterCount}</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {activeFilterCount > 0 && (
              <Pressable onPress={resetFilter} hitSlop={8}>
                <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>Reset</Text>
              </Pressable>
            )}
            <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={16} color={c.textMuted} />
          </View>
        </Pressable>

        {/* ── Filter panel ── */}
        {showFilters && (
          <View style={sc.mFilterPanel}>
            {/* Search */}
            <View style={sc.mSearchBox}>
              <Ionicons name="search-outline" size={17} color={c.textMuted} />
              <TextInput style={sc.mSearchInput} value={search} onChangeText={setSearch}
                placeholder="Search subject or description..." placeholderTextColor={c.textMuted}
                returnKeyType="search" autoCorrect={false} autoCapitalize="none"
                onSubmitEditing={applyFilter} clearButtonMode="while-editing" />
              {!!search && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={c.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Status + Priority dropdowns side by side */}
            <View style={sc.mFilterRow2}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Status</Text>
                <MobileDropdown label="Filter by Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} sc={sc} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Priority</Text>
                <MobileDropdown label="Filter by Priority" value={priorityFilter} options={priorityOptions} onChange={setPriorityFilter} sc={sc} />
              </View>
            </View>

            {/* Apply + Reset */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={({ pressed }) => [sc.mResetBtn, pressed && { opacity: 0.8 }]} onPress={resetFilter}>
                <Text style={sc.mResetBtnTxt}>Reset</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [sc.mApplyBtn, { flex: 1 }, pressed && { opacity: 0.85 }]} onPress={applyFilter}>
                <Text style={[sc.mApplyBtnTxt, { textAlign: 'center' }]}>Apply Filters</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Ticket list ── */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <ActivityIndicator size="large" color={c.sidebar} />
            <Text style={{ color: c.textMuted, fontSize: 14, fontWeight: '500' }}>Loading tickets...</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={tk => String(tk.id)}
            renderItem={({ item: tk }) => (
              <TicketCard ticket={tk} selected={selected?.id === tk.id} onPress={() => handleSelect(tk)} />
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.sidebar} />}
            contentContainerStyle={{ paddingBottom: 40, paddingTop: 6, flexGrow: 1 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 80, gap: 16 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: c.border }}>
                  <Ionicons name="headset-outline" size={34} color={c.textMuted} />
                </View>
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.heading }}>No tickets found</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 }}>
                    {activeFilterCount > 0 ? 'Try adjusting your filters.' : 'Raise a new ticket to get support from our team.'}
                  </Text>
                </View>
                {activeFilterCount === 0 && (
                  <Pressable style={({ pressed }) => [sc.mNewBtn, pressed && { opacity: 0.85 }]} onPress={() => setShowCreate(true)}>
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={sc.mNewBtnTxt}>New Ticket</Text>
                  </Pressable>
                )}
              </View>
            }
          />
        )}

        {/* Create modal */}
        <CreateTicketModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={handleCreated} />

        {/* Detail modal */}
        <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet"
          onRequestClose={() => setShowDetail(false)}>
          <View style={{ flex: 1, backgroundColor: c.surfaceAlt }}>
            {selected && (
              <TicketDetail key={selected.id} ticket={selected}
                onClose={() => setShowDetail(false)}
                onUpdated={handleUpdated} onDeleted={handleDeleted} />
            )}
          </View>
        </Modal>
      </View>
    );
  }

  // ─── Desktop / Web Layout (unchanged) ──────────────────────────────────────
  return (
    <Pressable style={{ flex: 1, backgroundColor: c.background }} onPress={() => {}}>
      <View style={sc.header}>
        <View>
          <Text style={sc.headerTitle}>Support Tickets</Text>
          <Text style={sc.headerSub}>Raise issues to the platform admin team and track their status.</Text>
        </View>
        <Pressable style={({ pressed }) => [sc.newBtn, pressed && { opacity: 0.85 }]} onPress={() => setShowCreate(true)}>
          <Ionicons name="add-circle-outline" size={15} color="#fff" />
          <Text style={sc.newBtnTxt}>New Ticket</Text>
        </Pressable>
      </View>

      <View style={sc.statsRow}>
        {STAT_ITEMS.map(s => (
          <View key={s.key} style={[sc.statCard, s.key !== 'all' && { borderLeftWidth: 1, borderLeftColor: c.border }]}>
            <View style={[sc.statIconWrap, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon} size={18} color={s.color} />
            </View>
            <Text style={sc.statLbl}>{s.label}</Text>
            <Text style={[sc.statVal, { color: s.color }]}>{countFor(s.key)}</Text>
          </View>
        ))}
      </View>

      <View style={sc.filterBar}>
        <FilterDropdown label="Tab"      value={tabFilter}      options={TAB_OPTIONS}      onChange={setTabFilter} />
        <FilterDropdown label="Status"   value={statusFilter}   options={statusOptions}    onChange={setStatusFilter} />
        <FilterDropdown label="Priority" value={priorityFilter} options={priorityOptions}  onChange={setPriorityFilter} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Search</Text>
          <TextInput style={sc.searchInput} value={search} onChangeText={setSearch}
            placeholder="Subject or description..." placeholderTextColor={c.textMuted}
            onSubmitEditing={applyFilter} />
        </View>
        <Pressable style={({ pressed }) => [sc.applyBtn, pressed && { opacity: 0.85 }]} onPress={applyFilter}>
          <Text style={sc.applyBtnTxt}>Apply</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={c.sidebar} />
          <Text style={{ color: c.textMuted, fontSize: 14 }}>Loading tickets...</Text>
        </View>
      ) : (
        <View style={{ flex: 1, margin: 12, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
          {tableHeader}
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.sidebar} />}>
            {filtered.length === 0 ? (
              <View style={sc.empty}>
                <Text style={sc.emptyTxt}>No tickets match your filters.</Text>
              </View>
            ) : (
              filtered.map((tk, i) => (
                <View key={tk.id} style={i % 2 === 1 ? { backgroundColor: c.surfaceAlt } : {}}>
                  <TableRow ticket={tk} onView={() => handleSelect(tk)} />
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      <CreateTicketModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={handleCreated} />

      {selected && (
        <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
          <Pressable style={sc.modalBackdrop} onPress={() => setSelected(null)}>
            <Pressable style={sc.modalPanel} onPress={() => {}}>
              <TicketDetail key={selected.id} ticket={selected}
                onClose={() => setSelected(null)}
                onUpdated={handleUpdated} onDeleted={handleDeleted} />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Pressable>
  );
}
