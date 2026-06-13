/**
 * Settings Screen — Professional redesign
 * Profile hero · Restaurant info · Appearance · Sync · About · Logout
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Alert,
  ScrollView, Platform, Modal, ActivityIndicator,
} from 'react-native';
import { deleteItem } from '@/utils/storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/store/themeStore';
import { syncService } from '@/sync/SyncService';
import { ThemeToggle } from '@/components/ThemeToggle';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FOREST  = '#1A2B1A';
const GOLD    = '#C9A52A';
const PRIMARY = '#2563eb';

// ── Row components ────────────────────────────────────────────────────────────
function SettingRow({
  icon, iconBg, iconColor, label, value, last, right,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value?: string;
  last?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View style={[row.wrap, last && { borderBottomWidth: 0 }]}>
      <View style={[row.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={row.label}>{label}</Text>
      <View style={row.right}>
        {right ?? (value ? <Text style={row.value} numberOfLines={1}>{value}</Text> : null)}
      </View>
    </View>
  );
}

function PressableRow({
  icon, iconBg, iconColor, label, sub, onPress, last, chevron = true, danger,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  sub?: string;
  onPress: () => void;
  last?: boolean;
  chevron?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [row.wrap, last && { borderBottomWidth: 0 }, pressed && { backgroundColor: '#f8fafc' }]}
      onPress={onPress}>
      <View style={[row.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[row.label, danger && { color: '#dc2626' }]}>{label}</Text>
        {sub ? <Text style={row.sub}>{sub}</Text> : null}
      </View>
      {chevron && <Ionicons name="chevron-forward" size={16} color="#d1d5db" />}
    </Pressable>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={sec.wrap}>
      <View style={sec.header}>
        <Ionicons name={icon as any} size={13} color="#9ca3af" />
        <Text style={sec.title}>{title}</Text>
      </View>
      <View style={sec.card}>{children}</View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { user, restaurant, isOnline, isSyncing, lastSyncedAt, clearAuth, taxes } = useAppStore();
  const { isDark, toggleMode, mode } = useTheme();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut,      setLoggingOut]      = useState(false);

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const syncColor = isSyncing ? '#d97706' : isOnline ? '#16a34a' : '#ef4444';
  const syncLabel = isSyncing ? 'Syncing…' : isOnline ? 'Online' : 'Offline';
  const syncIcon  = isSyncing ? 'sync' : isOnline ? 'wifi' : 'wifi-outline';

  async function handleSync() {
    try {
      await syncService.manualSync();
      if (Platform.OS === 'web') window.alert('Synced successfully!');
      else Alert.alert('Done', 'Synced successfully!');
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e?.message ?? 'Could not sync.');
      else Alert.alert('Sync Failed', e?.message ?? 'Could not sync.');
    }
  }

  async function doLogout() {
    setLoggingOut(true);
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

  function handleLogout() {
    setShowLogoutModal(true);
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}>

      {/* ── Profile Hero ─────────────────────────────────────────────────── */}
      <View style={s.hero}>
        {/* Decorative circles */}
        <View style={s.deco1} />
        <View style={s.deco2} />
        <View style={s.deco3} />

        {/* Avatar */}
        <View style={s.avatarOuter}>
          <View style={s.avatarRing} />
          <View style={s.avatar}>
            <Text style={s.avatarInitials}>{initials}</Text>
          </View>
        </View>

        {/* Name / email */}
        <Text style={s.heroName}>{user?.name ?? '—'}</Text>
        <Text style={s.heroEmail}>{user?.email ?? '—'}</Text>

        {/* Role + online badges */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={s.roleBadge}>
            <Ionicons name="shield-checkmark" size={11} color={GOLD} />
            <Text style={s.roleTxt}>{(user?.role ?? 'staff').toUpperCase()}</Text>
          </View>
          <View style={[s.onlineBadge, { backgroundColor: syncColor + '20', borderColor: syncColor + '50' }]}>
            <View style={[s.onlineDot, { backgroundColor: syncColor }]} />
            <Text style={[s.onlineTxt, { color: syncColor }]}>{syncLabel}</Text>
          </View>
        </View>
      </View>

      {/* ── Restaurant ───────────────────────────────────────────────────── */}
      <Section title="RESTAURANT" icon="storefront-outline">
        <View style={sec.restNameRow}>
          <View style={[sec.restIcon, { backgroundColor: 'rgba(26,43,26,0.07)' }]}>
            <Ionicons name="restaurant-outline" size={18} color={FOREST} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={sec.restName}>{restaurant?.name ?? '—'}</Text>
            {restaurant?.address
              ? <Text style={sec.restAddr} numberOfLines={2}>{restaurant.address}</Text>
              : null}
          </View>
        </View>

        {restaurant?.phone
          ? <SettingRow icon="call-outline"         iconBg="#f0fdf4" iconColor="#16a34a" label="Phone"    value={restaurant.phone} />
          : null}
        {restaurant?.gst_number
          ? <SettingRow icon="document-text-outline" iconBg="#eff6ff" iconColor={PRIMARY}  label="GSTIN"    value={restaurant.gst_number} />
          : null}
        <SettingRow icon="cash-outline"           iconBg="#fef9ec" iconColor="#d97706" label="Currency" value={restaurant?.currency ?? 'INR'} />
        {taxes.length > 0
          ? <SettingRow icon="receipt-outline"    iconBg="#f5f3ff" iconColor="#7c3aed" label="Tax"      value={`${taxes[0].name} · ${taxes[0].rate}%`} last />
          : <SettingRow icon="receipt-outline"    iconBg="#f5f3ff" iconColor="#7c3aed" label="Tax"      value="Not configured" last />
        }
      </Section>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <Section title="APPEARANCE" icon="color-palette-outline">
        <SettingRow
          icon={isDark ? 'moon' : 'sunny-outline'}
          iconBg={isDark ? '#1e1b4b' : '#fef9ec'}
          iconColor={isDark ? '#a5b4fc' : '#d97706'}
          label={isDark ? 'Dark Mode' : 'Light Mode'}
          value={mode === 'dark' ? 'Dark' : 'Light'}
          last
          right={<ThemeToggle variant="card" size={18} />}
        />
      </Section>

      {/* ── Sync & Connectivity ──────────────────────────────────────────── */}
      <Section title="SYNC & CONNECTIVITY" icon="sync-outline">
        {/* Status row */}
        <View style={[row.wrap]}>
          <View style={[row.iconBox, { backgroundColor: syncColor + '15' }]}>
            <Ionicons name={syncIcon as any} size={16} color={syncColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[row.label, { color: syncColor, fontWeight: '700' }]}>{syncLabel}</Text>
            {lastSyncedAt
              ? <Text style={row.sub}>Last synced: {new Date(lastSyncedAt).toLocaleString()}</Text>
              : <Text style={row.sub}>Not yet synced this session</Text>}
          </View>
          <View style={[s.statusPill, { backgroundColor: syncColor + '15', borderColor: syncColor + '40' }]}>
            <View style={[s.statusDot, { backgroundColor: syncColor }]} />
            <Text style={[s.statusPillTxt, { color: syncColor }]}>{syncLabel}</Text>
          </View>
        </View>

        {/* Sync button */}
        <Pressable
          style={({ pressed }) => [
            s.syncBtn,
            (!isOnline || isSyncing) && { opacity: 0.45 },
            pressed && { opacity: 0.75 },
          ]}
          onPress={handleSync}
          disabled={!isOnline || isSyncing}>
          <Ionicons name={isSyncing ? 'sync' : 'sync-outline'} size={17} color={GOLD} />
          <Text style={s.syncBtnTxt}>{isSyncing ? 'Syncing…' : 'Sync Now'}</Text>
        </Pressable>

        <View style={[row.wrap, { borderBottomWidth: 0 }]}>
          <View style={[row.iconBox, { backgroundColor: '#f0f9ff' }]}>
            <Ionicons name="server-outline" size={16} color="#0284c7" />
          </View>
          <Text style={row.label}>Server</Text>
          <Text style={[row.value, { fontSize: 11, maxWidth: 200 }]} numberOfLines={1}>restaurant.softwar.in</Text>
        </View>
      </Section>

      {/* ── About ────────────────────────────────────────────────────────── */}
      <Section title="ABOUT" icon="information-circle-outline">
        <SettingRow
          icon="phone-portrait-outline"
          iconBg="#f0f9ff"
          iconColor="#0284c7"
          label="Application"
          value="GTC POS"
        />
        <SettingRow
          icon="code-slash-outline"
          iconBg="#f5f3ff"
          iconColor="#7c3aed"
          label="Version"
          value="v1.0.0"
        />
        <SettingRow
          icon="layers-outline"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          label="Platform"
          value={
            Platform.OS === 'web'
              ? 'Web Browser'
              : Platform.OS === 'ios'
              ? 'iOS'
              : 'Android'
          }
          last
        />
      </Section>

      {/* ── Sign Out ─────────────────────────────────────────────────────── */}
      <View style={s.logoutSection}>
        <Pressable
          style={({ pressed }) => [s.logoutBtn, pressed && { opacity: 0.8 }]}
          onPress={handleLogout}>
          <View style={s.logoutIconWrap}>
            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          </View>
          <Text style={s.logoutTxt}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={16} color="#fca5a5" style={{ marginLeft: 'auto' }} />
        </Pressable>
        <Text style={s.logoutHint}>You can always log back in with your credentials.</Text>
      </View>

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerTxt}>GTC POS · Powered by Softwar.in</Text>
        <Text style={s.footerVersion}>Version 1.0.0 · {new Date().getFullYear()}</Text>
      </View>

      {/* ── Logout Confirmation Modal ──────────────────────────────────── */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => !loggingOut && setShowLogoutModal(false)}>
        <Pressable
          style={lm.backdrop}
          onPress={() => !loggingOut && setShowLogoutModal(false)}>
          <Pressable style={lm.panel} onPress={() => {}}>
            {/* Icon */}
            <View style={lm.iconWrap}>
              <Ionicons name="log-out-outline" size={28} color="#dc2626" />
            </View>

            {/* Text */}
            <Text style={lm.title}>Sign Out?</Text>
            <Text style={lm.body}>
              Are you sure you want to sign out of{'\n'}
              <Text style={lm.bold}>{user?.name ?? 'your account'}</Text>?
            </Text>

            {/* Divider */}
            <View style={lm.divider} />

            {/* Buttons */}
            <View style={lm.btnRow}>
              <Pressable
                style={({ pressed }) => [lm.cancelBtn, pressed && { opacity: 0.7 }]}
                disabled={loggingOut}
                onPress={() => setShowLogoutModal(false)}>
                <Text style={lm.cancelTxt}>Cancel</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [lm.logoutBtn, pressed && { opacity: 0.85 }]}
                disabled={loggingOut}
                onPress={doLogout}>
                {loggingOut ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={16} color="#fff" />
                    <Text style={lm.logoutTxt}>Yes, Sign Out</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#f0f2f7' },
  content: { paddingBottom: 56 },

  // Hero
  hero:          { backgroundColor: '#fff', alignItems: 'center', paddingTop: 36, paddingBottom: 28, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  deco1:         { position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(26,43,26,0.03)' },
  deco2:         { position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(26,43,26,0.02)' },
  deco3:         { position: 'absolute', top: 10, left: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(26,43,26,0.02)' },
  avatarOuter:   { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarRing:    { position: 'absolute', width: 94, height: 94, borderRadius: 47, borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed' },
  avatar:        { width: 76, height: 76, borderRadius: 38, backgroundColor: FOREST, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  avatarInitials:{ fontSize: 28, fontWeight: '900', color: GOLD },
  heroName:      { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
  heroEmail:     { fontSize: 13.5, color: '#6b7280', marginTop: 4, textAlign: 'center' },
  roleBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#bbf7d0' },
  roleTxt:       { fontSize: 10.5, fontWeight: '800', color: FOREST, letterSpacing: 1 },
  onlineBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  onlineDot:     { width: 7, height: 7, borderRadius: 3.5 },
  onlineTxt:     { fontSize: 11, fontWeight: '700' },

  // Sync section extras
  statusPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  statusDot:   { width: 7, height: 7, borderRadius: 3.5 },
  statusPillTxt:{ fontSize: 11, fontWeight: '700' },
  syncBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: FOREST, borderRadius: 12, paddingVertical: 13, marginHorizontal: 14, marginTop: 4, marginBottom: 10 },
  syncBtnTxt:  { color: GOLD, fontWeight: '800', fontSize: 14.5 },

  // Logout
  logoutSection: { marginHorizontal: 14, marginTop: 24, gap: 8 },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15, borderWidth: 1.5, borderColor: '#fee2e2', shadowColor: '#dc2626', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  logoutIconWrap:{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  logoutTxt:     { fontSize: 15.5, fontWeight: '700', color: '#dc2626' },
  logoutHint:    { fontSize: 11.5, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 20 },

  // Footer
  footer:        { alignItems: 'center', paddingTop: 28, gap: 3 },
  footerTxt:     { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  footerVersion: { fontSize: 11, color: '#d1d5db' },
});

const sec = StyleSheet.create({
  wrap:   { marginTop: 22, marginHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 2 },
  title:  { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 1 },
  card:   { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },

  // Restaurant header inside the card
  restNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  restIcon:    { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  restName:    { fontSize: 16, fontWeight: '800', color: '#111827' },
  restAddr:    { fontSize: 12, color: '#9ca3af', marginTop: 3, lineHeight: 17 },
});

// Logout confirmation modal styles
const lm = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel:      { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 340, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: 20 },
  iconWrap:   { alignItems: 'center', paddingTop: 28, paddingBottom: 4 },
  title:      { fontSize: 19, fontWeight: '800', color: '#111827', textAlign: 'center', marginTop: 12, paddingHorizontal: 24 },
  body:       { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, lineHeight: 21, paddingHorizontal: 24, paddingBottom: 22 },
  bold:       { color: '#374151', fontWeight: '700' },
  divider:    { height: 1, backgroundColor: '#f3f4f6' },
  btnRow:     { flexDirection: 'row' },
  cancelBtn:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRightWidth: 1, borderRightColor: '#f3f4f6' },
  cancelTxt:  { fontSize: 15, fontWeight: '600', color: '#374151' },
  logoutBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16, backgroundColor: '#dc2626' },
  logoutTxt:  { fontSize: 15, fontWeight: '800', color: '#fff' },
});

const row = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:   { flex: 1, fontSize: 14.5, fontWeight: '600', color: '#111827' },
  sub:     { fontSize: 11.5, color: '#9ca3af', marginTop: 1 },
  value:   { fontSize: 13.5, color: '#6b7280', fontWeight: '500', maxWidth: 160, textAlign: 'right' },
  right:   { flexShrink: 0 },
});
