import { create } from 'zustand';

import { getDatabase } from '@/db/database';
import { accountFlows, listAccounts } from '@/db/repositories/accountRepository';
import { listCategories } from '@/db/repositories/categoryRepository';
import { loadSettings, saveSettings } from '@/db/repositories/settingsRepository';
import { computeBalances } from '@/domain/balance';
import {
  type Account,
  type Category,
  DEFAULT_SETTINGS,
  type MinorUnits,
  type Settings,
} from '@/domain/types';
import { applyLanguage } from '@/i18n';

export type AppStatus = 'loading' | 'ready' | 'error';

interface AppState {
  status: AppStatus;
  error: string | null;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  balances: ReadonlyMap<string, MinorUnits>;
  /** Incremented after every committed write; screens re-query when it changes. */
  dataVersion: number;
  setStatus: (status: AppStatus, error?: string | null) => void;
  refresh: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'loading',
  error: null,
  settings: DEFAULT_SETTINGS,
  accounts: [],
  categories: [],
  balances: new Map(),
  dataVersion: 0,

  setStatus: (status, error = null) => set({ status, error }),

  refresh: async () => {
    const db = await getDatabase();
    const [settings, accounts, categories, flows] = await Promise.all([
      loadSettings(db),
      listAccounts(db),
      listCategories(db),
      accountFlows(db),
    ]);
    applyLanguage(settings.language);
    set({
      settings,
      accounts,
      categories,
      balances: computeBalances(accounts, flows),
      dataVersion: get().dataVersion + 1,
    });
  },

  updateSettings: async (patch) => {
    const db = await getDatabase();
    await saveSettings(db, patch);
    const settings = { ...get().settings, ...patch };
    applyLanguage(settings.language);
    set({ settings, dataVersion: get().dataVersion + 1 });
  },
}));

export const selectActiveAccounts = (s: AppState): Account[] =>
  s.accounts.filter((a) => !a.isArchived);

export function categoryMap(categories: readonly Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

export function accountMap(accounts: readonly Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]));
}
