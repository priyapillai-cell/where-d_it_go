import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { listFunds } from '@/db/repositories/fundRepository';
import { monthPeriodKey } from '@/domain/periods';
import {
  assertNever,
  BUDGET_LEFTOVER_MODES,
  type BudgetLeftoverMode,
  FUND_LEFTOVER_MODES,
  type FundLeftoverMode,
  type Settings,
} from '@/domain/types';
import { t } from '@/i18n';
import { money } from '@/i18n/format';
import { useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Card, ListRow, SectionTitle } from '../../components/FormField';
import { type SelectOption, SelectSheet } from '../../components/SelectSheet';
import { useDbQuery } from '../../hooks/useDbQuery';

type Sheet = 'none' | 'budgetLeftover' | 'fund' | 'account' | 'fundLeftover';

const NO_ACCOUNT = '';

function budgetLeftoverLabel(mode: BudgetLeftoverMode): string {
  switch (mode) {
    case 'none':
      return t('settings.budgetLeftoverNone');
    case 'nextMonth':
      return t('settings.budgetLeftoverNextMonth');
    case 'sinkingFund':
      return t('settings.budgetLeftoverSinkingFund');
    default:
      return assertNever(mode);
  }
}

function fundLeftoverLabel(mode: FundLeftoverMode): string {
  switch (mode) {
    case 'keep':
      return t('settings.fundLeftoverKeep');
    case 'nextMonth':
      return t('settings.fundLeftoverNextMonth');
    default:
      return assertNever(mode);
  }
}

function fundLeftoverHint(mode: FundLeftoverMode): string {
  switch (mode) {
    case 'keep':
      return t('settings.fundLeftoverHintKeep');
    case 'nextMonth':
      return t('settings.fundLeftoverHintNextMonth');
    default:
      return assertNever(mode);
  }
}

