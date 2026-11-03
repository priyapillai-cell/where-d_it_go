import { makeAccount, makeCategory, makeTransaction } from '@/test/factories';

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
