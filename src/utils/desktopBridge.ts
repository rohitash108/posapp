import { APP_BUILD } from '@/generated/appVersion';

export type DesktopUpdatePayload = {
  state: 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';
  version?: string;
  currentVersion?: string;
  message?: string;
  progress?: number;
};

type GtcPosBridge = {
  isDesktop: boolean;
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (callback: (payload: DesktopUpdatePayload) => void) => () => void;
};

function bridge(): GtcPosBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { gtcPos?: GtcPosBridge }).gtcPos;
}

export function isDesktopApp(): boolean {
  return !!bridge()?.isDesktop;
}

export async function getAppVersion(): Promise<string> {
  const desktop = bridge();
  if (desktop) {
    try {
      return await desktop.getVersion();
    } catch {
      return APP_BUILD.version;
    }
  }
  return APP_BUILD.version;
}

export function checkForUpdates(): void {
  const desktop = bridge();
  if (desktop) void desktop.checkForUpdates();
}

export function downloadDesktopUpdate(): Promise<void> {
  const desktop = bridge();
  if (!desktop) return Promise.resolve();
  return desktop.downloadUpdate();
}

export function installDesktopUpdate(): void {
  const desktop = bridge();
  if (desktop) void desktop.installUpdate();
}

export function onDesktopUpdateStatus(
  callback: (payload: DesktopUpdatePayload) => void,
): () => void {
  const desktop = bridge();
  if (!desktop?.onUpdateStatus) return () => undefined;
  return desktop.onUpdateStatus(callback);
}

export function triggerManualUpdateCheck(): void {
  if (isDesktopApp()) {
    checkForUpdates();
    return;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gtc-pos:check-updates'));
  }
}
