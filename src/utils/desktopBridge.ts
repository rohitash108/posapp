const APP_VERSION = '1.0.3';

type GtcPosBridge = {
  isDesktop: boolean;
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<void>;
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
      return APP_VERSION;
    }
  }
  return APP_VERSION;
}

export function checkForUpdates(): void {
  const desktop = bridge();
  if (desktop) void desktop.checkForUpdates();
}
