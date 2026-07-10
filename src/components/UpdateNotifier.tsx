import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useTheme } from '@/store/themeStore';

export default function UpdateNotifier() {
  const { colors: c, isDark } = useTheme();
  const { info, visible, bannerVisible, dismiss, applyUpdate } = useAppUpdate();

  if (Platform.OS !== 'web') return null;

  const showModal = visible || bannerVisible;
  if (!showModal) return null;

  const isReady = info.state === 'ready';
  const isDownloading = info.state === 'downloading';
  const isInfoOnly = info.state === 'up-to-date' || info.state === 'error';

  const title =
    info.state === 'error'
      ? 'Update Check Failed'
      : info.state === 'up-to-date'
        ? 'Up to Date'
        : isReady
          ? 'Update Ready'
          : 'Update Available';

  const detail =
    info.message ??
    (info.version
      ? `Version ${info.version} is available${info.currentVersion ? ` (you are on v${info.currentVersion})` : ''}.`
      : 'A new version of GTC POS is available.');

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <View style={st.overlay}>
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[st.iconWrap, { backgroundColor: isDark ? '#1A2B1A' : '#ecfdf5' }]}>
            <Ionicons
              name={info.state === 'error' ? 'alert-circle' : 'cloud-download-outline'}
              size={28}
              color={info.state === 'error' ? '#dc2626' : '#0f8f73'}
            />
          </View>

          <Text style={[st.title, { color: c.heading }]}>{title}</Text>
          <Text style={[st.detail, { color: c.text }]}>{detail}</Text>

          {isDownloading ? (
            <View style={st.loadingRow}>
              <ActivityIndicator color="#0f8f73" />
              <Text style={[st.loadingTxt, { color: c.textMuted }]}>
                {typeof info.progress === 'number' ? `${info.progress}%` : 'Please wait…'}
              </Text>
            </View>
          ) : null}

          <View style={st.actions}>
            {!isInfoOnly && !isDownloading ? (
              <Pressable
                style={[st.btn, st.btnPrimary, { backgroundColor: '#0f8f73' }]}
                onPress={() => void applyUpdate()}
              >
                <Text style={st.btnPrimaryTxt}>{isReady ? 'Restart Now' : 'Update Now'}</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[st.btn, st.btnGhost, { borderColor: c.border }]}
              onPress={dismiss}
              disabled={isDownloading}
            >
              <Text style={[st.btnGhostTxt, { color: c.text }]}>
                {isInfoOnly ? 'OK' : isDownloading ? 'Please wait…' : 'Later'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    gap: 12,
    ...(Platform.OS === 'web' ? { boxShadow: '0 16px 48px rgba(0,0,0,0.28)' } : {}),
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  detail: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  loadingTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {},
  btnPrimaryTxt: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  btnGhost: {
    borderWidth: 1,
  },
  btnGhostTxt: {
    fontSize: 14,
    fontWeight: '700',
  },
});
