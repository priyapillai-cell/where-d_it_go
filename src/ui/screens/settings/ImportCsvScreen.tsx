import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { MAX_CSV_BYTES, parseCsv } from '@/domain/csv';
import {
  type ColumnMapping,
  DATE_FORMATS,
  type DateFormat,
  guessMapping,
  IMPORT_FIELDS,
  type ImportField,
  missingRequiredFields,
  parseDateCell,
  REQUIRED_IMPORT_FIELDS,
  validateImport,
} from '@/domain/csvImport';
import { assertNever } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate, money } from '@/i18n/format';
import { importCandidates } from '@/services/dataService';
import { pickTextFile, type ReadError } from '@/services/fileService';
import { write } from '@/services/writes';
import { selectActiveAccounts, useAppStore } from '@/state/appStore';
import { showToast } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { AccountSheet } from '../../components/AccountSheet';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionTitle, SwitchRow } from '../../components/FormField';
import { ModalHeader } from '../../components/ModalHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SelectSheet } from '../../components/SelectSheet';
import { useTheme } from '../../theme/ThemeProvider';

type Step = 'pick' | 'map' | 'review';
type Sheet =
  { kind: 'none' } | { kind: 'field'; field: ImportField } | { kind: 'date' } | { kind: 'account' };

const NOT_MAPPED = -1;
const MAX_ERRORS_SHOWN = 20;
const PREVIEW_ROWS = 5;

function readErrorMessage(error: Exclude<ReadError, 'canceled'>): string {
  switch (error) {
    case 'tooLarge':
      return t('importCsv.tooLarge');
    case 'readFailed':
      return t('importCsv.readFailed');
    default:
      return assertNever(error);
  }
}

/** First format that parses every sampled date cell, so most files need no manual choice. */
function guessDateFormat(
  rows: readonly (readonly string[])[],
  column: number | undefined,
): DateFormat {
  if (column === undefined) return 'iso';
  const samples = rows
    .slice(1, 21)
    .map((r) => r[column] ?? '')
    .filter((v) => v.trim() !== '');
  return DATE_FORMATS.find((f) => samples.every((v) => parseDateCell(v, f) !== null)) ?? 'iso';
}

