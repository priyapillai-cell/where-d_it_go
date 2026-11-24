export type GoogleAvailability =
  | { kind: 'available'; clientId: string }
  | { kind: 'expoGo' }
  | { kind: 'unsupportedPlatform' }
  | { kind: 'notConfigured' };

export interface GoogleEnvironment {
  os: string;
  /** `Constants.executionEnvironment`; `storeClient` means Expo Go. */
  executionEnvironment: string | undefined;
  iosClientId: string | undefined;
}

const CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/;

/**
 * Google sign-in needs the app's own URL scheme registered with an iOS OAuth client, which
 * Expo Go cannot provide. Android needs a separately registered client and is not set up.
 */
export function googleAvailability(env: GoogleEnvironment): GoogleAvailability {
  if (env.os !== 'ios') return { kind: 'unsupportedPlatform' };
  if (env.executionEnvironment === 'storeClient') return { kind: 'expoGo' };
  const clientId = env.iosClientId?.trim();
  if (!clientId || !CLIENT_ID_PATTERN.test(clientId)) return { kind: 'notConfigured' };
  return { kind: 'available', clientId };
}
