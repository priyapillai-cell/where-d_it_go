import type { BudgetStatus } from '@/domain/budgets';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';

import type { ThemeColors } from '../../theme/theme';

export function statusPresentation(status: BudgetStatus): {
  color: keyof ThemeColors;
  icon: string;
  label: string;
} {
  switch (status) {
    case 'ok':
      return { color: 'success', icon: 'check-circle', label: t('budgets.statusOk') };
    case 'warning':
      return { color: 'warning', icon: 'alert', label: t('budgets.statusWarning') };
    case 'over':
      return { color: 'danger', icon: 'alert-octagon', label: t('budgets.statusOver') };
    default:
      return assertNever(status);
  }
}
