import { Pressable, StyleSheet, View } from 'react-native';

import type { Category } from '@/domain/types';
import { t } from '@/i18n';
import { money } from '@/i18n/format';

import { CategoryIcon } from '../../components/CategoryIcon';
import { useTheme } from '../../theme/ThemeProvider';

export const RING_ICON = 52;
export const MAX_RING_ITEMS = 12;

export interface RingItem {
  category: Category;
  total: number;
}

function CategoryButton({
  item,
  currency,
  onPress,
}: {
  item: RingItem;
  currency: string;
  onPress: (c: Category) => void;
}) {
  const { colors } = useTheme();
  const spent = item.total > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.categoryA11y', {
        name: item.category.name,
        amount: money(item.total, currency),
      })}
      onPress={() => onPress(item.category)}
      style={({ pressed }) => [
        styles.button,
        { opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      <CategoryIcon icon={item.category.icon} color={item.category.color} size={44} />
      {spent ? (
        <View
          style={[styles.badge, { backgroundColor: colors.text, borderColor: colors.background }]}
        />
      ) : null}
    </Pressable>
  );
}

/** Places category buttons evenly on a circle around the donut, starting at 12 o'clock. */
export function CategoryRing({
  items,
  size,
  currency,
  onPress,
}: {
  items: readonly RingItem[];
  size: number;
  currency: string;
  onPress: (c: Category) => void;
}) {
  const radius = size / 2 - RING_ICON / 2 - 2;
  return (
    <>
      {items.map((item, i) => {
        const angle = (2 * Math.PI * i) / items.length - Math.PI / 2;
        const left = size / 2 + radius * Math.cos(angle) - RING_ICON / 2;
        const top = size / 2 + radius * Math.sin(angle) - RING_ICON / 2;
        return (
          <View key={item.category.id} style={[styles.slot, { left, top }]}>
            <CategoryButton item={item} currency={currency} onPress={onPress} />
          </View>
        );
      })}
    </>
  );
}

export function CategoryGrid({
  items,
  currency,
  onPress,
}: {
  items: readonly RingItem[];
  currency: string;
  onPress: (c: Category) => void;
}) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <CategoryButton key={item.category.id} item={item} currency={currency} onPress={onPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', width: RING_ICON, height: RING_ICON },
  button: { width: RING_ICON, height: RING_ICON, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
});
