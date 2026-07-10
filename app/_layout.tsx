import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { setItem, getItem, deleteItem } from '@/utils/storage';
import Toast from 'react-native-toast-message';
import UpdateNotifier from '@/components/UpdateNotifier';
import { initDatabase } from '@/database/schema';
import { useAppStore } from '@/store/appStore';
import { syncService } from '@/sync/SyncService';
import { webSyncService } from '@/sync/WebSyncService';
import { useThemeStore } from '@/store/themeStore';

export default function RootLayout() {
  const setAuth = useAppStore((s) => s.setAuth);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const statusBarStyle = useThemeStore((s) => s.colors.statusBar);

  // Inject global web CSS once — kills browser focus rings on all inputs/textareas
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('app-global-style')) return;
    const s = document.createElement('style');
    s.id = 'app-global-style';
    s.textContent = [
      // Remove browser focus ring on all inputs and textareas
      'input:focus,textarea:focus{outline:none!important;box-shadow:none!important;}',
      // Remove default input/textarea browser chrome
      'input,textarea{border:none!important;background:transparent!important;}',
      // Prevent text selection highlight on interactive elements
      'button,a,[role="button"]{-webkit-tap-highlight-color:transparent;}',
    ].join('\n');
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    async function bootstrap() {
      await hydrateTheme();
      // Native: init SQLite
      if (Platform.OS !== 'web') {
        await initDatabase();
      }

      // ── Step 1: Restore auth IMMEDIATELY from local storage (offline-first) ──
      // The UI is unblocked right away — no network call required to show the app.
      const token          = await getItem('sanctum_token');
      const userJson       = await getItem('auth_user');
      const restaurantJson = await getItem('auth_restaurant');

      if (token && userJson && restaurantJson) {
        setAuth(JSON.parse(userJson), JSON.parse(restaurantJson), token);
      }

      // Unblock the UI immediately — do not wait for server validation.
      setHydrated();

      const { hydrateOfflineOrderTimes } = await import('@/utils/offlineOrderTimes');
      await hydrateOfflineOrderTimes();

      // ── Step 2: Validate with server in the background (non-blocking) ────────
      // Runs only when a session exists. Never clears auth on network errors —
      // only a confirmed 401 (handled by the interceptor + silentReauth) can
      // invalidate the session. All other errors (timeouts, 5xx, offline) are
      // silently ignored so the user stays logged in.
      if (token && userJson && restaurantJson) {
        (async () => {
          try {
            const { authApi } = await import('@/api/auth');
            const meRes = await authApi.me();
            const me   = meRes.data?.user ?? meRes.data;
            const rest = meRes.data?.restaurant ?? JSON.parse(restaurantJson);
            if (me) {
              setAuth(me, rest, token);
              await setItem('auth_user', JSON.stringify(me));
              if (rest) await setItem('auth_restaurant', JSON.stringify(rest));
            }
          } catch (e: any) {
            // A genuine 401 is already handled by the interceptor in client.ts
            // (silentReauth → performLogout). No action needed here.
            // Network errors, timeouts, 5xx → silently ignored; user stays logged in.
            if (e?.response?.status === 401) {
              console.warn('[Bootstrap] Token validation failed — interceptor handling re-auth');
            }
          }
        })();
      }

      if (Platform.OS === 'web') {
        // Register service worker for PWA offline support
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js').catch(console.warn);
        }

        // Online/offline detection
        const store = useAppStore.getState();
        store.setOnline(navigator.onLine);

        window.addEventListener('online', () => {
          store.setOnline(true);
          // Auto-sync when internet comes back
          if (token) webSyncService.sync().catch(console.warn);
        });
        window.addEventListener('offline', () => store.setOnline(false));

        // Initial sync if online and logged in
        if (navigator.onLine && token) {
          webSyncService.sync().catch(console.warn);
        }
      } else {
        syncService.start();
      }
    }

    bootstrap();
    return () => { if (Platform.OS !== 'web') syncService.stop(); };
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style={statusBarStyle} />
      <UpdateNotifier />
      <Toast />
    </>
  );
}
