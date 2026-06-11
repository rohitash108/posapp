import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export function useBreakpoint(): { bp: Breakpoint; width: number; isTablet: boolean; isDesktop: boolean } {
  const { width } = useWindowDimensions();
  const bp: Breakpoint = width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'mobile';
  return { bp, width, isTablet: bp === 'tablet', isDesktop: bp === 'desktop' };
}

export function numColumns(bp: Breakpoint): number {
  return bp === 'desktop' ? 4 : bp === 'tablet' ? 3 : 2;
}
