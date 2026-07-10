import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { APP_BUILD } from '@/generated/appVersion';
import {
  downloadDesktopUpdate,
  installDesktopUpdate,
  isDesktopApp,
  onDesktopUpdateStatus,
  checkForUpdates,
} from '@/utils/desktopBridge';

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error';

export type AppUpdateInfo = {
  state: UpdateState;
  version?: string;
  currentVersion?: string;
  message?: string;
  progress?: number;
};

const WEB_CHECK_MS = 15 * 60 * 1000; // 15 minutes
const WEB_FOCUS_THROTTLE_MS = 5 * 60 * 1000;

function releaseId(data: { version: string; builtAt: string; commit?: string }) {
  return `${data.version}+${data.builtAt}+${data.commit ?? ''}`;
}

async function fetchRemoteReleaseId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.version || !data?.builtAt) return null;
    return releaseId(data);
  } catch {
    return null;
  }
}

export function useAppUpdate() {
  const [info, setInfo] = useState<AppUpdateInfo>({ state: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const [manualFeedback, setManualFeedback] = useState(false);
  const localReleaseRef = useRef(releaseId(APP_BUILD));
  const lastWebCheckRef = useRef(0);

  const applyWebUpdate = useCallback(async () => {
    setInfo((prev) => ({ ...prev, state: 'downloading', message: 'Refreshing app…' }));
    try {
      sessionStorage.setItem('gtc_sw_reloading', '1');
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        await reg?.update().catch(() => undefined);
      }
    } finally {
      window.location.reload();
    }
  }, []);

  const checkWebUpdate = useCallback(async (silent = false) => {
    if (Platform.OS !== 'web' || isDesktopApp()) return;
    const now = Date.now();
    if (silent && now - lastWebCheckRef.current < WEB_FOCUS_THROTTLE_MS) return;
    lastWebCheckRef.current = now;

    if (!silent) setInfo((prev) => ({ ...prev, state: 'checking' }));

    const remote = await fetchRemoteReleaseId();
    if (!remote) {
      if (!silent) {
        setManualFeedback(true);
        setInfo({ state: 'error', message: 'Could not check for updates.' });
      }
      return;
    }

    if (remote !== localReleaseRef.current) {
      setDismissed(false);
      setInfo({
        state: 'available',
        version: remote.split('+')[0],
        currentVersion: APP_BUILD.version,
        message: 'A new version of GTC POS is available.',
      });
      return;
    }

    if (!silent) {
      setManualFeedback(true);
      setInfo({
        state: 'up-to-date',
        currentVersion: APP_BUILD.version,
        message: 'You are on the latest version.',
      });
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    if (isDesktopApp()) {
      if (info.state === 'ready') {
        installDesktopUpdate();
        return;
      }
      setInfo((prev) => ({ ...prev, state: 'downloading', message: 'Downloading update…' }));
      await downloadDesktopUpdate();
      return;
    }
    await applyWebUpdate();
  }, [applyWebUpdate, info.state]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setManualFeedback(false);
    setInfo((prev) => (prev.state === 'up-to-date' || prev.state === 'error' ? { state: 'idle' } : prev));
  }, []);

  const manualCheck = useCallback(() => {
    if (isDesktopApp()) {
      checkForUpdates();
      return;
    }
    setManualFeedback(true);
    void checkWebUpdate(false);
  }, [checkWebUpdate]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    if (isDesktopApp()) {
      return onDesktopUpdateStatus((payload) => {
        if (payload.state === 'available') {
          setDismissed(false);
          setInfo({
            state: 'available',
            version: payload.version,
            currentVersion: payload.currentVersion,
            message: payload.message ?? 'A new version is available.',
          });
          return;
        }
        if (payload.state === 'downloading') {
          setInfo({
            state: 'downloading',
            version: payload.version,
            currentVersion: payload.currentVersion,
            progress: payload.progress,
            message: 'Downloading update…',
          });
          return;
        }
        if (payload.state === 'ready') {
          setDismissed(false);
          setInfo({
            state: 'ready',
            version: payload.version,
            currentVersion: payload.currentVersion,
            message: 'Update downloaded. Restart to apply.',
          });
          return;
        }
        // Desktop "up to date" / errors use the native Windows dialog only (manual check).
      });
    }

    void checkWebUpdate(true);

    const timer = setInterval(() => { void checkWebUpdate(true); }, WEB_CHECK_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkWebUpdate(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    const onManualCheck = () => {
      setManualFeedback(true);
      void checkWebUpdate(false);
    };
    window.addEventListener('gtc-pos:check-updates', onManualCheck);

    let reg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        reg = registration;
        if (!registration) return;

        const notifyWaiting = () => {
          if (!registration?.waiting || !navigator.serviceWorker.controller) return;
          setDismissed(false);
          setInfo({
            state: 'available',
            version: APP_BUILD.version,
            currentVersion: APP_BUILD.version,
            message: 'A new version is ready. Refresh to update.',
          });
        };

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') notifyWaiting();
          });
        });

        notifyWaiting();
      }).catch(() => undefined);

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Reload once when a waiting worker takes control (after SKIP_WAITING).
        if (sessionStorage.getItem('gtc_sw_reloading') === '1') {
          sessionStorage.removeItem('gtc_sw_reloading');
          window.location.reload();
        }
      });
    }

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('gtc-pos:check-updates', onManualCheck);
      void reg;
    };
  }, [checkWebUpdate]);

  const visible =
    !dismissed &&
    (info.state === 'available' || info.state === 'ready' || info.state === 'downloading');

  const bannerVisible =
    !isDesktopApp() &&
    manualFeedback &&
    (info.state === 'up-to-date' || info.state === 'error');

  return {
    info,
    visible,
    bannerVisible,
    dismiss,
    applyUpdate,
    manualCheck,
  };
}
