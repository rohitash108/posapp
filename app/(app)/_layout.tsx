import React, { useEffect, useMemo } from 'react';
import { Tabs, usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, useWindowDimensions, ScrollView, StyleSheet, Platform } from 'react-native';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/store/themeStore';
import { webSyncService } from '@/sync/WebSyncService';
import { AppBrandLogo, APP_BRAND_NAME, APP_BRAND_TAGLINE } from '@/components/AppBrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { ThemeColors } from '@/theme/tokens';

type NavItem = { name: string; route: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] };
type NavSection = { label: string; items: NavItem[] };
const NAV_SECTIONS: NavSection[] = [
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
    label: 'MENU & STOCK',
    items: [
      { name: 'menu/index',        route: '/(app)/menu',        label: 'Menu Items',  icon: 'restaurant-outline'   as const },
      { name: 'categories/index',  route: '/(app)/categories',  label: 'Categories',  icon: 'folder-outline'       as const },
      { name: 'items/index',       route: '/(app)/items',       label: 'Items',       icon: 'fast-food-outline'    as const },
      { name: 'inventory/index',   route: '/(app)/inventory',   label: 'Inventory',   icon: 'cube-outline'         as const },
    ],
  },
  {
    label: 'CUSTOMERS',
    items: [
      { name: 'customers/index',    route: '/(app)/customers',    label: 'Customers',    icon: 'people-outline'       as const },
      { name: 'reservations/index', route: '/(app)/reservations', label: 'Reservations', icon: 'calendar-outline'     as const },
      { name: 'invoices/index',     route: '/(app)/invoices',     label: 'Invoices',     icon: 'document-text-outline' as const },
      { name: 'payments/index',     route: '/(app)/payments',     label: 'Payments',     icon: 'card-outline'          as const },
    ],
  },
  {
    label: 'PROMOTIONS',
    items: [
      { name: 'coupons/index', route: '/(app)/coupons', label: 'Coupons', icon: 'pricetag-outline' as const },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { name: 'expenses/index',       route: '/(app)/expenses',       label: 'Expenses',       icon: 'wallet-outline'      as const },
      { name: 'expense-report/index', route: '/(app)/expense-report', label: 'Expense Report', icon: 'stats-chart-outline' as const },
    ],
  },
  {
    label: 'SUPPORT',
    items: [
      { name: 'tickets/index', route: '/(app)/tickets', label: 'Tickets', icon: 'headset-outline' as const },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { name: 'reports/index', route: '/(app)/reports', label: 'Reports', icon: 'bar-chart-outline' as const },
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
  const { colors } = useTheme();
  const color = isSyncing ? colors.warning : isOnline ? colors.success : colors.danger;
  return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
}

const NAV_BADGE_KEY: Record<string, string> = {
  'orders/index': 'pending',
  'kitchen/index': 'preparing,confirmed',
};

function createSidebarStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { width: 220, backgroundColor: c.sidebar, height: '100%', overflow: 'hidden' },
    blobTop: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(201,165,42,0.07)' },
    blobBottom: { position: 'absolute', bottom: -40, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(201,165,42,0.05)' },
    brand: { alignItems: 'center', paddingTop: 10, paddingHorizontal: 16 },
    logoWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    ring1: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(201,165,42,0.45)' },
    ring2: { position: 'absolute', width: 62, height: 62, borderRadius: 31, borderWidth: 1, borderColor: 'rgba(201,165,42,0.15)' },
    logo: { width: 42, height: 42, borderRadius: 21, zIndex: 1 },
    restName: { color: c.brandName, fontWeight: '800', fontSize: 10, letterSpacing: 1.5, textAlign: 'center' },
    restSub: { color: c.brandTagline, fontSize: 9, marginTop: 1, letterSpacing: 1.2 },
    restContext: { color: c.sidebarTextMuted, fontSize: 8.5, marginTop: 3, letterSpacing: 0.5, maxWidth: 180, textAlign: 'center' },
    divider: { width: 28, height: 2, backgroundColor: 'rgba(201,165,42,0.35)', borderRadius: 1, marginTop: 6, marginBottom: 2 },
    navScroll: { flex: 1, paddingTop: 2 },
    navSection: { color: c.sidebarTextMuted, fontSize: 8.5, fontWeight: '700', letterSpacing: 2, paddingHorizontal: 18, marginBottom: 2, marginTop: 8, opacity: 0.55 },
    navItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, marginHorizontal: 8, borderRadius: 8, marginBottom: 1, position: 'relative', overflow: 'hidden' },
    navItemActive: { backgroundColor: 'rgba(201,165,42,0.12)' },
    activeBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, backgroundColor: c.brandName, borderRadius: 2 },
    iconBox: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8 },
    iconBoxActive: { backgroundColor: 'rgba(201,165,42,0.18)' },
    navLabel: { fontSize: 12.5, fontWeight: '500', color: c.sidebarTextMuted, flex: 1 },
    navLabelActive: { color: c.sidebarText, fontWeight: '700' },
    footer: { paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.sidebarBorder },
    footerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, fontWeight: '600' },
    logoutBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center' },
    navBadge: { marginLeft: 'auto', backgroundColor: c.brandName, borderRadius: 999, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
    navBadgeText: { fontSize: 9.5, fontWeight: '800', color: c.sidebar },
  });
}

