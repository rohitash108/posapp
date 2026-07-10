import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Tabs, usePathname, router } from 'expo-router';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { useGlobalOrderPolling } from '@/hooks/useGlobalOrderPolling';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, useWindowDimensions, ScrollView, StyleSheet, Platform, Modal, Animated, TouchableWithoutFeedback } from 'react-native';
import { useAppStore } from '@/store/appStore';
import { useRestaurantAdmin } from '@/hooks/useRestaurantAdmin';
import { useOrderBadgeStore } from '@/store/orderBadgeStore';
import { useTicketBadgeStore } from '@/store/ticketBadgeStore';
import { ticketsApi } from '@/api/tickets';
import { useTheme } from '@/store/themeStore';
import { webSyncService } from '@/sync/WebSyncService';
import { AppBrandLogo, APP_BRAND_NAME, APP_BRAND_TAGLINE } from '@/components/AppBrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { ThemeColors } from '@/theme/tokens';

type NavItem = { name: string; route: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] };
type NavSection = { label?: string; items: NavItem[] };
const NAV_SECTIONS: NavSection[] = [
  {
    // No section label — top-level operations (matches csPos web order)
    items: [
      { name: 'dashboard/index',    route: '/(app)/dashboard',    label: 'Dashboard',     icon: 'apps-outline'          as const },
      { name: 'pos/index',          route: '/(app)/pos',          label: 'POS 2',         icon: 'grid-outline'          as const },
      { name: 'orders/index',       route: '/(app)/orders',       label: 'Orders',        icon: 'reorder-four-outline'  as const },
      { name: 'kitchen/index',      route: '/(app)/kitchen',      label: 'Kitchen (KDS)', icon: 'flame-outline'         as const },
    ],
  },
  {
    label: 'MENU',
    items: [
      { name: 'inventory/index',  route: '/(app)/inventory',  label: 'Stock',  icon: 'cube-outline' as const },
      { name: 'coupons/index',    route: '/(app)/coupons',    label: 'Coupons',    icon: 'pricetag-outline'      as const },
    ],
  },
  {
    label: 'CUSTOMERS',
    items: [
      { name: 'customers/index', route: '/(app)/customers', label: 'Customers', icon: 'person-outline'        as const },
      { name: 'invoices/index',  route: '/(app)/invoices',  label: 'Invoices',  icon: 'document-text-outline' as const },
      { name: 'payments/index',  route: '/(app)/payments',  label: 'Payments',  icon: 'cash-outline'          as const },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { name: 'expenses/index',       route: '/(app)/expenses',       label: 'Expenses',       icon: 'wallet-outline'    as const },
      { name: 'royalties/index',      route: '/(app)/royalties',      label: 'Royalty',        icon: 'ribbon-outline'    as const },
      { name: 'expense-report/index', route: '/(app)/expense-report', label: 'Expense Report', icon: 'pie-chart-outline' as const },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { name: 'reports/index', route: '/(app)/reports', label: 'Sales Reports', icon: 'bar-chart-outline' as const },
    ],
  },
  {
    label: 'SUPPORT',
    items: [
      { name: 'tickets/index', route: '/(app)/tickets', label: 'Tickets',    icon: 'briefcase-outline'  as const },
      { name: 'tickets-new',   route: '/(app)/tickets', label: 'New Ticket', icon: 'add-circle-outline' as const },
    ],
  },
];


function filteredNavSections(isRestaurantAdmin: boolean): NavSection[] {
  return NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => item.name !== 'royalties/index' || isRestaurantAdmin),
  }));
}

