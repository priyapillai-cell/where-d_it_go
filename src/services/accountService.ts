import {
  countAccountTransactions,
  getAccount,
  insertAccount,
  listAccounts,
  nextAccountSortOrder,
  reorderAccounts,
  updateAccount,
} from '@/db/repositories/accountRepository';
import type { SqlDatabase, SqlExecutor } from '@/db/sqlDatabase';
import { currencyFractionDigits } from '@/domain/money';
import { moveInList } from '@/domain/ordering';
import { type Account, err, ok, type Result } from '@/domain/types';
import { type FieldErrors, hasErrors, validateAccountDraft } from '@/domain/validation';
import { newId } from '@/utils/id';

export interface AccountInput {
  name: string;
  currency: string;
  initialBalance: number | null;
  color: string;
  icon: string;
  includeInTotal: boolean;
}

export type AccountFieldErrors = FieldErrors<'name' | 'currency' | 'initialBalance'>;

export async function saveAccount(
  db: SqlDatabase,
  input: AccountInput,
  existingId?: string,
): Promise<Result<Account, AccountFieldErrors>> {
  const currency = input.currency.trim().toUpperCase();
  const errors: AccountFieldErrors = validateAccountDraft({ ...input, currency });
  if (hasErrors(errors)) return err(errors);

  return db.transaction(async (tx) => {
    const existing = existingId ? await getAccount(tx, existingId) : null;
    if (existingId && !existing) return err({ name: 'required' });
    // Stored amounts are in the account currency's minor units, so the currency is fixed once used.
    if (
      existing &&
      existing.currency !== currency &&
      (await countAccountTransactions(tx, existing.id)) > 0
    ) {
      return err({ currency: 'currencyLocked' });
    }
    const account: Account = {
      id: existing?.id ?? newId(),
      name: input.name.trim(),
      currency,
      initialBalance: input.initialBalance ?? 0,
      color: input.color,
      icon: input.icon,
      includeInTotal: input.includeInTotal,
      isArchived: existing?.isArchived ?? false,
      sortOrder: existing?.sortOrder ?? (await nextAccountSortOrder(tx)),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    if (existing) await updateAccount(tx, account);
    else await insertAccount(tx, account);
    return ok(account);
  });
}

export type AccountActionError = 'notFound' | 'lastAccount';

async function isLastActive(db: SqlExecutor, id: string): Promise<boolean> {
  const active = await listAccounts(db, false);
  return active.length === 1 && active[0]?.id === id;
}

export async function setAccountArchived(
  db: SqlDatabase,
  id: string,
  archived: boolean,
): Promise<Result<void, AccountActionError>> {
  const account = await getAccount(db, id);
  if (!account) return err('notFound');
  if (archived && !account.isArchived && (await isLastActive(db, id))) return err('lastAccount');
  await updateAccount(db, { ...account, isArchived: archived });
  return ok(undefined);
}

export interface AccountUsage {
  /** Transactions in this account, including transfers to or from it. */
  transactions: number;
  recurringRules: number;
}

/** What deleting an account would remove, so the user can confirm with the full picture. */
export async function accountUsage(db: SqlExecutor, id: string): Promise<AccountUsage> {
  const row = await db.first<{ transactions: number; rules: number }>(
    `SELECT
       (SELECT COUNT(*) FROM transactions WHERE account_id = ? OR to_account_id = ?) AS transactions,
       (SELECT COUNT(*) FROM recurring_rules WHERE account_id = ? OR to_account_id = ?) AS rules`,
    [id, id, id, id],
  );
  return { transactions: row?.transactions ?? 0, recurringRules: row?.rules ?? 0 };
}

/**
 * Deletes an account together with its transactions (transfers to or from it included) and
 * its recurring rules, in one transaction. The last active account cannot be deleted.
 */
export async function deleteAccount(
  db: SqlDatabase,
  id: string,
): Promise<Result<void, AccountActionError>> {
  return db.transaction(async (tx) => {
    const account = await getAccount(tx, id);
    if (!account) return err('notFound');
    if (!account.isArchived && (await isLastActive(tx, id))) return err('lastAccount');
    await tx.run('DELETE FROM transactions WHERE account_id = ? OR to_account_id = ?', [id, id]);
    await tx.run('DELETE FROM recurring_rules WHERE account_id = ? OR to_account_id = ?', [id, id]);
    await tx.run('DELETE FROM accounts WHERE id = ?', [id]);
    return ok(undefined);
  });
}

/** Accounts that are not in `currency` and could still switch to it (nothing recorded yet). */
export async function accountsSwitchableTo(db: SqlDatabase, currency: string): Promise<Account[]> {
  const accounts = await listAccounts(db, false);
  const result: Account[] = [];
  for (const account of accounts) {
    if (account.currency === currency) continue;
    if ((await accountUsage(db, account.id)).transactions > 0) continue;
    result.push(account);
  }
  return result;
}

/**
 * Moves unused accounts to another currency, keeping the opening balance's face value
 * (₹100 stays 100 in the new currency). Accounts that gained transactions meanwhile are skipped.
 */
export async function switchAccountsCurrency(
  db: SqlDatabase,
  ids: readonly string[],
  currency: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    let switched = 0;
    for (const id of ids) {
      const account = await getAccount(tx, id);
      if (!account || account.currency === currency) continue;
      if ((await accountUsage(tx, id)).transactions > 0) continue;
      const scale =
        10 ** (currencyFractionDigits(currency) - currencyFractionDigits(account.currency));
      await updateAccount(tx, {
        ...account,
        currency,
        initialBalance: Math.round(account.initialBalance * scale),
      });
      switched += 1;
    }
    return switched;
  });
}

export async function moveAccount(db: SqlDatabase, id: string, direction: -1 | 1): Promise<void> {
  await db.transaction(async (tx) => {
    const ids = (await listAccounts(tx)).map((a) => a.id);
    await reorderAccounts(tx, moveInList(ids, id, direction));
  });
}
