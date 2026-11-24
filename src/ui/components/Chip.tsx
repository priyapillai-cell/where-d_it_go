import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  leading?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  trailingIcon?: string;
}

/** Selection is shown with a check mark and border, never by colour alone. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  leading,
  accessibilityLabel,
  accessibilityHint,
  trailingIcon,
}: ChipProps) {
  const { colors, radius } = useTheme();
  const fg = selected ? colors.onPrimaryContainer : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.primaryContainer : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {selected ? <Icon name="check" size={16} color={fg} /> : null}
        {leading}
        {icon ? <Icon name={icon} size={18} color={fg} /> : null}
        <AppText variant="label" style={{ color: fg }} numberOfLines={1}>
          {label}
        </AppText>
        {trailingIcon ? <Icon name={trailingIcon} size={18} color={fg} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
