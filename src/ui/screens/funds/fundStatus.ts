import type { FundStatus } from '@/domain/sinkingFunds';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';

import type { ThemeColors } from '../../theme/theme';

export function fundStatusPresentation(status: FundStatus): {
  color: keyof ThemeColors;
  icon: string;
  label: string;
} {
  switch (status) {
    case 'noTarget':
      return {
        color: 'textSecondary',
        icon: 'piggy-bank-outline',
        label: t('funds.statusNoTarget'),
      };
    case 'reached':
      return { color: 'success', icon: 'check-circle', label: t('funds.statusReached') };
    case 'inProgress':
      return { color: 'primary', icon: 'progress-clock', label: t('funds.statusInProgress') };
    case 'onTrack':
      return { color: 'success', icon: 'trending-up', label: t('funds.statusOnTrack') };
    case 'behind':
      return { color: 'warning', icon: 'alert', label: t('funds.statusBehind') };
    case 'overdue':
      return { color: 'danger', icon: 'calendar-alert', label: t('funds.statusOverdue') };
    default:
      return assertNever(status);
  }
}
