import { getAccount, insertAccount, listAccounts } from '@/db/repositories/accountRepository';
import { insertCategory, listCategories } from '@/db/repositories/categoryRepository';
import { insertTransaction } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { moveInList } from '@/domain/ordering';
import { makeAccount, makeCategory, makeTransaction } from '@/test/factories';
import { createTestDatabase } from '@/test/nodeDatabase';

import {
  type AccountInput,
  deleteAccount,
  moveAccount,
  saveAccount,
  setAccountArchived,
} from '../accountService';
import { moveCategory, saveCategory, setCategoryArchived } from '../categoryService';

let db: SqlDatabase;

const input: AccountInput = {
  name: ' Card ',
  currency: 'eur',
  initialBalance: 5000,
  color: '#1E88E5',
  icon: 'credit-card',
  includeInTotal: true,
};

beforeEach(async () => {
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

describe('moveInList', () => {
  it('swaps neighbours and ignores moves past the edges', () => {
    expect(moveInList(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInList(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInList(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moveInList(['a', 'b'], 'missing', 1)).toEqual(['a', 'b']);
  });
});

describe('accountService', () => {
  it('creates a normalised account at the end of the order', async () => {
    await insertAccount(db, makeAccount({ id: 'cash', sortOrder: 0 }));
    const result = await saveAccount(db, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ name: 'Card', currency: 'EUR', sortOrder: 1 });
  });

  it('rejects invalid input without writing', async () => {
    const result = await saveAccount(db, { ...input, name: '  ', currency: 'XX' });
    expect(result).toEqual({ ok: false, error: { name: 'required', currency: 'invalidCurrency' } });
    expect(await listAccounts(db)).toHaveLength(0);
  });

  it('locks the currency once the account has transactions', async () => {
    await insertAccount(db, makeAccount({ id: 'acc', currency: 'USD' }));
    await insertTransaction(db, makeTransaction({ accountId: 'acc' }));
    const result = await saveAccount(db, { ...input, currency: 'EUR' }, 'acc');
    expect(result).toEqual({ ok: false, error: { currency: 'currencyLocked' } });
    const renamed = await saveAccount(db, { ...input, currency: 'USD' }, 'acc');
    expect(renamed.ok).toBe(true);
    expect((await getAccount(db, 'acc'))?.name).toBe('Card');
  });

  it('never archives or deletes the last active account', async () => {
    await insertAccount(db, makeAccount({ id: 'only' }));
    expect(await setAccountArchived(db, 'only', true)).toEqual({ ok: false, error: 'lastAccount' });
    expect(await deleteAccount(db, 'only')).toEqual({ ok: false, error: 'lastAccount' });
  });

  it('archives accounts with history but only deletes unused ones', async () => {
    await insertAccount(db, makeAccount({ id: 'a' }));
    await insertAccount(db, makeAccount({ id: 'b' }));
    await insertAccount(db, makeAccount({ id: 'c' }));
    await insertTransaction(db, makeTransaction({ accountId: 'a' }));
    expect(await deleteAccount(db, 'a')).toEqual({ ok: false, error: 'hasTransactions' });
    expect((await setAccountArchived(db, 'a', true)).ok).toBe(true);
    expect((await getAccount(db, 'a'))?.isArchived).toBe(true);
    expect((await deleteAccount(db, 'c')).ok).toBe(true);
    expect((await listAccounts(db)).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('reorders accounts atomically', async () => {
    await insertAccount(db, makeAccount({ id: 'a', sortOrder: 0 }));
    await insertAccount(db, makeAccount({ id: 'b', sortOrder: 1 }));
    await moveAccount(db, 'b', -1);
    expect((await listAccounts(db)).map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('categoryService', () => {
  it('creates, renames and keeps the type of a category', async () => {
    const created = await saveCategory(db, {
      name: 'Pets',
      type: 'expense',
      icon: 'paw',
      color: '#6D4C41',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const edited = await saveCategory(
      db,
      { name: 'Pet care', type: 'income', icon: 'paw', color: '#6D4C41' },
      created.value.id,
    );
    expect(edited.ok && edited.value).toMatchObject({ name: 'Pet care', type: 'expense' });
  });

  it('validates names', async () => {
    const result = await saveCategory(db, { name: '', type: 'expense', icon: 'x', color: '#000' });
    expect(result).toEqual({ ok: false, error: { name: 'required' } });
  });

  it('archives without losing history and reorders within a type', async () => {
    await insertCategory(db, makeCategory({ id: 'e1', sortOrder: 0 }));
    await insertCategory(db, makeCategory({ id: 'e2', sortOrder: 1 }));
    await insertCategory(db, makeCategory({ id: 'i1', type: 'income', sortOrder: 0 }));
    await insertAccount(db, makeAccount({ id: 'acc' }));
    await insertTransaction(db, makeTransaction({ categoryId: 'e1' }));
    expect((await setCategoryArchived(db, 'e1', true)).ok).toBe(true);
    await moveCategory(db, 'e2', -1);
    const categories = await listCategories(db);
    expect(categories.filter((c) => c.type === 'expense').map((c) => c.id)).toEqual(['e2', 'e1']);
    expect(categories.find((c) => c.id === 'e1')?.isArchived).toBe(true);
  });
});
