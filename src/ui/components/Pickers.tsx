import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '@/i18n';

import { ICON_CHOICES, PALETTE } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';

const SWATCH = 44;

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {PALETTE.map((color, index) => {
        const selected = color.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={color}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t('common.colorN', { index: index + 1, total: PALETTE.length })}
            onPress={() => onChange(color)}
            style={[
              styles.swatch,
              {
                backgroundColor: color,
                borderColor: selected ? colors.text : 'transparent',
              },
            ]}
          >
            {selected ? <Icon name="check" size={22} color="#FFFFFF" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (icon: string) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {ICON_CHOICES.map((icon) => {
        const selected = icon === value;
        return (
          <Pressable
            key={icon}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={icon.replace(/-/g, ' ')}
            onPress={() => onChange(icon)}
            style={[
              styles.iconCell,
              {
                borderRadius: radius.md,
                backgroundColor: selected ? color : colors.surfaceVariant,
                borderColor: selected ? colors.text : 'transparent',
              },
            ]}
          >
            <Icon name={icon} size={24} color={selected ? '#FFFFFF' : colors.text} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCell: {
    width: 48,
    height: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
