import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '@/i18n';
import { logger } from '@/utils/logger';

const CHANNEL_ID = 'reminders';
let setupDone = false;

async function ensureSetup(): Promise<void> {
  if (setupDone) return;
  setupDone = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t('notifications.channelName'),
      importance: AndroidImportance.DEFAULT,
    });
  }
}

/** Asks for permission only when the user enables something that needs it. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensureSetup();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch (error) {
    logger.warn('Notification permission request failed', error);
    return false;
  }
}

async function canNotify(): Promise<boolean> {
  try {
    await ensureSetup();
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function notifyNow(title: string, body: string): Promise<void> {
  if (!(await canNotify())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch (error) {
    logger.warn('Immediate notification failed', error);
  }
}

/** Schedules (or replaces) a notification with a stable identifier. Past dates are skipped. */
export async function scheduleAt(
  identifier: string,
  date: Date,
  title: string,
  body: string,
): Promise<void> {
  await cancelScheduled(identifier);
  if (date.getTime() <= Date.now() || !(await canNotify())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: CHANNEL_ID,
      },
    });
  } catch (error) {
    logger.warn('Scheduling notification failed', error);
  }
}

export async function cancelScheduled(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Nothing scheduled under this id.
  }
}

export async function scheduledIdentifiers(): Promise<string[]> {
  try {
    return (await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier);
  } catch {
    return [];
  }
}

export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    logger.warn('Cancelling notifications failed', error);
  }
}
