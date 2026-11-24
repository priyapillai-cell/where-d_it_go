export interface GoogleAccount {
  refreshToken: string;
  email: string | null;
}

export interface AccountStorage {
  load(): Promise<GoogleAccount | null>;
  save(account: GoogleAccount): Promise<void>;
  clear(): Promise<void>;
}

export interface TokenGrant {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn?: number;
  refreshToken?: string;
}

export interface TokenEndpoint {
  /** Must throw `GoogleAuthExpiredError` when Google rejects the refresh token. */
  refresh(refreshToken: string): Promise<TokenGrant>;
  revoke(token: string): Promise<void>;
}

/** The user is signed out or revoked access; they need to connect Google again. */
export class GoogleAuthExpiredError extends Error {
  constructor(message = 'Google sign-in expired') {
    super(message);
    this.name = 'GoogleAuthExpiredError';
  }
}

const EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_LIFETIME_S = 3600;

/** Keeps a short-lived access token fresh from the refresh token held in secure storage. */
export class GoogleTokenManager {
  private cached: { token: string; expiresAt: number } | null = null;
  private refreshing: Promise<string> | null = null;

  constructor(
    private readonly storage: AccountStorage,
    private readonly endpoint: TokenEndpoint,
    private readonly now: () => number = Date.now,
  ) {}

  private remember(grant: TokenGrant): string {
    this.cached = {
      token: grant.accessToken,
      expiresAt: this.now() + (grant.expiresIn ?? DEFAULT_LIFETIME_S) * 1000,
    };
    return grant.accessToken;
  }

  async signIn(account: GoogleAccount, grant: TokenGrant): Promise<void> {
    await this.storage.save(account);
    this.remember(grant);
  }

  async account(): Promise<GoogleAccount | null> {
    return this.storage.load();
  }

  async accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cached && this.cached.expiresAt - EXPIRY_MARGIN_MS > this.now()) {
      return this.cached.token;
    }
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    const account = await this.storage.load();
    if (!account) throw new GoogleAuthExpiredError('Not signed in');
    try {
      const grant = await this.endpoint.refresh(account.refreshToken);
      if (grant.refreshToken && grant.refreshToken !== account.refreshToken) {
        await this.storage.save({ ...account, refreshToken: grant.refreshToken });
      }
      return this.remember(grant);
    } catch (error) {
      if (error instanceof GoogleAuthExpiredError) {
        this.cached = null;
        await this.storage.clear();
      }
      throw error;
    }
  }

  /** Forgets the account locally and asks Google to revoke access (best effort). */
  async signOut(): Promise<void> {
    const account = await this.storage.load();
    this.cached = null;
    await this.storage.clear();
    if (account) {
      try {
        await this.endpoint.revoke(account.refreshToken);
      } catch {
        // Offline or already revoked: the local copy is gone either way.
      }
    }
  }
}

/** `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc` (iOS URL scheme). */
export function reversedClientId(clientId: string): string {
  return clientId.split('.').reverse().join('.');
}

export function googleRedirectUri(clientId: string): string {
  return `${reversedClientId(clientId)}:/oauthredirect`;
}

/** Reads the signed-in address from an ID token so the user can see which account is linked. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { email?: unknown };
    return typeof json.email === 'string' ? json.email : null;
  } catch {
    return null;
  }
}
