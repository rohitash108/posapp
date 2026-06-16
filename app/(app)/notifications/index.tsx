/**
 * Notifications — orders (Zomato/Swiggy/QR) + support tickets.
 * Matches CSPos bell behaviour: polling, unread count, mark-all-read.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import client from '@/api/client';
import { ticketsApi } from '@/api/tickets';
import { useTheme } from '@/store/themeStore';
import { useTicketBadgeStore } from '@/store/ticketBadgeStore';

// ── Types ────────────────────────────────────────────────────────────────────

interface NotifOrder {
  id: number;
  order_number?: string;
  source?: string;
  customer_name?: string;
  total?: number;
  created_at?: string;
  _seen?: boolean;
}

interface NotifTicket {
  id: number;
  subject: string;
  priority: string;
  status: string;
  creator_name?: string;
  created_at?: string;
  _seen?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_CFG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  zomato: { label: 'Zomato', color: '#dc2626', bg: '#fff1f2', icon: 'bicycle'         },
  swiggy: { label: 'Swiggy', color: '#ea580c', bg: '#fff7ed', icon: 'bicycle'         },
  qr:     { label: 'QR',     color: '#7c3aed', bg: '#f5f3ff', icon: 'qr-code-outline' },
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#dc2626',
  high:   '#ea580c',
  medium: '#d97706',
  low:    '#16a34a',
};

function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ── Screen ───────────────────────────────────────────────────────────────────

type Tab = 'orders' | 'tickets';

export default function NotificationsScreen() {
  const [tab, setTab]               = useState<Tab>('orders');
  const [orders, setOrders]         = useState<NotifOrder[]>([]);
  const [tickets, setTickets]       = useState<NotifTicket[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();
  const { unreadCount: ticketUnread, setUnreadCount } = useTicketBadgeStore();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ordRes, tixRes] = await Promise.all([
        client.get('/orders/notifications/new').catch(() => ({ data: { count: 0, orders: [] } })),
        ticketsApi.notificationsUnread().catch(() => ({ data: { count: 0, tickets: [] } })),
      ]);
      setOrderCount(ordRes.data?.count ?? 0);
      setOrders((ordRes.data?.orders ?? []).map((o: NotifOrder) => ({ ...o, _seen: false })));
      setUnreadCount(tixRes.data?.count ?? 0);
      setTickets((tixRes.data?.tickets ?? []).map((t: NotifTicket) => ({ ...t, _seen: false })));
    } catch {
      setOrders([]); setTickets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setUnreadCount]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  async function markOrdersSeen() {
    try { await client.post('/orders/notifications/mark-seen'); } catch { /* ok */ }
    setOrders(prev => prev.map(o => ({ ...o, _seen: true })));
    setOrderCount(0);
  }

  async function markTicketsSeen() {
    try { await ticketsApi.notificationsMarkRead(); } catch { /* ok */ }
    setTickets(prev => prev.map(t => ({ ...t, _seen: true })));
    setUnreadCount(0);
  }

  const totalUnread = orderCount + ticketUnread;

  return (
    <View style={[s.shell, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.title, { color: colors.text }]}>Notifications</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>
            {totalUnread > 0 ? `${totalUnread} unread` : 'All caught up'}
          </Text>
        </View>
        {tab === 'orders' && orderCount > 0 && (
          <Pressable style={s.markAllBtn} onPress={markOrdersSeen}>
            <Text style={s.markAllTxt}>Mark all seen</Text>
          </Pressable>
        )}
        {tab === 'tickets' && ticketUnread > 0 && (
          <Pressable style={s.markAllBtn} onPress={markTicketsSeen}>
            <Text style={s.markAllTxt}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {/* Tabs */}
      <View style={[s.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(['orders', 'tickets'] as Tab[]).map(t => (
          <Pressable key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, { color: tab === t ? '#C9A52A' : colors.textMuted }]}>
              {t === 'orders' ? 'Orders' : 'Tickets'}
            </Text>
            {t === 'orders' && orderCount > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{orderCount}</Text></View>
            )}
            {t === 'tickets' && ticketUnread > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{ticketUnread}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
          />
        }>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color="#1A2B1A" /></View>
        ) : tab === 'orders' ? (
          orders.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="notifications-off-outline" size={40} color="#d1d5db" />
              <Text style={[s.emptyTxt, { color: colors.textMuted }]}>No new orders</Text>
              <Text style={[s.emptyHint, { color: colors.textMuted }]}>
                New Zomato, Swiggy and QR orders will appear here
              </Text>
            </View>
          ) : orders.map(o => {
            const src    = o.source ?? 'qr';
            const cfg    = SOURCE_CFG[src] ?? SOURCE_CFG.qr;
            const unseen = !o._seen;
            return (
              <Pressable
                key={o.id}
                style={[s.row, { backgroundColor: unseen ? colors.surface : colors.background, borderBottomColor: colors.border }]}
                onPress={markOrdersSeen}>
                <View style={[s.iconWrap, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.rowTitle, { color: colors.text, fontWeight: unseen ? '700' : '500' }]}>
                      New {cfg.label} Order #{o.order_number}
                    </Text>
                    <View style={[s.chip, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.chipTxt, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  {o.customer_name ? (
                    <Text style={[s.rowMsg, { color: colors.textMuted }]} numberOfLines={1}>
                      {o.customer_name}{o.total != null ? ` · ₹${Number(o.total).toFixed(2)}` : ''}
                    </Text>
                  ) : null}
                  <Text style={s.rowTime}>{fmtTime(o.created_at)}</Text>
                </View>
                {unseen && <View style={s.unreadDot} />}
              </Pressable>
            );
          })
        ) : (
          tickets.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="ticket-outline" size={40} color="#d1d5db" />
              <Text style={[s.emptyTxt, { color: colors.textMuted }]}>No new tickets</Text>
              <Text style={[s.emptyHint, { color: colors.textMuted }]}>
                New support tickets will appear here
              </Text>
            </View>
          ) : tickets.map(t => {
            const unseen = !t._seen;
            const pColor = PRIORITY_COLOR[t.priority] ?? '#6b7280';
            return (
              <Pressable
                key={t.id}
                style={[s.row, { backgroundColor: unseen ? colors.surface : colors.background, borderBottomColor: colors.border }]}
                onPress={markTicketsSeen}>
                <View style={[s.iconWrap, { backgroundColor: pColor + '18' }]}>
                  <Ionicons name="ticket-outline" size={18} color={pColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.rowTitle, { color: colors.text, fontWeight: unseen ? '700' : '500' }]} numberOfLines={1}>
                      {t.subject}
                    </Text>
                    <View style={[s.chip, { backgroundColor: pColor + '18' }]}>
                      <Text style={[s.chipTxt, { color: pColor }]}>{t.priority}</Text>
                    </View>
                  </View>
                  {t.creator_name ? (
                    <Text style={[s.rowMsg, { color: colors.textMuted }]} numberOfLines={1}>
                      From: {t.creator_name}
                    </Text>
                  ) : null}
                  <Text style={s.rowTime}>{fmtTime(t.created_at)}</Text>
                </View>
                {unseen && <View style={[s.unreadDot, { backgroundColor: pColor }]} />}
              </Pressable>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  shell:        { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title:        { fontSize: 22, fontWeight: '800' },
  sub:          { fontSize: 12.5, marginTop: 2 },
  markAllBtn:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#1A2B1A' },
  markAllTxt:   { color: '#C9A52A', fontSize: 12, fontWeight: '700' },
  tabBar:       { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#C9A52A' },
  tabTxt:       { fontSize: 13, fontWeight: '600' },
  tabBadge:     { backgroundColor: '#dc2626', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeTxt:  { color: '#fff', fontSize: 10, fontWeight: '700' },
  center:       { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyTxt:     { fontSize: 14, fontWeight: '600' },
  emptyHint:    { fontSize: 12, textAlign: 'center', paddingHorizontal: 32 },
  row:          { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  iconWrap:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle:     { fontSize: 14.5, flex: 1 },
  rowMsg:       { fontSize: 13, marginTop: 3, lineHeight: 18 },
  rowTime:      { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316', marginTop: 6 },
  chip:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  chipTxt:      { fontSize: 10, fontWeight: '700' },
});
