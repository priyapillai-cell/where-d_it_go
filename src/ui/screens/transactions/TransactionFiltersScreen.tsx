import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseAmount, toMajorString } from '@/domain/money';
import { customPeriod } from '@/domain/periods';
import { EMPTY_FILTER, type TransactionFilter } from '@/domain/transactionFilter';
import { TRANSACTION_TYPES, type TransactionType } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { useAppStore } from '@/state/appStore';
import { useFilterStore } from '@/state/filterStore';

import { Button } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Chip } from '../../components/Chip';
import { DatePickerModal } from '../../components/DatePickerModal';
import { FieldLabel, TextField } from '../../components/FormField';
import { ModalHeader } from '../../components/ModalHeader';
import { useTheme } from '../../theme/ThemeProvider';

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function amountText(value: number | null, currency: string): string {
  return value === null ? '' : toMajorString(value, currency);
}

/** Day before an exclusive upper bound, so the picker shows the last included day. */
function inclusiveEnd(iso: string): Date {
  const date = new Date(iso);
  date.setDate(date.getDate() - 1);
  return date;
}

export function TransactionFiltersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = useFilterStore((s) => s.filter);
  const setFilter = useFilterStore((s) => s.setFilter);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const currency = useAppStore((s) => s.settings.defaultCurrency);

  const [draft, setDraft] = useState<TransactionFilter>(current);
  const [minText, setMinText] = useState(amountText(current.minAmount, currency));
  const [maxText, setMaxText] = useState(amountText(current.maxAmount, currency));
  const [picker, setPicker] = useState<'none' | 'from' | 'to'>('none');
  const [amountError, setAmountError] = useState(false);

  const patch = (next: Partial<TransactionFilter>) => setDraft((d) => ({ ...d, ...next }));

  const fromDate = draft.from ? new Date(draft.from) : null;
  const toDate = draft.to ? inclusiveEnd(draft.to) : null;

  const setRange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      const range = customPeriod(from, to);
      patch({ from: range.start?.toISOString() ?? null, to: range.end?.toISOString() ?? null });
    } else if (from) {
      patch({ from: customPeriod(from, from).start?.toISOString() ?? null, to: null });
    } else if (to) {
      patch({ from: null, to: customPeriod(to, to).end?.toISOString() ?? null });
    } else {
      patch({ from: null, to: null });
    }
  };

  const parseBound = (text: string): number | null | 'invalid' => {
    if (text.trim() === '') return null;
    return parseAmount(text, currency, { allowNegative: false }) ?? 'invalid';
  };

  const onApply = () => {
    const min = parseBound(minText);
    const max = parseBound(maxText);
    if (min === 'invalid' || max === 'invalid') {
      setAmountError(true);
      return;
    }
    const [lo, hi] = min !== null && max !== null && min > max ? [max, min] : [min, max];
    setFilter({ ...draft, search: current.search, minAmount: lo, maxAmount: hi });
    router.back();
  };

  const onClear = () => {
    setDraft({ ...EMPTY_FILTER, search: current.search });
    setMinText('');
    setMaxText('');
    setAmountError(false);
  };

  const visibleCategories = categories.filter(
    (c) =>
      (draft.types.length === 0 || draft.types.includes(c.type)) &&
      (!c.isArchived || draft.categoryIds.includes(c.id)),
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader
        title={t('transactions.filters')}
        onClose={() => router.back()}
        right={<Button label={t('common.clear')} variant="text" onPress={onClear} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <FieldLabel>{t('transactions.type')}</FieldLabel>
        <View style={styles.wrap}>
          {TRANSACTION_TYPES.map((type: TransactionType) => (
            <Chip
              key={type}
              label={t(`types.${type}`)}
              selected={draft.types.includes(type)}
              onPress={() => patch({ types: toggle(draft.types, type) })}
            />
          ))}
        </View>

        <FieldLabel>{t('transactions.accounts')}</FieldLabel>
        <View style={styles.wrap}>
          {accounts.map((a) => (
            <Chip
              key={a.id}
              label={a.isArchived ? `${a.name} (${t('common.archived')})` : a.name}
              leading={<CategoryIcon icon={a.icon} color={a.color} size={24} />}
              selected={draft.accountIds.includes(a.id)}
              onPress={() => patch({ accountIds: toggle(draft.accountIds, a.id) })}
            />
          ))}
        </View>

        <FieldLabel>{t('transactions.categories')}</FieldLabel>
        <View style={styles.wrap}>
          {visibleCategories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              leading={<CategoryIcon icon={c.icon} color={c.color} size={24} />}
              selected={draft.categoryIds.includes(c.id)}
              onPress={() => patch({ categoryIds: toggle(draft.categoryIds, c.id) })}
            />
          ))}
        </View>

        <FieldLabel>{t('transactions.dateRange')}</FieldLabel>
        <View style={styles.wrap}>
          <Chip
            icon="calendar-start"
            label={`${t('common.from')}: ${fromDate ? formatDate(fromDate, 'medium') : t('transactions.anyDate')}`}
            selected={fromDate !== null}
            onPress={() => setPicker('from')}
          />
          <Chip
            icon="calendar-end"
            label={`${t('common.to')}: ${toDate ? formatDate(toDate, 'medium') : t('transactions.anyDate')}`}
            selected={toDate !== null}
            onPress={() => setPicker('to')}
          />
          {fromDate || toDate ? (
            <Chip icon="close" label={t('common.clear')} onPress={() => setRange(null, null)} />
          ) : null}
        </View>

        <FieldLabel>{`${t('transactions.amountRange')} (${currency})`}</FieldLabel>
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              label={t('transactions.minAmount')}
              value={minText}
              onChangeText={(v) => {
                setAmountError(false);
                setMinText(v);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label={t('transactions.maxAmount')}
              value={maxText}
              onChangeText={(v) => {
                setAmountError(false);
                setMaxText(v);
              }}
              keyboardType="decimal-pad"
              placeholder="∞"
              error={amountError ? 'invalidNumber' : undefined}
            />
          </View>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={t('common.apply')} icon="check" size="large" onPress={onApply} />
      </View>

      <DatePickerModal
        visible={picker !== 'none'}
        value={(picker === 'to' ? toDate : fromDate) ?? new Date()}
        title={picker === 'to' ? t('common.to') : t('common.from')}
        onCancel={() => setPicker('none')}
        onConfirm={(d) => {
          if (picker === 'from') setRange(d, toDate);
          else setRange(fromDate, d);
          setPicker('none');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
});