function Sidebar() {
  const restaurant = useAppStore((s) => s.restaurant);
  const { isSyncing, isOnline, clearAuth } = useAppStore();
  const { colors } = useTheme();
  const sb = useMemo(() => createSidebarStyles(colors), [colors]);
  const pathname = usePathname();

  // Live order counts for nav badges
  const [navCounts, setNavCounts] = React.useState<Record<string, number>>({});
  useEffect(() => {
    async function fetchCounts() {
      try {
        const { ordersApi } = await import('@/api/orders');
        const res = await ordersApi.list({ per_page: 200 });
        const data: any[] = res.data?.data ?? res.data ?? [];
        const pending  = data.filter((o: any) => o.status === 'pending').length;
        const kitchen  = data.filter((o: any) => ['preparing', 'confirmed'].includes(o.status)).length;
        setNavCounts({ 'orders/index': pending, 'kitchen/index': kitchen });
      } catch { /* offline */ }
    }
    fetchCounts();
    const t = setInterval(fetchCounts, 60_000);
    return () => clearInterval(t);
  }, []);

  function isActive(name: string) {
    const segment = name.replace('/index', '').split('/')[0];
    return pathname.includes(segment);
  }

  function handleLogout() {
    clearAuth();
    router.replace('/(auth)/login' as any);
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
          <AppBrandLogo size={42} style={sb.logo} />
        </View>
        <Text style={sb.restName} numberOfLines={2}>
          {APP_BRAND_NAME}
        </Text>
        <Text style={sb.restSub}>{APP_BRAND_TAGLINE}</Text>
        {restaurant?.name ? (
          <Text style={sb.restContext} numberOfLines={1}>{restaurant.name}</Text>
        ) : null}
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
                <Pressable
                  key={item.name}
                  onPress={() => router.push(item.route as any)}
                  style={({ pressed }) => [sb.navItem, active && sb.navItemActive, pressed && { opacity: 0.75 }]}
                >
                  {active && <View style={sb.activeBar} />}
                  <View style={[sb.iconBox, active && sb.iconBoxActive]}>
                    <Ionicons name={item.icon} size={14} color={active ? colors.brandName : colors.sidebarTextMuted} />
                  </View>
                  <Text style={[sb.navLabel, active && sb.navLabelActive]}>{item.label}</Text>
                  {active && item.name === 'pos/index' && (
                    <View style={{ marginLeft: 'auto' }}><SyncDot /></View>
                  )}
                  {!active && navCounts[item.name] > 0 && (
                    <View style={sb.navBadge}>
                      <Text style={sb.navBadgeText}>{navCounts[item.name]}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Status footer */}
      <View style={sb.footer}>
        <View style={sb.footerTop}>
          <View style={[sb.statusPill, { backgroundColor: isOnline ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }]}>
            <View style={[sb.statusDot, { backgroundColor: isOnline ? colors.success : colors.danger }]} />
            <Text style={[sb.statusText, { color: isOnline ? colors.success : colors.danger }]}>
              {isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          <ThemeToggle variant="sidebar" size={16} />
          <Pressable style={({ pressed }) => [sb.logoutBtn, pressed && { opacity: 0.7 }]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={16} color="#f87171" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function HeaderActions() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 16 }}>
      <ThemeToggle variant="header" size={16} />
      <SyncDot />
    </View>
  );
}

function RestaurantHeader() {
  const { colors, isDark } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <AppBrandLogo size={34} />
      <View>
        <Text style={{ color: isDark ? colors.brandName : colors.brandDark, fontWeight: '800', fontSize: 13, letterSpacing: 1 }}>
          {APP_BRAND_NAME}
        </Text>
        <Text style={{ color: isDark ? colors.brandTagline : colors.textMuted, fontSize: 11 }}>
          {APP_BRAND_TAGLINE}
        </Text>
      </View>
    </View>
  );
}