// Triple-beep alert matching CSPos order-bell (square wave, 5-note rising pattern × 3)
let ticketBeepLockedUntil = 0;
function playTicketBeep() {
  if (Platform.OS !== 'web') return;
  const wallNow = Date.now();
  if (wallNow < ticketBeepLockedUntil) return; // already playing
  ticketBeepLockedUntil = wallNow + 2700;       // 3 passes × 0.85s + margin
  try {
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t        = ctx.currentTime;
    const FREQS    = [1046, 1318, 1568, 1318, 1046];
    const PASS_GAP = 0.85;
    for (let pass = 0; pass < 3; pass++) {
      FREQS.forEach((freq: number, i: number) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t0 = t + pass * PASS_GAP + i * 0.13;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.65, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        osc.start(t0);
        osc.stop(t0 + 0.25);
      });
    }
  } catch { /* ignore — AudioContext unavailable */ }
}

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
  const isRestaurantAdmin = useRestaurantAdmin();
  const navSections = useMemo(() => filteredNavSections(isRestaurantAdmin), [isRestaurantAdmin]);
  const sb = useMemo(() => createSidebarStyles(colors), [colors]);
  const pathname = usePathname();

  // Nav badge counts — orders from orderBadgeStore, tickets from ticketBadgeStore.
  const { pendingCount, kitchenCount } = useOrderBadgeStore();
  const { unreadCount: ticketUnread } = useTicketBadgeStore();
  const navCounts: Record<string, number> = {
    'orders/index':  pendingCount,
    'kitchen/index': kitchenCount,
    'tickets/index': ticketUnread,
  };

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
        {navSections.map((section, sIdx) => (
          <View key={section.label || sIdx}>
            {section.label ? <Text style={sb.navSection}>{section.label}</Text> : null}
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

const TICKET_POLL_MS = 20_000;

// ── More Bottom Sheet ─────────────────────────────────────────────────────────
type MoreLink = { label: string; route: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string };
const MORE_SECTIONS: { title: string; links: MoreLink[] }[] = [
  {
    title: 'OPERATIONS',
    links: [
      { label: 'Dashboard',   route: '/(app)/dashboard',    icon: 'apps-outline',      color: '#1A2B1A' },
      { label: 'Kitchen',     route: '/(app)/kitchen',      icon: 'flame-outline',     color: '#ea580c' },
      { label: 'Tables',      route: '/(app)/tables',       icon: 'grid-outline',      color: '#7c3aed' },
    ],
  },
  {
    title: 'MENU',
    links: [
      { label: 'Stock',  route: '/(app)/inventory',  icon: 'cube-outline',          color: '#64748b' },
      { label: 'Coupons',    route: '/(app)/coupons',    icon: 'pricetag-outline',      color: '#db2777' },
    ],
  },
  {
    title: 'CUSTOMERS',
    links: [
      { label: 'Customers',  route: '/(app)/customers', icon: 'people-outline',        color: '#16a34a' },
      { label: 'Invoices',   route: '/(app)/invoices',  icon: 'document-text-outline', color: '#4f46e5' },
      { label: 'Payments',   route: '/(app)/payments',  icon: 'card-outline',          color: '#0284c7' },
      ...(Platform.OS !== 'web' ? [{ label: 'Wallet', route: '/(app)/wallet', icon: 'wallet-outline', color: '#d97706' } as MoreLink] : []),
    ],
  },
  {
    title: 'FINANCE',
    links: [
      { label: 'Expenses',   route: '/(app)/expenses',       icon: 'wallet-outline',      color: '#ca8a04' },
      { label: 'Royalty',    route: '/(app)/royalties',      icon: 'ribbon-outline',      color: '#9333ea' },
      { label: 'Exp. Report',route: '/(app)/expense-report', icon: 'stats-chart-outline', color: '#059669' },
      { label: 'Reports',    route: '/(app)/reports',        icon: 'bar-chart-outline',   color: '#2563eb' },
    ],
  },
  {
    title: 'ADMIN',
    links: [
      { label: 'Tickets',       route: '/(app)/tickets',       icon: 'headset-outline',       color: '#9333ea' },
      { label: 'Notifications', route: '/(app)/notifications', icon: 'notifications-outline', color: '#f59e0b' },
      { label: 'Staff',         route: '/(app)/staff',         icon: 'people-circle-outline', color: '#0f766e' },
      { label: 'Settings',      route: '/(app)/settings',      icon: 'settings-outline',      color: '#475569' },
    ],
  },
];

function filteredMoreSections(isRestaurantAdmin: boolean) {
  return MORE_SECTIONS.map(section => ({
    ...section,
    links: section.links.filter(link => link.route !== '/(app)/royalties' || isRestaurantAdmin),
  }));
}

function MoreBottomSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const isRestaurantAdmin = useRestaurantAdmin();
  const moreSections = useMemo(() => filteredMoreSections(isRestaurantAdmin), [isRestaurantAdmin]);
  const slideY = useRef(new Animated.Value(700)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
        Animated.timing(backdropOp, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 700, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropOp, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  function navigate(route: string) {
    onClose();
    setTimeout(() => router.push(route as any), 50);
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[ms.backdrop, { opacity: backdropOp }]} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View style={[ms.sheet, { backgroundColor: colors.background, transform: [{ translateY: slideY }] }]}>
        {/* Handle */}
        <View style={ms.handleWrap}>
          <View style={[ms.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <View style={[ms.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[ms.sheetTitle, { color: colors.text }]}>All Modules</Text>
          <Pressable onPress={onClose} style={ms.closeBtn}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ms.scrollContent}>
          {moreSections.map(section => (
            <View key={section.title} style={ms.section}>
              <Text style={[ms.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
              <View style={[ms.grid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {section.links.map(link => (
                  <Pressable
                    key={link.route}
                    style={({ pressed }) => [ms.tile, pressed && { opacity: 0.65, transform: [{ scale: 0.95 }] }]}
                    onPress={() => navigate(link.route)}
                  >
                    <View style={[ms.iconWrap, { backgroundColor: link.color + '1a' }]}>
                      <Ionicons name={link.icon} size={17} color={link.color} />
                    </View>
                    <Text style={[ms.tileLabel, { color: colors.text }]} numberOfLines={2}>{link.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 24 },
  handleWrap:   { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:       { width: 36, height: 4, borderRadius: 2 },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1 },
  sheetTitle:   { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  closeBtn:     { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  scrollContent:{ paddingHorizontal: 14, paddingTop: 10 },
  section:      { marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6, paddingLeft: 2 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, borderWidth: 1, padding: 4 },
  tile:         { width: '25%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 2 },
  iconWrap:     { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  tileLabel:    { fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 13 },
});

export default function AppLayout() {
  const { width } = useWindowDimensions();
  const isLarge = width >= 640;
  const token = useAppStore((s) => s.token);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  // Proactively refresh the Sanctum token when the app returns to foreground
  // after a long absence, preventing the first API call from hitting a 401.
  useTokenRefresh();
  useGlobalOrderPolling();
  const store = useAppStore();
  const { colors } = useTheme();
  const pathname = usePathname();
  const isPOS = pathname.includes('/pos');

  // Ticket notification polling — matches CSPos 20-second interval.
  // lastKnownCount ref prevents beeping on the very first poll (page load/resume).
  const lastKnownTicketCount = useRef<number | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function pollTickets() {
      if (cancelled) return;
      try {
        const res = await ticketsApi.notificationsUnread();
        const count: number = res.data?.count ?? 0;
        useTicketBadgeStore.getState().setUnreadCount(count);
        // Beep only when count increases from a previously-known value
        if (lastKnownTicketCount.current !== null && count > lastKnownTicketCount.current) {
          playTicketBeep();
        }
        lastKnownTicketCount.current = count;
      } catch { /* ignore network errors */ }
    }

    pollTickets();
    const timer = setInterval(pollTickets, TICKET_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [token]);

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
            <Tabs.Screen name="kitchen/index"    options={{ headerShown: false }} />
            <Tabs.Screen name="orders/index"     options={{ title: 'Orders' }} />
            <Tabs.Screen name="tables/index"     options={{ title: 'Tables' }} />
            <Tabs.Screen name="customers/index"      options={{ headerShown: false }} />
            <Tabs.Screen name="wallet/index"        options={{ title: 'Wallet' }} />
            <Tabs.Screen name="reservations/index"  options={{ headerShown: false }} />
            <Tabs.Screen name="menu/index"          options={{ headerShown: false }} />
            <Tabs.Screen name="categories/index"    options={{ headerShown: false }} />
            <Tabs.Screen name="items/index"         options={{ headerShown: false }} />
            <Tabs.Screen name="inventory/index"     options={{ headerShown: false }} />
            <Tabs.Screen name="invoices/index"      options={{ headerShown: false }} />
            <Tabs.Screen name="payments/index"      options={{ headerShown: false }} />
            <Tabs.Screen name="coupons/index"       options={{ headerShown: false }} />
            <Tabs.Screen name="expenses/index"      options={{ headerShown: false }} />
            <Tabs.Screen name="royalties/index"     options={{ headerShown: false }} />
            <Tabs.Screen name="expense-report/index" options={{ headerShown: false }} />
            <Tabs.Screen name="tickets/index"       options={{ headerShown: false }} />
            <Tabs.Screen name="reports/index"       options={{ title: 'Reports' }} />
            <Tabs.Screen name="staff/index"         options={{ title: 'Staff' }} />
            <Tabs.Screen name="notifications/index" options={{ title: 'Notifications' }} />
            <Tabs.Screen name="more/index"          options={{ title: 'All Modules', headerShown: false }} />
            <Tabs.Screen name="settings/index"      options={{ title: 'Settings' }} />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <>
    <MoreBottomSheet visible={moreSheetOpen} onClose={() => setMoreSheetOpen(false)} />
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
      <Tabs.Screen name="pos/index" options={{ headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size} />, tabBarLabel: 'POS' }} />
      <Tabs.Screen name="kitchen/index" options={{ title: 'Kitchen', headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="orders/index" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} />, tabBarLabel: 'Orders' }} />
      <Tabs.Screen name="more/index" options={{ title: 'More', tabBarLabel: 'More', headerShown: false, tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal-circle-outline" color={color} size={24} />, tabBarButton: (props) => <Pressable {...(props as any)} onPress={() => setMoreSheetOpen(true)} /> }} />
      <Tabs.Screen name="tables/index" options={{ title: 'Tables', headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="customers/index"       options={{ title: 'Customers',      headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="wallet/index"         options={{ title: 'Wallet',         headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="reservations/index"   options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="menu/index"           options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="categories/index"     options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="items/index"          options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="inventory/index"      options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="invoices/index"       options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="payments/index"       options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="coupons/index"        options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="expenses/index"       options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="royalties/index"      options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="expense-report/index" options={{ headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="tickets/index"        options={{ title: 'Support Tickets',    headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="reports/index"        options={{ title: 'Reports',        tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="staff/index"          options={{ title: 'Staff',          headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="notifications/index"  options={{ title: 'Notifications',  headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="settings/index"       options={{ title: 'Settings',       headerShown: false, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
    </Tabs>
    </>
  );
}
