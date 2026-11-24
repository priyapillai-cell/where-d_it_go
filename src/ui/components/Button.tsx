import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';

export type ButtonVariant = 'filled' | 'tonal' | 'outline' | 'text' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  icon?: string;
  loading?: boolean;
  /** Overrides the background of filled buttons (e.g. income/expense colours). */
  tint?: string;
  size?: 'regular' | 'large';
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'filled',
  icon,
  loading,
  tint,
  size = 'regular',
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { colors, radius, touchTarget } = useTheme();
  const palette = {
    filled: { bg: tint ?? colors.primary, fg: colors.onPrimary, border: 'transparent' },
    tonal: { bg: colors.primaryContainer, fg: colors.onPrimaryContainer, border: 'transparent' },
    outline: { bg: 'transparent', fg: colors.primary, border: colors.border },
    text: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.onDanger, border: 'transparent' },
  }[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: size === 'large' ? 56 : touchTarget,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: radius.md,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={20} color={palette.fg} /> : null}
          <AppText
            variant={size === 'large' ? 'subtitle' : 'label'}
            style={{ color: palette.fg }}
            numberOfLines={1}
          >
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  color,
  size = 24,
  style,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  icon: string;
  label: string;
  color?: string;
  size?: number;
  style?: ViewStyle;
}) {
  const { colors, touchTarget } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: touchTarget,
          height: touchTarget,
          opacity: rest.disabled ? 0.4 : pressed ? 0.6 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <Icon name={icon} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
});
