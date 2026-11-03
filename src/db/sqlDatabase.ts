export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
}

/** Query surface shared by the database and an open transaction. Repositories depend on this. */
export interface SqlExecutor {
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
}

export interface SqlDatabase extends SqlExecutor {
  /** Runs `work` atomically: every write inside commits together or none do. */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Raw driver operations; implemented for expo-sqlite (app) and better-sqlite3 (tests). */
export interface SqlDriver extends SqlExecutor {
  close(): Promise<void>;
}

/**
 * Wraps a driver with a FIFO lock so a transaction never interleaves with other statements
 * on the same connection (expo-sqlite's async API would otherwise let them slip into an open
 * BEGIN...COMMIT). Statements issued through the transaction handle bypass the lock.
 */
export function createSqlDatabase(driver: SqlDriver): SqlDatabase {
  let queue: Promise<unknown> = Promise.resolve();

  function locked<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    run: (sql, params) => locked(() => driver.run(sql, params)),
    all: <T>(sql: string, params?: readonly SqlValue[]) => locked(() => driver.all<T>(sql, params)),
    first: <T>(sql: string, params?: readonly SqlValue[]) =>
      locked(() => driver.first<T>(sql, params)),
    exec: (sql) => locked(() => driver.exec(sql)),
    transaction: <T>(work: (tx: SqlExecutor) => Promise<T>) =>
      locked(async () => {
        await driver.exec('BEGIN IMMEDIATE');
        try {
          const value = await work(driver);
          await driver.exec('COMMIT');
          return value;
        } catch (error) {
          await driver.exec('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }),
    close: () => locked(() => driver.close()),
  };
}
