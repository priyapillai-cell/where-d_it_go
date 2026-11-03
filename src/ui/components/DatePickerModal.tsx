import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFormattingLocale, t } from '@/i18n';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

export interface DatePickerModalProps {
  visible: boolean;
  value: Date;
  title?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

/** Keeps the original time of day so picking a date never moves a transaction to midnight. */
function withTimeOf(date: Date, source: Date): Date {
  const next = new Date(date);
  next.setHours(
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  );
  return next;
}

function IosSheet({
  value,
  title,
  minimumDate,
  maximumDate,
  onConfirm,
  onCancel,
}: Omit<DatePickerModalProps, 'visible'>) {
  const { colors, radius, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);
  return (
    <>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onCancel}
        accessibilityLabel={t('common.cancel')}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        {title ? (
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {title}
          </AppText>
        ) : null}
        <DateTimePicker
          value={draft}
          mode="date"
          display="inline"
          locale={getFormattingLocale()}
          themeVariant={dark ? 'dark' : 'light'}
          accentColor={colors.primary}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_, date) => date && setDraft(withTimeOf(date, value))}
        />
        <View style={styles.actions}>
          <Button
            label={t('common.cancel')}
            variant="text"
            onPress={onCancel}
            style={styles.action}
          />
          <Button label={t('common.done')} onPress={() => onConfirm(draft)} style={styles.action} />
        </View>
      </View>
    </>
  );
}

/** Date selection: the native dialog on Android, an inline calendar in a sheet on iOS. */
export function DatePickerModal(props: DatePickerModalProps) {
  const { visible, onCancel } = props;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const { value, minimumDate, maximumDate } = latest.current;
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (event, date) => {
        if (event.type === 'set' && date) latest.current.onConfirm(withTimeOf(date, value));
        else latest.current.onCancel();
      },
    });
  }, [visible]);

  if (Platform.OS === 'android') return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {visible ? <IosSheet {...props} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { paddingHorizontal: 16, paddingTop: 16 },
  title: { marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  action: { flex: 1 },
});
