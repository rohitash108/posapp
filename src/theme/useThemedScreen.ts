import { useMemo } from 'react';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';

export function useThemedScreen() {
  const { colors, isDark, mode } = useTheme();

  return useMemo(() => ({
    colors,
    isDark,
    mode,
    shell: { flex: 1 as const, backgroundColor: colors.background },
    shellRow: { flex: 1 as const, flexDirection: 'row' as const, backgroundColor: colors.background },
    surface: { backgroundColor: colors.surface },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1 as const,
    },
    chrome: { backgroundColor: colors.sidebar },
    chromeBtn: { backgroundColor: colors.sidebar, borderColor: colors.sidebar },
    headerBar: {
      backgroundColor: colors.header,
      borderBottomColor: colors.headerBorder,
      borderBottomWidth: 1 as const,
    },
    textHeading: { color: colors.heading },
    textBody: { color: colors.text },
    textMuted: { color: colors.textMuted },
    textOnChrome: { color: colors.sidebarText },
    textBrand: { color: colors.brandName },
    textBrandTag: { color: colors.brandTagline },
    iconOnChrome: colors.brandName,
    iconOnHeader: isDark ? colors.brandName : colors.primary,
  }), [colors, isDark, mode]);
}

export type ThemedScreenStyles = ReturnType<typeof useThemedScreen>;

/** Merge static StyleSheet entry with web-parity theme overrides */
export function mergeTheme<T>(base: T, patch: Partial<Record<keyof T, object>>): T {
  return { ...base, ...patch } as T;
}

export function chromeBg(colors: ThemeColors) {
  return { backgroundColor: colors.sidebar };
}

export function pageBg(colors: ThemeColors) {
  return { backgroundColor: colors.background };
}
