import type { ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { IconButton } from './Button';
import { Icon } from './Icon';

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
  description?: string;
  leading?: ReactNode;
}

export interface SelectSheetProps<V extends string | number> {
  visible: boolean;
  title: string;
  options: readonly SelectOption<V>[];
  selected?: V | null;
  onSelect: (value: V) => void;
  onClose: () => void;
}

/** Modal bottom sheet with a single-choice list. */
export function SelectSheet<V extends string | number>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: SelectSheetProps<V>) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingBottom: insets.bottom + 8,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.header}>
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {title}
          </AppText>
          <IconButton icon="close" label={t('common.close')} onPress={onClose} />
        </View>
        <FlatList
          data={options}
          keyExtractor={(o) => String(o.value)}
          renderItem={({ item }) => {
            const isSelected = item.value === selected;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={[item.label, item.description].filter(Boolean).join(', ')}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' },
                ]}
              >
                {item.leading}
                <View style={styles.optionText}>
                  <AppText variant="body">{item.label}</AppText>
                  {item.description ? (
                    <AppText variant="caption" color="textSecondary">
                      {item.description}
                    </AppText>
                  ) : null}
                </View>
                <Icon
                  name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                  size={22}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { maxHeight: '75%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 8,
  },
  title: { flex: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
    gap: 12,
  },
  optionText: { flex: 1, paddingVertical: 8 },
});
