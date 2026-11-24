import {
  AuthRequest,
  exchangeCodeAsync,
  refreshAsync,
  ResponseType,
  revokeAsync,
  TokenTypeHint,
} from 'expo-auth-session';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import * as SecureStore from '@/services/secureStore';

import {
  type AccountStorage,
  emailFromIdToken,
  type GoogleAccount,
  GoogleAuthExpiredError,
  googleRedirectUri,
  GoogleTokenManager,
  type TokenGrant,
} from './googleAuth';
import { type GoogleAvailability, googleAvailability } from './googleConfig';

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/** Hidden app folder for sync and backups, plus files the app itself creates (the sheet). */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];

const ACCOUNT_KEY = 'pocket-ledger.google-account';

export function currentGoogleAvailability(): GoogleAvailability {
  const extra = Constants.expoConfig?.extra as { googleIosClientId?: unknown } | undefined;
  return googleAvailability({
    os: Platform.OS,
    executionEnvironment: Constants.executionEnvironment,
    iosClientId: typeof extra?.googleIosClientId === 'string' ? extra.googleIosClientId : undefined,
  });
}

function requireClientId(): string {
  const availability = currentGoogleAvailability();
  if (availability.kind !== 'available') throw new GoogleAuthExpiredError('Google unavailable');
  return availability.clientId;
}

const secureStorage: AccountStorage = {
  async load() {
    const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<GoogleAccount>;
      return typeof parsed.refreshToken === 'string'
        ? { refreshToken: parsed.refreshToken, email: parsed.email ?? null }
        : null;
    } catch {
      return null;
    }
  },
  save: (account) => SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(account)),
  clear: () => SecureStore.deleteItemAsync(ACCOUNT_KEY),
};

function isInvalidGrant(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'invalid_grant'
  );
}

export const googleTokens = new GoogleTokenManager(secureStorage, {
  async refresh(refreshToken): Promise<TokenGrant> {
    try {
      const response = await refreshAsync({ clientId: requireClientId(), refreshToken }, DISCOVERY);
      return {
        accessToken: response.accessToken,
        expiresIn: response.expiresIn,
        refreshToken: response.refreshToken,
      };
    } catch (error) {
      if (isInvalidGrant(error)) throw new GoogleAuthExpiredError();
      throw error;
    }
  },
  async revoke(token) {
    await revokeAsync(
      { clientId: requireClientId(), token, tokenTypeHint: TokenTypeHint.RefreshToken },
      DISCOVERY,
    );
  },
});

export type SignInResult = { kind: 'signedIn'; email: string | null } | { kind: 'cancelled' };

/** Opens Google's consent page in the system browser (PKCE, no client secret). */
export async function signInWithGoogle(): Promise<SignInResult> {
  const clientId = requireClientId();
  const redirectUri = googleRedirectUri(clientId);
  const request = new AuthRequest({
    clientId,
    redirectUri,
    scopes: GOOGLE_SCOPES,
    responseType: ResponseType.Code,
    usePKCE: true,
  });
  const result = await request.promptAsync(DISCOVERY);
  if (result.type === 'cancel' || result.type === 'dismiss') return { kind: 'cancelled' };
  if (result.type !== 'success' || !result.params.code) {
    throw new Error(result.type === 'error' ? (result.error?.message ?? 'error') : result.type);
  }
  const tokens = await exchangeCodeAsync(
    {
      clientId,
      redirectUri,
      code: result.params.code,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    DISCOVERY,
  );
  if (!tokens.refreshToken) throw new Error('Google did not return a refresh token');
  const email = emailFromIdToken(tokens.idToken);
  await googleTokens.signIn(
    { refreshToken: tokens.refreshToken, email },
    { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn },
  );
  return { kind: 'signedIn', email };
}