export function ImportCsvScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useAppStore(useShallow(selectActiveAccounts));
  const categories = useAppStore((s) => s.categories);

  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [hasHeader, setHasHeader] = useState(true);
  const [dateFormat, setDateFormat] = useState<DateFormat>('iso');
  const [decimalSeparator, setDecimalSeparator] = useState<'.' | ','>('.');
  const [defaultAccountId, setDefaultAccountId] = useState(accounts[0]?.id ?? '');
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const [error, setError] = useState<string | undefined>();
  const [importing, setImporting] = useState(false);

  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const columnLabel = (index: number): string => {
    const header = hasHeader ? rows[0]?.[index]?.trim() : '';
    return header ? header : `${t('importCsv.column')} ${index + 1}`;
  };
  const sample = (index: number): string => rows[hasHeader ? 1 : 0]?.[index] ?? '';

  const missing = missingRequiredFields(mapping);
  const validation = useMemo(
    () =>
      step === 'review'
        ? validateImport(
            rows,
            mapping,
            { hasHeader, dateFormat, decimalSeparator, defaultAccountId },
            { accounts, categories },
          )
        : null,
    [
      step,
      rows,
      mapping,
      hasHeader,
      dateFormat,
      decimalSeparator,
      defaultAccountId,
      accounts,
      categories,
    ],
  );

  const onPick = async () => {
    setError(undefined);
    const picked = await pickTextFile(
      ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
      MAX_CSV_BYTES,
    );
    if (!picked.ok) {
      if (picked.error !== 'canceled') setError(readErrorMessage(picked.error));
      return;
    }
    const parsed = parseCsv(picked.value.text);
    if (parsed.length === 0) {
      setError(t('importCsv.emptyFile'));
      return;
    }
    const guessed = guessMapping(parsed[0] ?? []);
    setFileName(picked.value.name);
    setRows(parsed);
    setMapping(guessed);
    setDateFormat(guessDateFormat(parsed, guessed.date));
    setStep('map');
  };

  const onImport = async () => {
    if (!validation || validation.candidates.length === 0) return;
    setImporting(true);
    try {
      const count = await write((db) => importCandidates(db, validation.candidates));
      router.back();
      showToast({ message: t('importCsv.done', { count }) });
    } catch (e) {
      logger.error('Import failed', e);
      setError(t('common.somethingWentWrong'));
    } finally {
      setImporting(false);
    }
  };

  const defaultAccount = accounts.find((a) => a.id === defaultAccountId);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const newCategoryCount = validation
    ? new Set(
        validation.candidates
          .map((c) => c.newCategory)
          .filter((c) => c !== null)
          .map((c) => `${c.type}:${c.name.toLocaleLowerCase()}`),
      ).size
    : 0;

  const footer = (() => {
    switch (step) {
      case 'pick':
        return (
          <Button
            label={t('importCsv.pickFile')}
            icon="file-upload-outline"
            size="large"
            onPress={onPick}
          />
        );
      case 'map':
        return (
          <Button
            label={t('common.continue')}
            icon="arrow-right"
            size="large"
            disabled={missing.length > 0}
            onPress={() => setStep('review')}
          />
        );
      case 'review':
        return (
          <View style={styles.footerRow}>
            <Button label={t('common.back')} variant="outline" onPress={() => setStep('map')} />
            <View style={styles.flex}>
              <Button
                label={
                  importing
                    ? t('importCsv.importing')
                    : t('importCsv.importAction', { count: validation?.candidates.length ?? 0 })
                }
                icon="check"
                size="large"
                loading={importing}
                disabled={!validation || validation.candidates.length === 0}
                onPress={onImport}
              />
            </View>
          </View>
        );
      default:
        return assertNever(step);
    }
  })();

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ModalHeader title={t('importCsv.title')} onClose={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="label" color="primary">
          {step === 'pick'
            ? t('importCsv.step1')
            : step === 'map'
              ? t('importCsv.step2')
              : t('importCsv.step3')}
        </AppText>
        {error ? (
          <AppText color="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        {step === 'pick' ? (
          <AppText color="textSecondary">{t('importCsv.pickHint')}</AppText>
        ) : (
          <AppText variant="caption" color="textSecondary">
            {t('importCsv.fileInfo', {
              name: fileName,
              rows: Math.max(0, rows.length - (hasHeader ? 1 : 0)),
            })}
          </AppText>
        )}

        {step === 'map' ? (
          <>
            <Card style={styles.padded}>
              <SwitchRow
                label={t('importCsv.hasHeader')}
                value={hasHeader}
                onValueChange={setHasHeader}
              />
            </Card>
            <SectionTitle>{t('importCsv.column')}</SectionTitle>
            <Card>
              {IMPORT_FIELDS.map((field) => {
                const index = mapping[field];
                const required = REQUIRED_IMPORT_FIELDS.includes(field);
                return (
                  <ListRow
                    key={field}
                    label={`${t(`importCsv.fields.${field}`)}${required ? ' *' : ''}`}
                    value={index === undefined ? t('importCsv.notMapped') : columnLabel(index)}
                    onPress={() => setSheet({ kind: 'field', field })}
                  />
                );
              })}
            </Card>
            {missing.length > 0 ? (
              <AppText variant="caption" color="danger">
                {t('importCsv.missingFields', {
                  fields: missing.map((f) => t(`importCsv.fields.${f}`)).join(', '),
                })}
              </AppText>
            ) : null}
            <Card>
              <ListRow
                label={t('importCsv.dateFormat')}
                value={t(`importCsv.dateFormats.${dateFormat}`)}
                onPress={() => setSheet({ kind: 'date' })}
              />
              <ListRow
                label={t('importCsv.defaultAccount')}
                value={defaultAccount?.name ?? ''}
                onPress={() => setSheet({ kind: 'account' })}
              />
            </Card>
            <AppText variant="label" color="textSecondary">
              {t('importCsv.decimalSeparator')}
            </AppText>
            <SegmentedControl
              segments={[
                { value: '.', label: '1,234.56' },
                { value: ',', label: '1.234,56' },
              ]}
              value={decimalSeparator}
              onChange={setDecimalSeparator}
              accessibilityLabel={t('importCsv.decimalSeparator')}
            />
          </>
        ) : null}

        {step === 'review' && validation ? (
          <>
            <Card style={styles.padded}>
              <AppText variant="subtitle" color="income">
                {t('importCsv.validRows', { count: validation.candidates.length })}
              </AppText>
              {validation.errors.length > 0 ? (
                <AppText variant="body" color="danger">
                  {t('importCsv.invalidRows', { count: validation.errors.length })}
                </AppText>
              ) : null}
              {newCategoryCount > 0 ? (
                <AppText variant="body" color="textSecondary">
                  {t('importCsv.newCategories', { count: newCategoryCount })}
                </AppText>
              ) : null}
            </Card>
            {validation.candidates.length > 0 ? (
              <>
                <SectionTitle>{t('importCsv.preview')}</SectionTitle>
                <Card style={styles.padded}>
                  {validation.candidates.slice(0, PREVIEW_ROWS).map((c) => {
                    const currency = accountsById.get(c.accountId)?.currency ?? 'USD';
                    return (
                      <View key={c.rowNumber} style={styles.previewRow}>
                        <AppText variant="caption" color="textSecondary" style={styles.previewDate}>
                          {formatDate(new Date(c.date), 'medium')}
                        </AppText>
                        <AppText variant="body" style={styles.flex} numberOfLines={1}>
                          {c.note || c.newCategory?.name || t(`types.${c.type}`)}
                        </AppText>
                        <AppText
                          variant="label"
                          tabular
                          color={
                            c.type === 'expense'
                              ? 'expense'
                              : c.type === 'income'
                                ? 'income'
                                : 'transfer'
                          }
                        >
                          {money(c.type === 'expense' ? -c.amount : c.amount, currency)}
                        </AppText>
                      </View>
                    );
                  })}
                </Card>
              </>
            ) : null}
            {validation.errors.length > 0 ? (
              <Card style={styles.padded}>
                {validation.errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
                  <AppText key={`${e.rowNumber}-${e.code}`} variant="caption" color="danger">
                    {t('importCsv.rowError', {
                      row: e.rowNumber,
                      message: t(`importCsv.errors.${e.code}`, { value: e.value }),
                    })}
                  </AppText>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>

      <SelectSheet
        visible={sheet.kind === 'field'}
        title={sheet.kind === 'field' ? t(`importCsv.fields.${sheet.field}`) : ''}
        options={[
          { value: NOT_MAPPED, label: t('importCsv.notMapped') },
          ...Array.from({ length: columnCount }, (_, i) => ({
            value: i,
            label: columnLabel(i),
            description: sample(i),
          })),
        ]}
        selected={sheet.kind === 'field' ? (mapping[sheet.field] ?? NOT_MAPPED) : null}
        onSelect={(value) => {
          if (sheet.kind !== 'field') return;
          const field = sheet.field;
          setMapping((m) => {
            const next: ColumnMapping = { ...m };
            if (value === NOT_MAPPED) delete next[field];
            else next[field] = value;
            return next;
          });
          if (field === 'date' && value !== NOT_MAPPED) setDateFormat(guessDateFormat(rows, value));
        }}
        onClose={() => setSheet({ kind: 'none' })}
      />
      <SelectSheet
        visible={sheet.kind === 'date'}
        title={t('importCsv.dateFormat')}
        options={DATE_FORMATS.map((f) => ({ value: f, label: t(`importCsv.dateFormats.${f}`) }))}
        selected={dateFormat}
        onSelect={setDateFormat}
        onClose={() => setSheet({ kind: 'none' })}
      />
      <AccountSheet
        visible={sheet.kind === 'account'}
        title={t('importCsv.defaultAccount')}
        selected={defaultAccountId}
        onSelect={setDefaultAccountId}
        onClose={() => setSheet({ kind: 'none' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  padded: { padding: 16, gap: 6 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  previewDate: { width: 96 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
  footerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
