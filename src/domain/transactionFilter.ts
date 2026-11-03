import type { MinorUnits, TransactionType } from './types';

export interface TransactionFilter {
  search: string;
  types: TransactionType[];
  accountIds: string[];
  categoryIds: string[];
  /** Inclusive lower bound (ISO). */
  from: string | null;
  /** Exclusive upper bound (ISO). */
  to: string | null;
  minAmount: MinorUnits | null;
  maxAmount: MinorUnits | null;
}

export const EMPTY_FILTER: TransactionFilter = {
  search: '',
  types: [],
  accountIds: [],
  categoryIds: [],
  from: null,
  to: null,
  minAmount: null,
  maxAmount: null,
};

/** Number of filter groups in use (search excluded), for the filter badge. */
export function activeFilterCount(filter: TransactionFilter): number {
  return [
    filter.types.length > 0,
    filter.accountIds.length > 0,
    filter.categoryIds.length > 0,
    filter.from !== null || filter.to !== null,
    filter.minAmount !== null || filter.maxAmount !== null,
  ].filter(Boolean).length;
}
