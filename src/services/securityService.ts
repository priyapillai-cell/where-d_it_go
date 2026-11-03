import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import {
  type AttemptState,
  isValidPasscode,
  parseAttemptState,
  registerFailure,
  remainingLockout,
} from '@/domain/passcode';
import { t } from '@/i18n';
import { logger } from '@/utils/logger';

const HASH_KEY = 'pocket-ledger.passcode';
const ATTEMPTS_KEY = 'pocket-ledger.passcode-attempts';

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hash(passcode: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${passcode}`);
}

/**
 * Stores a salted SHA-256 of the passcode in the OS keychain/keystore. A 4-digit code has
 * little entropy, so protection comes from the secure store plus attempt throttling.
 */
export async function setPasscode(passcode: string): Promise<boolean> {
  if (!isValidPasscode(passcode)) return false;
  const salt = toHex(Crypto.getRandomBytes(16));
  await SecureStore.setItemAsync(HASH_KEY, `${salt}:${await hash(passcode, salt)}`);
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  return true;
}

export async function clearPasscode(): Promise<void> {
  await SecureStore.deleteItemAsync(HASH_KEY);
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
}

export async function hasPasscode(): Promise<boolean> {
  return (await SecureStore.getItemAsync(HASH_KEY)) !== null;
}

async function readAttempts(): Promise<AttemptState> {
  return parseAttemptState(await SecureStore.getItemAsync(ATTEMPTS_KEY));
}

export type VerifyResult =
  | { status: 'ok' }
  | { status: 'wrong' }
  | { status: 'locked'; seconds: number }
  | { status: 'missing' };

export async function lockoutRemaining(): Promise<number> {
  return remainingLockout(await readAttempts(), Date.now());
}

export async function verifyPasscode(passcode: string): Promise<VerifyResult> {
  const attempts = await readAttempts();
  const seconds = remainingLockout(attempts, Date.now());
  if (seconds > 0) return { status: 'locked', seconds };

  const stored = await SecureStore.getItemAsync(HASH_KEY);
  if (!stored) return { status: 'missing' };
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return { status: 'missing' };

  if ((await hash(passcode, salt)) === expected) {
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
    return { status: 'ok' };
  }
  const next = registerFailure(attempts, Date.now());
  await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify(next));
  const locked = remainingLockout(next, Date.now());
  return locked > 0 ? { status: 'locked', seconds: locked } : { status: 'wrong' };
}

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync())
    );
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('security.biometricPrompt'),
      cancelLabel: t('common.cancel'),
      disableDeviceFallback: true,
    });
    if (result.success) await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
    return result.success;
  } catch (error) {
    logger.warn('Biometric authentication failed', error);
    return false;
  }
}
