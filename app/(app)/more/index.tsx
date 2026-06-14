/**
 * More — mobile hub for all admin modules not in the bottom tab bar.
 */
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/store/themeStore';
import { useAppStore } from '@/store/appStore';

type Link = { label: string; route: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string };

const SECTIONS: { title: string; links: Link[] }[] = [
  {
    title: 'OPERATIONS',
    links: [
      { label: 'Dashboard', route: '/(app)/dashboard', icon: 'home-outline', color: '#1A2B1A' },
      { label: 'Tables', route: '/(app)/tables', icon: 'grid-outline', color: '#7c3aed' },
    ],
  },
  {
    title: 'MENU & STOCK',
    links: [
      { label: 'Menu Items', route: '/(app)/menu', icon: 'restaurant-outline', color: '#2563eb' },
      { label: 'Categories', route: '/(app)/categories', icon: 'folder-outline', color: '#0891b2' },
      { label: 'Items', route: '/(app)/items', icon: 'fast-food-outline', color: '#ea580c' },
      { label: 'Inventory', route: '/(app)/inventory', icon: 'cube-outline', color: '#64748b' },
    ],
  },
  {
    title: 'CUSTOMERS',
    links: [
      { label: 'Customers', route: '/(app)/customers', icon: 'people-outline', color: '#16a34a' },
      ...(Platform.OS !== 'web' ? [{ label: 'Wallet', route: '/(app)/wallet', icon: 'wallet-outline', color: '#d97706' }] : []),
      { label: 'Reservations', route: '/(app)/reservations', icon: 'calendar-outline', color: '#dc2626' },
      { label: 'Invoices', route: '/(app)/invoices', icon: 'document-text-outline', color: '#4f46e5' },
      { label: 'Payments', route: '/(app)/payments', icon: 'card-outline', color: '#0284c7' },
    ],
  },
  {
    title: 'PROMOTIONS & FINANCE',
    links: [
      { label: 'Coupons', route: '/(app)/coupons', icon: 'pricetag-outline', color: '#db2777' },
      { label: 'Expenses', route: '/(app)/expenses', icon: 'wallet-outline', color: '#ca8a04' },
      { label: 'Expense Report', route: '/(app)/expense-report', icon: 'stats-chart-outline', color: '#059669' },
    ],
  },
  {
    title: 'SUPPORT & ANALYTICS',
    links: [
      { label: 'Tickets', route: '/(app)/tickets', icon: 'headset-outline', color: '#9333ea' },
      { label: 'Reports', route: '/(app)/reports', icon: 'bar-chart-outline', color: '#2563eb' },
      { label: 'Notifications', route: '/(app)/notifications', icon: 'notifications-outline', color: '#f59e0b' },
    ],
  },
  {
    title: 'SYSTEM',
    links: [
      { label: 'Staff', route: '/(app)/staff', icon: 'people-circle-outline', color: '#1A2B1A' },
      { label: 'Settings', route: '/(app)/settings', icon: 'settings-outline', color: '#64748b' },
    ],
  },
];

export default function MoreScreen() {
  const { colors } = useTheme();
  const user = useAppStore(s => s.user);

  return (
    <ScrollView style={[s.shell, { backgroundColor: colors.background }]} contentContainerStyle={s.content}>
      <View style={[s.hero, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[s.title, { color: colors.text }]}>More</Text>
        <Text style={[s.sub, { color: colors.textMuted }]}>
          All modules · {(user?.role ?? 'staff').replace('_', ' ')}
        </Text>
      </View>

      {SECTIONS.map(section => (
        <View key={section.title} style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
          <View style={[s.grid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {section.links.map(link => (
              <Pressable
                key={link.route}
                style={({ pressed }) => [s.tile, pressed && { opacity: 0.75 }]}
                onPress={() => router.push(link.route as any)}>
                <View style={[s.iconWrap, { backgroundColor: link.color + '18' }]}>
                  <Ionicons name={link.icon} size={22} color={link.color} />
                </View>
                <Text style={[s.tileLabel, { color: colors.text }]} numberOfLines={2}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1 },
  content: { paddingBottom: 24 },
  hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 13, marginTop: 4 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, paddingLeft: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 14, borderWidth: 1, padding: 8, gap: 4 },
  tile: { width: '33.33%', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileLabel: { fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
});
