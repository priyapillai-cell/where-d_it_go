import {
  countAccountTransactions,
  getAccount,
  insertAccount,
  listAccounts,
  nextAccountSortOrder,
  reorderAccounts,
  updateAccount,
} from '@/db/repositories/accountRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
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

export type AccountActionError = 'notFound' | 'lastAccount' | 'hasTransactions';

async function isLastActive(db: SqlDatabase, id: string): Promise<boolean> {
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

/** Only unused accounts can be deleted; anything with history must be archived instead. */
export async function deleteAccount(
  db: SqlDatabase,
  id: string,
): Promise<Result<void, AccountActionError>> {
  return db.transaction(async (tx) => {
    const account = await getAccount(tx, id);
    if (!account) return err('notFound');
    if ((await countAccountTransactions(tx, id)) > 0) return err('hasTransactions');
    const rules = await tx.first<{ n: number }>(
      'SELECT COUNT(*) AS n FROM recurring_rules WHERE account_id = ? OR to_account_id = ?',
      [id, id],
    );
    if ((rules?.n ?? 0) > 0) return err('hasTransactions');
    const active = await listAccounts(tx, false);
    if (!account.isArchived && active.length <= 1) return err('lastAccount');
    await tx.run('DELETE FROM accounts WHERE id = ?', [id]);
    return ok(undefined);
  });
}

export async function moveAccount(db: SqlDatabase, id: string, direction: -1 | 1): Promise<void> {
  await db.transaction(async (tx) => {
    const ids = (await listAccounts(tx)).map((a) => a.id);
    await reorderAccounts(tx, moveInList(ids, id, direction));
  });
}
