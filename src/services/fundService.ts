import {
  countFundEntries,
  deleteFund as deleteFundRow,
  deleteFundEntry as deleteEntryRow,
  getFund,
  getFundEntry,
  listAllFundEntries,
  listFundEntries,
  listFunds,
  nextFundSortOrder,
  reorderFunds,
  upsertFund,
  upsertFundEntry,
} from '@/db/repositories/fundRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { moveInList } from '@/domain/ordering';
import type { Period } from '@/domain/periods';
import {
  type FundMonth,
  fundMonthlyHistory,
  type FundSummary,
  fundTotalsByCurrency,
  summarizeFund,
  totalsByFund,
} from '@/domain/sinkingFunds';
import {
  err,
  type FundEntry,
  type FundEntryType,
  type MinorUnits,
  ok,
  type Result,
  type Settings,
  type SinkingFund,
} from '@/domain/types';
import {
  type FieldErrors,
  hasErrors,
  validateFundDraft,
  validateFundEntryDraft,
} from '@/domain/validation';
import { newId } from '@/utils/id';

import { loadFundMonthBudget, type MonthBudgetState } from './leftoverService';

export interface FundInput {
  name: string;
  icon: string;
  color: string;
  currency: string;
  targetAmount: MinorUnits | null;
  targetDate: string | null;
  monthlyContribution: MinorUnits | null;
}

export type FundFieldErrors = FieldErrors<
  'name' | 'currency' | 'targetAmount' | 'targetDate' | 'monthlyContribution'
>;

export async function saveFund(
  db: SqlDatabase,
  input: FundInput,
  existingId?: string,
  now: Date = new Date(),
): Promise<Result<SinkingFund, FundFieldErrors>> {
  const draft = { ...input, name: input.name.trim() };
  const errors: FundFieldErrors = validateFundDraft(draft);
  if (hasErrors(errors)) return err(errors);

  return db.transaction(async (tx) => {
    const existing = existingId ? await getFund(tx, existingId) : null;
    if (
      existing &&
      existing.currency !== draft.currency &&
      (await countFundEntries(tx, existing.id)) > 0
    ) {
      return err<FundFieldErrors>({ currency: 'currencyLocked' });
    }
    const fund: SinkingFund = {
      id: existing?.id ?? newId(),
      name: draft.name,
      icon: draft.icon,
      color: draft.color,
      currency: draft.currency,
      targetAmount: draft.targetAmount,
      targetDate: draft.targetDate,
      monthlyContribution: draft.monthlyContribution,
      isArchived: existing?.isArchived ?? false,
      sortOrder: existing?.sortOrder ?? (await nextFundSortOrder(tx)),
      createdAt: existing?.createdAt ?? now.toISOString(),
    };
    await upsertFund(tx, fund);
    return ok(fund);
  });
}

export async function setFundArchived(
  db: SqlDatabase,
  id: string,
  archived: boolean,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const fund = await getFund(tx, id);
    if (!fund) return false;
    await upsertFund(tx, { ...fund, isArchived: archived });
    return true;
  });
}

/** Deletes the fund together with all of its entries. */
export async function deleteFund(db: SqlDatabase, id: string): Promise<void> {
  await db.transaction((tx) => deleteFundRow(tx, id));
}

export async function moveFund(db: SqlDatabase, id: string, direction: -1 | 1): Promise<void> {
  await db.transaction(async (tx) => {
    const ids = (await listFunds(tx)).map((f) => f.id);
    await reorderFunds(tx, moveInList(ids, id, direction));
  });
}

export interface FundEntryInput {
  type: FundEntryType;
  amount: MinorUnits;
  note: string;
  date: string;
}

export type FundEntryErrors = FieldErrors<'amount' | 'note' | 'date' | 'fund'>;