export default function AppLayout() {
  const { width } = useWindowDimensions();
  const isLarge = width >= 640;
  const token = useAppStore((s) => s.token);
  const store = useAppStore();
  const { colors } = useTheme();
  const pathname = usePathname();
  const isPOS = pathname.includes('/pos');

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
    // Initialise online state immediately — without this, isOnline stays false
    // on first load and all orders fall through to offline-save incorrectly.
    store.setOnline(navigator.onLine);
    if (navigator.onLine && token) webSyncService.sync().catch(console.warn);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token]);

  const tabScreenOptions = {
    headerStyle: { backgroundColor: colors.header },
    headerTintColor: colors.headerText,
    headerTitleStyle: { fontWeight: '700' as const },
    tabBarStyle: { display: 'none' as const },
    sceneStyle: { backgroundColor: colors.background },
  };

  if (isLarge) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
        {!isPOS && <Sidebar />}
        <View style={{ flex: 1 }}>
          <Tabs screenOptions={tabScreenOptions}>
            <Tabs.Screen name="dashboard/index" options={{ headerShown: false }} />
            <Tabs.Screen name="pos/index" options={{ headerShown: false }} />
            <Tabs.Screen name="kitchen/index"    options={{ title: 'Kitchen Display' }} />
            <Tabs.Screen name="orders/index"     options={{ title: 'Orders' }} />
            <Tabs.Screen name="tables/index"     options={{ title: 'Tables' }} />
            <Tabs.Screen name="customers/index"      options={{ title: 'Customers' }} />
            <Tabs.Screen name="reservations/index"  options={{ title: 'Reservations' }} />
            <Tabs.Screen name="menu/index"          options={{ title: 'Menu Items' }} />
            <Tabs.Screen name="categories/index"    options={{ title: 'Categories' }} />
            <Tabs.Screen name="items/index"         options={{ title: 'Items' }} />
            <Tabs.Screen name="inventory/index"     options={{ title: 'Inventory' }} />
            <Tabs.Screen name="invoices/index"      options={{ title: 'Invoices' }} />
            <Tabs.Screen name="payments/index"      options={{ title: 'Payments' }} />
            <Tabs.Screen name="coupons/index"       options={{ title: 'Coupons' }} />
            <Tabs.Screen name="expenses/index"      options={{ title: 'Expenses' }} />
            <Tabs.Screen name="expense-report/index" options={{ title: 'Expense Report' }} />
            <Tabs.Screen name="tickets/index"       options={{ title: 'Support Tickets' }} />
            <Tabs.Screen name="reports/index"       options={{ title: 'Reports' }} />
            <Tabs.Screen name="settings/index"      options={{ title: 'Settings' }} />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.header },
      headerTintColor: colors.headerText,
      headerTitleStyle: { fontWeight: '700' },
      tabBarActiveTintColor: colors.tabActive,
      tabBarInactiveTintColor: colors.tabInactive,
      tabBarStyle: {
        backgroundColor: colors.tabBar,
        borderTopColor: colors.tabBarBorder,
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
      },
      sceneStyle: { backgroundColor: colors.background },
    }}>
      <Tabs.Screen name="dashboard/index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />, tabBarLabel: 'Home', headerShown: false }} />
      <Tabs.Screen name="pos/index" options={{ headerTitle: () => <RestaurantHeader />, tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size} />, tabBarLabel: 'POS', headerRight: () => <HeaderActions /> }} />
      <Tabs.Screen name="kitchen/index" options={{ title: 'Kitchen', tabBarIcon: ({ color, size }) => <Ionicons name="flame-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="orders/index" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="tables/index" options={{ title: 'Tables', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="customers/index"       options={{ title: 'Customers',      tabBarButton: () => null }} />
      <Tabs.Screen name="reservations/index"   options={{ title: 'Reservations',   tabBarButton: () => null }} />
      <Tabs.Screen name="menu/index"           options={{ title: 'Menu',           tabBarButton: () => null }} />
      <Tabs.Screen name="categories/index"     options={{ title: 'Categories',     tabBarButton: () => null }} />
      <Tabs.Screen name="items/index"          options={{ title: 'Items',          tabBarButton: () => null }} />
      <Tabs.Screen name="inventory/index"      options={{ title: 'Inventory',      tabBarButton: () => null }} />
      <Tabs.Screen name="invoices/index"       options={{ title: 'Invoices',       tabBarButton: () => null }} />
      <Tabs.Screen name="payments/index"       options={{ title: 'Payments',       tabBarButton: () => null }} />
      <Tabs.Screen name="coupons/index"        options={{ title: 'Coupons',        tabBarButton: () => null }} />
      <Tabs.Screen name="expenses/index"       options={{ title: 'Expenses',       tabBarButton: () => null }} />
      <Tabs.Screen name="expense-report/index" options={{ title: 'Expense Report', tabBarButton: () => null }} />
      <Tabs.Screen name="tickets/index"        options={{ title: 'Support Tickets',    tabBarButton: () => null }} />
      <Tabs.Screen name="reports/index"        options={{ title: 'Reports',        tabBarButton: () => null }} />
      <Tabs.Screen name="settings/index"       options={{ title: 'Settings',       tabBarButton: () => null }} />
    </Tabs>
  );
}
