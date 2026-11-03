import type { SqlDatabase } from './sqlDatabase';

/**
 * Ordered, append-only schema migrations. Index + 1 is the schema version stored in
 * `PRAGMA user_version`. Never edit a released migration; add a new one instead.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    initial_balance INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    include_in_total INTEGER NOT NULL DEFAULT 1,
    is_archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE recurring_rules (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    to_amount INTEGER,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id),
    note TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    interval INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
    start_date TEXT NOT NULL,
    end_date TEXT,
    last_generated_at TEXT,
    reminder_days_before INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    to_amount INTEGER CHECK (to_amount IS NULL OR to_amount > 0),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id),
    note TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    recurring_rule_id TEXT REFERENCES recurring_rules(id) ON DELETE SET NULL,
    occurrence_key TEXT,
    CHECK (type <> 'transfer' OR (to_account_id IS NOT NULL AND to_account_id <> account_id))
  );

  CREATE INDEX idx_transactions_date ON transactions(date);
  CREATE INDEX idx_transactions_account ON transactions(account_id, date);
  CREATE INDEX idx_transactions_to_account ON transactions(to_account_id) WHERE to_account_id IS NOT NULL;
  CREATE INDEX idx_transactions_category ON transactions(category_id, date);
  CREATE UNIQUE INDEX idx_transactions_occurrence
    ON transactions(recurring_rule_id, occurrence_key)
    WHERE recurring_rule_id IS NOT NULL AND occurrence_key IS NOT NULL;

  CREATE TABLE budgets (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_budgets_scope ON budgets(IFNULL(category_id, ''), currency, period);

  CREATE TABLE budget_alerts (
    budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,
    threshold INTEGER NOT NULL,
    notified_at TEXT NOT NULL,
    PRIMARY KEY (budget_id, period_key, threshold)
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDatabase): Promise<number> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${current} is newer than this app supports (${SCHEMA_VERSION}).`,
    );
  }
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    const sql = MIGRATIONS[version] as string;
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
  return SCHEMA_VERSION;
}
