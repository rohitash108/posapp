/**
 * csPos web parity — values from style.css + responsive.css (GTC sidebar overrides).
 */
export type ThemeMode = 'light' | 'dark';

export interface DashboardColors {
  primary: string;
  success: string;
  danger: string;
  warning: string;
  purple: string;
  info: string;
  orange: string;
  dark: string;
  gold: string;
  indigo: string;
  bg: string;
  white: string;
  border: string;
  text: string;
  muted: string;
  card: string;
  cardShadow: string;
}

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  heading: string;
  brand: string;
  brandName: string;
  brandTagline: string;
  brandDark: string;
  brandMuted: string;
  sidebar: string;
  sidebarText: string;
  sidebarTextMuted: string;
  sidebarBorder: string;
  header: string;
  headerText: string;
  headerBorder: string;
  tabBar: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;
  primary: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  loginPanel: string;
  loginFormBg: string;
  loginCard: string;
  loginBrandBg: string;
  inputBg: string;
  inputBorder: string;
  inputFocusedBorder: string;
  placeholder: string;
  dashboard: DashboardColors;
  statusBar: 'light' | 'dark';
}

/** Web :root semantic palette */
const WEB_SEMANTIC = {
  primary: '#0D76E1',
  success: '#14B51D',
  danger: '#FF3636',
  warning: '#FDAF22',
  secondary: '#FFA80B',
  info: '#2088EE',
  purple: '#A91CFF',
  orange: '#E65100',
  indigo: '#1B36E0',
};

const dashboardBase = {
  ...WEB_SEMANTIC,
  gold: '#d4b45a',
  dark: '#1B2E1B',
};

export const themes: Record<ThemeMode, ThemeColors> = {
  light: {
    // html/body — style.css line 8745
    background: '#f9f9fa',
    surface: '#FFFFFF',
    surfaceAlt: '#F8F8F8',
    border: '#E2E8F0',
    text: '#475569',
    textMuted: '#64748B',
    heading: '#0F172A',
    brand: '#C9A52A',
    brandName: '#d4b45a',
    brandTagline: '#e8d49a',
    brandDark: '#1B2E1B',
    brandMuted: '#7A9A7A',
    // responsive.css sidebar-simple light
    sidebar: '#1B2E1B',
    sidebarText: '#FFFFFF',
    sidebarTextMuted: 'rgba(255,255,255,0.72)',
    sidebarBorder: 'rgba(255,255,255,0.06)',
    // --topbar-bg light
    header: '#FFFFFF',
    headerText: '#0F172A',
    headerBorder: '#E2E8F0',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E2E8F0',
    tabActive: '#0D76E1',
    tabInactive: '#64748B',
    ...WEB_SEMANTIC,
    loginPanel: '#1B2E1B',
    loginFormBg: '#f9f9fa',
    loginCard: '#FFFFFF',
    loginBrandBg: '#1b2e1b',
    inputBg: '#FAFBFC',
    inputBorder: '#E2E8F0',
    inputFocusedBorder: '#d4b45a',
    placeholder: '#CBD5E1',
    dashboard: {
      ...dashboardBase,
      bg: '#f9f9fa',
      white: '#FFFFFF',
      border: '#E2E8F0',
      text: '#0F172A',
      muted: '#64748B',
      card: '#FFFFFF',
      cardShadow: '#0B0D0E',
    },
    statusBar: 'dark',
  },
  dark: {
    background: '#101111',
    surface: '#1a1f26',
    surfaceAlt: '#101111',
    border: '#272828',
    text: '#767A80',
    textMuted: '#92969E',
    heading: '#CDCED0',
    brand: '#d4b45a',
    brandName: '#d4b45a',
    brandTagline: '#e8d49a',
    brandDark: '#0F1F0F',
    brandMuted: '#545658',
    // responsive.css sidebar-simple dark
    sidebar: '#0F1F0F',
    sidebarText: '#CDCED0',
    sidebarTextMuted: 'rgba(255,255,255,0.72)',
    sidebarBorder: 'rgba(255,255,255,0.05)',
    header: '#01060B',
    headerText: '#CDCED0',
    headerBorder: '#272828',
    tabBar: '#01060B',
    tabBarBorder: '#272828',
    tabActive: '#d4b45a',
    tabInactive: '#767A80',
    ...WEB_SEMANTIC,
    loginPanel: '#0F1F0F',
    loginFormBg: '#101111',
    loginCard: '#1a1f26',
    loginBrandBg: '#0f1f0f',
    inputBg: '#232830',
    inputBorder: '#2a2f37',
    inputFocusedBorder: '#d4b45a',
    placeholder: '#545658',
    dashboard: {
      ...dashboardBase,
      bg: '#101111',
      white: '#1a1f26',
      border: '#272828',
      text: '#CDCED0',
      muted: '#767A80',
      card: '#1a1f26',
      cardShadow: '#000000',
    },
    statusBar: 'light',
  },
};

/** Legacy hardcoded hex → theme token (for gradual screen migration) */
export function legacyColor(hex: string, colors: ThemeColors): string {
  const key = hex.toLowerCase();
  const map: Record<string, string> = {
    '#f0f2f7': colors.background,
    '#f4f6f9': colors.background,
    '#f9f9fa': colors.background,
    '#1a2b1a': colors.sidebar,
    '#1b2e1b': colors.sidebar,
    '#243a24': colors.sidebarBorder,
    '#0f1f0f': colors.sidebar,
    '#ffffff': colors.surface,
    '#fff': colors.surface,
    '#e2e8f0': colors.border,
    '#0f172a': colors.heading,
    '#64748b': colors.textMuted,
    '#475569': colors.text,
    '#c9a52a': colors.brand,
    '#d4b45a': colors.brandName,
    '#ef4444': colors.danger,
    '#ff3636': colors.danger,
    '#0891b2': colors.info,
    '#2088ee': colors.info,
    '#14b51d': colors.success,
    '#22c55e': colors.success,
  };
  return map[key] ?? hex;
}
