import {
  isValidPasscode,
  lockoutSeconds,
  NO_ATTEMPTS,
  parseAttemptState,
  registerFailure,
  remainingLockout,
} from '../passcode';

it('accepts exactly four digits', () => {
  expect(isValidPasscode('0123')).toBe(true);
  expect(isValidPasscode('123')).toBe(false);
  expect(isValidPasscode('12345')).toBe(false);
  expect(isValidPasscode('12a4')).toBe(false);
});

it('throttles after five failures with a capped exponential delay', () => {
  expect(lockoutSeconds(4)).toBe(0);
  expect(lockoutSeconds(5)).toBe(30);
  expect(lockoutSeconds(6)).toBe(60);
  expect(lockoutSeconds(50)).toBe(900);
});

it('tracks failures and remaining lockout', () => {
  let state = NO_ATTEMPTS;
  for (let i = 0; i < 5; i += 1) state = registerFailure(state, 1_000);
  expect(state.failures).toBe(5);
  expect(remainingLockout(state, 1_000)).toBe(30);
  expect(remainingLockout(state, 31_000)).toBe(0);
});

it('recovers from corrupt persisted state', () => {
  expect(parseAttemptState(null)).toEqual(NO_ATTEMPTS);
  expect(parseAttemptState('{')).toEqual(NO_ATTEMPTS);
  expect(parseAttemptState('{"failures":"x","lockedUntil":1}')).toEqual(NO_ATTEMPTS);
  expect(parseAttemptState('{"failures":2,"lockedUntil":5}')).toEqual({
    failures: 2,
    lockedUntil: 5,
  });
});
