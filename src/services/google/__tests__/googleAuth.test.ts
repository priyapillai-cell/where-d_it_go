import {
  type AccountStorage,
  emailFromIdToken,
  type GoogleAccount,
  GoogleAuthExpiredError,
  googleRedirectUri,
  GoogleTokenManager,
  reversedClientId,
  type TokenEndpoint,
} from '../googleAuth';
import { googleAvailability } from '../googleConfig';

function memoryStorage(initial: GoogleAccount | null = null) {
  let value = initial;
  const storage: AccountStorage = {
    load: async () => value,
    save: async (account) => {
      value = account;
    },
    clear: async () => {
      value = null;
    },
  };
  return { storage, get: () => value };
}

describe('GoogleTokenManager', () => {
  let clock: number;
  let refreshes: number;
  let revoked: string[];
  let endpoint: TokenEndpoint;

  beforeEach(() => {
    clock = 0;
    refreshes = 0;
    revoked = [];
    endpoint = {
      refresh: async () => {
        refreshes += 1;
        return { accessToken: `access-${refreshes}`, expiresIn: 3600 };
      },
      revoke: async (token) => {
        revoked.push(token);
      },
    };
  });

  it('reuses a valid token and refreshes shortly before expiry', async () => {
    const { storage } = memoryStorage();
    const tokens = new GoogleTokenManager(storage, endpoint, () => clock);
    await tokens.signIn(
      { refreshToken: 'r', email: 'a@b.c' },
      { accessToken: 'first', expiresIn: 3600 },
    );
    expect(await tokens.accessToken()).toBe('first');
    clock = 3_550_000;
    expect(await tokens.accessToken()).toBe('access-1');
    expect(await tokens.accessToken(true)).toBe('access-2');
  });

  it('shares one refresh between concurrent callers', async () => {
    const { storage } = memoryStorage({ refreshToken: 'r', email: null });
    const tokens = new GoogleTokenManager(storage, endpoint, () => clock);
    const results = await Promise.all([tokens.accessToken(), tokens.accessToken()]);
    expect(results).toEqual(['access-1', 'access-1']);
    expect(refreshes).toBe(1);
  });

  it('stores a rotated refresh token', async () => {
    const { storage, get } = memoryStorage({ refreshToken: 'old', email: 'x' });
    endpoint.refresh = async () => ({ accessToken: 'a', refreshToken: 'new' });
    await new GoogleTokenManager(storage, endpoint).accessToken();
    expect(get()).toEqual({ refreshToken: 'new', email: 'x' });
  });

  it('forgets the account when Google rejects the refresh token', async () => {
    const { storage, get } = memoryStorage({ refreshToken: 'r', email: null });
    endpoint.refresh = async () => {
      throw new GoogleAuthExpiredError();
    };
    const tokens = new GoogleTokenManager(storage, endpoint);
    await expect(tokens.accessToken()).rejects.toBeInstanceOf(GoogleAuthExpiredError);
    expect(get()).toBeNull();
    await expect(tokens.accessToken()).rejects.toThrow('Not signed in');
  });

  it('keeps the account on network errors', async () => {
    const { storage, get } = memoryStorage({ refreshToken: 'r', email: null });
    endpoint.refresh = async () => {
      throw new TypeError('Network request failed');
    };
    await expect(new GoogleTokenManager(storage, endpoint).accessToken()).rejects.toThrow(
      'Network',
    );
    expect(get()).not.toBeNull();
  });

  it('signs out locally even when revoking fails', async () => {
    const { storage, get } = memoryStorage({ refreshToken: 'r', email: null });
    endpoint.revoke = async (token) => {
      revoked.push(token);
      throw new Error('offline');
    };
    await new GoogleTokenManager(storage, endpoint).signOut();
    expect(revoked).toEqual(['r']);
    expect(get()).toBeNull();
  });
});

it('derives the iOS redirect from the client id', () => {
  const id = '123-abc.apps.googleusercontent.com';
  expect(reversedClientId(id)).toBe('com.googleusercontent.apps.123-abc');
  expect(googleRedirectUri(id)).toBe('com.googleusercontent.apps.123-abc:/oauthredirect');
});

it('reads the email from an ID token and tolerates garbage', () => {
  const payload = Buffer.from(JSON.stringify({ email: 'me@example.com' })).toString('base64url');
  expect(emailFromIdToken(`h.${payload}.s`)).toBe('me@example.com');
  expect(emailFromIdToken('h.%%%.s')).toBeNull();
  expect(emailFromIdToken(undefined)).toBeNull();
});

describe('googleAvailability', () => {
  const clientId = '123-abc.apps.googleusercontent.com';
  it.each([
    [{ os: 'ios', executionEnvironment: 'bare', iosClientId: clientId }, 'available'],
    [{ os: 'ios', executionEnvironment: 'storeClient', iosClientId: clientId }, 'expoGo'],
    [{ os: 'android', executionEnvironment: 'bare', iosClientId: clientId }, 'unsupportedPlatform'],
    [{ os: 'ios', executionEnvironment: 'bare', iosClientId: '' }, 'notConfigured'],
    [{ os: 'ios', executionEnvironment: 'bare', iosClientId: 'not-a-client' }, 'notConfigured'],
  ])('%o → %s', (env, kind) => {
    expect(googleAvailability(env).kind).toBe(kind);
  });
});
