import { getDatabase } from '@/db/database';
import type { Category } from '@/domain/types';
import { t } from '@/i18n';
import { categoryUsage, deleteCategory } from '@/services/categoryService';
import { write } from '@/services/writes';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { showAlert } from '../../dialogs';

/** Asks first, saying how many records use the category, then deletes it. */
export async function confirmDeleteCategory(
  category: Category,
  onDeleted?: () => void,
): Promise<void> {
  const usage = await categoryUsage(await getDatabase(), category.id);
  const used = usage.transactions > 0 || usage.recurringRules > 0;
  const body = [
    used
      ? t('categories.deleteConfirmWithData', {
          transactions: usage.transactions,
          rules: usage.recurringRules,
        })
      : t('categories.deleteConfirmEmpty'),
    usage.budgets > 0 ? t('categories.deleteConfirmBudget') : null,
  ]
    .filter(Boolean)
    .join(' ');

  showAlert(t('categories.deleteConfirm', { name: category.name }), body, [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('common.delete'),
      style: 'destructive',
      onPress: () => {
        write((db) => deleteCategory(db, category.id))
          .then(() => {
            onDeleted?.();
            showToast({ message: t('categories.deleted') });
          })
          .catch((e: unknown) => {
            logger.error('Deleting category failed', e);
            showToast({ message: t('common.somethingWentWrong') });
          });
      },
    },
  ]);
}
