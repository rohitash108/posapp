/**
 * Notifications — full inbox with mark-as-read support.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '@/api/client';
import { useTheme } from '@/store/themeStore';

interface Notification {
  id: number;
  title?: string;
  message?: string;
  type?: string;
  created_at?: string;
  read_at?: string | null;
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await client.get('/notifications', { params: { per_page: 50 } });
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: number) {
    try {
      await client.patch(`/notifications/${id}/read`);
      setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    } catch {
      // Optimistic local mark if endpoint unavailable
      setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    }
  }

  async function markAllRead() {
    const unread = items.filter(n => !n.read_at);
    await Promise.all(unread.map(n => markRead(n.id)));
  }

  const unreadCount = items.filter(n => !n.read_at).length;

  return (
    <View style={[s.shell, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.title, { color: colors.text }]}>Notifications</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable style={s.markAllBtn} onPress={markAllRead}>
            <Text style={s.markAllTxt}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color="#1A2B1A" /></View>
        ) : items.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="notifications-off-outline" size={40} color="#d1d5db" />
            <Text style={[s.emptyTxt, { color: colors.textMuted }]}>No notifications yet</Text>
          </View>
        ) : (
          items.map(n => {
            const unread = !n.read_at;
            return (
              <Pressable
                key={n.id}
                style={[s.row, { backgroundColor: unread ? colors.surface : colors.background, borderBottomColor: colors.border }]}
                onPress={() => unread && markRead(n.id)}>
                <View style={[s.iconWrap, { backgroundColor: unread ? '#fef3c7' : '#f1f5f9' }]}>
                  <Ionicons
                    name={unread ? 'notifications' : 'notifications-outline'}
                    size={18}
                    color={unread ? '#d97706' : '#9ca3af'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: colors.text, fontWeight: unread ? '700' : '500' }]}>
                    {n.title ?? n.type ?? 'Notification'}
                  </Text>
                  {n.message ? <Text style={[s.rowMsg, { color: colors.textMuted }]} numberOfLines={3}>{n.message}</Text> : null}
                  <Text style={s.rowTime}>{fmtTime(n.created_at)}</Text>
                </View>
                {unread && <View style={s.unreadDot} />}
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
  shell: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 2 },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#1A2B1A' },
  markAllTxt: { color: '#C9A52A', fontSize: 12, fontWeight: '700' },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyTxt: { fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5 },
  rowMsg: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  rowTime: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d97706', marginTop: 6 },
});
