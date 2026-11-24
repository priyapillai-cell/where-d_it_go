export type ExportKind = 'csv' | 'json' | 'xlsx';

export const EXPORT_TYPES: Record<ExportKind, { mimeType: string; UTI: string }> = {
  csv: { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' },
  json: { mimeType: 'application/json', UTI: 'public.json' },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  },
};

export type ReadError = 'canceled' | 'tooLarge' | 'readFailed';

export interface PickedText {
  name: string;
  text: string;
}

export function fileTimestamp(now: Date): string {
  return now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}
