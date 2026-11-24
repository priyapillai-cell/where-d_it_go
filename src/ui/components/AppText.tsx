import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/theme';

export type TextVariant =
  'display' | 'headline' | 'title' | 'subtitle' | 'body' | 'label' | 'caption';

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  headline: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  subtitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: keyof ThemeColors;
  align?: TextStyle['textAlign'];
  /** Tabular digits keep amounts aligned in lists. */
  tabular?: boolean;
}

/** Text that follows the theme and scales with the system font size. */
export function AppText({
  variant = 'body',
  color = 'text',
  align,
  tabular,
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={rest.maxFontSizeMultiplier ?? 2}
      style={[
        VARIANTS[variant],
        { color: colors[color], textAlign: align },
        tabular && styles.tabular,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});
