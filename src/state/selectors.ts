import type { Account } from '@/domain/types';

import { ALL_ACCOUNTS } from './homeStore';

export interface AccountScope {
  /** Accounts whose transactions are included. */
  accountIds: string[];
  /** Single currency shown; amounts in other currencies are never summed together. */
  currency: string;
}

/**
 * "All accounts" means every account in the default currency (falling back to the first
 * account's currency); a specific selection means just that account.
 */
export function scopeForSelection(
  accountId: string,
  accounts: readonly Account[],
  defaultCurrency: string,
): AccountScope {
  if (accountId !== ALL_ACCOUNTS) {
    const account = accounts.find((a) => a.id === accountId);
    if (account) return { accountIds: [account.id], currency: account.currency };
  }
  const currency = accounts.some((a) => a.currency === defaultCurrency)
    ? defaultCurrency
    : (accounts[0]?.currency ?? defaultCurrency);
  return { accountIds: accounts.filter((a) => a.currency === currency).map((a) => a.id), currency };
}
