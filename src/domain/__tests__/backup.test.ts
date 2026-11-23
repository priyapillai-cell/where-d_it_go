import {
  makeAccount,
  makeCategory,
  makeFund,
  makeFundEntry,
  makeTransaction,
} from '@/test/factories';

import { type BackupData, createBackup, parseBackup } from '../backup';
import { DEFAULT_SETTINGS } from '../types';

function sampleData(): BackupData {
  const account = makeAccount({ id: 'a1' });
  const category = makeCategory({ id: 'c1' });
  return {
    accounts: [account],
    categories: [category],
    transactions: [makeTransaction({ accountId: 'a1', categoryId: 'c1' })],
    recurringRules: [],
    budgets: [{ id: 'b1', categoryId: null, period: 'monthly', amount: 50000, currency: 'USD' }],
    sinkingFunds: [makeFund({ id: 'f1' })],
    fundEntries: [makeFundEntry({ id: 'e1', fundId: 'f1' })],
    settings: DEFAULT_SETTINGS,
  };
}

it('round-trips a valid backup', () => {
  const backup = createBackup(sampleData(), new Date('2026-01-01T00:00:00.000Z'));
  const parsed = parseBackup(JSON.stringify(backup));
  expect(parsed).toEqual({ ok: true, value: backup });
});

it('rejects non-JSON and wrong shapes without throwing', () => {
  expect(parseBackup('{oops')).toEqual({ ok: false, error: { kind: 'notJson' } });
  const wrong = parseBackup(JSON.stringify({ format: 'something-else' }));
  expect(wrong.ok).toBe(false);
  if (!wrong.ok) expect(wrong.error.kind).toBe('schema');
});

it('rejects float amounts', () => {
  const data = sampleData();
  const backup = createBackup({
    ...data,
    transactions: [{ ...data.transactions[0]!, amount: 12.5 }],
  });
  const parsed = parseBackup(JSON.stringify(backup));
  expect(parsed.ok).toBe(false);
});

it('detects dangling references', () => {
  const data = sampleData();
  const backup = createBackup({
    ...data,
    transactions: [makeTransaction({ accountId: 'missing' })],
  });
  const parsed = parseBackup(JSON.stringify(backup));
  expect(parsed.ok).toBe(false);
  if (!parsed.ok) expect(parsed.error.kind).toBe('integrity');
});

it('accepts version 1 backups, which predate sinking funds', () => {
  const { sinkingFunds: _funds, fundEntries: _entries, ...v1Data } = sampleData();
  const parsed = parseBackup(
    JSON.stringify({ ...createBackup(sampleData()), version: 1, data: v1Data }),
  );
  expect(parsed.ok && parsed.value.data.sinkingFunds).toEqual([]);
  expect(parsed.ok && parsed.value.data.fundEntries).toEqual([]);
});

it('rejects fund entries that point at a missing fund', () => {
  const data = sampleData();
  const parsed = parseBackup(
    JSON.stringify(
      createBackup({ ...data, fundEntries: [makeFundEntry({ id: 'e2', fundId: 'nope' })] }),
    ),
  );
  expect(parsed.ok).toBe(false);
  if (!parsed.ok) expect(parsed.error.kind).toBe('integrity');
});

it('reads fund entries saved before they could come from an account', () => {
  const backup = createBackup(sampleData());
  const { accountId: _e, ...oldEntry } = backup.data.fundEntries[0]!;
  const parsed = parseBackup(
    JSON.stringify({ ...backup, data: { ...backup.data, fundEntries: [oldEntry] } }),
  );
  expect(parsed.ok && parsed.value.data.fundEntries[0]?.accountId).toBeNull();
});

it('fills in sinking fund settings missing from older backups', () => {
  const backup = createBackup(sampleData());
  const {
    fundBudget: _b,
    budgetLeftover: _l,
    fundLeftover: _f,
    showFundsOnOverview: _s,
    ...oldSettings
  } = backup.data.settings;
  const parsed = parseBackup(
    JSON.stringify({ ...backup, data: { ...backup.data, settings: oldSettings } }),
  );
  expect(parsed.ok && parsed.value.data.settings).toEqual(
    expect.objectContaining({
      fundBudget: null,
      budgetLeftover: 'none',
      fundLeftover: 'keep',
      showFundsOnOverview: false,
    }),
  );
});

it('round-trips sinking fund budget and leftover settings', () => {
  const data: BackupData = {
    ...sampleData(),
    fundEntries: [makeFundEntry({ id: 'e1', fundId: 'f1', accountId: 'a1' })],
    settings: {
      ...DEFAULT_SETTINGS,
      fundBudget: 20000,
      budgetLeftover: 'sinkingFund',
      budgetLeftoverFundId: 'f1',
      budgetLeftoverAccountId: 'a1',
      budgetLeftoverSince: '2026-11',
      budgetLeftoverLastMonth: '2026-11',
      fundLeftover: 'nextMonth',
      fundLeftoverSince: '2026-10',
      showFundsOnOverview: true,
    },
  };
  const backup = createBackup(data, new Date('2026-11-21T00:00:00.000Z'));
  expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, value: backup });
});

it('rejects a malformed leftover month', () => {
  const backup = createBackup({
    ...sampleData(),
    settings: { ...DEFAULT_SETTINGS, budgetLeftoverSince: 'November' },
  });
  expect(parseBackup(JSON.stringify(backup)).ok).toBe(false);
});
