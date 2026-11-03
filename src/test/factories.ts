import type { Account, Category, RecurringRule, Transaction } from '@/domain/types';

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: nextId('acc'),
    name: 'Cash',
    currency: 'USD',
    initialBalance: 0,
    color: '#00897B',
    icon: 'wallet',
    includeInTotal: true,
    isArchived: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: nextId('cat'),
    name: 'Food',
    type: 'expense',
    icon: 'cart',
    color: '#43A047',
    sortOrder: 0,
    isArchived: false,
    ...overrides,
  };
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId('tx'),
    type: 'expense',
    amount: 1000,
    toAmount: null,
    accountId: 'acc',
    toAccountId: null,
    categoryId: null,
    note: '',
    date: '2026-03-15T12:00:00.000Z',
    createdAt: '2026-03-15T12:00:00.000Z',
    updatedAt: '2026-03-15T12:00:00.000Z',
    recurringRuleId: null,
    occurrenceKey: null,
    ...overrides,
  };
}

export function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: nextId('rule'),
    type: 'expense',
    amount: 120000,
    toAmount: null,
    accountId: 'acc',
    toAccountId: null,
    categoryId: null,
    note: 'Rent',
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-31T09:00:00.000Z',
    endDate: null,
    lastGeneratedAt: null,
    reminderDaysBefore: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
