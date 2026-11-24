import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { getDatabase } from '@/db/database';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

interface Settled<T> {
  key: string;
  data: T | undefined;
  error: Error | null;
}

/**
 * Runs a read query and re-runs it whenever `key` changes or any write commits (tracked via
 * the store's `dataVersion`). `key` must encode every input the query depends on.
 * Stale responses are discarded; previous data stays visible while reloading.
 */
export function useDbQuery<T>(key: string, query: (db: SqlDatabase) => Promise<T>): QueryState<T> {
  const dataVersion = useAppStore((s) => s.dataVersion);
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: '', data: undefined, error: null });
  const queryRef = useRef(query);
  const fullKey = `${key}|${dataVersion}|${nonce}`;

  useLayoutEffect(() => {
    queryRef.current = query;
  });

  useEffect(() => {
    let active = true;
    getDatabase()
      .then((db) => queryRef.current(db))
      .then((data) => {
        if (active) setSettled({ key: fullKey, data, error: null });
      })
      .catch((error: unknown) => {
        logger.error('Query failed', error);
        if (active) {
          setSettled((s) => ({
            ...s,
            key: fullKey,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [fullKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: settled.data, error: settled.error, loading: settled.key !== fullKey, reload };
}
