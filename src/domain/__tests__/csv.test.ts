import { makeAccount, makeCategory, makeTransaction } from '@/test/factories';

import { detectDelimiter, parseCsv, serializeCsv } from '../csv';
import { EXPORT_HEADER, transactionsToCsv } from '../csvExport';
import { guessMapping, missingRequiredFields, parseDateCell, validateImport } from '../csvImport';

describe('parseCsv / serializeCsv', () => {
  it('handles quotes, escaped quotes, embedded newlines, CRLF and BOM', () => {
    const text = '\uFEFFa,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\n1,2,3';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
      ['1', '2', '3'],
    ]);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('date;amount;note\n1;2;3')).toBe(';');
    expect(detectDelimiter('date\tamount\n1\t2')).toBe('\t');
    expect(parseCsv('a;"b;c"\n1;2')).toEqual([
      ['a', 'b;c'],
      ['1', '2'],
    ]);
  });

  it('round-trips through serialize', () => {
    const rows = [
      ['plain', 'with,comma', 'with "quote"', 'multi\nline'],
      ['', ' ', 'x', 'y'],
    ];
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });
});

describe('transactionsToCsv', () => {
  const usd = makeAccount({ id: 'usd', name: 'Wallet', currency: 'USD' });
  const jpy = makeAccount({ id: 'jpy', name: 'Yen', currency: 'JPY' });
  const food = makeCategory({ id: 'food', name: 'Food' });

  it('exports a stable header and major-unit amounts', () => {
    const csv = transactionsToCsv(
      [
        makeTransaction({
          amount: 1250,
          accountId: 'usd',
          categoryId: 'food',
          note: 'Lunch, with "friends"',
        }),
        makeTransaction({
          type: 'transfer',
          amount: 1000,
          toAmount: 1500,
          accountId: 'usd',
          toAccountId: 'jpy',
        }),
      ],
      [usd, jpy],
      [food],
    );
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...EXPORT_HEADER]);
    expect(rows[1]).toEqual([
      '2026-03-15T12:00:00.000Z',
      'expense',
      '12.50',
      'USD',
      'Wallet',
      'Food',
      'Lunch, with "friends"',
      '',
      '',
      '',
    ]);
    expect(rows[2]?.slice(7)).toEqual(['Yen', '1500', 'JPY']);
  });

  it('neutralises spreadsheet formulas', () => {
    const csv = transactionsToCsv(
      [makeTransaction({ accountId: 'usd', note: '=HYPERLINK("x")' })],
      [usd],
      [],
    );
    expect(parseCsv(csv)[1]?.[6]).toBe('\'=HYPERLINK("x")');
  });
});

