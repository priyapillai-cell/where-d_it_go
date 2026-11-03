import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PASSCODE_LENGTH } from '@/domain/passcode';
import { t } from '@/i18n';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const KEY_SIZE = 72;

function PadKey({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  children,
}: {
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: pressed ? colors.primaryContainer : colors.surfaceVariant,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {label ? <AppText variant="headline">{label}</AppText> : children}
    </Pressable>
  );
}

export function PinPad({
  title,
  message,
  messageIsError = false,
  length,
  disabled,
  onDigit,
  onBackspace,
  onBiometric,
}: {
  title: string;
  message?: string;
  messageIsError?: boolean;
  length: number;
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onBiometric?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <AppText variant="title" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={t('security.entered', { count: length })}
        accessibilityLiveRegion="polite"
      >
        {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderColor: colors.text,
                backgroundColor: i < length ? colors.text : 'transparent',
              },
            ]}
          />
        ))}
      </View>
      <AppText
        variant="body"
        align="center"
        color={messageIsError ? 'danger' : 'textSecondary'}
        accessibilityRole={messageIsError ? 'alert' : undefined}
        style={styles.message}
      >
        {message ?? ' '}
      </AppText>
      <View style={styles.grid}>
        {DIGITS.map((d) => (
          <PadKey
            key={d}
            label={d}
            accessibilityLabel={t('security.digit', { digit: d })}
            disabled={disabled}
            onPress={() => onDigit(d)}
          />
        ))}
        {onBiometric ? (
          <PadKey accessibilityLabel={t('security.unlockWithBiometrics')} onPress={onBiometric}>
            <Icon name="fingerprint" size={30} color={colors.text} />
          </PadKey>
        ) : (
          <View style={styles.key} />
        )}
        <PadKey
          label="0"
          accessibilityLabel={t('security.digit', { digit: '0' })}
          disabled={disabled}
          onPress={() => onDigit('0')}
        />
        <PadKey
          accessibilityLabel={t('keypad.backspace')}
          onPress={onBackspace}
          disabled={disabled}
        >
          <Icon name="backspace-outline" size={28} color={colors.text} />
        </PadKey>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  dots: { flexDirection: 'row', gap: 18, paddingVertical: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  message: { minHeight: 22 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: KEY_SIZE * 3 + 24 * 2,
    gap: 24,
    justifyContent: 'center',
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
