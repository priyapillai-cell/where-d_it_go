import { getDatabase } from '@/db/database';
import type { SqlDatabase } from '@/db/sqlDatabase';

import { notifyDataChanged } from './dataEvents';

/** Runs a write against the app database, then refreshes cached state and listeners. */
export async function write<T>(work: (db: SqlDatabase) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  const result = await work(db);
  await notifyDataChanged();
  return result;
}
