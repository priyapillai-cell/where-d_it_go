import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getDatabase } from '@/db/database';
import { notifyDataChanged } from '@/services/dataEvents';
import { driveSync } from '@/services/google/driveSyncInstance';
import { runMaintenance } from '@/services/maintenanceService';
import { useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

/** Catches up recurring rules and syncs Google Drive whenever the app returns to the foreground. */
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
        .catch((error: unknown) => logger.error('Foreground maintenance failed', error))
        .finally(() => void driveSync.sync());
    });
    return () => subscription.remove();
  }, []);
}
