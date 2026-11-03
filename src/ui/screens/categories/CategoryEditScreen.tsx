import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CategoryType } from '@/domain/types';
import { MAX_NAME_LENGTH } from '@/domain/validation';
import { t } from '@/i18n';
import {
  type CategoryFieldErrors,
  saveCategory,
  setCategoryArchived,
} from '@/services/categoryService';
import { write } from '@/services/writes';
import { useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { FieldLabel, TextField } from '../../components/FormField';
import { ModalHeader } from '../../components/ModalHeader';
import { ColorPicker, IconPicker } from '../../components/Pickers';
import { SegmentedControl } from '../../components/SegmentedControl';
import { PALETTE } from '../../theme/theme';
import { useTheme } from '../../theme/ThemeProvider';

export function CategoryEditScreen() {
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const existing = useAppStore((s) => s.categories.find((c) => c.id === params.id) ?? null);

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<CategoryType>(
    existing?.type ?? (params.type === 'income' ? 'income' : 'expense'),
  );
  const [color, setColor] = useState(existing?.color ?? PALETTE[5] ?? '#1E88E5');
  const [icon, setIcon] = useState(existing?.icon ?? 'shape-outline');
  const [errors, setErrors] = useState<CategoryFieldErrors>({});
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      const result = await write((db) =>
        saveCategory(db, { name, type, icon, color }, existing?.id),
      );
      if (!result.ok) {
        setErrors(result.error);
        return;
      }
      router.back();
    } catch (e) {
      logger.error('Saving category failed', e);
    } finally {
      setSaving(false);
    }
  };

  const onArchive = () => {
    if (!existing) return;
    const apply = () =>
      write((db) => setCategoryArchived(db, existing.id, !existing.isArchived))
        .then(() => router.back())
        .catch((e: unknown) => logger.error('Archiving category failed', e));
    if (existing.isArchived) {
      void apply();
      return;
    }
    Alert.alert(t('categories.archiveConfirm'), t('categories.archiveConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), onPress: () => void apply() },
    ]);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader
        title={existing ? t('categories.edit') : t('categories.new')}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.preview} accessible accessibilityLabel={t('categories.preview')}>
          <CategoryIcon icon={icon} color={color} size={64} />
          <AppText variant="subtitle">{name.trim() || t('categories.new')}</AppText>
        </View>
        {existing ? null : (
          <SegmentedControl
            segments={[
              { value: 'expense', label: t('types.expense') },
              { value: 'income', label: t('types.income') },
            ]}
            value={type}
            onChange={setType}
            accessibilityLabel={t('categories.type')}
          />
        )}
        <TextField
          label={t('categories.name')}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setErrors({});
          }}
          maxLength={MAX_NAME_LENGTH}
          autoFocus={!existing}
          error={errors.name}
        />
        <FieldLabel>{t('categories.color')}</FieldLabel>
        <ColorPicker value={color} onChange={setColor} />
        <FieldLabel>{t('categories.icon')}</FieldLabel>
        <IconPicker value={icon} color={color} onChange={setIcon} />
        {existing ? (
          <Button
            label={existing.isArchived ? t('common.unarchive') : t('common.archive')}
            icon={existing.isArchived ? 'archive-arrow-up-outline' : 'archive-outline'}
            variant="outline"
            onPress={onArchive}
            style={styles.archive}
          />
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={t('common.save')}
          icon="check"
          size="large"
          loading={saving}
          onPress={onSave}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  preview: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  archive: { marginTop: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
});
