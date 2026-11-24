import Database from 'better-sqlite3';

import { migrate } from '@/db/migrations';
import {
  createSqlDatabase,
  type SqlDatabase,
  type SqlDriver,
  type SqlValue,
} from '@/db/sqlDatabase';

/** In-memory SQLite (better-sqlite3) behind the same driver interface the app uses. */
export function createNodeDriver(filename = ':memory:'): SqlDriver {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  const bind = (params?: readonly SqlValue[]) => (params ? [...params] : []);
  return {
    run: async (sql, params) => ({ changes: db.prepare(sql).run(...bind(params)).changes }),
    all: async <T>(sql: string, params?: readonly SqlValue[]) =>
      db.prepare(sql).all(...bind(params)) as T[],
    first: async <T>(sql: string, params?: readonly SqlValue[]) =>
      (db.prepare(sql).get(...bind(params)) as T | undefined) ?? null,
    exec: async (sql) => {
      db.exec(sql);
    },
    close: async () => {
      db.close();
    },
  };
}

export async function createTestDatabase(): Promise<SqlDatabase> {
  const db = createSqlDatabase(createNodeDriver());
  await migrate(db);
  return db;
}
