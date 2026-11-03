import {
  getRecurringRule,
  listRecurringRules,
  setRuleWatermark,
} from '@/db/repositories/recurringRepository';
import { insertTransactionIfAbsent } from '@/db/repositories/transactionRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { dueOccurrences, transactionFromRule } from '@/domain/recurrence';
import { newId } from '@/utils/id';
import { logger } from '@/utils/logger';

export interface GenerationResult {
  created: number;
  failedRules: number;
}

let inFlight: Promise<GenerationResult> | null = null;

/**
 * Creates every due transaction for every active rule. Safe to call any number of times and
 * concurrently (app open + background task):
 *  - runs are de-duplicated in-process,
 *  - each rule is re-read inside its own DB transaction so the watermark is current,
 *  - inserts use a unique (rule, occurrence) index with INSERT OR IGNORE,
 *  - the watermark advances in the same transaction as the inserts.
 */
export function generateDueTransactions(
  db: SqlDatabase,
  now: Date = new Date(),
): Promise<GenerationResult> {
  if (!inFlight) {
    inFlight = run(db, now).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function run(db: SqlDatabase, now: Date): Promise<GenerationResult> {
  const result: GenerationResult = { created: 0, failedRules: 0 };
  const rules = await listRecurringRules(db);
  for (const candidate of rules) {
    if (dueOccurrences(candidate, now).length === 0) continue;
    try {
      result.created += await db.transaction(async (tx) => {
        const rule = await getRecurringRule(tx, candidate.id);
        if (!rule) return 0;
        const due = dueOccurrences(rule, now);
        const nowIso = now.toISOString();
        let created = 0;
        for (const date of due) {
          if (await insertTransactionIfAbsent(tx, transactionFromRule(rule, date, newId(), nowIso)))
            created += 1;
        }
        const last = due[due.length - 1];
        if (last) await setRuleWatermark(tx, rule.id, last.toISOString());
        return created;
      });
    } catch (error) {
      result.failedRules += 1;
      logger.error(`Recurring rule ${candidate.id} failed to generate`, error);
    }
  }
  return result;
}