export async function saveFundEntry(
  db: SqlDatabase,
  fundId: string,
  input: FundEntryInput,
  existingId?: string,
  now: Date = new Date(),
): Promise<Result<FundEntry, FundEntryErrors>> {
  const errors: FundEntryErrors = validateFundEntryDraft(input);
  if (hasErrors(errors)) return err(errors);

  return db.transaction(async (tx) => {
    if (!(await getFund(tx, fundId))) return err<FundEntryErrors>({ fund: 'required' });
    const existing = existingId ? await getFundEntry(tx, existingId) : null;
    const nowIso = now.toISOString();
    const entry: FundEntry = {
      id: existing?.id ?? newId(),
      fundId,
      type: input.type,
      amount: input.amount,
      note: input.note.trim(),
      date: new Date(input.date).toISOString(),
      accountId: existing?.accountId ?? null,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    await upsertFundEntry(tx, entry);
    return ok(entry);
  });
}

/** Deletes an entry and returns it so the caller can offer undo. */
export async function deleteFundEntry(db: SqlDatabase, id: string): Promise<FundEntry | null> {
  return db.transaction(async (tx) => {
    const entry = await getFundEntry(tx, id);
    if (!entry) return null;
    await deleteEntryRow(tx, id);
    return entry;
  });
}

/** Re-inserts a deleted entry; skipped if its fund was deleted meanwhile. */
export async function restoreFundEntry(db: SqlDatabase, entry: FundEntry): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (!(await getFund(tx, entry.fundId))) return false;
    await upsertFundEntry(tx, entry);
    return true;
  });
}

export interface FundOverviewItem {
  fund: SinkingFund;
  summary: FundSummary;
}

export interface FundsOverview {
  active: FundOverviewItem[];
  archived: FundOverviewItem[];
  totals: { currency: string; balance: MinorUnits }[];
}

function groupByFund(entries: readonly FundEntry[]): Map<string, FundEntry[]> {
  const byFund = new Map<string, FundEntry[]>();
  for (const entry of entries) {
    const list = byFund.get(entry.fundId) ?? [];
    list.push(entry);
    byFund.set(entry.fundId, list);
  }
  return byFund;
}

function overviewOf(funds: SinkingFund[], entries: FundEntry[], now: Date): FundsOverview {
  const byFund = groupByFund(entries);
  const items = funds.map((fund) => ({
    fund,
    summary: summarizeFund(fund, byFund.get(fund.id) ?? [], now),
  }));
  const balances = new Map(items.map((i) => [i.fund.id, i.summary.balance]));
  return {
    active: items.filter((i) => !i.fund.isArchived),
    archived: items.filter((i) => i.fund.isArchived),
    totals: fundTotalsByCurrency(funds, balances),
  };
}

export async function loadFundsOverview(db: SqlDatabase, now: Date): Promise<FundsOverview> {
  const [funds, entries] = await Promise.all([listFunds(db), listAllFundEntries(db)]);
  return overviewOf(funds, entries, now);
}

export interface FundsDashboard extends FundsOverview {
  /** The default currency: the budget and charts cover categories in it. */
  currency: string;
  spentInPeriod: Map<string, MinorUnits>;
  addedInPeriod: Map<string, MinorUnits>;
  /** The sinking fund budget of the period's month; `null` for other periods or when unset. */
  budget: MonthBudgetState | null;
  /** All categories in `currency` combined, last six months. */
  history: FundMonth[];
}

/** Everything the sinking fund screen and its overview card show. */
export async function loadFundsDashboard(
  db: SqlDatabase,
  period: Period,
  settings: Settings,
  now: Date = new Date(),
): Promise<FundsDashboard> {
  const [funds, entries] = await Promise.all([listFunds(db), listAllFundEntries(db)]);
  const currency = settings.defaultCurrency;
  const inCurrency = new Set(funds.filter((f) => f.currency === currency).map((f) => f.id));
  const from = period.start ?? new Date(0);
  const to = period.end ?? new Date(8.64e15);
  return {
    ...overviewOf(funds, entries, now),
    currency,
    spentInPeriod: totalsByFund(entries, 'spend', from, to),
    addedInPeriod: totalsByFund(entries, 'deposit', from, to),
    budget:
      period.kind === 'month' && period.start
        ? await loadFundMonthBudget(db, period.start, settings)
        : null,
    history: fundMonthlyHistory(
      entries.filter((e) => inCurrency.has(e.fundId)),
      now,
    ),
  };
}

export interface FundDetail extends FundOverviewItem {
  entries: FundEntry[];
  history: FundMonth[];
}

export async function loadFundDetail(
  db: SqlDatabase,
  id: string,
  now: Date,
): Promise<FundDetail | null> {
  const fund = await getFund(db, id);
  if (!fund) return null;
  const entries = await listFundEntries(db, id);
  return {
    fund,
    entries,
    summary: summarizeFund(fund, entries, now),
    history: fundMonthlyHistory(entries, now),
  };
}
