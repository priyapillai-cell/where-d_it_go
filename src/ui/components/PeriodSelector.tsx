import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { PERIOD_KINDS, type Period, type PeriodKind } from '@/domain/periods';
import { formatPeriod } from '@/i18n/format';
import { t } from '@/i18n';

import { AppText } from './AppText';
import { IconButton } from './Button';
import { Chip } from './Chip';
import { DatePickerModal } from './DatePickerModal';
import { SelectSheet } from './SelectSheet';

type RangeStep = 'idle' | 'from' | 'to';

/** iOS can't present a modal while another one is still animating out. */
const SHEET_DISMISS_MS = Platform.OS === 'ios' ? 400 : 0;

/**
 * Period navigation. With `kindMenu`, the Day/Week/… chips are replaced by a sheet that the
 * caller opens (for example from a filter button in its header).
 */
export function PeriodSelector({
  period,
  onKindChange,
  onShift,
  onCustomRange,
  kindMenu,
}: {
  period: Period;
  onKindChange: (kind: Exclude<PeriodKind, 'custom'>) => void;
  onShift: (direction: 1 | -1) => void;
  onCustomRange: (from: Date, to: Date) => void;
  kindMenu?: { visible: boolean; onClose: () => void };
}) {
  const [step, setStep] = useState<RangeStep>('idle');
  const [from, setFrom] = useState<Date>(period.start ?? new Date());
  const canShift = period.kind !== 'all';
  const label = formatPeriod(period);

  const choose = (kind: PeriodKind, delayMs = 0) => {
    if (kind !== 'custom') {
      onKindChange(kind);
      return;
    }
    setFrom(period.start ?? new Date());
    setTimeout(() => setStep('from'), delayMs);
  };

  return (
    <View style={styles.container}>
      {kindMenu ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kinds}
        >
          {PERIOD_KINDS.map((kind) => (
            <Chip
              key={kind}
              label={t(`periods.${kind}`)}
              selected={period.kind === kind}
              onPress={() => choose(kind)}
            />
          ))}
        </ScrollView>
      )}
      <View style={styles.nav}>
        <IconButton
          icon="chevron-left"
          label={t('periods.previous')}
          onPress={() => onShift(-1)}
          disabled={!canShift}
        />
        <AppText
          variant="subtitle"
          align="center"
          style={styles.label}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
        >
          {label}
        </AppText>
        <IconButton
          icon="chevron-right"
          label={t('periods.next')}
          onPress={() => onShift(1)}
          disabled={!canShift}
        />
      </View>
      {kindMenu ? (
        <SelectSheet
          visible={kindMenu.visible}
          title={t('periods.choosePeriod')}
          options={PERIOD_KINDS.map((kind) => ({ value: kind, label: t(`periods.${kind}`) }))}
          selected={period.kind}
          onSelect={(kind) => choose(kind, SHEET_DISMISS_MS)}
          onClose={kindMenu.onClose}
        />
      ) : null}
      <DatePickerModal
        visible={step === 'from'}
        title={`${t('periods.chooseRange')} · ${t('common.from')}`}
        value={from}
        onCancel={() => setStep('idle')}
        onConfirm={(date) => {
          setFrom(date);
          setStep('to');
        }}
      />
      <DatePickerModal
        visible={step === 'to'}
        title={`${t('periods.chooseRange')} · ${t('common.to')}`}
        value={from}
        minimumDate={from}
        onCancel={() => setStep('idle')}
        onConfirm={(date) => {
          setStep('idle');
          onCustomRange(from, date);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  kinds: { gap: 8, paddingHorizontal: 16 },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  label: { flex: 1 },
});
