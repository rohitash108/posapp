/**
 * Staff — list restaurant staff for waiter assignment and admin overview.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { staffApi } from '@/api/staff';
import { useTheme } from '@/store/themeStore';
import type { StaffMember } from '@/types';

const ROLE_COLORS: Record<string, string> = {
  restaurant_admin: '#16a34a',
  super_admin: '#7c3aed',
  admin: '#2563eb',
  staff: '#64748b',
};

export default function StaffScreen() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await staffApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setStaff(Array.isArray(data) ? data : []);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[s.shell, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.title, { color: colors.text }]}>Staff</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>
            {staff.length} team member{staff.length !== 1 ? 's' : ''} · used in POS waiter picker
          </Text>
        </View>
        <Pressable onPress={() => { setRefreshing(true); load(true); }} style={s.refreshBtn}>
          <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        contentContainerStyle={staff.length === 0 && !loading ? s.emptyWrap : undefined}>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#1A2B1A" />
          </View>
        ) : staff.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="people-outline" size={40} color="#d1d5db" />
            <Text style={[s.emptyTitle, { color: colors.text }]}>No staff members</Text>
            <Text style={[s.emptySub, { color: colors.textMuted }]}>
              Staff are managed from the CSPos web admin panel. Once added, they appear here and in POS.
            </Text>
          </View>
        ) : (
          staff.map((member, i) => {
            const roleColor = ROLE_COLORS[member.role] ?? '#64748b';
            const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <View
                key={member.id}
                style={[s.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }, i === staff.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[s.avatar, { backgroundColor: roleColor + '22' }]}>
                  <Text style={[s.avatarTxt, { color: roleColor }]}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: colors.text }]}>{member.name}</Text>
                  {member.email ? <Text style={[s.meta, { color: colors.textMuted }]}>{member.email}</Text> : null}
                  {member.phone ? <Text style={[s.meta, { color: colors.textMuted }]}>{member.phone}</Text> : null}
                </View>
                <View style={[s.roleBadge, { backgroundColor: roleColor + '18' }]}>
                  <Text style={[s.roleTxt, { color: roleColor }]}>{member.role.replace('_', ' ')}</Text>
                </View>
                <View style={[s.statusDot, { backgroundColor: member.is_active ? '#16a34a' : '#d1d5db' }]} />
              </View>
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
  refreshBtn: { padding: 8 },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roleTxt: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
