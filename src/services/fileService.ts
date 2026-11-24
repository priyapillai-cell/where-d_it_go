import * as DocumentPicker from 'expo-document-picker';
import { type Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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

async function writeFile(
  dir: Directory,
  name: string,
  contents: string | Uint8Array,
): Promise<File> {
  const file = new File(dir, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(contents);
  return file;
}

/** Writes an export to the cache directory and opens the share sheet. */
export async function shareExport(
  baseName: string,
  extension: ExportKind,
  contents: string | Uint8Array,
  now: Date = new Date(),
): Promise<Result<void, 'unavailable' | 'failed'>> {
  try {
    if (!(await Sharing.isAvailableAsync())) return err('unavailable');
    const file = await writeFile(
      Paths.cache,
      `${baseName}-${fileTimestamp(now)}.${extension}`,
      contents,
    );
    await Sharing.shareAsync(file.uri, EXPORT_TYPES[extension]);
    return ok(undefined);
  } catch (error) {
    logger.error('Export failed', error);
    return err('failed');
  }
}

export async function readTextFile(
  uri: string,
  maxBytes: number,
): Promise<Result<string, ReadError>> {
  try {
    const file = new File(uri);
    if (file.size > maxBytes) return err('tooLarge');
    return ok(await file.text());
  } catch (error) {
    logger.warn('Reading file failed', error);
    return err('readFailed');
  }
}

/** Lets the user pick a document and reads it as text. */
export async function pickTextFile(
  types: string[],
  maxBytes: number,
): Promise<Result<PickedText, ReadError>> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: types,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return err('canceled');
    const asset = result.assets[0];
    if (!asset) return err('canceled');
    if (asset.size !== undefined && asset.size > maxBytes) return err('tooLarge');
    const text = await readTextFile(asset.uri, maxBytes);
    return text.ok ? ok({ name: asset.name, text: text.value }) : text;
  } catch (error) {
    logger.warn('Picking file failed', error);
    return err('readFailed');
  }
}
