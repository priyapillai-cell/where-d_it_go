import { addMonths, isSameDay, startOfMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { calendarWeeks, weekdayOrder } from '@/domain/calendar';
import { getFormattingLocale, t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { useAppStore } from '@/state/appStore';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { IconButton } from './Button';

/** A month calendar drawn in plain React Native, so it behaves the same on every platform. */
export function CalendarGrid({
  value,
  onChange,
  minimumDate,
  maximumDate,
}: {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const { colors } = useTheme();
  const weekStartsOn = useAppStore((s) => s.settings.firstDayOfWeek);
  const [month, setMonth] = useState(() => startOfMonth(value));
  const [today] = useState(() => new Date());
  const locale = getFormattingLocale();

  const weeks = useMemo(
    () => calendarWeeks(month, weekStartsOn, minimumDate, maximumDate),
    [month, weekStartsOn, minimumDate, maximumDate],
  );
  const weekdays = useMemo(() => {
    const narrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    // 2023-01-01 was a Sunday, so day index i maps to January (1 + i).
    return weekdayOrder(weekStartsOn).map((i) => narrow.format(new Date(2023, 0, 1 + i)));
  }, [locale, weekStartsOn]);
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month);

  const canGoBack = !minimumDate || startOfMonth(minimumDate) < month;
  const canGoForward = !maximumDate || startOfMonth(maximumDate) > month;

  return (
    <View>
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label={t('calendar.previousMonth')}
          disabled={!canGoBack}
          onPress={() => setMonth((m) => addMonths(m, -1))}
        />
        <AppText
          variant="subtitle"
          align="center"
          style={styles.title}
          accessibilityLiveRegion="polite"
        >
          {title}
        </AppText>
        <IconButton
          icon="chevron-right"
          label={t('calendar.nextMonth')}
          disabled={!canGoForward}
          onPress={() => setMonth((m) => addMonths(m, 1))}
        />
      </View>
      <View style={styles.week}>
        {weekdays.map((label, i) => (
          <AppText
            key={i}
            variant="caption"
            color="textSecondary"
            align="center"
            style={styles.cell}
            aria-hidden
          >
            {label}
          </AppText>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]?.date.toISOString()} style={styles.week}>
          {week.map(({ date, inMonth, disabled }) => {
            const selected = isSameDay(date, value);
            const isToday = isSameDay(date, today);
            return (
              <Pressable
                key={date.toISOString()}
                accessibilityRole="button"
                accessibilityLabel={formatDate(date, 'long')}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => {
                  onChange(date);
                  if (!inMonth) setMonth(startOfMonth(date));
                }}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    selected && { backgroundColor: colors.primary },
                    !selected && isToday && { borderWidth: 1, borderColor: colors.primary },
                  ]}
                >
                  <AppText
                    variant="body"
                    tabular
                    color={selected ? 'onPrimary' : inMonth ? 'text' : 'textSecondary'}
                    style={disabled ? styles.disabled : undefined}
                  >
                    {date.getDate()}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.shortcuts}>
        {[0, -1].map((offset) => {
          const day = new Date(today);
          day.setDate(today.getDate() + offset);
          const outOfRange = calendarWeeks(day, weekStartsOn, minimumDate, maximumDate)
            .flat()
            .some((d) => d.disabled && isSameDay(d.date, day));
          if (outOfRange) return null;
          return (
            <Pressable
              key={offset}
              accessibilityRole="button"
              onPress={() => {
                onChange(day);
                setMonth(startOfMonth(day));
              }}
              style={({ pressed }) => [
                styles.shortcut,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <AppText variant="label">
                {offset === 0 ? t('common.today') : t('common.yesterday')}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.3 },
  shortcuts: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 8 },
  shortcut: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    minHeight: 36,
    justifyContent: 'center',
  },
});
