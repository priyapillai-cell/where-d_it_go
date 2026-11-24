import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { bootstrapApp } from '@/services/bootstrapService';
import { useAppStore } from '@/state/appStore';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { Logo } from './Logo';

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
          <Logo height={136} />
          <ActivityIndicator
            size="large"
            color={colors.primary}
            accessibilityLabel={t('app.loading')}
          />
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
