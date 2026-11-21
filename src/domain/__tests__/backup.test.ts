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

it('reads funds saved before monthly carryover existed', () => {
  const backup = createBackup(sampleData());
  const {
    autoMode: _m,
    autoAccountId: _a,
    autoLastMonth: _l,
    ...oldFund
  } = backup.data.sinkingFunds[0]!;
  const { accountId: _e, ...oldEntry } = backup.data.fundEntries[0]!;
  const parsed = parseBackup(
    JSON.stringify({
      ...backup,
      data: { ...backup.data, sinkingFunds: [oldFund], fundEntries: [oldEntry] },
    }),
  );
  expect(parsed.ok && parsed.value.data.sinkingFunds[0]).toEqual(
    expect.objectContaining({ autoMode: null, autoAccountId: null, autoLastMonth: null }),
  );
  expect(parsed.ok && parsed.value.data.fundEntries[0]?.accountId).toBeNull();
});

it('round-trips carryover settings and rejects unknown carryover accounts', () => {
  const data = sampleData();
  const withCarryover: BackupData = {
    ...data,
    sinkingFunds: [
      makeFund({ id: 'f1', autoMode: 'leftover', autoAccountId: 'a1', autoLastMonth: '2026-11' }),
    ],
    fundEntries: [makeFundEntry({ id: 'e1', fundId: 'f1', accountId: 'a1' })],
  };
  const backup = createBackup(withCarryover, new Date('2026-11-21T00:00:00.000Z'));
  expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, value: backup });

  const dangling = createBackup({
    ...withCarryover,
    sinkingFunds: [makeFund({ id: 'f1', autoMode: 'fixed', autoAccountId: 'gone' })],
  });
  const parsed = parseBackup(JSON.stringify(dangling));
  expect(!parsed.ok && parsed.error.kind).toBe('integrity');
});
