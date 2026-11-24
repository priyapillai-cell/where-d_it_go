export const PASSCODE_LENGTH = 4;
/** Failed attempts allowed before throttling starts. */
export const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_SECONDS = 30;
const MAX_LOCKOUT_SECONDS = 15 * 60;

export function isValidPasscode(value: string): boolean {
  return new RegExp(`^\\d{${PASSCODE_LENGTH}}$`).test(value);
}

/** Lockout after `failures` consecutive wrong entries: 0, then 30 s doubling up to 15 min. */
export function lockoutSeconds(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  const exponent = Math.min(failures - FREE_ATTEMPTS, 10);
  return Math.min(BASE_LOCKOUT_SECONDS * 2 ** exponent, MAX_LOCKOUT_SECONDS);
}

export interface AttemptState {
  failures: number;
  /** Epoch ms until which entry is blocked; 0 when not locked. */
  lockedUntil: number;
}

export const NO_ATTEMPTS: AttemptState = { failures: 0, lockedUntil: 0 };

export function registerFailure(state: AttemptState, now: number): AttemptState {
  const failures = state.failures + 1;
  const seconds = lockoutSeconds(failures);
  return { failures, lockedUntil: seconds > 0 ? now + seconds * 1000 : 0 };
}

export function remainingLockout(state: AttemptState, now: number): number {
  return Math.max(0, Math.ceil((state.lockedUntil - now) / 1000));
}

/** Tolerates missing or tampered persisted state by falling back to a clean slate. */
export function parseAttemptState(raw: string | null): AttemptState {
  if (!raw) return NO_ATTEMPTS;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'failures' in value &&
      'lockedUntil' in value &&
      Number.isInteger(value.failures) &&
      typeof value.lockedUntil === 'number' &&
      Number.isFinite(value.lockedUntil)
    ) {
      return { failures: Number(value.failures), lockedUntil: value.lockedUntil };
    }
  } catch {
    // Fall through.
  }
  return NO_ATTEMPTS;
}
