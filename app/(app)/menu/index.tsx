import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SectionList, RefreshControl, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCategories, getItems } from '@/database/repositories';
import { webGetCategories, webGetItems } from '@/utils/webDb';
import { Platform } from 'react-native';
import { syncService } from '@/sync/SyncService';
import { useAppStore } from '@/store/appStore';
import type { Item } from '@/types';

const FOOD_CFG: Record<string, { color: string; bg: string; label: string }> = {
  veg:     { color: '#16a34a', bg: '#dcfce7', label: 'VEG'     },
  non_veg: { color: '#dc2626', bg: '#fee2e2', label: 'NON-VEG' },
  egg:     { color: '#d97706', bg: '#fef3c7', label: 'EGG'     },
};

export default function MenuScreen() {
  const [sections, setSections] = useState<{ title: string; data: Item[]; id: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { isOnline } = useAppStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  async function load() {
    const cats = Platform.OS === 'web' ? await webGetCategories() : await getCategories();
    const result = [];
    for (const cat of cats) {
      const items = Platform.OS === 'web' ? await webGetItems(cat.id) : await getItems(cat.id);
      if (items.length > 0) result.push({ title: cat.name, data: items, id: cat.id });
    }
    setSections(result);
  }

  useEffect(() => { load(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try { if (isOnline) await syncService.manualSync(); } catch {}
    await load();
    setRefreshing(false);
  }

  const totalItems = sections.reduce((sum, s) => sum + s.data.length, 0);

  return (
    <View style={s.container}>
      {/* Header stats bar */}
      <View style={s.statsBar}>
        <View style={s.statItem}>
          <Text style={s.statNum}>{sections.length}</Text>
          <Text style={s.statLabel}>Categories</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statNum}>{totalItems}</Text>
          <Text style={s.statLabel}>Menu Items</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statNum}>{sections.reduce((sum, sec) => sum + sec.data.filter(i => i.is_available).length, 0)}</Text>
          <Text style={s.statLabel}>Available</Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#C9A52A" />}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}>
              <View style={s.catIconBg}>
                <Ionicons name="restaurant-outline" size={14} color="#C9A52A" />
              </View>
              <Text style={s.sectionTitle}>{section.title}</Text>
            </View>
            <View style={s.itemCountBadge}>
              <Text style={s.itemCountText}>{section.data.length} items</Text>
            </View>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const food = item.food_type ? FOOD_CFG[item.food_type] : null;
          const isLast = index === section.data.length - 1;
          return (
            <View style={[s.itemCard, isDesktop && s.itemCardDesktop, isLast && s.itemCardLast]}>
              {/* Food type bar */}
              {food && <View style={[s.foodBar, { backgroundColor: food.color }]} />}
              <View style={s.itemBody}>
                <View style={s.itemLeft}>
                  <Text style={s.itemName}>{item.name}</Text>
                  {item.description ? <Text style={s.itemDesc} numberOfLines={1}>{item.description}</Text> : null}
                  {food && (
                    <View style={[s.foodBadge, { backgroundColor: food.bg }]}>
                      <View style={[s.foodDot, { backgroundColor: food.color }]} />
                      <Text style={[s.foodLabel, { color: food.color }]}>{food.label}</Text>
                    </View>
                  )}
                </View>
                <View style={s.itemRight}>
                  <Text style={s.itemPrice}>₹{item.price.toFixed(2)}</Text>
                  <View style={[s.availChip, item.is_available ? s.availOn : s.availOff]}>
                    <View style={[s.availDot, { backgroundColor: item.is_available ? '#16a34a' : '#dc2626' }]} />
                    <Text style={[s.availText, { color: item.is_available ? '#16a34a' : '#dc2626' }]}>
                      {item.is_available ? 'Available' : 'Unavailable'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="restaurant-outline" size={36} color="#CBD5E1" />
            </View>
            <Text style={s.emptyTitle}>No menu items</Text>
            <Text style={s.emptyText}>Pull down to sync menu from server</Text>
            <TouchableOpacity style={s.syncBtn} onPress={handleRefresh}>
              <Ionicons name="sync-outline" size={16} color="#fff" />
              <Text style={s.syncBtnText}>Sync Now</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F4' },

  statsBar: {
    flexDirection: 'row', backgroundColor: '#1A2B1A', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(201,165,42,0.2)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#C9A52A' },
  statLabel: { fontSize: 11, color: '#7A9A7A', marginTop: 2, letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 4 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F4F6F4', marginTop: 8,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIconBg: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(26,43,26,0.08)', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: 0.3 },
  itemCountBadge: { backgroundColor: '#1A2B1A', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  itemCountText: { fontSize: 11, fontWeight: '700', color: '#C9A52A' },

  itemCard: {
    flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#fff',
    marginHorizontal: 12, marginBottom: 2, borderRadius: 0,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    overflow: 'hidden',
  },
  itemCardDesktop: { marginHorizontal: 12, borderRadius: 0 },
  itemCardLast: { borderBottomWidth: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, marginBottom: 4 },
  foodBar: { width: 4 },
  itemBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  itemLeft: { flex: 1, gap: 4 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  itemDesc: { fontSize: 12, color: '#94A3B8', lineHeight: 16 },
  foodBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  foodDot: { width: 5, height: 5, borderRadius: 3 },
  foodLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  itemRight: { alignItems: 'flex-end', gap: 8 },
  itemPrice: { fontSize: 16, fontWeight: '800', color: '#C9A52A' },
  availChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  availOn: { backgroundColor: '#dcfce7' },
  availOff: { backgroundColor: '#fee2e2' },
  availDot: { width: 5, height: 5, borderRadius: 3 },
  availText: { fontSize: 10, fontWeight: '600' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#94A3B8' },
  emptyText: { fontSize: 13, color: '#CBD5E1', textAlign: 'center' },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1A2B1A', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  syncBtnText: { color: '#C9A52A', fontWeight: '700', fontSize: 14 },
});