describe('CSV import', () => {
  const wallet = makeAccount({ id: 'wallet', name: 'Wallet', currency: 'USD' });
  const bank = makeAccount({ id: 'bank', name: 'Bank', currency: 'USD' });
  const food = makeCategory({ id: 'food', name: 'Food', type: 'expense' });
  const salary = makeCategory({ id: 'salary', name: 'Salary', type: 'income' });
  const context = { accounts: [wallet, bank], categories: [food, salary] };
  const options = {
    hasHeader: true,
    dateFormat: 'iso' as const,
    decimalSeparator: '.' as const,
    defaultAccountId: 'wallet',
  };

  it('guesses a mapping from header synonyms', () => {
    expect(guessMapping(['Date', 'Description', 'Amount', 'Category'])).toEqual({
      date: 0,
      note: 1,
      amount: 2,
      category: 3,
    });
    expect(missingRequiredFields({ date: 0 })).toEqual(['amount']);
  });

  it('parses dates in several formats', () => {
    expect(parseDateCell('2026-03-15', 'iso')?.toISOString()).toBe('2026-03-15T12:00:00.000Z');
    expect(parseDateCell('2026-03-15T08:30:00Z', 'dmy')?.toISOString()).toBe(
      '2026-03-15T08:30:00.000Z',
    );
    expect(parseDateCell('15/03/2026', 'dmy')?.toISOString()).toBe('2026-03-15T12:00:00.000Z');
    expect(parseDateCell('03/15/2026 18:05', 'mdy')?.toISOString()).toBe(
      '2026-03-15T18:05:00.000Z',
    );
    expect(parseDateCell('15.03.26', 'dmy')?.toISOString()).toBe('2026-03-15T12:00:00.000Z');
    expect(parseDateCell('31/02/2026', 'dmy')).toBeNull();
    expect(parseDateCell('garbage', 'iso')).toBeNull();
  });

  it('validates rows, infers types from sign and collects errors without throwing', () => {
    const rows = parseCsv(
      [
        'date,amount,category,account,note',
        '2026-03-01,-12.50,Food,Wallet,Groceries',
        '2026-03-02,2500,Salary,Bank,March',
        '2026-03-03,-5,Coffee,,',
        'not-a-date,-1,Food,Wallet,',
        '2026-03-04,abc,Food,Wallet,',
        '2026-03-05,,Food,Wallet,',
        '2026-03-06,-3,Food,Unknown,Falls back to default',
      ].join('\n'),
    );
    const result = validateImport(rows, guessMapping(rows[0] ?? []), options, context);
    expect(result.totalRows).toBe(7);
    expect(result.errors.map((e) => [e.rowNumber, e.code])).toEqual([
      [5, 'invalidDate'],
      [6, 'invalidAmount'],
      [7, 'missingAmount'],
    ]);
    expect(result.candidates).toHaveLength(4);
    expect(result.candidates[0]).toMatchObject({
      type: 'expense',
      amount: 1250,
      accountId: 'wallet',
      categoryId: 'food',
    });
    expect(result.candidates[1]).toMatchObject({
      type: 'income',
      amount: 250000,
      accountId: 'bank',
      categoryId: 'salary',
    });
    expect(result.candidates[2]).toMatchObject({
      categoryId: null,
      newCategory: { name: 'Coffee', type: 'expense' },
    });
    expect(result.candidates[3]).toMatchObject({ accountId: 'wallet' });
  });

  it('round-trips its own export including transfers', () => {
    const exported = transactionsToCsv(
      [
        makeTransaction({ amount: 999, accountId: 'wallet', categoryId: 'food', note: '=sum' }),
        makeTransaction({
          type: 'transfer',
          amount: 5000,
          toAmount: 5000,
          accountId: 'wallet',
          toAccountId: 'bank',
        }),
      ],
      [wallet, bank],
      [food, salary],
    );
    const rows = parseCsv(exported);
    const result = validateImport(rows, guessMapping(rows[0] ?? []), options, context);
    expect(result.errors).toEqual([]);
    expect(result.candidates[0]).toMatchObject({
      type: 'expense',
      amount: 999,
      categoryId: 'food',
      note: '=sum',
    });
    expect(result.candidates[1]).toMatchObject({
      type: 'transfer',
      amount: 5000,
      toAmount: 5000,
      toAccountId: 'bank',
    });
  });

  it('rejects bad types and self-transfers', () => {
    const rows = [
      ['date', 'amount', 'type', 'account', 'to_account'],
      ['2026-03-01', '10', 'refund', 'Wallet', ''],
      ['2026-03-01', '10', 'transfer', 'Wallet', 'Wallet'],
      ['2026-03-01', '10', 'transfer', 'Wallet', 'Nowhere'],
    ];
    const result = validateImport(rows, guessMapping(rows[0] ?? []), options, context);
    expect(result.errors.map((e) => e.code)).toEqual([
      'invalidType',
      'sameAccount',
      'unknownToAccount',
    ]);
  });

  it('supports comma decimals and headerless files', () => {
    const rows = [['15/03/2026', '-1.234,50', 'Food']];
    const result = validateImport(
      rows,
      { date: 0, amount: 1, category: 2 },
      { ...options, hasHeader: false, dateFormat: 'dmy', decimalSeparator: ',' },
      context,
    );
    expect(result.candidates[0]).toMatchObject({ amount: 123450, type: 'expense', rowNumber: 1 });
  });
});
