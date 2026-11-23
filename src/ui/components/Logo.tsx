import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { t } from '@/i18n';

import logo from '../../../assets/logo.png';

const ASPECT_RATIO = 1200 / 583;

/** The app logo (coin and wordmark), sized by height. */
export function Logo({ height, style }: { height: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={logo}
      accessibilityRole="image"
      accessibilityLabel={t('app.name')}
      resizeMode="contain"
      style={[{ height, width: height * ASPECT_RATIO }, style]}
    />
  );
}
