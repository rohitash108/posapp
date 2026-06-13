import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/store/themeStore';

type Props = {
  size?: number;
  style?: ViewStyle;
  variant?: 'sidebar' | 'header' | 'card';
};

export function ThemeToggle({ size = 18, style, variant = 'header' }: Props) {
  const { isDark, toggleMode, colors } = useTheme();

  const bg =
    variant === 'sidebar'
      ? 'rgba(255,255,255,0.06)'
      : variant === 'card'
        ? colors.surfaceAlt
        : isDark
          ? 'rgba(255,255,255,0.1)'
          : colors.surfaceAlt;

  const iconColor =
    variant === 'sidebar'
      ? colors.brandName
      : variant === 'header'
        ? (isDark ? colors.brandName : colors.heading)
        : colors.heading;

  return (
    <TouchableOpacity
      onPress={toggleMode}
      style={[st.btn, { backgroundColor: bg }, style]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={size} color={iconColor} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
