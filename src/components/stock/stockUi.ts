import type { ThemeColors } from '@/theme/tokens';

export const STOCK_BRAND = '#0f8f73';

type StockLevel = 'in' | 'low' | 'out' | 'untracked';

const LEVELS: Record<StockLevel, { label: string; color: string; colorDark: string; bg: string; bgDark: string }> = {
  in:        { label: 'In Stock',      color: '#16a34a', colorDark: '#14B51D', bg: '#f0fdf4', bgDark: 'rgba(20,181,29,0.15)' },
  low:       { label: 'Low Stock',   color: '#d97706', colorDark: '#FDAF22', bg: '#fef9ec', bgDark: 'rgba(253,175,34,0.15)' },
  out:       { label: 'Out of Stock', color: '#dc2626', colorDark: '#FF3636', bg: '#fef2f2', bgDark: 'rgba(255,54,54,0.15)' },
  untracked: { label: 'Not Tracked', color: '#6b7280', colorDark: '#888888', bg: '#f3f4f6', bgDark: 'rgba(255,255,255,0.08)' },
};

export function stockLevelTone(level: StockLevel, isDark: boolean) {
  const t = LEVELS[level];
  return { label: t.label, color: isDark ? t.colorDark : t.color, bg: isDark ? t.bgDark : t.bg };
}

export function ingredientStockTone(
  ing: { on_hand: number; low_stock_threshold: number },
  isDark: boolean,
) {
  if (ing.on_hand <= 0) return stockLevelTone('out', isDark);
  if (ing.low_stock_threshold > 0 && ing.on_hand <= ing.low_stock_threshold) return stockLevelTone('low', isDark);
  return stockLevelTone('in', isDark);
}

export function trackedStockTone(
  tracked: boolean,
  onHand: number,
  threshold: number,
  isDark: boolean,
) {
  if (!tracked) return stockLevelTone('untracked', isDark);
  if (onHand <= 0) return stockLevelTone('out', isDark);
  if (threshold > 0 && onHand <= threshold) return stockLevelTone('low', isDark);
  return stockLevelTone('in', isDark);
}

export function filterChipColor(key: 'all' | 'low' | 'out', isDark: boolean, c: ThemeColors): string {
  if (key === 'all') return isDark ? c.sidebar : '#1B2E1B';
  if (key === 'low') return isDark ? '#b45309' : '#d97706';
  return isDark ? '#b91c1c' : '#dc2626';
}

export function stockTabActiveBg(isDark: boolean) {
  return isDark ? 'rgba(15,143,115,0.22)' : '#f0fdf4';
}

export function pickerSelectedBg(isDark: boolean) {
  return isDark ? 'rgba(15,143,115,0.22)' : '#f0fdf4';
}

export function moveBadgeBg(color: string, isDark: boolean) {
  return isDark ? `${color}30` : `${color}18`;
}

export function errBannerColors(isDark: boolean) {
  return {
    backgroundColor: isDark ? 'rgba(255,54,54,0.12)' : '#fef2f2',
    borderColor: isDark ? 'rgba(255,54,54,0.35)' : '#fecaca',
  };
}

export function dangerBorder(isDark: boolean) {
  return isDark ? 'rgba(255,54,54,0.35)' : '#fecaca';
}

export function activeRuleBg(active: boolean, isDark: boolean) {
  if (active) return isDark ? 'rgba(20,181,29,0.15)' : '#f0fdf4';
  return isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6';
}

export function qtyDeltaColor(delta: number, isDark: boolean, c: ThemeColors) {
  if (delta > 0) return isDark ? '#14B51D' : '#059669';
  if (delta < 0) return isDark ? '#FF3636' : '#dc2626';
  return c.textMuted;
}
