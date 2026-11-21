import { z } from 'zod';

import { isValidCurrencyCode } from './money';
import {
  type Account,
  type Budget,
  type Category,
  err,
  type FundEntry,
  ok,
  type RecurringRule,
  type Result,
  type Settings,
  type SinkingFund,
  type Transaction,
} from './types';

export const BACKUP_FORMAT = 'pocket-ledger-backup';
export const BACKUP_VERSION = 2;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

const id = z.string().min(1).max(64);
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
const currency = z.string().refine(isValidCurrencyCode, 'Invalid currency');
const minor = z.number().int().refine(Number.isSafeInteger);
const positiveMinor = minor.refine((v) => v > 0, 'Must be positive');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const shortText = z.string().max(500);

export const accountSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  currency,
  initialBalance: minor,
  color,
  icon: z.string().min(1).max(64),
  includeInTotal: z.boolean(),
  isArchived: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoDate,
}) satisfies z.ZodType<Account>;

export const categorySchema = z.object({
  id,
  name: z.string().min(1).max(60),
  type: z.enum(['expense', 'income']),
  icon: z.string().min(1).max(64),
  color,
  sortOrder: z.number().int(),
  isArchived: z.boolean(),
}) satisfies z.ZodType<Category>;

export const transactionSchema = z.object({
  id,
  type: z.enum(['expense', 'income', 'transfer']),
  amount: positiveMinor,
  toAmount: positiveMinor.nullable(),
  accountId: id,
  toAccountId: id.nullable(),
  categoryId: id.nullable(),
  note: shortText,
  date: isoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
  recurringRuleId: id.nullable(),
  occurrenceKey: z.string().max(64).nullable(),
}) satisfies z.ZodType<Transaction>;

export const recurringRuleSchema = z.object({
  id,
  type: z.enum(['expense', 'income', 'transfer']),
  amount: positiveMinor,
  toAmount: positiveMinor.nullable(),
  accountId: id,
  toAccountId: id.nullable(),
  categoryId: id.nullable(),
  note: shortText,
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(1000),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  lastGeneratedAt: isoDate.nullable(),
  reminderDaysBefore: z.number().int().min(0).max(30).nullable(),
  isActive: z.boolean(),
  createdAt: isoDate,
}) satisfies z.ZodType<RecurringRule>;

export const budgetSchema = z.object({
  id,
  categoryId: id.nullable(),
  period: z.literal('monthly'),
  amount: positiveMinor,
  currency,
}) satisfies z.ZodType<Budget>;

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const sinkingFundSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  icon: z.string().min(1).max(64),
  color,
  currency,
  targetAmount: positiveMinor.nullable(),
  targetDate: calendarDay.nullable(),
  monthlyContribution: positiveMinor.nullable(),
  autoMode: z.enum(['fixed', 'leftover']).nullable().default(null),
  autoAccountId: id.nullable().default(null),
  autoLastMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable()
    .default(null),
  isArchived: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoDate,
}) satisfies z.ZodType<SinkingFund>;

export const fundEntrySchema = z.object({
  id,
  fundId: id,
  type: z.enum(['deposit', 'spend']),
  amount: positiveMinor,
  note: shortText,
  date: isoDate,
  accountId: id.nullable().default(null),
  createdAt: isoDate,
  updatedAt: isoDate,
}) satisfies z.ZodType<FundEntry>;

export const settingsSchema = z.object({
  defaultCurrency: currency,
  firstDayOfWeek: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  firstDayOfMonth: z.number().int().min(1).max(28),
  theme: z.enum(['light', 'dark', 'system']),
  passcodeEnabled: z.boolean(),
  biometricsEnabled: z.boolean(),
  language: z.enum(['system', 'en']),
}) satisfies z.ZodType<Settings>;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: isoDate,
  data: z.object({
    accounts: z.array(accountSchema),
    categories: z.array(categorySchema),
    transactions: z.array(transactionSchema),
    recurringRules: z.array(recurringRuleSchema),
    budgets: z.array(budgetSchema),
    /** Added in version 2; older backups have no sinking funds. */
    sinkingFunds: z.array(sinkingFundSchema).default([]),
    fundEntries: z.array(fundEntrySchema).default([]),
    settings: settingsSchema,
  }),
});

export type BackupData = z.infer<typeof backupSchema>['data'];
export type BackupFile = z.infer<typeof backupSchema>;

export function createBackup(data: BackupData, now: Date = new Date()): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export type BackupError =
  | { kind: 'notJson' }
  | { kind: 'schema'; issues: string[] }
  | { kind: 'integrity'; issues: string[] };

function checkIntegrity(data: BackupData): string[] {
  const issues: string[] = [];
  const unique = (label: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length) issues.push(`Duplicate ${label} ids`);
  };
  unique(
    'account',
    data.accounts.map((a) => a.id),
  );
  unique(
    'category',
    data.categories.map((c) => c.id),
  );
  unique(
    'transaction',
    data.transactions.map((t) => t.id),
  );
  unique(
    'recurring rule',
    data.recurringRules.map((r) => r.id),
  );
  unique(
    'budget',
    data.budgets.map((b) => b.id),
  );
  unique(
    'sinking fund',
    data.sinkingFunds.map((f) => f.id),
  );
  unique(
    'fund entry',
    data.fundEntries.map((e) => e.id),
  );

  const accountIds = new Set(data.accounts.map((a) => a.id));
  const categoryIds = new Set(data.categories.map((c) => c.id));
  const ruleIds = new Set(data.recurringRules.map((r) => r.id));
  const checkRefs = (
    label: string,
    item: Pick<Transaction, 'type' | 'accountId' | 'toAccountId' | 'categoryId'>,
  ) => {
    if (!accountIds.has(item.accountId)) issues.push(`${label}: unknown account`);
    if (item.type === 'transfer' && (!item.toAccountId || !accountIds.has(item.toAccountId))) {
      issues.push(`${label}: transfer without valid destination`);
    }
    if (item.categoryId !== null && !categoryIds.has(item.categoryId))
      issues.push(`${label}: unknown category`);
  };
  data.transactions.forEach((t) => {
    checkRefs(`Transaction ${t.id}`, t);
    if (t.recurringRuleId !== null && !ruleIds.has(t.recurringRuleId)) {
      issues.push(`Transaction ${t.id}: unknown recurring rule`);
    }
  });
  data.recurringRules.forEach((r) => checkRefs(`Recurring rule ${r.id}`, r));
  data.budgets.forEach((b) => {
    if (b.categoryId !== null && !categoryIds.has(b.categoryId))
      issues.push(`Budget ${b.id}: unknown category`);
  });
  data.sinkingFunds.forEach((f) => {
    if (f.autoAccountId !== null && !accountIds.has(f.autoAccountId))
      issues.push(`Sinking fund ${f.id}: unknown carryover account`);
  });
  const fundIds = new Set(data.sinkingFunds.map((f) => f.id));
  data.fundEntries.forEach((e) => {
    if (!fundIds.has(e.fundId)) issues.push(`Fund entry ${e.id}: unknown sinking fund`);
    if (e.accountId !== null && !accountIds.has(e.accountId))
      issues.push(`Fund entry ${e.id}: unknown account`);
  });
  return issues.slice(0, 20);
}

/** Validates untrusted backup text. Never throws. */
export function parseBackup(text: string): Result<BackupFile, BackupError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err({ kind: 'notJson' });
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    return err({
      kind: 'schema',
      issues: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  const issues = checkIntegrity(parsed.data.data);
  if (issues.length > 0) return err({ kind: 'integrity', issues });
  return ok(parsed.data);
}
