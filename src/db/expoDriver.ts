import * as SQLite from 'expo-sqlite';

import type { SqlDriver, SqlValue } from './sqlDatabase';

export async function openExpoDriver(name: string): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
  );
  const bind = (params?: readonly SqlValue[]): SQLite.SQLiteBindParams =>
    params ? [...params] : [];
  return {
    run: async (sql, params) => {
      const result = await db.runAsync(sql, bind(params));
      return { changes: result.changes };
    },
    all: <T>(sql: string, params?: readonly SqlValue[]) => db.getAllAsync<T>(sql, bind(params)),
    first: <T>(sql: string, params?: readonly SqlValue[]) => db.getFirstAsync<T>(sql, bind(params)),
    exec: (sql) => db.execAsync(sql),
    close: () => db.closeAsync(),
  };
}
