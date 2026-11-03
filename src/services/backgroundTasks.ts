import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { getDatabase } from '@/db/database';
import { logger } from '@/utils/logger';

import { runMaintenance } from './maintenanceService';

export const MAINTENANCE_TASK = 'pocket-ledger.maintenance';
/** Minutes; the OS treats this as a lower bound and schedules opportunistically. */
const MINIMUM_INTERVAL_MINUTES = 6 * 60;

TaskManager.defineTask(MAINTENANCE_TASK, async () => {
  try {
    await runMaintenance(await getDatabase(), { source: 'background' });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    logger.error('Background maintenance failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundTasks(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      logger.warn('Background tasks are restricted on this device');
      return false;
    }
    if (!(await TaskManager.isTaskRegisteredAsync(MAINTENANCE_TASK))) {
      await BackgroundTask.registerTaskAsync(MAINTENANCE_TASK, {
        minimumInterval: MINIMUM_INTERVAL_MINUTES,
      });
    }
    return true;
  } catch (error) {
    logger.warn('Could not register background task', error);
    return false;
  }
}
