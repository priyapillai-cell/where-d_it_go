import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, type TextInputProps, View } from 'react-native';

import type { ValidationCode } from '@/domain/validation';
import { t } from '@/i18n';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';

export function FieldLabel({ children }: { children: string }) {
  return (
    <AppText variant="label" color="textSecondary" style={styles.label}>
      {children}
    </AppText>
  );
}

export function FieldError({ code }: { code?: ValidationCode | 'invalidNumber' }) {
  const { colors } = useTheme();
  if (!code) return null;
  return (
    <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <Icon name="alert-circle" size={16} color={colors.danger} />
      <AppText variant="caption" color="danger">
        {t(`validation.${code}`)}
      </AppText>
    </View>
  );
}

export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: ValidationCode | 'invalidNumber' }) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        maxFontSizeMultiplier={2}
        {...props}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.md,
          },
          props.style,
        ]}
      />
      <FieldError code={error} />
    </View>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color="textSecondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

/** A tappable settings-style row with a value and chevron. */
export function ListRow({
  label,
  value,
  icon,
  onPress,
  destructive,
  leading,
  accessibilityHint,
}: {
  label: string;
  value?: string;
  icon?: string;
  onPress?: () => void;
  destructive?: boolean;
  leading?: ReactNode;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' },
      ]}
    >
      {leading}
      {icon ? (
        <Icon name={icon} size={22} color={destructive ? colors.danger : colors.textSecondary} />
      ) : null}
      <AppText variant="body" color={destructive ? 'danger' : 'text'} style={styles.flex}>
        {label}
      </AppText>
      {value ? (
        <AppText variant="body" color="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {onPress && !destructive ? (
        <Icon name="chevron-right" size={22} color={colors.textSecondary} />
      ) : null}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <AppText variant="label" color="primary" accessibilityRole="header" style={styles.sectionTitle}>
      {children.toUpperCase()}
    </AppText>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { marginLeft: 2 },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    gap: 12,
    paddingVertical: 4,
  },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    gap: 14,
  },
  value: { maxWidth: '45%' },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sectionTitle: { marginTop: 24, marginBottom: 8, marginHorizontal: 16, letterSpacing: 0.6 },
});
