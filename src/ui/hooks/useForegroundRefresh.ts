import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getDatabase } from '@/db/database';
import { notifyDataChanged } from '@/services/dataEvents';
import { runMaintenance } from '@/services/maintenanceService';
import { useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

/** Catches up recurring rules whenever the app returns to the foreground. */
export function useForegroundRefresh(): void {
  const last = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const wasBackground = last.current !== 'active';
      last.current = next;
      if (next !== 'active' || !wasBackground || useAppStore.getState().status !== 'ready') return;
      getDatabase()
        .then((db) => runMaintenance(db, { source: 'foreground' }))
        .then((created) => (created > 0 ? notifyDataChanged() : undefined))
        .catch((error: unknown) => logger.error('Foreground maintenance failed', error));
    });
    return () => subscription.remove();
  }, []);
}
