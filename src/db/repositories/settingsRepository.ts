import { settingsSchema } from '@/domain/backup';
import { DEFAULT_SETTINGS, type Settings } from '@/domain/types';
import { logger } from '@/utils/logger';

import type { SqlExecutor } from '../sqlDatabase';

type SettingKey = keyof Settings;
const fieldSchemas = settingsSchema.shape;

/** Loads settings, falling back to the default for any missing or corrupt value. */
export async function loadSettings(
  db: SqlExecutor,
  defaults: Settings = DEFAULT_SETTINGS,
): Promise<Settings> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings: Settings = { ...defaults };
  for (const { key, value } of rows) {
    if (!(key in fieldSchemas)) continue;
    const field = key as SettingKey;
    try {
      const parsed = fieldSchemas[field].safeParse(JSON.parse(value));
      if (parsed.success) Object.assign(settings, { [field]: parsed.data });
      else logger.warn(`Ignoring invalid setting ${field}`);
    } catch {
      logger.warn(`Ignoring unreadable setting ${field}`);
    }
  }
  return settings;
}

export async function saveSettings(db: SqlExecutor, patch: Partial<Settings>): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !(key in fieldSchemas)) continue;
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }
}
