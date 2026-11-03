import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PASSCODE_LENGTH } from '@/domain/passcode';
import { t } from '@/i18n';
import { clearPasscode, setPasscode, verifyPasscode } from '@/services/securityService';
import { useAppStore } from '@/state/appStore';
import { useLockStore } from '@/state/lockStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { ModalHeader } from '../../components/ModalHeader';
import { PinPad } from '../../components/PinPad';
import { useTheme } from '../../theme/ThemeProvider';

type Mode = 'create' | 'change' | 'disable';
type Step = 'verify' | 'enter' | 'confirm';

function parseMode(value: string | undefined): Mode {
  return value === 'change' || value === 'disable' ? value : 'create';
}

export function PasscodeScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = parseMode(params.mode);
  const { colors } = useTheme();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setUnlocked = useLockStore((s) => s.setUnlocked);

  const [step, setStep] = useState<Step>(mode === 'create' ? 'enter' : 'verify');
  const [entry, setEntry] = useState('');
  const [first, setFirst] = useState('');
  const [message, setMessage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const title =
    step === 'verify'
      ? t('security.currentPasscode')
      : step === 'enter'
        ? t('security.createPasscode')
        : t('security.confirmPasscode');

  const complete = async (code: string) => {
    setBusy(true);
    try {
      if (step === 'verify') {
        const result = await verifyPasscode(code);
        if (result.status === 'locked') {
          setMessage(t('security.lockedOut', { seconds: result.seconds }));
          return;
        }
        if (result.status === 'wrong') {
          setMessage(t('security.wrong'));
          return;
        }
        if (mode === 'disable') {
          await clearPasscode();
          await updateSettings({ passcodeEnabled: false, biometricsEnabled: false });
          router.back();
          showToast({ message: t('security.passcodeRemoved') });
          return;
        }
        setMessage(undefined);
        setStep('enter');
        return;
      }
      if (step === 'enter') {
        setFirst(code);
        setMessage(undefined);
        setStep('confirm');
        return;
      }
      if (code !== first) {
        setFirst('');
        setStep('enter');
        setMessage(t('security.mismatch'));
        return;
      }
      await setPasscode(code);
      setUnlocked(true);
      await updateSettings({ passcodeEnabled: true });
      router.back();
      showToast({ message: t('security.passcodeSet') });
    } catch (error) {
      logger.error('Passcode update failed', error);
      setMessage(t('common.somethingWentWrong'));
    } finally {
      setEntry('');
      setBusy(false);
    }
  };

  const onDigit = (digit: string) => {
    if (busy) return;
    const next = `${entry}${digit}`.slice(0, PASSCODE_LENGTH);
    setEntry(next);
    if (next.length === PASSCODE_LENGTH) void complete(next);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader
        title={mode === 'change' ? t('settings.changePasscode') : t('settings.passcode')}
        onClose={() => router.back()}
      />
      <View style={styles.center}>
        <PinPad
          title={title}
          message={message}
          messageIsError={message !== undefined}
          length={entry.length}
          disabled={busy}
          onDigit={onDigit}
          onBackspace={() => setEntry((e) => e.slice(0, -1))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingBottom: 48 },
});
