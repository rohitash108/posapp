import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getItem } from '@/utils/storage';
import Toast from 'react-native-toast-message';
import { initDatabase } from '@/database/schema';
import { syncService } from '@/sync/SyncService';
import { webSyncService } from '@/sync/WebSyncService';
import { useAppStore } from '@/store/appStore';
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

      // Restore saved auth
      const token = await getItem('sanctum_token');
      const userJson = await getItem('auth_user');
      const restaurantJson = await getItem('auth_restaurant');
      if (token && userJson && restaurantJson) {
        setAuth(JSON.parse(userJson), JSON.parse(restaurantJson), token);
      }

      setHydrated();

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
      <Toast />
    </>
  );
}
