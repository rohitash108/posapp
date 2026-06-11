import { Tabs, usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Image, TouchableOpacity, useWindowDimensions, ScrollView, StyleSheet, Platform } from 'react-native';
import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { API_BASE_URL } from '@/api/client';
import { webSyncService } from '@/sync/WebSyncService';

const NAV_ITEMS = [
  { name: 'pos/index',      route: '/(app)/pos',      label: 'POS',      icon: 'cart-outline'        as const },
  { name: 'orders/index',   route: '/(app)/orders',   label: 'Orders',   icon: 'receipt-outline'     as const },
  { name: 'menu/index',     route: '/(app)/menu',     label: 'Menu',     icon: 'restaurant-outline'  as const },
  { name: 'tables/index',   route: '/(app)/tables',   label: 'Tables',   icon: 'grid-outline'        as const },
  { name: 'settings/index', route: '/(app)/settings', label: 'Settings', icon: 'settings-outline'    as const },
];

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

  return (
    <View style={sb.container}>
      {/* Decorative blobs */}
      <View style={sb.blobTop} />
      <View style={sb.blobBottom} />

      {/* Brand header */}
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
        <Text style={sb.restSub}>Billing System</Text>
        <View style={sb.divider} />
      </View>

      {/* Navigation */}
      <ScrollView style={sb.navScroll} showsVerticalScrollIndicator={false}>
        <Text style={sb.navSection}>NAVIGATION</Text>
        {NAV_ITEMS.map((item) => {
          const active = pathname.includes(item.name.replace('/index', '').split('/')[0]);
          return (
            <TouchableOpacity
              key={item.name}
              onPress={() => router.push(item.route as any)}
              style={[sb.navItem, active && sb.navItemActive]}
              activeOpacity={0.75}
            >
              {active && <View style={sb.activeBar} />}
              <View style={[sb.iconBox, active && sb.iconBoxActive]}>
                <Ionicons name={item.icon} size={17} color={active ? '#C9A52A' : '#5A7A5A'} />
              </View>
              <Text style={[sb.navLabel, active && sb.navLabelActive]}>{item.label}</Text>
              {active && item.name === 'pos/index' && (
                <View style={{ marginLeft: 'auto' }}><SyncDot /></View>
              )}
            </TouchableOpacity>
          );
        })}
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
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Billing System</Text>
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

    // Register service worker for PWA offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.warn);
    }

    // Inject manifest link if not already present
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.json';
      document.head.appendChild(link);
    }

    // Sync when coming back online
    const handleOnline = () => {
      store.setOnline(true);
      if (token) webSyncService.sync().catch(console.warn);
    };
    const handleOffline = () => store.setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync if online
    if (navigator.onLine && token) {
      webSyncService.sync().catch(console.warn);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token]);


  if (isLarge) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <Tabs screenOptions={{
            headerStyle: { backgroundColor: '#1A2B1A' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            tabBarStyle: { display: 'none' },
          }}>
            <Tabs.Screen name="pos/index" options={{ headerTitle: () => <RestaurantHeader />, headerRight: () => <View style={{ marginRight: 16 }}><SyncDot /></View> }} />
            <Tabs.Screen name="orders/index" options={{ title: 'Orders' }} />
            <Tabs.Screen name="menu/index" options={{ title: 'Menu' }} />
            <Tabs.Screen name="tables/index" options={{ title: 'Tables' }} />
            <Tabs.Screen name="settings/index" options={{ title: 'Settings' }} />
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
      <Tabs.Screen name="pos/index" options={{
        headerTitle: () => <RestaurantHeader />,
        tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size} />,
        tabBarLabel: 'POS',
        headerRight: () => <View style={{ marginRight: 16 }}><SyncDot /></View>,
      }} />
      <Tabs.Screen name="orders/index" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="menu/index" options={{ title: 'Menu', tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="tables/index" options={{ title: 'Tables', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="settings/index" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}

const sb = StyleSheet.create({
  container: { width: 230, backgroundColor: '#1A2B1A', height: '100%', overflow: 'hidden' },
  blobTop: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(201,165,42,0.07)' },
  blobBottom: { position: 'absolute', bottom: -40, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(201,165,42,0.05)' },

  brand: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 16 },
  logoWrap: { width: 108, height: 108, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ring1: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 1.5, borderColor: 'rgba(201,165,42,0.45)' },
  ring2: { position: 'absolute', width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: 'rgba(201,165,42,0.15)' },
  logo: { width: 62, height: 62, borderRadius: 31, zIndex: 1 },
  logoFallback: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#2D4A2D', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  restName: { color: '#C9A52A', fontWeight: '800', fontSize: 11, letterSpacing: 1.5, textAlign: 'center' },
  restSub: { color: '#4A6A4A', fontSize: 10, marginTop: 3, letterSpacing: 1 },
  divider: { width: 30, height: 2, backgroundColor: 'rgba(201,165,42,0.35)', borderRadius: 1, marginTop: 14, marginBottom: 4 },

  navScroll: { flex: 1, paddingTop: 8 },
  navSection: { color: '#2D4A2D', fontSize: 9, fontWeight: '700', letterSpacing: 2, paddingHorizontal: 22, marginBottom: 6, marginTop: 10 },
  navItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 10, borderRadius: 12, marginBottom: 2, position: 'relative', overflow: 'hidden' },
  navItemActive: { backgroundColor: 'rgba(201,165,42,0.1)' },
  activeBar: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, backgroundColor: '#C9A52A', borderRadius: 2 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', marginRight: 12 },
  iconBoxActive: { backgroundColor: 'rgba(201,165,42,0.15)' },
  navLabel: { fontSize: 14, fontWeight: '500', color: '#4A6A4A', flex: 1 },
  navLabelActive: { color: '#fff', fontWeight: '700' },

  footer: { paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
});
