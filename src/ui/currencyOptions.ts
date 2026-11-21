import { currencyChoices, isPrimaryCurrency, type PrimaryCurrency } from '@/domain/currencies';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';

import type { SelectOption } from './components/SelectSheet';

function primaryName(code: PrimaryCurrency): string {
  switch (code) {
    case 'INR':
      return t('currencies.INR');
    case 'USD':
      return t('currencies.USD');
    case 'EUR':
      return t('currencies.EUR');
    default:
      return assertNever(code);
  }
}

/** "Indian rupee (₹)" for the main currencies, the ISO code for everything else. */
export function currencyLabel(code: string): string {
  return isPrimaryCurrency(code) ? primaryName(code) : code;
}

export function currencyOptions(current?: string): SelectOption<string>[] {
  return currencyChoices(current).map((code) => ({
    value: code,
    label: currencyLabel(code),
    description: isPrimaryCurrency(code) ? code : undefined,
  }));
}
