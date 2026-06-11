import { Tabs, usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Image, TouchableOpacity, useWindowDimensions, ScrollView, StyleSheet, Platform } from 'react-native';
import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { API_BASE_URL } from '@/api/client';
import { webSyncService } from '@/sync/WebSyncService';

const NAV_SECTIONS = [
  {
    label: 'OPERATIONS',
    items: [
      { name: 'dashboard/index', route: '/(app)/dashboard', label: 'Dashboard',    icon: 'home-outline'         as const },
      { name: 'pos/index',       route: '/(app)/pos',       label: 'POS',          icon: 'cart-outline'         as const },
      { name: 'kitchen/index',   route: '/(app)/kitchen',   label: 'Kitchen',      icon: 'flame-outline'        as const },
      { name: 'orders/index',    route: '/(app)/orders',    label: 'Orders',       icon: 'receipt-outline'      as const },
      { name: 'tables/index',    route: '/(app)/tables',    label: 'Tables',       icon: 'grid-outline'         as const },
    ],
  },
  {
    label: 'GUESTS',
    items: [
      { name: 'customers/index',    route: '/(app)/customers',    label: 'Customers',    icon: 'people-outline'       as const },
      { name: 'reservations/index', route: '/(app)/reservations', label: 'Reservations', icon: 'calendar-outline'     as const },
    ],
  },
  {
    label: 'MENU & STOCK',
    items: [
      { name: 'menu/index', route: '/(app)/menu', label: 'Menu Items', icon: 'restaurant-outline' as const },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { name: 'expenses/index', route: '/(app)/expenses', label: 'Expenses', icon: 'wallet-outline' as const },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { name: 'settings/index', route: '/(app)/settings', label: 'Settings', icon: 'settings-outline' as const },
    ],
  },
];

// Flat list for tab registration
const ALL_SCREENS = NAV_SECTIONS.flatMap(s => s.items);

// Bottom tab items (mobile — keep concise)
const TAB_ITEMS = [
  { name: 'pos/index',     route: '/(app)/pos',     label: 'POS',     icon: 'cart-outline'     as const },
  { name: 'kitchen/index', route: '/(app)/kitchen', label: 'Kitchen', icon: 'flame-outline'    as const },
  { name: 'orders/index',  route: '/(app)/orders',  label: 'Orders',  icon: 'receipt-outline'  as const },
  { name: 'tables/index',  route: '/(app)/tables',  label: 'Tables',  icon: 'grid-outline'     as const },
  { name: 'settings/index',route: '/(app)/settings',label: 'More',    icon: 'ellipsis-horizontal-outline' as const },
];

const SOURCE_BADGE_ROUTES = ['kitchen/index'];

function SyncDot() {
  const { isSyncing, isOnline } = useAppStore();
  const color = isSyncing ? '#f59e0b' : isOnline ? '#22c55e' : '#ef4444';
  return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
}

