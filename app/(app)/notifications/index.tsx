/**
 * Notifications — shows new pending Zomato / Swiggy / QR orders since last seen.
 * Uses the existing /orders/notifications/new endpoint (GET) and
 * /orders/notifications/mark-seen (POST) to clear the unseen cursor.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import client from '@/api/client';
import { useTheme } from '@/store/themeStore';

const SOURCE_CFG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  zomato: { label: 'Zomato', color: '#dc2626', bg: '#fff1f2', icon: 'bicycle'              },
  swiggy: { label: 'Swiggy', color: '#ea580c', bg: '#fff7ed', icon: 'bicycle'              },
  qr:     { label: 'QR',     color: '#7c3aed', bg: '#f5f3ff', icon: 'qr-code-outline'      },
};

function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

interface NotifOrder {
  id: number;
  order_number?: string;
  order_type?: string;
  source?: string;
  source_label?: string;
  customer_name?: string;
  total?: number;
  created_at?: string;
  _seen?: boolean;
}

export default function NotificationsScreen() {
  const [items, setItems]       = useState<NotifOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [count, setCount]       = useState(0);
  const { colors } = useTheme();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await client.get('/orders/notifications/new');
      const orders: NotifOrder[] = res.data?.orders ?? [];
      setCount(res.data?.count ?? 0);
      setItems(orders.map(o => ({ ...o, _seen: false })));
    } catch {
      setItems([]);
      setCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  async function markAllSeen() {
    try {
      await client.post('/orders/notifications/mark-seen');
      setItems(prev => prev.map(o => ({ ...o, _seen: true })));
      setCount(0);
    } catch {
      setItems(prev => prev.map(o => ({ ...o, _seen: true })));
      setCount(0);
    }
  }

  const unreadCount = count;

  return (
    <View style={[s.shell, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.title, { color: colors.text }]}>Notifications</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>
            {unreadCount > 0 ? `${unreadCount} new order${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable style={s.markAllBtn} onPress={markAllSeen}>
            <Text style={s.markAllTxt}>Mark all seen</Text>
          </Pressable>
        )}
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
        ) : items.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="notifications-off-outline" size={40} color="#d1d5db" />
            <Text style={[s.emptyTxt, { color: colors.textMuted }]}>No new orders</Text>
            <Text style={[s.emptyHint, { color: colors.textMuted }]}>
              New Zomato, Swiggy and QR orders will appear here
            </Text>
          </View>
        ) : (
          items.map(o => {
            const src   = o.source ?? 'qr';
            const cfg   = SOURCE_CFG[src] ?? SOURCE_CFG.qr;
            const unseen = !o._seen;
            return (
              <Pressable
                key={o.id}
                style={[s.row, {
                  backgroundColor: unseen ? colors.surface : colors.background,
                  borderBottomColor: colors.border,
                }]}
                onPress={() => markAllSeen()}>
                <View style={[s.iconWrap, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.rowTitle, { color: colors.text, fontWeight: unseen ? '700' : '500' }]}>
                      New {cfg.label} Order #{o.order_number}
                    </Text>
                    <View style={[s.srcChip, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.srcTxt, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  {o.customer_name ? (
                    <Text style={[s.rowMsg, { color: colors.textMuted }]} numberOfLines={1}>
                      {o.customer_name}
                      {o.total != null ? ` · ₹${Number(o.total).toFixed(2)}` : ''}
                    </Text>
                  ) : null}
                  <Text style={s.rowTime}>{fmtTime(o.created_at)}</Text>
                </View>
                {unseen && <View style={s.unreadDot} />}
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
  shell:       { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title:       { fontSize: 22, fontWeight: '800' },
  sub:         { fontSize: 12.5, marginTop: 2 },
  markAllBtn:  { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#1A2B1A' },
  markAllTxt:  { color: '#C9A52A', fontSize: 12, fontWeight: '700' },
  center:      { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyTxt:    { fontSize: 14, fontWeight: '600' },
  emptyHint:   { fontSize: 12, textAlign: 'center', paddingHorizontal: 32 },
  row:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  iconWrap:    { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle:    { fontSize: 14.5 },
  rowMsg:      { fontSize: 13, marginTop: 3, lineHeight: 18 },
  rowTime:     { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316', marginTop: 6 },
  srcChip:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  srcTxt:      { fontSize: 10, fontWeight: '700' },
});
