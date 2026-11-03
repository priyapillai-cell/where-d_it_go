import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { bootstrapApp } from '@/services/bootstrapService';
import { useAppStore } from '@/state/appStore';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

/** Full-screen overlay shown until the database is open, seeded and loaded. */
export function StartupGate() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const { colors } = useTheme();
  if (status === 'ready') return null;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: colors.background }]}
    >
      {status === 'loading' ? (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText variant="body" color="textSecondary">
            {t('app.loading')}
          </AppText>
        </>
      ) : (
        <>
          <Icon name="database-alert-outline" size={48} color={colors.danger} />
          <AppText variant="title" align="center">
            {t('app.startupFailed')}
          </AppText>
          {error ? (
            <AppText variant="caption" color="textSecondary" align="center">
              {error}
            </AppText>
          ) : null}
          <Button label={t('app.retry')} onPress={() => void bootstrapApp()} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
});
