import { router, useNavigation } from 'expo-router';
import { type ReactNode, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Category, CategoryType } from '@/domain/types';
import { t } from '@/i18n';
import { moveCategory, setCategoryArchived } from '@/services/categoryService';
import { write } from '@/services/writes';
import { useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button, IconButton } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Card, SectionTitle } from '../../components/FormField';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/States';
import { useTheme } from '../../theme/ThemeProvider';

function CategoryRow({ category, trailing }: { category: Category; trailing: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={category.name}
        accessibilityHint={t('categories.edit')}
        onPress={() => router.push({ pathname: '/category-edit', params: { id: category.id } })}
        style={({ pressed }) => [
          styles.rowMain,
          { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' },
        ]}
      >
        <CategoryIcon icon={category.icon} color={category.color} size={40} />
        <AppText variant="body" style={styles.flex} numberOfLines={1}>
          {category.name}
        </AppText>
      </Pressable>
      <View style={styles.trailing}>{trailing}</View>
    </View>
  );
}

export function CategoriesScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const categories = useAppStore((s) => s.categories);
  const [type, setType] = useState<CategoryType>('expense');

  const ofType = categories.filter((c) => c.type === type);
  const active = ofType.filter((c) => !c.isArchived);
  const archived = ofType.filter((c) => c.isArchived);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="plus"
          label={t('categories.add')}
          onPress={() => router.push({ pathname: '/category-edit', params: { type } })}
        />
      ),
    });
  }, [navigation, type]);

  const run = (work: Parameters<typeof write>[0]) => {
    write(work).catch((e: unknown) => logger.error('Category update failed', e));
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <SegmentedControl
        segments={[
          { value: 'expense', label: t('types.expense') },
          { value: 'income', label: t('types.income') },
        ]}
        value={type}
        onChange={setType}
        accessibilityLabel={t('categories.type')}
      />

      {active.length === 0 ? (
        <EmptyState icon="shape-outline" title={t('categories.empty')} />
      ) : (
        <Card>
          {active.map((category, index) => (
            <CategoryRow
              key={category.id}
              category={category}
              trailing={
                <>
                  <IconButton
                    icon="chevron-up"
                    size={20}
                    label={`${t('common.moveUp')}: ${category.name}`}
                    disabled={index === 0}
                    onPress={() => run((db) => moveCategory(db, category.id, -1))}
                  />
                  <IconButton
                    icon="chevron-down"
                    size={20}
                    label={`${t('common.moveDown')}: ${category.name}`}
                    disabled={index === active.length - 1}
                    onPress={() => run((db) => moveCategory(db, category.id, 1))}
                  />
                </>
              }
            />
          ))}
        </Card>
      )}

      <Button
        label={t('categories.add')}
        icon="plus"
        variant="tonal"
        onPress={() => router.push({ pathname: '/category-edit', params: { type } })}
      />

      {archived.length > 0 ? (
        <>
          <SectionTitle>{t('categories.archivedSection')}</SectionTitle>
          <Card>
            {archived.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                trailing={
                  <IconButton
                    icon="archive-arrow-up-outline"
                    label={`${t('common.unarchive')}: ${category.name}`}
                    onPress={() => run((db) => setCategoryArchived(db, category.id, false))}
                  />
                }
              />
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    minHeight: 60,
  },
  trailing: { flexDirection: 'row', paddingRight: 4 },
});
