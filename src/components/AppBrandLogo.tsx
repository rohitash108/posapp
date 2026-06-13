import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const GTC_LOGO = require('../../assets/gtc-logo.png');

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

/** Same logo asset used on the login screen. */
export function AppBrandLogo({ size = 42, style }: Props) {
  return (
    <Image
      source={GTC_LOGO}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
}

export const APP_BRAND_NAME = 'GLOBAL TEA CAFE';
export const APP_BRAND_TAGLINE = 'Billing System';
