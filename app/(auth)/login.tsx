import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image, useWindowDimensions, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { authApi } from '@/api/auth';
import { useAppStore } from '@/store/appStore';
import { syncService } from '@/sync/SyncService';
import { webSyncService } from '@/sync/WebSyncService';
import { setItem } from '@/utils/storage';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const setAuth = useAppStore((s) => s.setAuth);
  const isOnline = useAppStore((s) => s.isOnline);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login({ email: email.trim(), password });
      const { token, user, restaurant } = res.data;
      await setItem('sanctum_token', token);
      await setItem('auth_user', JSON.stringify(user));
      await setItem('auth_restaurant', JSON.stringify(restaurant));
      setAuth(user, restaurant, token);
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
            <Text style={d.brandTagline}>Point of Sale System</Text>

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
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={d.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[d.btn, loading && { opacity: 0.75 }]} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#1A2B1A" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={d.btnText}>Sign In</Text>
                  <Ionicons name="arrow-forward" size={18} color="#1A2B1A" />
                </View>
              )}
            </TouchableOpacity>

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
        <View style={m.brand}>
          <View style={m.logoWrap}>
            <View style={m.ring2} />
            <View style={m.ring1} />
            <Image source={require('../../assets/gtc-logo.png')} style={m.logo} resizeMode="contain" />
          </View>
          <Text style={m.brandName}>GLOBAL TEA CAFE</Text>
          <Text style={m.brandSub}>Point of Sale System</Text>
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
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={m.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={[m.btn, loading && { opacity: 0.75 }]} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#1A2B1A" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={m.btnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={16} color="#1A2B1A" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={m.footer}>© 2025 Global Tea Cafe</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Desktop styles ────────────────────────────────────────────────────────────
const d = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#fff' },

  // Left panel
  left: { width: '44%', backgroundColor: '#1A2B1A', justifyContent: 'space-between', overflow: 'hidden' },
  blob1: { position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(201,165,42,0.07)' },
  blob2: { position: 'absolute', bottom: -60, left: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(201,165,42,0.05)' },
  blob3: { position: 'absolute', top: '45%', left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.02)' },
  leftContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 48 },

  // Logo with rings
  logoWrap: { width: 280, height: 280, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ring1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1.5, borderColor: 'rgba(201,165,42,0.45)' },
  ring2: { position: 'absolute', width: 210, height: 210, borderRadius: 105, borderWidth: 1, borderColor: 'rgba(201,165,42,0.22)' },
  ring3: { position: 'absolute', width: 262, height: 262, borderRadius: 131, borderWidth: 1, borderColor: 'rgba(201,165,42,0.10)' },
  logo: { width: 120, height: 120, zIndex: 1 },

  brandName: { color: '#C9A52A', fontSize: 22, fontWeight: '800', letterSpacing: 4, textAlign: 'center', marginBottom: 6 },
  brandTagline: { color: 'rgba(201,165,42,0.7)', fontSize: 13, fontWeight: '500', letterSpacing: 2, textAlign: 'center' },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(201,165,42,0.3)', maxWidth: 40 },

  brandDesc: { color: '#7A9A7A', fontSize: 13, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  featureList: { gap: 14, width: '100%', maxWidth: 260 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIconBg: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(201,165,42,0.12)', alignItems: 'center', justifyContent: 'center' },
  featureText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },

  copyright: { color: '#4A6A4A', fontSize: 12, textAlign: 'center', paddingBottom: 24 },

  // Right panel
  right: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 48, backgroundColor: '#F7F6F3', overflow: 'hidden' },
  rightBlob1: { position: 'absolute', top: -120, right: -120, width: 350, height: 350, borderRadius: 175, backgroundColor: 'rgba(26,43,26,0.03)' },
  rightBlob2: { position: 'absolute', bottom: -80, left: -80, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(201,165,42,0.04)' },

  // Form card
  formBox: {
    width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 24,
    paddingHorizontal: 40, paddingBottom: 40, paddingTop: 0,
    shadowColor: '#1A2B1A', shadowOpacity: 0.12, shadowRadius: 32, shadowOffset: { width: 0, height: 8 },
    elevation: 12, overflow: 'hidden',
  },
  formAccent: { height: 4, backgroundColor: '#C9A52A', marginBottom: 32 },

  formHeader: { alignItems: 'center', marginBottom: 28 },
  formLogoWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#F0F7F0', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#E2EDE2' },
  formLogo: { width: 38, height: 38 },
  welcome: { fontSize: 26, fontWeight: '800', color: '#0F172A', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },

  offlineBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', borderRadius: 10, padding: 12, marginBottom: 16, gap: 6 },
  offlineText: { fontSize: 12, color: '#92400e', flexShrink: 1 },

  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, backgroundColor: '#FAFBFC', paddingHorizontal: 14 },
  inputWrapFocused: { borderColor: '#C9A52A', backgroundColor: '#FFFDF7', shadowColor: '#C9A52A', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#0F172A' },
  eyeBtn: { paddingLeft: 10, paddingVertical: 14 },

  btn: { backgroundColor: '#C9A52A', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, flexDirection: 'row', justifyContent: 'center', shadowColor: '#C9A52A', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  btnText: { color: '#1A2B1A', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  secureNote: { textAlign: 'center', color: '#94A3B8', fontSize: 12, marginTop: 20 },
});

// ─── Mobile styles ─────────────────────────────────────────────────────────────
const m = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#1A2B1A' },

  // Background decoration circles
  bgCircle1: { position: 'absolute', top: -100, right: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(201,165,42,0.08)' },
  bgCircle2: { position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(201,165,42,0.06)' },
  bgCircle3: { position: 'absolute', top: '40%', right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.02)' },

  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  brand: { alignItems: 'center', marginBottom: 28 },
  logoWrap: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ring1: { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1.5, borderColor: 'rgba(201,165,42,0.4)' },
  ring2: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: 'rgba(201,165,42,0.18)' },
  logo: { width: 90, height: 90, zIndex: 1 },
  brandName: { color: '#C9A52A', fontSize: 18, fontWeight: '800', letterSpacing: 3, textAlign: 'center' },
  brandSub: { color: 'rgba(201,165,42,0.65)', fontSize: 12, marginTop: 4, letterSpacing: 2, textAlign: 'center' },

  card: { backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 24, paddingBottom: 28, paddingTop: 0, elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, overflow: 'hidden' },
  cardAccent: { height: 4, backgroundColor: '#C9A52A', marginBottom: 24 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20 },

  offlineBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', borderRadius: 10, padding: 10, marginBottom: 12, gap: 4 },
  offlineText: { fontSize: 12, color: '#92400e', flexShrink: 1 },

  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#FAFBFC', paddingHorizontal: 12 },
  inputWrapFocused: { borderColor: '#C9A52A', backgroundColor: '#FFFDF7' },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#0F172A' },
  eyeBtn: { paddingLeft: 8, paddingVertical: 12 },

  btn: { backgroundColor: '#C9A52A', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8, flexDirection: 'row', justifyContent: 'center', shadowColor: '#C9A52A', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  btnText: { color: '#1A2B1A', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  footer: { textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 28 },
});
