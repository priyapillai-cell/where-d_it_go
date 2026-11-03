import * as Haptics from 'expo-haptics';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { KeypadKey } from '@/domain/calculator';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';

const ROWS: readonly (readonly KeypadKey[])[] = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '-'],
  ['.', '0', 'backspace', '+'],
];

function labelFor(key: KeypadKey): string {
  switch (key) {
    case 'backspace':
      return t('keypad.backspace');
    case 'clear':
      return t('keypad.clear');
    case '.':
      return t('keypad.decimal');
    case '+':
      return t('keypad.plus');
    case '-':
      return t('keypad.minus');
    case '×':
      return t('keypad.multiply');
    case '÷':
      return t('keypad.divide');
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      return key;
    default:
      return assertNever(key);
  }
}

const KeyButton = memo(function KeyButton({
  value,
  onPress,
  onLongPress,
  disabled,
}: {
  value: KeypadKey;
  onPress: (key: KeypadKey) => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {
  const { colors, radius } = useTheme();
  const isOperator = value === '+' || value === '-' || value === '×' || value === '÷';
  return (
    <Pressable
      accessibilityRole="keyboardkey"
      accessibilityLabel={labelFor(value)}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress(value);
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.key,
        {
          borderRadius: radius.md,
          backgroundColor: pressed
            ? colors.border
            : isOperator
              ? colors.surfaceVariant
              : colors.surface,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      {value === 'backspace' ? (
        <Icon name="backspace-outline" size={26} color={colors.text} />
      ) : (
        <AppText
          variant="headline"
          color={isOperator ? 'primary' : 'text'}
          maxFontSizeMultiplier={1.3}
        >
          {value === '-' ? '−' : value}
        </AppText>
      )}
    </Pressable>
  );
});

/** Large calculator keypad. Long-press backspace clears the expression. */
export function Keypad({
  onKey,
  allowDecimal = true,
}: {
  onKey: (key: KeypadKey) => void;
  allowDecimal?: boolean;
}) {
  return (
    <View style={styles.grid}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((key) => (
            <KeyButton
              key={key}
              value={key}
              onPress={onKey}
              disabled={key === '.' && !allowDecimal}
              onLongPress={key === 'backspace' ? () => onKey('clear') : undefined}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  key: { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center' },
});
