import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import { deleteItem } from '@/utils/storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/appStore';
import { syncService } from '@/sync/SyncService';

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={16} color="#1A2B1A" />
      </View>
      <View style={s.infoText}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { user, restaurant, isOnline, isSyncing, lastSyncedAt, clearAuth, taxes } = useAppStore();

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

  const syncColor = isSyncing ? '#f59e0b' : isOnline ? '#22c55e' : '#ef4444';
  const syncLabel = isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline';

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* User profile card */}
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
          <Ionicons name="shield-checkmark-outline" size={12} color="#C9A52A" />
          <Text style={s.roleText}>{user?.role?.toUpperCase() ?? 'STAFF'}</Text>
        </View>
      </View>

      {/* Restaurant section */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="storefront-outline" size={15} color="#1A2B1A" />
          <Text style={s.sectionTitle}>Restaurant</Text>
        </View>
        <View style={s.card}>
          <Text style={s.restName}>{restaurant?.name ?? '—'}</Text>
          {restaurant?.phone ? <InfoRow icon="call-outline" label="Phone" value={restaurant.phone} /> : null}
          {restaurant?.address ? <InfoRow icon="location-outline" label="Address" value={restaurant.address} /> : null}
          {restaurant?.gst_number ? <InfoRow icon="document-text-outline" label="GST Number" value={restaurant.gst_number} /> : null}
          <InfoRow icon="cash-outline" label="Currency" value={restaurant?.currency ?? 'INR'} />
          {taxes.length > 0 ? <InfoRow icon="receipt-outline" label="Tax" value={`${taxes[0].name} (${taxes[0].rate}%)`} /> : null}
        </View>
      </View>

      {/* Sync status section */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="sync-outline" size={15} color="#1A2B1A" />
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
          <TouchableOpacity
            style={[s.syncBtn, (!isOnline || isSyncing) && { opacity: 0.5 }]}
            onPress={handleSync}
            disabled={!isOnline || isSyncing}
            activeOpacity={0.8}
          >
            <Ionicons name={isSyncing ? 'sync' : 'sync-outline'} size={18} color="#C9A52A" />
            <Text style={s.syncBtnText}>{isSyncing ? 'Syncing...' : 'Sync Now'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* App info */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="information-circle-outline" size={15} color="#1A2B1A" />
          <Text style={s.sectionTitle}>About</Text>
        </View>
        <View style={s.card}>
          <InfoRow icon="phone-portrait-outline" label="App" value="GTC POS v1.0" />
          <InfoRow icon="leaf-outline" label="Platform" value={Platform.OS === 'web' ? 'Web Browser' : Platform.OS === 'ios' ? 'iOS' : 'Android'} />
        </View>
      </View>

      {/* Logout */}
      <View style={s.dangerZone}>
        <Text style={s.dangerLabel}>DANGER ZONE</Text>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          <Text style={s.logoutText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={16} color="#dc2626" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F4' },
  content: { paddingBottom: 48 },

  // Profile card
  profileCard: {
    backgroundColor: '#1A2B1A', alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24,
    overflow: 'hidden',
  },
  blobTop: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(201,165,42,0.08)' },
  avatarWrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarRing: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: 'rgba(201,165,42,0.4)' },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#C9A52A', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#1A2B1A' },
  userName: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  userEmail: { fontSize: 14, color: '#7A9A7A', marginBottom: 12 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(201,165,42,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  roleText: { fontSize: 11, fontWeight: '700', color: '#C9A52A', letterSpacing: 1 },

  // Sections
  section: { marginTop: 20, paddingHorizontal: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1A2B1A', letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 4, paddingHorizontal: 16, shadowColor: '#1A2B1A', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  restName: { fontSize: 18, fontWeight: '800', color: '#0F172A', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', marginBottom: 4 },

  // Info rows
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  infoIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F0F7F0', alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 1 },
  infoValue: { fontSize: 14, color: '#0F172A', fontWeight: '500' },

  // Sync
  syncStatus: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', marginBottom: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  syncStatusLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  syncTime: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  statusPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: '600' },
  syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1A2B1A', borderRadius: 12, paddingVertical: 13, marginVertical: 10 },
  syncBtnText: { color: '#C9A52A', fontWeight: '700', fontSize: 15 },

  // Danger zone
  dangerZone: { marginTop: 24, marginHorizontal: 14 },
  dangerLabel: { fontSize: 10, fontWeight: '700', color: '#dc2626', letterSpacing: 1.5, marginBottom: 8 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16,
    borderWidth: 1.5, borderColor: '#fee2e2',
    shadowColor: '#dc2626', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  logoutText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
});