function Sidebar() {
  const restaurant = useAppStore((s) => s.restaurant);
  const { isSyncing, isOnline } = useAppStore();
  const pathname = usePathname();
  const logoUrl = restaurant?.logo
    ? (restaurant.logo.startsWith('http') ? restaurant.logo : `${API_BASE_URL.replace('/api/mobile', '')}/${restaurant.logo}`)
    : null;

  function isActive(name: string) {
    const segment = name.replace('/index', '').split('/')[0];
    return pathname.includes(segment);
  }

  return (
    <View style={sb.container}>
      <View style={sb.blobTop} />
      <View style={sb.blobBottom} />

      {/* Brand */}
      <View style={sb.brand}>
        <View style={sb.logoWrap}>
          <View style={sb.ring1} />
          <View style={sb.ring2} />
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={sb.logo} />
          ) : (
            <View style={sb.logoFallback}>
              <Ionicons name="restaurant" size={26} color="#C9A52A" />
            </View>
          )}
        </View>
        <Text style={sb.restName} numberOfLines={2}>
          {restaurant?.name?.toUpperCase() ?? 'RESTAURANT'}
        </Text>
        <Text style={sb.restSub}>POS System</Text>
        <View style={sb.divider} />
      </View>

      {/* Navigation sections */}
      <ScrollView style={sb.navScroll} showsVerticalScrollIndicator={false}>
        {NAV_SECTIONS.map(section => (
          <View key={section.label}>
            <Text style={sb.navSection}>{section.label}</Text>
            {section.items.map((item) => {
              const active = isActive(item.name);
              return (
                <TouchableOpacity
                  key={item.name}
                  onPress={() => router.push(item.route as any)}
                  style={[sb.navItem, active && sb.navItemActive]}
                  activeOpacity={0.75}
                >
                  {active && <View style={sb.activeBar} />}
                  <View style={[sb.iconBox, active && sb.iconBoxActive]}>
                    <Ionicons name={item.icon} size={16} color={active ? '#C9A52A' : '#5A7A5A'} />
                  </View>
                  <Text style={[sb.navLabel, active && sb.navLabelActive]}>{item.label}</Text>
                  {active && item.name === 'pos/index' && (
                    <View style={{ marginLeft: 'auto' }}><SyncDot /></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Status footer */}
      <View style={sb.footer}>
        <View style={[sb.statusPill, { backgroundColor: isOnline ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }]}>
          <View style={[sb.statusDot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
          <Text style={[sb.statusText, { color: isOnline ? '#4ade80' : '#f87171' }]}>
            {isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function RestaurantHeader() {
  const restaurant = useAppStore((s) => s.restaurant);
  const logoUrl = restaurant?.logo
    ? (restaurant.logo.startsWith('http') ? restaurant.logo : `${API_BASE_URL.replace('/api/mobile', '')}/${restaurant.logo}`)
    : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={{ width: 34, height: 34, borderRadius: 17 }} />
      ) : (
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#2D4A2D', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="restaurant" size={16} color="#C9A52A" />
        </View>
      )}
      <View>
        <Text style={{ color: '#C9A52A', fontWeight: '800', fontSize: 13, letterSpacing: 1 }}>
          {restaurant?.name?.toUpperCase() ?? 'RESTAURANT'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>POS System</Text>
      </View>
    </View>
  );
}

export default function AppLayout() {
  const { width } = useWindowDimensions();
  const isLarge = width >= 768;
  const token = useAppStore((s) => s.token);
  const store = useAppStore();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.warn);
    }
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.json';
      document.head.appendChild(link);
    }
    const handleOnline = () => {
      store.setOnline(true);
      if (token) webSyncService.sync().catch(console.warn);
    };
    const handleOffline = () => store.setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine && token) webSyncService.sync().catch(console.warn);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token]);

  const tabScreenOptions = {
    headerStyle: { backgroundColor: '#1A2B1A' },
    headerTintColor: '#fff',
    headerTitleStyle: { fontWeight: '700' as const },
    tabBarStyle: { display: 'none' as const },
  };

  if (isLarge) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <Tabs screenOptions={tabScreenOptions}>
            <Tabs.Screen name="dashboard/index" options={{ headerTitle: () => <RestaurantHeader />, headerRight: () => <View style={{ marginRight: 16 }}><SyncDot /></View> }} />
            <Tabs.Screen name="pos/index" options={{ headerTitle: () => <RestaurantHeader />, headerRight: () => <View style={{ marginRight: 16 }}><SyncDot /></View> }} />
            <Tabs.Screen name="kitchen/index"    options={{ title: 'Kitchen Display' }} />
            <Tabs.Screen name="orders/index"     options={{ title: 'Orders' }} />
            <Tabs.Screen name="tables/index"     options={{ title: 'Tables' }} />
            <Tabs.Screen name="customers/index"  options={{ title: 'Customers' }} />
            <Tabs.Screen name="reservations/index" options={{ title: 'Reservations' }} />
            <Tabs.Screen name="menu/index"       options={{ title: 'Menu Items' }} />
            <Tabs.Screen name="expenses/index"   options={{ title: 'Expenses' }} />
            <Tabs.Screen name="settings/index"   options={{ title: 'Settings' }} />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: '#1A2B1A' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      tabBarActiveTintColor: '#C9A52A',
      tabBarInactiveTintColor: '#7A9A7A',
      tabBarStyle: { borderTopColor: '#E2E8F0', elevation: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -2 } },
    }}>
      <Tabs.Screen name="dashboard/index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />, tabBarLabel: 'Home', headerTitle: () => <RestaurantHeader /> }} />
      <Tabs.Screen name="pos/index" options={{ headerTitle: () => <RestaurantHeader />, tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size} />, tabBarLabel: 'POS', headerRight: () => <View style={{ marginRight: 16 }}><SyncDot /></View> }} />
      <Tabs.Screen name="kitchen/index" options={{ title: 'Kitchen', tabBarIcon: ({ color, size }) => <Ionicons name="flame-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="orders/index" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="tables/index" options={{ title: 'Tables', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="customers/index" options={{ title: 'Customers', tabBarButton: () => null }} />
      <Tabs.Screen name="reservations/index" options={{ title: 'Reservations', tabBarButton: () => null }} />
      <Tabs.Screen name="menu/index" options={{ title: 'Menu', tabBarButton: () => null }} />
      <Tabs.Screen name="expenses/index" options={{ title: 'Expenses', tabBarButton: () => null }} />
      <Tabs.Screen name="settings/index" options={{ title: 'Settings', tabBarButton: () => null }} />
    </Tabs>
  );
}

const sb = StyleSheet.create({
  container: { width: 220, backgroundColor: '#1A2B1A', height: '100%', overflow: 'hidden' },
  blobTop: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(201,165,42,0.07)' },
  blobBottom: { position: 'absolute', bottom: -40, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(201,165,42,0.05)' },

  brand: { alignItems: 'center', paddingTop: 18, paddingHorizontal: 16 },
  logoWrap: { width: 90, height: 90, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  ring1: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: 'rgba(201,165,42,0.45)' },
  ring2: { position: 'absolute', width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: 'rgba(201,165,42,0.15)' },
  logo: { width: 56, height: 56, borderRadius: 28, zIndex: 1 },
  logoFallback: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2D4A2D', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  restName: { color: '#C9A52A', fontWeight: '800', fontSize: 10.5, letterSpacing: 1.5, textAlign: 'center' },
  restSub: { color: '#4A6A4A', fontSize: 9.5, marginTop: 2, letterSpacing: 1 },
  divider: { width: 28, height: 2, backgroundColor: 'rgba(201,165,42,0.35)', borderRadius: 1, marginTop: 10, marginBottom: 4 },

  navScroll: { flex: 1, paddingTop: 4 },
  navSection: { color: '#2D4A2D', fontSize: 9, fontWeight: '700', letterSpacing: 2, paddingHorizontal: 18, marginBottom: 3, marginTop: 12 },
  navItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, marginHorizontal: 8, borderRadius: 10, marginBottom: 1, position: 'relative', overflow: 'hidden' },
  navItemActive: { backgroundColor: 'rgba(201,165,42,0.1)' },
  activeBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, backgroundColor: '#C9A52A', borderRadius: 2 },
  iconBox: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', marginRight: 10 },
  iconBoxActive: { backgroundColor: 'rgba(201,165,42,0.15)' },
  navLabel: { fontSize: 13, fontWeight: '500', color: '#4A6A4A', flex: 1 },
  navLabelActive: { color: '#fff', fontWeight: '700' },

  footer: { paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
});
