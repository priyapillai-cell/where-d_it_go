import * as DocumentPicker from 'expo-document-picker';

import { err, ok, type Result } from '@/domain/types';
import { logger } from '@/utils/logger';

import {
  fileTimestamp,
  EXPORT_TYPES,
  type ExportKind,
  type PickedText,
  type ReadError,
} from './fileTypes';
export type { ExportKind, PickedText, ReadError };

/** Browser version of `fileService`: expo-file-system and the share sheet do not exist on web. */

function downloadFile(name: string, contents: string | Uint8Array, mimeType: string): void {
  const part = typeof contents === 'string' ? contents : new Uint8Array(contents);
  const url = URL.createObjectURL(new Blob([part], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Downloads the export, since browsers have no share sheet for generated files. */
export async function shareExport(
  baseName: string,
  extension: ExportKind,
  contents: string | Uint8Array,
  now: Date = new Date(),
): Promise<Result<void, 'unavailable' | 'failed'>> {
  try {
    downloadFile(
      `${baseName}-${fileTimestamp(now)}.${extension}`,
      contents,
      EXPORT_TYPES[extension].mimeType,
    );
    return ok(undefined);
  } catch (error) {
    logger.error('Export failed', error);
    return err('failed');
  }
}

/** Reads a picked file through its object URL. */
export async function readTextFile(
  uri: string,
  maxBytes: number,
): Promise<Result<string, ReadError>> {
  try {
    const blob = await (await fetch(uri)).blob();
    if (blob.size > maxBytes) return err('tooLarge');
    return ok(await blob.text());
  } catch (error) {
    logger.warn('Reading file failed', error);
    return err('readFailed');
  }
}

export async function pickTextFile(
  types: string[],
  maxBytes: number,
): Promise<Result<PickedText, ReadError>> {
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: types, multiple: false });
    if (result.canceled) return err('canceled');
    const asset = result.assets[0];
    if (!asset) return err('canceled');
    if (asset.file) {
      if (asset.file.size > maxBytes) return err('tooLarge');
      return ok({ name: asset.name, text: await asset.file.text() });
    }
    const text = await readTextFile(asset.uri, maxBytes);
    return text.ok ? ok({ name: asset.name, text: text.value }) : text;
  } catch (error) {
    logger.warn('Picking file failed', error);
    return err('readFailed');
  }
}
