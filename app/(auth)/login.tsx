import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  ActivityIndicator, Alert, Image, useWindowDimensions, ScrollView, KeyboardAvoidingView, Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { authApi } from '@/api/auth';
import { useAppStore } from '@/store/appStore';
import { syncService } from '@/sync/SyncService';
import { webSyncService } from '@/sync/WebSyncService';
import { setItem, getItem, deleteItem } from '@/utils/storage';
import { useTheme } from '@/store/themeStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { ThemeColors } from '@/theme/tokens';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  // Load saved credentials on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await getItem('remember_me_credentials');
        if (saved) {
          const { email: savedEmail, password: savedPassword } = JSON.parse(saved);
          setEmail(savedEmail ?? '');
          setPassword(savedPassword ?? '');
          setRememberMe(true);
        }
      } catch { /* ignore */ }
    })();
  }, []);
  const setAuth = useAppStore((s) => s.setAuth);
  const isOnline = useAppStore((s) => s.isOnline);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { colors } = useTheme();
  const d = useMemo(() => createDesktopStyles(colors), [colors]);
  const m = useMemo(() => createMobileStyles(colors), [colors]);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login({ email: email.trim(), password });
      const { token, user, restaurant } = res.data;

      // Write auth state ONLY through setAuth() — the Zustand persist middleware
      // automatically saves to SecureStore (native) / localStorage (web).
      // Keeping a single source of truth prevents split-brain state on restart.
      setAuth(user, restaurant, token);

      // Also mirror to individual keys so the _layout.tsx bootstrap can read them
      // during the transition period before all paths move to the Zustand store.
      await setItem('sanctum_token', token);
      await setItem('auth_user', JSON.stringify(user));
      await setItem('auth_restaurant', JSON.stringify(restaurant));

      // Save or clear remembered credentials (used for silent re-auth in the
      // 401 interceptor when a token expires — see src/api/client.ts silentReauth).
      if (rememberMe) {
        await setItem('remember_me_credentials', JSON.stringify({ email: email.trim(), password }));
      } else {
        await deleteItem('remember_me_credentials');
      }
      // Web: sync data to IndexedDB for offline use
      // Native: sync to SQLite
      if (Platform.OS === 'web') {
        webSyncService.sync().catch(console.warn);
      } else {
        syncService.runSync().catch(console.warn);
      }
      router.replace('/(app)/pos');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.response?.data?.errors?.email?.[0] ?? 'Login failed. Check your credentials.';
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  }

  if (isDesktop) {
    return (
      <View style={d.container}>
        {/* Left Panel */}
        <View style={d.left}>
          {/* Background decorative blobs */}
          <View style={d.blob1} />
          <View style={d.blob2} />
          <View style={d.blob3} />

          <View style={d.leftContent}>
            {/* Logo with decorative rings */}
            <View style={d.logoWrap}>
              <View style={d.ring3} />
              <View style={d.ring2} />
              <View style={d.ring1} />
              <Image source={require('../../assets/gtc-logo.png')} style={d.logo} resizeMode="contain" />
            </View>

            <Text style={d.brandName}>GLOBAL TEA CAFE</Text>
            <Text style={d.brandTagline}>Billing System</Text>

            <View style={d.divider}>
              <View style={d.dividerLine} />
              <Ionicons name="leaf" size={14} color="#C9A52A" />
              <View style={d.dividerLine} />
            </View>

            <Text style={d.brandDesc}>Crafting great experiences, one order at a time.</Text>

            <View style={d.featureList}>
              {[
                { icon: 'storefront-outline' as const, label: 'POS & Order Management' },
                { icon: 'grid-outline' as const, label: 'Table Tracking' },
                { icon: 'cloud-offline-outline' as const, label: 'Works Offline' },
                { icon: 'sync-outline' as const, label: 'Real-time Sync' },
              ].map((f) => (
                <View key={f.label} style={d.featureItem}>
                  <View style={d.featureIconBg}>
                    <Ionicons name={f.icon} size={14} color="#C9A52A" />
                  </View>
                  <Text style={d.featureText}>{f.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={d.copyright}>© 2025 Global Tea Cafe · All rights reserved</Text>
        </View>

        {/* Right Panel */}
        <ScrollView contentContainerStyle={d.right} keyboardShouldPersistTaps="handled">
          {/* Subtle background decoration */}
          <View style={d.rightBlob1} />
          <View style={d.rightBlob2} />
          <View style={{ position: 'absolute', top: 24, right: 24, zIndex: 2 }}>
            <ThemeToggle variant="card" size={20} />
          </View>

          <View style={d.formBox}>
            {/* Gold accent bar */}
            <View style={d.formAccent} />

            <View style={d.formHeader}>
              <View style={d.formLogoWrap}>
                <Image source={require('../../assets/gtc-logo.png')} style={d.formLogo} resizeMode="contain" />
              </View>
              <Text style={d.welcome}>Welcome back</Text>
              <Text style={d.subtitle}>Sign in to continue to your POS dashboard</Text>
            </View>

            {!isOnline && (
              <View style={d.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={14} color="#92400e" />
                <Text style={d.offlineText}> No internet — server required for first login</Text>
              </View>
            )}

            <View style={d.fieldGroup}>
              <Text style={d.label}>Email Address</Text>
              <View style={[d.inputWrap, focusedField === 'email' && d.inputWrapFocused]}>
                <Ionicons name="mail-outline" size={18} color={focusedField === 'email' ? '#C9A52A' : '#94A3B8'} style={d.inputIcon} />
                <TextInput
                  style={d.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="admin@restaurant.com"
                  placeholderTextColor="#CBD5E1"
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            <View style={d.fieldGroup}>
              <Text style={d.label}>Password</Text>
              <View style={[d.inputWrap, focusedField === 'password' && d.inputWrapFocused]}>
                <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'password' ? '#C9A52A' : '#94A3B8'} style={d.inputIcon} />
                <TextInput
                  style={d.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#CBD5E1"
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable onPress={() => setShowPassword(v => !v)} style={d.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                </Pressable>
              </View>
            </View>

            {/* Remember Me */}
            <Pressable style={d.rememberRow} onPress={() => setRememberMe(v => !v)}>
              <View style={[d.checkbox, rememberMe && d.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={d.rememberTxt}>Remember me</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [d.btn, loading && { opacity: 0.75 }, pressed && { opacity: 0.85 }]}
              onPress={handleLogin}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color={colors.brandDark} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={d.btnText}>Sign In</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.brandDark} />
                </View>
              )}
            </Pressable>

            <Text style={d.secureNote}>
              <Ionicons name="shield-checkmark-outline" size={12} color="#94A3B8" /> Secured with end-to-end encryption
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Mobile layout
  return (
    <KeyboardAvoidingView style={m.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Background decorations */}
      <View style={m.bgCircle1} />
      <View style={m.bgCircle2} />
      <View style={m.bgCircle3} />

      <ScrollView contentContainerStyle={m.container} keyboardShouldPersistTaps="handled">
        <View style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
          <ThemeToggle variant="sidebar" size={18} />
        </View>
        <View style={m.brand}>
          <View style={m.logoWrap}>
            <View style={m.ring2} />
            <View style={m.ring1} />
            <Image source={require('../../assets/gtc-logo.png')} style={m.logo} resizeMode="contain" />
          </View>
          <Text style={m.brandName}>GLOBAL TEA CAFE</Text>
          <Text style={m.brandSub}>Billing System</Text>
        </View>

        <View style={m.card}>
          <View style={m.cardAccent} />
          <Text style={m.cardTitle}>Sign In</Text>
          <Text style={m.cardSubtitle}>Enter your credentials to continue</Text>

          {!isOnline && (
            <View style={m.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color="#92400e" />
              <Text style={m.offlineText}> No internet — server required for first login</Text>
            </View>
          )}

          <View style={m.fieldGroup}>
            <Text style={m.label}>Email</Text>
            <View style={[m.inputWrap, focusedField === 'email' && m.inputWrapFocused]}>
              <Ionicons name="mail-outline" size={16} color={focusedField === 'email' ? '#C9A52A' : '#94A3B8'} style={m.inputIcon} />
              <TextInput
                style={m.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="admin@restaurant.com"
                placeholderTextColor="#CBD5E1"
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          <View style={m.fieldGroup}>
            <Text style={m.label}>Password</Text>
            <View style={[m.inputWrap, focusedField === 'password' && m.inputWrapFocused]}>
              <Ionicons name="lock-closed-outline" size={16} color={focusedField === 'password' ? '#C9A52A' : '#94A3B8'} style={m.inputIcon} />
              <TextInput
                style={m.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor="#CBD5E1"
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <Pressable onPress={() => setShowPassword(v => !v)} style={m.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
              </Pressable>
            </View>
          </View>

          {/* Remember Me */}
          <Pressable style={m.rememberRow} onPress={() => setRememberMe(v => !v)}>
            <View style={[m.checkbox, rememberMe && m.checkboxChecked]}>
              {rememberMe && <Ionicons name="checkmark" size={11} color="#fff" />}
            </View>
            <Text style={m.rememberTxt}>Remember me</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [m.btn, loading && { opacity: 0.75 }, pressed && { opacity: 0.85 }]}
            onPress={handleLogin}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.brandDark} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={m.btnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.brandDark} />
              </View>
            )}
          </Pressable>
        </View>

        <Text style={m.footer}>© 2025 Global Tea Cafe</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Desktop styles ────────────────────────────────────────────────────────────
function createDesktopStyles(c: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: c.surface },
  left: { width: '44%', backgroundColor: c.loginPanel, justifyContent: 'space-between', overflow: 'hidden' },
  blob1: { position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(201,165,42,0.07)' },
  blob2: { position: 'absolute', bottom: -60, left: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(201,165,42,0.05)' },
  blob3: { position: 'absolute', top: '45%', left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.02)' },
  leftContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 48 },
  logoWrap: { width: 280, height: 280, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ring1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1.5, borderColor: 'rgba(201,165,42,0.45)' },
  ring2: { position: 'absolute', width: 210, height: 210, borderRadius: 105, borderWidth: 1, borderColor: 'rgba(201,165,42,0.22)' },
  ring3: { position: 'absolute', width: 262, height: 262, borderRadius: 131, borderWidth: 1, borderColor: 'rgba(201,165,42,0.10)' },
  logo: { width: 120, height: 120, zIndex: 1 },
  brandName: { color: c.brandName, fontSize: 22, fontWeight: '800', letterSpacing: 4, textAlign: 'center', marginBottom: 6 },
  brandTagline: { color: c.brandTagline, fontSize: 13, fontWeight: '500', letterSpacing: 2, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(201,165,42,0.3)', maxWidth: 40 },
  brandDesc: { color: c.brandMuted, fontSize: 13, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  featureList: { gap: 14, width: '100%', maxWidth: 260 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIconBg: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(201,165,42,0.12)', alignItems: 'center', justifyContent: 'center' },
  featureText: { color: c.sidebarText, fontSize: 14, fontWeight: '500' },
  copyright: { color: c.brandMuted, fontSize: 12, textAlign: 'center', paddingBottom: 24 },
  right: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 48, backgroundColor: c.loginFormBg, overflow: 'hidden' },
  rightBlob1: { position: 'absolute', top: -120, right: -120, width: 350, height: 350, borderRadius: 175, backgroundColor: 'rgba(26,43,26,0.03)' },
  rightBlob2: { position: 'absolute', bottom: -80, left: -80, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(201,165,42,0.04)' },
  formBox: {
    width: '100%', maxWidth: 440, backgroundColor: c.loginCard, borderRadius: 24,
    paddingHorizontal: 40, paddingBottom: 40, paddingTop: 0,
    shadowColor: c.brandDark, shadowOpacity: 0.12, shadowRadius: 32, shadowOffset: { width: 0, height: 8 },
    elevation: 12, overflow: 'hidden',
  },
  formAccent: { height: 4, backgroundColor: c.brand, marginBottom: 32 },
  formHeader: { alignItems: 'center', marginBottom: 28 },
  formLogoWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: c.border },
  formLogo: { width: 38, height: 38 },
  welcome: { fontSize: 26, fontWeight: '800', color: c.heading, marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', borderRadius: 10, padding: 12, marginBottom: 16, gap: 6 },
  offlineText: { fontSize: 12, color: '#92400e', flexShrink: 1 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: c.heading, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 14, backgroundColor: c.inputBg, paddingHorizontal: 14 },
  inputWrapFocused: { borderColor: c.inputFocusedBorder, backgroundColor: c.surfaceAlt, shadowColor: c.brand, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: c.heading },
  eyeBtn: { paddingLeft: 10, paddingVertical: 14 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 4 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: c.inputBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: c.inputBg },
  checkboxChecked: { backgroundColor: '#C9A52A', borderColor: '#C9A52A' },
  rememberTxt: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  btn: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, flexDirection: 'row', justifyContent: 'center', shadowColor: c.brand, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  btnText: { color: c.brandDark, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  secureNote: { textAlign: 'center', color: c.textMuted, fontSize: 12, marginTop: 20 },
  });
}

function createMobileStyles(c: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.loginBrandBg },
  bgCircle1: { position: 'absolute', top: -100, right: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(201,165,42,0.08)' },
  bgCircle2: { position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(201,165,42,0.06)' },
  bgCircle3: { position: 'absolute', top: '40%', right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.02)' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', marginBottom: 28 },
  logoWrap: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ring1: { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1.5, borderColor: 'rgba(201,165,42,0.4)' },
  ring2: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: 'rgba(201,165,42,0.18)' },
  logo: { width: 90, height: 90, zIndex: 1 },
  brandName: { color: c.brandName, fontSize: 18, fontWeight: '800', letterSpacing: 3, textAlign: 'center' },
  brandSub: { color: c.brandTagline, fontSize: 12, marginTop: 4, letterSpacing: 2, textAlign: 'center' },
  card: { backgroundColor: c.loginCard, borderRadius: 24, paddingHorizontal: 24, paddingBottom: 28, paddingTop: 0, elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, overflow: 'hidden' },
  cardAccent: { height: 4, backgroundColor: c.brand, marginBottom: 24 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: c.heading, textAlign: 'center', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginBottom: 20 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', borderRadius: 10, padding: 10, marginBottom: 12, gap: 4 },
  offlineText: { fontSize: 12, color: '#92400e', flexShrink: 1 },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: c.heading, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 12, backgroundColor: c.inputBg, paddingHorizontal: 12 },
  inputWrapFocused: { borderColor: c.inputFocusedBorder, backgroundColor: c.surfaceAlt },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: c.heading },
  eyeBtn: { paddingLeft: 8, paddingVertical: 12 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: 2 },
  checkbox: { width: 17, height: 17, borderRadius: 4, borderWidth: 1.5, borderColor: c.inputBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: c.inputBg },
  checkboxChecked: { backgroundColor: '#C9A52A', borderColor: '#C9A52A' },
  rememberTxt: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  btn: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8, flexDirection: 'row', justifyContent: 'center', shadowColor: c.brand, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  btnText: { color: c.brandDark, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  footer: { textAlign: 'center', color: c.sidebarTextMuted, fontSize: 12, marginTop: 28 },
  });
}
