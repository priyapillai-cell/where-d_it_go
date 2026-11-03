import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/db/database';
import { needsSeed, seedDefaults } from '@/db/seed';
import { isValidCurrencyCode } from '@/domain/money';
import { deviceCurrency, t, type TranslationKey } from '@/i18n';
import { useAppStore } from '@/state/appStore';
import { setIdGenerator } from '@/utils/id';
import { logger } from '@/utils/logger';

import { registerBackgroundTasks } from './backgroundTasks';
import { notifyDataChanged } from './dataEvents';
import { runMaintenance } from './maintenanceService';

export async function seedIfEmpty(): Promise<void> {
  const db = await getDatabase();
  if (!(await needsSeed(db))) return;
  const currency = deviceCurrency();
  await db.transaction((tx) =>
    seedDefaults(tx, {
      currency: currency && isValidCurrencyCode(currency) ? currency : 'USD',
      accountName: t('seed.account'),
      categoryName: (key) => t(`seed.categories.${key}` as TranslationKey),
    }),
  );
}

/** Opens and migrates the DB, seeds a first run, loads state and catches up recurring rules. */
export async function bootstrapApp(): Promise<void> {
  setIdGenerator(() => Crypto.randomUUID());
  const store = useAppStore.getState();
  store.setStatus('loading');
  try {
    await seedIfEmpty();
    await store.refresh();
    store.setStatus('ready');
  } catch (error) {
    logger.error('Startup failed', error);
    store.setStatus('error', error instanceof Error ? error.message : String(error));
    return;
  }
  try {
    const created = await runMaintenance(await getDatabase(), { source: 'launch' });
    if (created > 0) await notifyDataChanged();
  } catch (error) {
    logger.error('Launch maintenance failed', error);
  }
  void registerBackgroundTasks();
}
