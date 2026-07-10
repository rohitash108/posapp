import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { StockAlertsData } from '@/types';
import type { ThemeColors } from '@/theme/tokens';

function mkS(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: isDark ? 'rgba(255,54,54,0.45)' : '#fecaca',
      overflow: 'hidden',
    },
    hdr: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: { fontSize: 15, fontWeight: '800', color: isDark ? '#FF3636' : '#dc2626', flex: 1 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeTxt: { fontSize: 11, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 8 },
    actBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
    },
    actTxt: { fontSize: 12, fontWeight: '700', color: c.text },
    section: { paddingHorizontal: 14, paddingVertical: 10 },
    sectionTitle: { fontSize: 11, fontWeight: '800', color: isDark ? '#FDAF22' : '#d97706', textTransform: 'uppercase', marginBottom: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowName: { fontSize: 13, fontWeight: '700', color: c.heading, flex: 1 },
    rowMeta: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    restockBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,54,54,0.45)' : '#fecaca',
    },
    restockTxt: { fontSize: 11, fontWeight: '700', color: isDark ? '#FF3636' : '#dc2626' },
    qtyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isDark ? 'rgba(255,54,54,0.15)' : '#fef2f2' },
    qtyTxt: { fontSize: 12, fontWeight: '800', color: isDark ? '#FF3636' : '#dc2626' },
  });
}

export default function DashboardStockAlerts({
  data, colors: c, isDark,
}: {
  data: StockAlertsData;
  colors: ThemeColors;
  isDark: boolean;
}) {
  const s = useMemo(() => mkS(c, isDark), [c, isDark]);

  const menuOut = data.menu.out_of_stock ?? [];
  const menuLow = data.menu.low_stock ?? [];
  const supOut = data.supplies.out_of_stock ?? [];
  const supLow = data.supplies.low_stock ?? [];
  const total = menuOut.length + menuLow.length + supOut.length + supLow.length;

  if (total === 0) return null;

  return (
    <View style={s.card}>
      <View style={s.hdr}>
        <Ionicons name="cube-outline" size={18} color={isDark ? '#FF3636' : '#dc2626'} />
        <Text style={s.title}>Stock alerts</Text>
        {menuOut.length > 0 && (
          <View style={[s.badge, { backgroundColor: isDark ? 'rgba(255,54,54,0.15)' : '#fef2f2' }]}>
            <Text style={[s.badgeTxt, { color: isDark ? '#FF3636' : '#dc2626' }]}>{menuOut.length} out</Text>
          </View>
        )}
        {menuLow.length > 0 && (
          <View style={[s.badge, { backgroundColor: isDark ? 'rgba(253,175,34,0.15)' : '#fef9ec' }]}>
            <Text style={[s.badgeTxt, { color: isDark ? '#FDAF22' : '#d97706' }]}>{menuLow.length} low</Text>
          </View>
        )}
        <View style={s.actions}>
          <TouchableOpacity style={s.actBtn} onPress={() => router.push('/(app)/inventory')}>
            <Text style={s.actTxt}>Menu stock</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actBtn} onPress={() => router.push('/(app)/inventory')}>
            <Text style={s.actTxt}>Supplies</Text>
          </TouchableOpacity>
        </View>
      </View>

      {menuOut.length > 0 && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: isDark ? '#FF3636' : '#dc2626' }]}>Out of stock</Text>
          {menuOut.slice(0, 8).map(row => (
            <View key={`mo-${row.item_id}`} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{row.item_name}</Text>
                <Text style={s.rowMeta}>{row.category_name}</Text>
              </View>
              <View style={s.qtyBadge}><Text style={s.qtyTxt}>0</Text></View>
              <TouchableOpacity style={[s.restockBtn, { marginLeft: 8 }]} onPress={() => router.push('/(app)/inventory')}>
                <Text style={s.restockTxt}>Restock</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {menuLow.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Low stock</Text>
          {menuLow.slice(0, 8).map(row => (
            <View key={`ml-${row.item_id}`} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{row.item_name}</Text>
                <Text style={s.rowMeta}>{row.category_name}</Text>
              </View>
              <Text style={[s.qtyTxt, { color: isDark ? '#FDAF22' : '#d97706' }]}>{row.on_hand} / {row.threshold}</Text>
            </View>
          ))}
        </View>
      )}

      {(supOut.length > 0 || supLow.length > 0) && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Supplies</Text>
          {[...supOut, ...supLow].slice(0, 8).map(row => (
            <View key={`s-${row.sku_id}`} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{row.sku_name}</Text>
                <Text style={s.rowMeta}>{row.category_label}</Text>
              </View>
              <Text style={s.qtyTxt}>{row.on_hand}{row.threshold > 0 ? ` / ${row.threshold}` : ''}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
