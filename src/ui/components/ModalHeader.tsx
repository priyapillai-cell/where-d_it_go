import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@/i18n';

import { AppText } from './AppText';
import { IconButton } from './Button';

export function ModalHeader({
  title,
  onClose,
  right,
}: {
  title: string;
  onClose: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
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