/** Sinking fund budget, both leftover options and the Overview checkbox. */
export function SinkingFundSettings() {
  const settings = useAppStore((s) => s.settings);
  const accounts = useAppStore((s) => s.accounts);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [sheet, setSheet] = useState<Sheet>('none');
  const currency = settings.defaultCurrency;
  const funds = (useDbQuery('settings-funds', (db) => listFunds(db, false)).data ?? []).filter(
    (f) => f.currency === currency,
  );
  const sameCurrencyAccounts = accounts.filter((a) => !a.isArchived && a.currency === currency);
  const fund = funds.find((f) => f.id === settings.budgetLeftoverFundId) ?? null;
  const account = sameCurrencyAccounts.find((a) => a.id === settings.budgetLeftoverAccountId);
  const thisMonth = monthPeriodKey(new Date(), settings.firstDayOfMonth);

  const save = (patch: Partial<Settings>) => {
    updateSettings(patch).catch((e: unknown) => logger.error('Saving settings failed', e));
  };

  const budgetHint = ((): string => {
    switch (settings.budgetLeftover) {
      case 'none':
        return t('settings.budgetLeftoverHintNone');
      case 'nextMonth':
        return t('settings.budgetLeftoverHintNextMonth');
      case 'sinkingFund':
        if (funds.length === 0) return t('settings.budgetLeftoverNoFunds', { currency });
        return t('settings.budgetLeftoverHintSinkingFund', {
          fund: fund?.name ?? t('funds.title'),
        });
      default:
        return assertNever(settings.budgetLeftover);
    }
  })();

  const sheetConfig = ((): {
    title: string;
    options: SelectOption<string>[];
    selected: string;
    onSelect: (value: string) => void;
  } | null => {
    switch (sheet) {
      case 'none':
        return null;
      case 'budgetLeftover':
        return {
          title: t('settings.budgetLeftover'),
          options: BUDGET_LEFTOVER_MODES.map((m) => ({ value: m, label: budgetLeftoverLabel(m) })),
          selected: settings.budgetLeftover,
          onSelect: (value) => {
            const mode = BUDGET_LEFTOVER_MODES.find((m) => m === value);
            if (!mode || mode === settings.budgetLeftover) return;
            save({
              budgetLeftover: mode,
              budgetLeftoverSince: mode === 'none' ? null : thisMonth,
              budgetLeftoverLastMonth: null,
              budgetLeftoverFundId:
                mode === 'sinkingFund'
                  ? (settings.budgetLeftoverFundId ?? funds[0]?.id ?? null)
                  : settings.budgetLeftoverFundId,
            });
          },
        };
      case 'fund':
        return {
          title: t('settings.budgetLeftoverFund'),
          options: funds.map((f) => ({ value: f.id, label: f.name })),
          selected: settings.budgetLeftoverFundId ?? '',
          onSelect: (value) => save({ budgetLeftoverFundId: value }),
        };
      case 'account':
        return {
          title: t('settings.budgetLeftoverAccount'),
          options: [
            { value: NO_ACCOUNT, label: t('settings.budgetLeftoverNoAccount') },
            ...sameCurrencyAccounts.map((a) => ({ value: a.id, label: a.name })),
          ],
          selected: settings.budgetLeftoverAccountId ?? NO_ACCOUNT,
          onSelect: (value) =>
            save({ budgetLeftoverAccountId: value === NO_ACCOUNT ? null : value }),
        };
      case 'fundLeftover':
        return {
          title: t('settings.fundLeftover'),
          options: FUND_LEFTOVER_MODES.map((m) => ({ value: m, label: fundLeftoverLabel(m) })),
          selected: settings.fundLeftover,
          onSelect: (value) => {
            const mode = FUND_LEFTOVER_MODES.find((m) => m === value);
            if (!mode || mode === settings.fundLeftover) return;
            save({ fundLeftover: mode, fundLeftoverSince: mode === 'keep' ? null : thisMonth });
          },
        };
      default:
        return assertNever(sheet);
    }
  })();

  return (
    <>
      <SectionTitle>{t('settings.sinkingFund')}</SectionTitle>
      <Card style={styles.card}>
        <ListRow
          icon="piggy-bank-outline"
          label={t('settings.fundBudget')}
          value={
            settings.fundBudget !== null
              ? money(settings.fundBudget, currency)
              : t('settings.fundBudgetNotSet')
          }
          onPress={() => router.push('/fund-budget')}
        />
        <ListRow
          icon="wallet-outline"
          label={t('settings.budgetLeftover')}
          value={budgetLeftoverLabel(settings.budgetLeftover)}
          onPress={() => setSheet('budgetLeftover')}
        />
        {settings.budgetLeftover === 'sinkingFund' && funds.length > 0 ? (
          <>
            <ListRow
              icon="arrow-right-bold-circle-outline"
              label={t('settings.budgetLeftoverFund')}
              value={fund?.name ?? t('settings.budgetLeftoverChooseFund')}
              onPress={() => setSheet('fund')}
            />
            <ListRow
              icon="bank-outline"
              label={t('settings.budgetLeftoverAccount')}
              value={account?.name ?? t('settings.budgetLeftoverNoAccount')}
              onPress={() => setSheet('account')}
            />
          </>
        ) : null}
      </Card>
      <AppText variant="caption" color="textSecondary" style={styles.hint}>
        {budgetHint}
      </AppText>
      <Card style={styles.card}>
        <ListRow
          icon="calendar-refresh"
          label={t('settings.fundLeftover')}
          value={fundLeftoverLabel(settings.fundLeftover)}
          onPress={() => setSheet('fundLeftover')}
        />
      </Card>
      <AppText variant="caption" color="textSecondary" style={styles.hint}>
        {fundLeftoverHint(settings.fundLeftover)}
      </AppText>

      {sheetConfig ? (
        <SelectSheet
          visible
          title={sheetConfig.title}
          options={sheetConfig.options}
          selected={sheetConfig.selected}
          onSelect={sheetConfig.onSelect}
          onClose={() => setSheet('none')}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  hint: { marginHorizontal: 16, marginTop: 0, marginBottom: 8 },
  card: { marginHorizontal: 16, marginBottom: 8 },
});
