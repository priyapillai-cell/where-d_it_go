import type { Account, MinorUnits, Transaction } from './types';

/** Money movement totals for one account, all in that account's currency. */
export interface AccountFlow {
  accountId: string;
  income: MinorUnits;
  expense: MinorUnits;
  transferOut: MinorUnits;
  transferIn: MinorUnits;
}

export function emptyFlow(accountId: string): AccountFlow {
  return { accountId, income: 0, expense: 0, transferOut: 0, transferIn: 0 };
}

type FlowTransaction = Pick<
  Transaction,
  'type' | 'amount' | 'toAmount' | 'accountId' | 'toAccountId'
>;

export function flowsFromTransactions(
  transactions: readonly FlowTransaction[],
): Map<string, AccountFlow> {
  const flows = new Map<string, AccountFlow>();
  const get = (id: string): AccountFlow => {
    let flow = flows.get(id);
    if (!flow) {
      flow = emptyFlow(id);
      flows.set(id, flow);
    }
    return flow;
  };
  for (const tx of transactions) {
    switch (tx.type) {
      case 'income':
        get(tx.accountId).income += tx.amount;
        break;
      case 'expense':
        get(tx.accountId).expense += tx.amount;
        break;
      case 'transfer':
        get(tx.accountId).transferOut += tx.amount;
        if (tx.toAccountId) get(tx.toAccountId).transferIn += tx.toAmount ?? tx.amount;
        break;
      default: {
        const unreachable: never = tx.type;
        throw new Error(`Unknown transaction type ${String(unreachable)}`);
      }
    }
  }
  return flows;
}

/** balance = initialBalance + income − expenses − transfers out + transfers in */
export function computeBalance(
  account: Pick<Account, 'initialBalance'>,
  flow?: AccountFlow,
): MinorUnits {
  if (!flow) return account.initialBalance;
  return account.initialBalance + flow.income - flow.expense - flow.transferOut + flow.transferIn;
}

export function computeBalances(
  accounts: readonly Account[],
  flows: ReadonlyMap<string, AccountFlow>,
): Map<string, MinorUnits> {
  return new Map(accounts.map((a) => [a.id, computeBalance(a, flows.get(a.id))]));
}

export interface CurrencyTotal {
  currency: string;
  total: MinorUnits;
}

/**
 * Sums balances per currency (amounts in different currencies are never added together).
 * Only non-archived accounts flagged `includeInTotal` contribute.
 */
export function totalsByCurrency(
  accounts: readonly Account[],
  balances: ReadonlyMap<string, MinorUnits>,
  preferredCurrency?: string,
): CurrencyTotal[] {
  const totals = new Map<string, MinorUnits>();
  for (const account of accounts) {
    if (!account.includeInTotal || account.isArchived) continue;
    totals.set(
      account.currency,
      (totals.get(account.currency) ?? 0) + (balances.get(account.id) ?? 0),
    );
  }
  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => {
      if (a.currency === preferredCurrency) return -1;
      if (b.currency === preferredCurrency) return 1;
      return a.currency.localeCompare(b.currency);
    });
}

/**
 * Net change a transaction causes across a set of accounts. A transfer between two accounts
 * that are both in the set nets to zero only when amounts match (same currency).
 */
export function netChangeForAccounts(
  tx: FlowTransaction,
  accountIds: ReadonlySet<string>,
): MinorUnits {
  switch (tx.type) {
    case 'income':
      return accountIds.has(tx.accountId) ? tx.amount : 0;
    case 'expense':
      return accountIds.has(tx.accountId) ? -tx.amount : 0;
    case 'transfer': {
      const out = accountIds.has(tx.accountId) ? -tx.amount : 0;
      const inc = tx.toAccountId && accountIds.has(tx.toAccountId) ? (tx.toAmount ?? tx.amount) : 0;
      return out + inc;
    }
    default: {
      const unreachable: never = tx.type;
      throw new Error(`Unknown transaction type ${String(unreachable)}`);
    }
  }
}
