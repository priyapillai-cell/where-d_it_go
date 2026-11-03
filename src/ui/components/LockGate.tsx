import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PASSCODE_LENGTH } from '@/domain/passcode';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';
import { authenticateWithBiometrics, verifyPasscode } from '@/services/securityService';
import { useAppStore } from '@/state/appStore';
import { useLockStore } from '@/state/lockStore';
import { logger } from '@/utils/logger';

import { useTheme } from '../theme/ThemeProvider';
import { PinPad } from './PinPad';

/** Re-lock only after this long in the background, so share sheets and pickers don't relock. */
const RELOCK_AFTER_MS = 30_000;

export function LockGate() {
  const { colors } = useTheme();
  const status = useAppStore((s) => s.status);
  const passcodeEnabled = useAppStore((s) => s.settings.passcodeEnabled);
  const biometricsEnabled = useAppStore((s) => s.settings.biometricsEnabled);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const unlocked = useLockStore((s) => s.unlocked);
  const setUnlocked = useLockStore((s) => s.setUnlocked);
  const [entry, setEntry] = useState('');
  const [message, setMessage] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const locked = status === 'ready' && passcodeEnabled && !unlocked;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away > RELOCK_AFTER_MS) {
          setEntry('');
          setMessage(undefined);
          setUnlocked(false);
        }
      }
    });
    return () => subscription.remove();
  }, [setUnlocked]);

  const tryBiometrics = async () => {
    if (await authenticateWithBiometrics()) {
      setEntry('');
      setMessage(undefined);
      setUnlocked(true);
    }
  };

  useEffect(() => {
    if (locked && biometricsEnabled) {
      const handle = setTimeout(() => {
        authenticateWithBiometrics()
          .then((success) => {
            if (success) setUnlocked(true);
          })
          .catch(() => undefined);
      }, 300);
      return () => clearTimeout(handle);
    }
    return undefined;
  }, [locked, biometricsEnabled, setUnlocked]);

  const submit = async (code: string) => {
    setChecking(true);
    try {
      const result = await verifyPasscode(code);
      switch (result.status) {
        case 'ok':
          setMessage(undefined);
          setUnlocked(true);
          break;
        case 'wrong':
          setMessage(t('security.wrong'));
          break;
        case 'locked':
          setMessage(t('security.lockedOut', { seconds: result.seconds }));
          break;
        case 'missing':
          // The secure store was cleared (e.g. reinstall): never lock the user out of their data.
          logger.warn('Passcode enabled but no hash found; disabling lock');
          await updateSettings({ passcodeEnabled: false, biometricsEnabled: false });
          setUnlocked(true);
          break;
        default:
          assertNever(result);
      }
    } catch (error) {
      logger.error('Passcode verification failed', error);
      setMessage(t('common.somethingWentWrong'));
    } finally {
      setEntry('');
      setChecking(false);
    }
  };

  const onDigit = (digit: string) => {
    if (checking) return;
    const next = `${entry}${digit}`.slice(0, PASSCODE_LENGTH);
    setEntry(next);
    if (next.length === PASSCODE_LENGTH) void submit(next);
  };

  return (
    <Modal
      visible={locked}
      animationType="fade"
      onRequestClose={() => undefined}
      statusBarTranslucent
    >
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <PinPad
            title={t('security.enterPasscode')}
            message={message}
            messageIsError={message !== undefined}
            length={entry.length}
            disabled={checking}
            onDigit={onDigit}
            onBackspace={() => setEntry((e) => e.slice(0, -1))}
            onBiometric={biometricsEnabled ? () => void tryBiometrics() : undefined}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
});
