import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { getTables, updateTableStatus } from '@/database/repositories';
import { webGetTables, webUpdateTableStatus, webSaveTables } from '@/utils/webDb';
import { syncService } from '@/sync/SyncService';
import { useAppStore } from '@/store/appStore';
import client from '@/api/client';
import type { RestaurantTable } from '@/types';

const STATUS_CFG = {
  available: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: 'checkmark-circle' as const, label: 'Available', dotColor: '#22c55e' },
  occupied:  { color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', icon: 'people'           as const, label: 'Occupied',  dotColor: '#ef4444' },
  reserved:  { color: '#d97706', bg: '#fefce8', border: '#fde047', icon: 'bookmark'         as const, label: 'Reserved',  dotColor: '#f59e0b' },
};

export default function TablesScreen() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { isOnline } = useAppStore();
  const { width } = useWindowDimensions();
  const cols = width >= 1024 ? 4 : width >= 768 ? 3 : 2;

  const load = useCallback(async () => {
    if (Platform.OS === 'web') {
      // Always try API first; fall back to IndexedDB cache
      try {
        const res = await client.get('/sync/pull');
        const tbls = res.data?.tables ?? [];
        if (tbls.length > 0) {
          await webSaveTables(tbls);
          setTables(tbls);
        } else {
          setTables(await webGetTables());
        }
      } catch {
        setTables(await webGetTables());
      }
    } else {
      setTables(await getTables());
    }
  }, []);
  useEffect(() => { load(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try { if (isOnline) await syncService.manualSync(); } catch {}
    await load();
    setRefreshing(false);
  }

  async function cycleStatus(table: RestaurantTable) {
    const cycle: RestaurantTable['status'][] = ['available', 'occupied', 'reserved'];
    const next = cycle[(cycle.indexOf(table.status) + 1) % cycle.length];
    try {
      if (Platform.OS === 'web') {
        await webUpdateTableStatus(table.id, next);
      } else {
        await updateTableStatus(table.id, next);
      }
      if (isOnline) await client.patch(`/tables/${table.id}/status`, { status: next });
      await load();
    } catch { Alert.alert('Error', 'Could not update table status.'); }
  }

  const stats = {
    available: tables.filter(t => t.status === 'available').length,
    occupied:  tables.filter(t => t.status === 'occupied').length,
    reserved:  tables.filter(t => t.status === 'reserved').length,
  };

  return (
    <View style={s.container}>
      {/* Stats bar */}
      <View style={s.statsBar}>
        {(Object.entries(STATUS_CFG) as [keyof typeof STATUS_CFG, typeof STATUS_CFG[keyof typeof STATUS_CFG]][]).map(([key, cfg]) => (
          <View key={key} style={s.statCard}>
            <View style={[s.statIconBg, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={18} color={cfg.color} />
            </View>
            <View>
              <Text style={[s.statNum, { color: cfg.color }]}>{stats[key]}</Text>
              <Text style={s.statLabel}>{cfg.label}</Text>
            </View>
          </View>
        ))}
        <View style={s.statCard}>
          <View style={[s.statIconBg, { backgroundColor: '#F0F7F0' }]}>
            <Ionicons name="grid-outline" size={18} color="#1A2B1A" />
          </View>
          <View>
            <Text style={[s.statNum, { color: '#1A2B1A' }]}>{tables.length}</Text>
            <Text style={s.statLabel}>Total</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={tables}
        keyExtractor={(t) => String(t.id)}
        numColumns={cols}
        key={cols}
        columnWrapperStyle={s.colWrap}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#C9A52A" />}
        renderItem={({ item: t }) => {
          const cfg = STATUS_CFG[t.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.available;
          return (
            <TouchableOpacity
              style={[s.card, { borderColor: cfg.border, backgroundColor: cfg.bg }]}
              onPress={() => cycleStatus(t)}
              activeOpacity={0.8}
            >
              {/* Status indicator dot */}
              <View style={[s.statusDot, { backgroundColor: cfg.dotColor }]} />

              {/* Table name */}
              <Text style={s.tableName}>{t.name}</Text>
              {t.floor ? <Text style={s.tableSub}>Floor {t.floor}</Text> : null}

              {t.capacity ? (
                <View style={s.capRow}>
                  <Ionicons name="people-outline" size={12} color="#64748B" />
                  <Text style={s.capText}>{t.capacity} seats</Text>
                </View>
              ) : null}

              <View style={[s.statusChip, { backgroundColor: cfg.color }]}>
                <Ionicons name={cfg.icon} size={11} color="#fff" />
                <Text style={s.chipText}>{cfg.label}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="grid-outline" size={36} color="#CBD5E1" />
            </View>
            <Text style={s.emptyTitle}>No tables found</Text>
            <Text style={s.emptyText}>Pull down to sync tables from server</Text>
          </View>
        }
      />
      <View style={s.hint}>
        <Ionicons name="hand-left-outline" size={13} color="#94A3B8" />
        <Text style={s.hintText}>Tap a table to cycle its status</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F4' },

  statsBar: {
    flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12 },
  statIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statNum: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#64748B', fontWeight: '600', marginTop: 1 },

  list: { padding: 12, paddingBottom: 32, flexGrow: 1 },
  colWrap: { gap: 12, marginBottom: 12 },

  card: {
    flex: 1, borderRadius: 18, padding: 16, alignItems: 'center', minHeight: 140,
    borderWidth: 1.5, position: 'relative',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  statusDot: { position: 'absolute', top: 12, right: 12, width: 10, height: 10, borderRadius: 5 },
  tableName: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  tableSub: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  capText: { fontSize: 12, color: '#64748B' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: 10 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#94A3B8' },
  emptyText: { fontSize: 13, color: '#CBD5E1', textAlign: 'center' },

  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  hintText: { textAlign: 'center', color: '#94A3B8', fontSize: 12 },
});
