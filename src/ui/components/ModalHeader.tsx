import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { modalTopInset } from '@/ui/modalInsets';

import { AppText } from './AppText';
import { IconButton } from './Button';

export function useModalTopInset(): number {
  return modalTopInset(Platform.OS, useSafeAreaInsets().top);
}

export function ModalHeader({
  title,
  onClose,
  right,
}: {
  title: string;
  onClose: () => void;
  right?: ReactNode;
}) {
  const topInset = useModalTopInset();
  return (
    <View style={[styles.header, { paddingTop: styles.header.paddingTop + topInset }]}>
      <IconButton icon="close" label={t('common.close')} onPress={onClose} />
      <AppText variant="title" accessibilityRole="header" style={styles.title} align="center">
        {title}
      </AppText>
      {right ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 8 },
  title: { flex: 1 },
  spacer: { width: 48 },
});
