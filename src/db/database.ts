import { openExpoDriver } from './expoDriver';
import { migrate } from './migrations';
import { createSqlDatabase, type SqlDatabase } from './sqlDatabase';

export const DATABASE_NAME = 'pocket-ledger.db';

let instance: Promise<SqlDatabase> | null = null;

async function open(): Promise<SqlDatabase> {
  const db = createSqlDatabase(await openExpoDriver(DATABASE_NAME));
  await migrate(db);
  return db;
}

/** Shared, lazily opened and migrated database (also used by background tasks). */
export function getDatabase(): Promise<SqlDatabase> {
  if (!instance) {
    instance = open().catch((error: unknown) => {
      instance = null;
      throw error;
    });
  }
  return instance;
}
