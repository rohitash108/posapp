import { Platform } from 'react-native';
import { create } from 'zustand';
import { getItem, setItem } from '@/utils/storage';
import { themes, type ThemeMode, type ThemeColors } from '@/theme/tokens';

const STORAGE_KEY = '__THEME_CONFIG__';

function applyWebTheme(mode: ThemeMode) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-bs-theme', mode);
    document.body?.setAttribute('data-bs-theme', mode);
  }
}

interface ThemeState {
  mode: ThemeMode;
  isHydrated: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'light',
  isHydrated: false,
  colors: themes.light,
  setMode: (mode) => {
    set({ mode, colors: themes[mode] });
    applyWebTheme(mode);
    setItem(STORAGE_KEY, JSON.stringify({ theme: mode })).catch(() => {});
  },
  toggleMode: () => {
    const next: ThemeMode = get().mode === 'light' ? 'dark' : 'light';
    get().setMode(next);
  },
  hydrate: async () => {
    try {
      const raw = await getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const mode: ThemeMode = parsed.theme === 'dark' ? 'dark' : 'light';
      set({ mode, colors: themes[mode], isHydrated: true });
      applyWebTheme(mode);
    } catch {
      set({ isHydrated: true });
    }
  },
}));

export function useTheme() {
  const mode = useThemeStore((s) => s.mode);
  const colors = useThemeStore((s) => s.colors);
  const isDark = mode === 'dark';
  return {
    mode,
    colors,
    isDark,
    setMode: useThemeStore.getState().setMode,
    toggleMode: useThemeStore.getState().toggleMode,
  };
}
