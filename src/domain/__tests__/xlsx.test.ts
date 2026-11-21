import { strFromU8, unzipSync } from 'fflate';

import {
  makeAccount,
  makeCategory,
  makeFund,
  makeFundEntry,
  makeTransaction,
} from '@/test/factories';

import { buildExcelSheets, type ExcelExportLabels } from '../excelExport';
import {
  buildXlsx,
  columnName,
  escapeXml,
  excelDateSerial,
  sanitizeSheetName,
  type XlsxCell,
  type XlsxSheet,
} from '../xlsx';

const NOW = new Date('2026-11-21T08:00:00.000Z');

function unpack(bytes: Uint8Array): Record<string, string> {
  const files = unzipSync(bytes);
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

const LABELS: ExcelExportLabels = {
  sheets: {
    transactions: 'Transactions',
    monthly: 'Monthly summary',
    categories: 'By category',
    accounts: 'Accounts',
    funds: 'Sinking funds',
    fundHistory: 'Fund history',
  },
  columns: {
    date: 'Date',
    type: 'Type',
    category: 'Category',
    amount: 'Amount',
    currency: 'Currency',
    account: 'Account',
    note: 'Note',
    toAccount: 'To account',
    toAmount: 'To amount',
    toCurrency: 'To currency',
    month: 'Month',
    income: 'Income',
    expenses: 'Expenses',
    net: 'Net',
    count: 'Transactions',
    total: 'Total',
    openingBalance: 'Opening balance',
    balance: 'Current balance',
    archived: 'Archived',
    fund: 'Fund',
    target: 'Target',
    targetDate: 'Target date',
    deposited: 'Set aside',
    spent: 'Spent',
  },
  types: { expense: 'Expense', income: 'Income', transfer: 'Transfer' },
  fundEntryTypes: { deposit: 'Set aside', spend: 'Spent' },
  yes: 'Yes',
  no: 'No',
  uncategorized: 'Uncategorized',
};

const values = (rows: readonly (readonly XlsxCell[])[]) => rows.map((r) => r.map((c) => c.value));

describe('xlsx helpers', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('converts local wall-clock time to a 1900-system date serial', () => {
    expect(excelDateSerial(new Date(2026, 0, 1))).toBe(46023);
    expect(excelDateSerial(new Date(1900, 2, 1))).toBe(61);
    expect(excelDateSerial(new Date(2026, 0, 1, 18, 0))).toBeCloseTo(46023.75, 10);
  });

  it('escapes markup and strips characters XML cannot hold', () => {
    expect(escapeXml('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
    expect(escapeXml('bell\u0007 tab\t nl\n')).toBe('bell tab\t nl\n');
    expect(escapeXml('lone\uD800 pair\uD83D\uDE00')).toBe('lone pair\uD83D\uDE00');
  });

  it('cleans sheet names Excel would reject', () => {
    expect(sanitizeSheetName('a/b:c*?[d]', 'S')).toBe('a b c   d');
    expect(sanitizeSheetName('   ', 'Sheet1')).toBe('Sheet1');
    expect(sanitizeSheetName('x'.repeat(40), 'S')).toHaveLength(31);
  });
});

describe('buildXlsx', () => {
  const sheet: XlsxSheet = {
    name: 'Data',
    headerRow: true,
    columnWidths: [12, 20],
    rows: [
      [
        { value: 'Name', style: { kind: 'header' } },
        { value: 'Amount', style: { kind: 'header' } },
      ],
      [{ value: 'Lunch & <coffee>' }, { value: -12.5, style: { kind: 'number', decimals: 2 } }],
      [{ value: 'Lunch & <coffee>' }, { value: new Date(2026, 0, 1) }],
      [{ value: null }, { value: Number.NaN }],
    ],
  };

  it('writes every part a spreadsheet app needs', () => {
    const files = unpack(buildXlsx([sheet], NOW));
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/app.xml',
      'docProps/core.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/sharedStrings.xml',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(files['xl/workbook.xml']).toContain('<sheet name="Data" sheetId="1" r:id="rId1"/>');
    expect(files['xl/workbook.xml']).toContain("'Data'!$A$1:$B$4");
  });

  it('stores text once in shared strings and numbers and dates as numeric cells', () => {
    const files = unpack(buildXlsx([sheet], NOW));
    const xml = files['xl/worksheets/sheet1.xml'] ?? '';
    expect(files['xl/sharedStrings.xml']).toContain('count="4" uniqueCount="3"');
    expect(files['xl/sharedStrings.xml']).toContain('Lunch &amp; &lt;coffee&gt;');
    expect(xml).toContain('<c r="A2" t="s"><v>2</v></c>');
    expect(xml).toContain('<c r="B2" s="5"><v>-12.5</v></c>');
    expect(xml).toContain('<c r="B3" s="2"><v>46023</v></c>');
    expect(xml).toContain('<row r="4"></row>');
    expect(xml).toContain('state="frozen"');
    expect(xml).toContain('<autoFilter ref="A1:B4"/>');
    expect(xml).toContain('<col min="2" max="2" width="20" customWidth="1"/>');
  });

  it('keeps sheet names unique and rejects an empty workbook', () => {
    const files = unpack(buildXlsx([sheet, sheet], NOW));
    expect(files['xl/workbook.xml']).toContain('name="Data (2)"');
    expect(() => buildXlsx([], NOW)).toThrow();
  });
});

describe('buildExcelSheets', () => {
  const usd = makeAccount({ id: 'usd', name: 'Wallet', currency: 'USD', initialBalance: 10000 });
  const jpy = makeAccount({ id: 'jpy', name: 'Yen', currency: 'JPY', sortOrder: 1 });
  const food = makeCategory({ id: 'food', name: 'Food' });
  const salary = makeCategory({ id: 'salary', name: 'Salary', type: 'income' });

  const transactions = [
    makeTransaction({
      id: 't2',
      amount: 1250,
      accountId: 'usd',
      categoryId: 'food',
      note: '=SUM(A1)',
      date: '2026-03-20T10:00:00.000Z',
    }),
    makeTransaction({
      id: 't1',
      type: 'income',
      amount: 500000,
      accountId: 'usd',
      categoryId: 'salary',
      date: '2026-02-28T09:00:00.000Z',
    }),
    makeTransaction({
      id: 't3',
      type: 'transfer',
      amount: 1000,
      toAmount: 1500,
      accountId: 'usd',
      toAccountId: 'jpy',
      date: '2026-03-21T10:00:00.000Z',
    }),
    makeTransaction({ id: 't4', amount: 800, accountId: 'jpy', date: '2026-03-22T10:00:00.000Z' }),
  ];

  const sheets = buildExcelSheets(
    { transactions, accounts: [jpy, usd], categories: [food, salary] },
    LABELS,
  );
  const [txSheet, monthly, byCategory, accounts] = sheets;

  it('lists transactions oldest first with signed major-unit amounts', () => {
    expect(sheets.map((s) => s.name)).toEqual([
      'Transactions',
      'Monthly summary',
      'By category',
      'Accounts',
    ]);
    const rows = values(txSheet?.rows ?? []);
    expect(rows[0]).toEqual([
      'Date',
      'Type',
      'Category',
      'Amount',
      'Currency',
      'Account',
      'Note',
      'To account',
      'To amount',
      'To currency',
    ]);
    expect(rows.slice(1).map((r) => [r[1], r[2], r[3], r[4]])).toEqual([
      ['Income', 'Salary', 5000, 'USD'],
      ['Expense', 'Food', -12.5, 'USD'],
      ['Transfer', '', -10, 'USD'],
      ['Expense', 'Uncategorized', -800, 'JPY'],
    ]);
    expect(rows[2]?.[6]).toBe('=SUM(A1)');
    expect(rows[3]?.slice(7)).toEqual(['Yen', 1500, 'JPY']);
    expect(rows[1]?.[0]).toEqual(new Date('2026-02-28T09:00:00.000Z'));
    expect(txSheet?.rows[2]?.[3]?.style).toEqual({ kind: 'number', decimals: 2 });
    expect(txSheet?.rows[4]?.[3]?.style).toEqual({ kind: 'number', decimals: 0 });
  });

  it('summarises income and expenses per month and currency, excluding transfers', () => {
    expect(values(monthly?.rows ?? []).slice(1)).toEqual([
      ['2026-02', 'USD', 5000, 0, 5000],
      ['2026-03', 'JPY', 0, 800, -800],
      ['2026-03', 'USD', 0, 12.5, -12.5],
    ]);
  });

  it('totals categories per type and currency', () => {
    expect(values(byCategory?.rows ?? []).slice(1)).toEqual([
      ['Uncategorized', 'Expense', 'JPY', 1, 800],
      ['Food', 'Expense', 'USD', 1, 12.5],
      ['Salary', 'Income', 'USD', 1, 5000],
    ]);
  });

  it('reports opening and current balances in account order', () => {
    expect(values(accounts?.rows ?? []).slice(1)).toEqual([
      ['Wallet', 'USD', 100, 5077.5, 'No'],
      ['Yen', 'JPY', 0, 700, 'No'],
    ]);
  });

  it('adds fund summary and history sheets only when funds exist', () => {
    const withFunds = buildExcelSheets(
      {
        transactions: [],
        accounts: [],
        categories: [],
        sinkingFunds: [
          makeFund({ id: 'f1', name: 'Vacation', currency: 'INR', targetAmount: 10000000 }),
        ],
        fundEntries: [
          makeFundEntry({ fundId: 'f1', amount: 2500000, date: '2026-10-01T10:00:00.000Z' }),
          makeFundEntry({
            fundId: 'f1',
            type: 'spend',
            amount: 500000,
            note: 'Hotel',
            date: '2026-11-01T10:00:00.000Z',
          }),
          makeFundEntry({ fundId: 'gone', amount: 1 }),
        ],
      },
      LABELS,
      NOW,
    );
    expect(withFunds.map((s) => s.name)).toEqual([
      'Transactions',
      'Monthly summary',
      'By category',
      'Accounts',
      'Sinking funds',
      'Fund history',
    ]);
    expect(values(withFunds[4]?.rows ?? []).slice(1)).toEqual([
      ['Vacation', 'INR', 100000, '', 25000, 5000, 20000, 'No'],
    ]);
    expect(
      values(withFunds[5]?.rows ?? [])
        .slice(1)
        .map((r) => r.slice(1)),
    ).toEqual([
      ['Vacation', 'Set aside', 25000, 'INR', ''],
      ['Vacation', 'Spent', -5000, 'INR', 'Hotel'],
    ]);
  });

  it('produces a workbook even with no data', () => {
    const empty = buildExcelSheets({ transactions: [], accounts: [], categories: [] }, LABELS);
    expect(empty.every((s) => s.rows.length === 1)).toBe(true);
    expect(() => buildXlsx(empty, NOW)).not.toThrow();
  });
});
