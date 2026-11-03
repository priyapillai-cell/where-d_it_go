import type { Account, Category, CategoryType } from '@/domain/types';
import { newId } from '@/utils/id';

import { insertAccount } from './repositories/accountRepository';
import { insertCategory } from './repositories/categoryRepository';
import { saveSettings } from './repositories/settingsRepository';
import type { SqlExecutor } from './sqlDatabase';

interface CategorySeed {
  /** i18n key under `seed.categories`; resolved to a display name at seed time. */
  key: string;
  type: CategoryType;
  icon: string;
  color: string;
}

export const DEFAULT_CATEGORIES: readonly CategorySeed[] = [
  { key: 'food', type: 'expense', icon: 'cart', color: '#43A047' },
  { key: 'eatingOut', type: 'expense', icon: 'silverware-fork-knife', color: '#FB8C00' },
  { key: 'bills', type: 'expense', icon: 'receipt', color: '#E53935' },
  { key: 'house', type: 'expense', icon: 'home', color: '#8D6E63' },
  { key: 'transport', type: 'expense', icon: 'bus', color: '#1E88E5' },
  { key: 'car', type: 'expense', icon: 'car', color: '#3949AB' },
  { key: 'clothes', type: 'expense', icon: 'tshirt-crew', color: '#8E24AA' },
  { key: 'health', type: 'expense', icon: 'hospital-box', color: '#D81B60' },
  { key: 'entertainment', type: 'expense', icon: 'movie-open', color: '#F4511E' },
  { key: 'communications', type: 'expense', icon: 'cellphone', color: '#00ACC1' },
  { key: 'gifts', type: 'expense', icon: 'gift', color: '#C0CA33' },
  { key: 'sports', type: 'expense', icon: 'basketball', color: '#7CB342' },
  { key: 'pets', type: 'expense', icon: 'paw', color: '#6D4C41' },
  { key: 'toiletry', type: 'expense', icon: 'lotion-outline', color: '#5E35B1' },
  { key: 'salary', type: 'income', icon: 'briefcase', color: '#2E7D32' },
  { key: 'deposits', type: 'income', icon: 'bank', color: '#00897B' },
  { key: 'savings', type: 'income', icon: 'piggy-bank', color: '#F9A825' },
  { key: 'giftsReceived', type: 'income', icon: 'gift-outline', color: '#AD1457' },
];

export interface SeedOptions {
  currency: string;
  categoryName: (key: string) => string;
  accountName: string;
  now?: Date;
}

/** Inserts default categories, a sample "Cash" account and the default currency. */
export async function seedDefaults(db: SqlExecutor, options: SeedOptions): Promise<void> {
  const nowIso = (options.now ?? new Date()).toISOString();
  const order: Record<CategoryType, number> = { expense: 0, income: 0 };
  for (const seed of DEFAULT_CATEGORIES) {
    const category: Category = {
      id: newId(),
      name: options.categoryName(seed.key),
      type: seed.type,
      icon: seed.icon,
      color: seed.color,
      sortOrder: order[seed.type]++,
      isArchived: false,
    };
    await insertCategory(db, category);
  }
  const account: Account = {
    id: newId(),
    name: options.accountName,
    currency: options.currency,
    initialBalance: 0,
    color: '#00897B',
    icon: 'wallet',
    includeInTotal: true,
    isArchived: false,
    sortOrder: 0,
    createdAt: nowIso,
  };
  await insertAccount(db, account);
  await saveSettings(db, { defaultCurrency: options.currency });
}

export async function needsSeed(db: SqlExecutor): Promise<boolean> {
  const row = await db.first<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM categories) + (SELECT COUNT(*) FROM accounts) AS n',
  );
  return (row?.n ?? 0) === 0;
}
