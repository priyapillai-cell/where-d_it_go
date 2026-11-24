import { listFunds } from '@/db/repositories/fundRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { parseBackup } from '@/domain/backup';
import { periodContaining } from '@/domain/periods';
import { DEFAULT_SETTINGS } from '@/domain/types';
import { createTestDatabase } from '@/test/nodeDatabase';

import { exportBackupJson, restoreBackup } from '../dataService';
import {
  deleteFund,
  deleteFundEntry,
  type FundInput,
  loadFundDetail,
  loadFundsDashboard,
  loadFundsOverview,
  moveFund,
  restoreFundEntry,
  saveFund,
  saveFundEntry,
  setFundArchived,
} from '../fundService';

let db: SqlDatabase;
const NOW = new Date('2026-11-21T08:00:00.000Z');

const vacation: FundInput = {
  name: ' Vacation ',
  icon: 'airplane',
  color: '#1E88E5',
  currency: 'INR',
  targetAmount: 15000000,
  targetDate: '2027-05-01',
  monthlyContribution: 2500000,
};

beforeEach(async () => {
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

async function createFund(input: FundInput = vacation) {
  const result = await saveFund(db, input, undefined, NOW);
  if (!result.ok) throw new Error('fund not saved');
  return result.value;
}

it('creates, edits and orders funds', async () => {
  const fund = await createFund();
  expect(fund).toMatchObject({ name: 'Vacation', sortOrder: 0, isArchived: false });
  const gifts = await createFund({ ...vacation, name: 'Gifts', targetAmount: null });
  expect(gifts.sortOrder).toBe(1);

  const edited = await saveFund(db, { ...vacation, name: 'Goa trip' }, fund.id, NOW);
  expect(edited.ok && edited.value).toMatchObject({ id: fund.id, name: 'Goa trip', sortOrder: 0 });

  await moveFund(db, gifts.id, -1);
  expect((await listFunds(db)).map((f) => f.name)).toEqual(['Gifts', 'Goa trip']);
});

it('rejects invalid input and locks the currency once money is recorded', async () => {
  const invalid = await saveFund(db, { ...vacation, name: '', targetAmount: 0 });
  expect(invalid.ok).toBe(false);

  const fund = await createFund();
  await saveFundEntry(db, fund.id, {
    type: 'deposit',
    amount: 1000,
    note: '',
    date: NOW.toISOString(),
  });
  const changed = await saveFund(db, { ...vacation, currency: 'USD' }, fund.id);
  expect(changed).toEqual({ ok: false, error: { currency: 'currencyLocked' } });
});

it('records deposits and spending and summarises each fund', async () => {
  const fund = await createFund();
  await saveFundEntry(
    db,
    fund.id,
    { type: 'deposit', amount: 5000000, note: ' Bonus ', date: '2026-11-01T10:00:00.000Z' },
    undefined,
    NOW,
  );
  await saveFundEntry(
    db,
    fund.id,
    { type: 'spend', amount: 1200000, note: 'Flights', date: '2026-11-15T10:00:00.000Z' },
    undefined,
    NOW,
  );

  const detail = await loadFundDetail(db, fund.id, NOW);
  expect(detail?.entries.map((e) => [e.type, e.amount, e.note])).toEqual([
    ['spend', 1200000, 'Flights'],
    ['deposit', 5000000, 'Bonus'],
  ]);
  expect(detail?.summary).toMatchObject({ balance: 3800000, remaining: 11200000, monthsLeft: 7 });

  const overview = await loadFundsOverview(db, NOW);
  expect(overview.totals).toEqual([{ currency: 'INR', balance: 3800000 }]);
  expect(await loadFundDetail(db, 'missing', NOW)).toBeNull();
});

it('refuses entries for unknown funds or invalid amounts', async () => {
  const entry = { type: 'deposit' as const, amount: 100, note: '', date: NOW.toISOString() };
  expect(await saveFundEntry(db, 'missing', entry)).toEqual({
    ok: false,
    error: { fund: 'required' },
  });
  const fund = await createFund();
  const bad = await saveFundEntry(db, fund.id, { ...entry, amount: -5 });
  expect(bad.ok).toBe(false);
});

it('deletes entries with undo and removes a fund with its entries', async () => {
  const fund = await createFund();
  const saved = await saveFundEntry(db, fund.id, {
    type: 'deposit',
    amount: 1000,
    note: '',
    date: NOW.toISOString(),
  });
  if (!saved.ok) throw new Error('entry not saved');

  const removed = await deleteFundEntry(db, saved.value.id);
  expect(removed?.id).toBe(saved.value.id);
  expect((await loadFundDetail(db, fund.id, NOW))?.entries).toHaveLength(0);
  expect(await restoreFundEntry(db, saved.value)).toBe(true);
  expect((await loadFundDetail(db, fund.id, NOW))?.entries).toHaveLength(1);

  await deleteFund(db, fund.id);
  expect(await listFunds(db)).toEqual([]);
  expect(await restoreFundEntry(db, saved.value)).toBe(false);
});

it('archives funds out of the active list and its totals', async () => {
  const fund = await createFund();
  await saveFundEntry(db, fund.id, {
    type: 'deposit',
    amount: 1000,
    note: '',
    date: NOW.toISOString(),
  });
  expect(await setFundArchived(db, fund.id, true)).toBe(true);
  const overview = await loadFundsOverview(db, NOW);
  expect(overview.active).toHaveLength(0);
  expect(overview.archived).toHaveLength(1);
  expect(overview.totals).toEqual([]);
  expect(await setFundArchived(db, 'missing', true)).toBe(false);
});

it('keeps funds through a JSON backup and restore', async () => {
  const fund = await createFund();
  await saveFundEntry(db, fund.id, {
    type: 'deposit',
    amount: 1000,
    note: '',
    date: NOW.toISOString(),
  });
  const json = await exportBackupJson(db, NOW);

  const other = await createTestDatabase();
  try {
    const parsed = parseBackup(json);
    if (!parsed.ok) throw new Error('backup did not parse');
    await restoreBackup(other, parsed.value);
    expect((await loadFundDetail(other, fund.id, NOW))?.summary.balance).toBe(1000);
  } finally {
    await other.close();
  }
});

it('loads the sinking fund dashboard for a period in the default currency', async () => {
  const fund = await createFund();
  const other = await createFund({ ...vacation, name: 'Euro trip', currency: 'EUR' });
  await saveFundEntry(db, fund.id, {
    type: 'deposit',
    amount: 50000,
    note: '',
    date: NOW.toISOString(),
  });
  await saveFundEntry(db, fund.id, {
    type: 'spend',
    amount: 12000,
    note: '',
    date: NOW.toISOString(),
  });
  await saveFundEntry(db, other.id, {
    type: 'spend',
    amount: 700,
    note: '',
    date: NOW.toISOString(),
  });
  const period = periodContaining('month', NOW, { firstDayOfWeek: 1, firstDayOfMonth: 1 });
  const settings = { ...DEFAULT_SETTINGS, defaultCurrency: 'INR', fundBudget: 20000 };

  const dashboard = await loadFundsDashboard(db, period, settings, NOW);
  expect(dashboard.spentInPeriod.get(fund.id)).toBe(12000);
  expect(dashboard.addedInPeriod.get(fund.id)).toBe(50000);
  expect(dashboard.budget?.progress).toMatchObject({ limit: 20000, spent: 12000 });
  expect(dashboard.history.at(-1)).toMatchObject({ added: 50000, spent: 12000, balance: 38000 });

  const noBudget = await loadFundsDashboard(db, period, { ...settings, fundBudget: null }, NOW);
  expect(noBudget.budget).toBeNull();

  const year = periodContaining('year', NOW, { firstDayOfWeek: 1, firstDayOfMonth: 1 });
  expect((await loadFundsDashboard(db, year, settings, NOW)).budget).toBeNull();
});
