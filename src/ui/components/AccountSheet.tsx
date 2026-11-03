import { useMemo } from 'react';

import type { Account } from '@/domain/types';
import { t } from '@/i18n';
import { money } from '@/i18n/format';
import { useAppStore } from '@/state/appStore';
import { ALL_ACCOUNTS } from '@/state/homeStore';

import { CategoryIcon } from './CategoryIcon';
import { type SelectOption, SelectSheet } from './SelectSheet';

export function AccountSheet({
  visible,
  title,
  selected,
  onSelect,
  onClose,
  includeAll = false,
  exclude,
  accounts: provided,
}: {
  visible: boolean;
  title?: string;
  selected: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  includeAll?: boolean;
  exclude?: string | null;
  accounts?: readonly Account[];
}) {
  const allAccounts = useAppStore((s) => s.accounts);
  const balances = useAppStore((s) => s.balances);
  const accounts = provided ?? allAccounts.filter((a) => !a.isArchived);

  const options = useMemo(() => {
    const list: SelectOption<string>[] = accounts
      .filter((a) => a.id !== exclude)
      .map((a) => ({
        value: a.id,
        label: a.name,
        description: money(balances.get(a.id) ?? a.initialBalance, a.currency),
        leading: <CategoryIcon icon={a.icon} color={a.color} size={36} />,
      }));
    if (includeAll) {
      list.unshift({
        value: ALL_ACCOUNTS,
        label: t('home.allAccounts'),
        leading: <CategoryIcon icon="wallet-outline" color="#546E7A" size={36} />,
      });
    }
    return list;
  }, [accounts, balances, exclude, includeAll]);

  return (
    <SelectSheet
      visible={visible}
      title={title ?? t('home.selectAccount')}
      options={options}
      selected={selected}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}
