import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { err, ok, type Result } from '@/domain/types';
import { logger } from '@/utils/logger';

export interface StoredFile {
  name: string;
  uri: string;
  size: number;
  modifiedAt: Date | null;
}

const BACKUP_DIR = 'backups';

function timestamp(now: Date): string {
  return now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function backupDirectory(): Directory {
  const dir = new Directory(Paths.document, BACKUP_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function writeFile(dir: Directory, name: string, contents: string): Promise<File> {
  const file = new File(dir, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(contents);
  return file;
}

/** Writes an export to the cache directory and opens the share sheet. */
export async function shareExport(
  baseName: string,
  extension: 'csv' | 'json',
  contents: string,
  now: Date = new Date(),
): Promise<Result<void, 'unavailable' | 'failed'>> {
  try {
    if (!(await Sharing.isAvailableAsync())) return err('unavailable');
    const file = await writeFile(
      Paths.cache,
      `${baseName}-${timestamp(now)}.${extension}`,
      contents,
    );
    await Sharing.shareAsync(file.uri, {
      mimeType: extension === 'csv' ? 'text/csv' : 'application/json',
      UTI: extension === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
    });
    return ok(undefined);
  } catch (error) {
    logger.error('Export failed', error);
    return err('failed');
  }
}

export async function shareFile(uri: string): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json' });
    return true;
  } catch (error) {
    logger.warn('Sharing failed', error);
    return false;
  }
}

export async function saveBackupFile(
  contents: string,
  now: Date = new Date(),
): Promise<StoredFile> {
  const file = await writeFile(backupDirectory(), `pocket-ledger-${timestamp(now)}.json`, contents);
  return { name: file.name, uri: file.uri, size: file.size, modifiedAt: now };
}

export function listBackupFiles(): StoredFile[] {
  try {
    return backupDirectory()
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.json'))
      .map((file) => ({
        name: file.name,
        uri: file.uri,
        size: file.size,
        modifiedAt: file.modificationTime ? new Date(file.modificationTime) : null,
      }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch (error) {
    logger.warn('Listing backups failed', error);
    return [];
  }
}

export function deleteStoredFile(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export type ReadError = 'canceled' | 'tooLarge' | 'readFailed';

/** Reads a text file, refusing anything larger than `maxBytes` before loading it. */
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

export interface PickedText {
  name: string;
  text: string;
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
