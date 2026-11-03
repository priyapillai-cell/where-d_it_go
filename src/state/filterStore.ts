import { create } from 'zustand';

import { EMPTY_FILTER, type TransactionFilter } from '@/domain/transactionFilter';

interface FilterState {
  filter: TransactionFilter;
  setFilter: (patch: Partial<TransactionFilter>) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  filter: EMPTY_FILTER,
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilters: () => set((s) => ({ filter: { ...EMPTY_FILTER, search: s.filter.search } })),
}));
