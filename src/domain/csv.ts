/** RFC 4180 CSV reading/writing with delimiter detection and spreadsheet-injection guards. */

export type CsvDelimiter = ',' | ';' | '\t';
const CANDIDATE_DELIMITERS: readonly CsvDelimiter[] = [',', ';', '\t'];

export const MAX_CSV_BYTES = 10 * 1024 * 1024;

/** Guesses the delimiter by counting candidates outside quotes on the first line. */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts = new Map<CsvDelimiter, number>(CANDIDATE_DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === '\n' || char === '\r')) break;
    else if (!inQuotes && counts.has(char as CsvDelimiter)) {
      counts.set(char as CsvDelimiter, (counts.get(char as CsvDelimiter) ?? 0) + 1);
    }
  }
  let best: CsvDelimiter = ',';
  let bestCount = 0;
  for (const [delimiter, count] of counts) {
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parses CSV text into rows of cells. Handles quoted fields, escaped quotes (""),
 * embedded newlines, CRLF/LF endings and a UTF-8 BOM. Blank lines are skipped.
 */
export function parseCsv(
  input: string,
  delimiter: CsvDelimiter = detectDelimiter(input),
): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    field = '';
  };

  while (i < text.length) {
    const char = text[i] as string;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
    } else {
      field += char;
    }
    i += 1;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** Prefixes values that spreadsheets would execute as formulas (CWE-1236). */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCell(value: string, delimiter: CsvDelimiter): string {
  if (value.includes('"') || value.includes(delimiter) || /[\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeCsv(
  rows: readonly (readonly string[])[],
  delimiter: CsvDelimiter = ',',
): string {
  return (
    rows.map((r) => r.map((cell) => escapeCell(cell, delimiter)).join(delimiter)).join('\r\n') +
    '\r\n'
  );
}
