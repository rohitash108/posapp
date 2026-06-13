import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import { deleteItem } from '@/utils/storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/store/themeStore';
import { syncService } from '@/sync/SyncService';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { ThemeColors } from '@/theme/tokens';

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingBottom: 48 },
    profileCard: {
      backgroundColor: c.sidebar, alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24,
      overflow: 'hidden',
    },
    blobTop: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(201,165,42,0.08)' },
    avatarWrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    avatarRing: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: 'rgba(201,165,42,0.4)' },
    avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 26, fontWeight: '800', color: c.sidebar },
    userName: { fontSize: 20, fontWeight: '800', color: c.sidebarText, marginBottom: 4 },
    userEmail: { fontSize: 14, color: c.sidebarTextMuted, marginBottom: 12 },
    roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(201,165,42,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    roleText: { fontSize: 11, fontWeight: '700', color: c.brand, letterSpacing: 1 },
    section: { marginTop: 20, paddingHorizontal: 14 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.heading, letterSpacing: 0.5 },
    card: {
      backgroundColor: c.surface, borderRadius: 16, paddingVertical: 4, paddingHorizontal: 16,
      shadowColor: c.dashboard.cardShadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    restName: { fontSize: 18, fontWeight: '800', color: c.heading, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, marginBottom: 4 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border },
    infoIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    infoText: { flex: 1 },
    infoLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 1 },
    infoValue: { fontSize: 14, color: c.heading, fontWeight: '500' },
    syncStatus: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, marginBottom: 4 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    syncStatusLabel: { fontSize: 15, fontWeight: '700', color: c.heading },
    syncTime: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    statusPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    statusPillText: { fontSize: 12, fontWeight: '600' },
    syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: c.sidebar, borderRadius: 12, paddingVertical: 13, marginVertical: 10 },
    syncBtnText: { color: c.brand, fontWeight: '700', fontSize: 15 },
    themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    themeLabel: { fontSize: 15, fontWeight: '600', color: c.heading },
    themeSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    dangerZone: { marginTop: 24, marginHorizontal: 14 },
    dangerLabel: { fontSize: 10, fontWeight: '700', color: '#dc2626', letterSpacing: 1.5, marginBottom: 8 },
    logoutBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface,
      borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16,
      borderWidth: 1.5, borderColor: '#fee2e2',
      shadowColor: '#dc2626', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    logoutText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
  });
}

function InfoRow({ icon, label, value, styles }: { icon: any; label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.brandDark} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { user, restaurant, isOnline, isSyncing, lastSyncedAt, clearAuth, taxes } = useAppStore();
  const { colors, mode, isDark } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  async function handleSync() {
    try { await syncService.manualSync(); Alert.alert('Done', 'Synced successfully!'); }
    catch (e: any) { Alert.alert('Failed', e?.message ?? 'Could not sync.'); }
  }

  async function doLogout() {
    try {
      const { authApi } = await import('@/api/auth');
      if (isOnline) await authApi.logout().catch(() => {});
    } catch {}
    await deleteItem('sanctum_token');
    await deleteItem('auth_user');
    await deleteItem('auth_restaurant');
    clearAuth();
    router.replace('/(auth)/login');
  }

  async function handleLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) await doLogout();
    } else {
      Alert.alert('Logout', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: doLogout },
      ]);
    }
  }

  const syncColor = isSyncing ? colors.warning : isOnline ? colors.success : colors.danger;
  const syncLabel = isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline';

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      <View style={s.profileCard}>
        <View style={s.blobTop} />
        <View style={s.avatarWrap}>
          <View style={s.avatarRing} />
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
        </View>
        <Text style={s.userName}>{user?.name ?? '—'}</Text>
        <Text style={s.userEmail}>{user?.email ?? '—'}</Text>
        <View style={s.roleBadge}>
          <Ionicons name="shield-checkmark-outline" size={12} color={colors.brand} />
          <Text style={s.roleText}>{user?.role?.toUpperCase() ?? 'STAFF'}</Text>
        </View>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="color-palette-outline" size={15} color={colors.heading} />
          <Text style={s.sectionTitle}>Appearance</Text>
        </View>
        <View style={s.card}>
          <View style={s.themeRow}>
            <View>
              <Text style={s.themeLabel}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
              <Text style={s.themeSub}>Same as web — tap to switch theme</Text>
            </View>
            <ThemeToggle variant="card" size={20} />
          </View>
          <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
            <View style={s.infoIcon}>
              <Ionicons name="moon-outline" size={16} color={colors.brandDark} />
            </View>
            <View style={s.infoText}>
              <Text style={s.infoLabel}>Current theme</Text>
              <Text style={s.infoValue}>{mode === 'dark' ? 'Dark' : 'Light'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="storefront-outline" size={15} color={colors.heading} />
          <Text style={s.sectionTitle}>Restaurant</Text>
        </View>
        <View style={s.card}>
          <Text style={s.restName}>{restaurant?.name ?? '—'}</Text>
          {restaurant?.phone ? <InfoRow icon="call-outline" label="Phone" value={restaurant.phone} styles={s} /> : null}
          {restaurant?.address ? <InfoRow icon="location-outline" label="Address" value={restaurant.address} styles={s} /> : null}
          {restaurant?.gst_number ? <InfoRow icon="document-text-outline" label="GST Number" value={restaurant.gst_number} styles={s} /> : null}
          <InfoRow icon="cash-outline" label="Currency" value={restaurant?.currency ?? 'INR'} styles={s} />
          {taxes.length > 0 ? <InfoRow icon="receipt-outline" label="Tax" value={`${taxes[0].name} (${taxes[0].rate}%)`} styles={s} /> : null}
        </View>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="sync-outline" size={15} color={colors.heading} />
          <Text style={s.sectionTitle}>Sync & Connectivity</Text>
        </View>
        <View style={s.card}>
          <View style={s.syncStatus}>
            <View style={[s.statusDot, { backgroundColor: syncColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.syncStatusLabel}>{syncLabel}</Text>
              {lastSyncedAt ? (
                <Text style={s.syncTime}>Last synced: {new Date(lastSyncedAt).toLocaleString()}</Text>
              ) : null}
            </View>
            <View style={[s.statusPill, { backgroundColor: syncColor + '18' }]}>
              <Text style={[s.statusPillText, { color: syncColor }]}>{syncLabel}</Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [s.syncBtn, (!isOnline || isSyncing) && { opacity: 0.5 }, pressed && { opacity: 0.75 }]}
            onPress={handleSync}
            disabled={!isOnline || isSyncing}
          >
            <Ionicons name={isSyncing ? 'sync' : 'sync-outline'} size={18} color={colors.brand} />
            <Text style={s.syncBtnText}>{isSyncing ? 'Syncing...' : 'Sync Now'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="information-circle-outline" size={15} color={colors.heading} />
          <Text style={s.sectionTitle}>About</Text>
        </View>
        <View style={s.card}>
          <InfoRow icon="phone-portrait-outline" label="App" value="GTC POS v1.0" styles={s} />
          <InfoRow icon="leaf-outline" label="Platform" value={Platform.OS === 'web' ? 'Web Browser' : Platform.OS === 'ios' ? 'iOS' : 'Android'} styles={s} />
        </View>
      </View>

      <View style={s.dangerZone}>
        <Text style={s.dangerLabel}>DANGER ZONE</Text>
        <Pressable style={({ pressed }) => [s.logoutBtn, pressed && { opacity: 0.75 }]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          <Text style={s.logoutText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={16} color="#dc2626" style={{ marginLeft: 'auto' }} />
        </Pressable>
      </View>

    </ScrollView>
  );
}
