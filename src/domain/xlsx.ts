import { strToU8, zipSync, type Zippable } from 'fflate';

/**
 * Minimal Office Open XML (.xlsx) writer. Produces the subset of SpreadsheetML that
 * Excel 2007+, Excel for Mac/mobile, Google Sheets, Numbers and LibreOffice all read:
 * shared strings, numbers, date serials, a bold header row, frozen panes and auto-filter.
 * Cells are always literal values, never formulas.
 */

export type XlsxDecimals = 0 | 1 | 2 | 3 | 4;

export type XlsxCellStyle =
  { kind: 'header' } | { kind: 'dateTime' } | { kind: 'number'; decimals: XlsxDecimals };

export interface XlsxCell {
  value: string | number | Date | null;
  style?: XlsxCellStyle;
}

export interface XlsxSheet {
  name: string;
  /** Column widths in characters. */
  columnWidths?: readonly number[];
  rows: readonly (readonly XlsxCell[])[];
  /** Freezes the first row and adds a filter over the used range. */
  headerRow?: boolean;
}

const MAX_CELL_LENGTH = 32767;
const MAX_SHEET_NAME_LENGTH = 31;
const DECIMALS: readonly XlsxDecimals[] = [0, 1, 2, 3, 4];

// Style indexes in cellXfs: 0 default, 1 header, 2 date-time, 3.. number formats by decimals.
const HEADER_XF = 1;
const DATE_TIME_XF = 2;
const FIRST_NUMBER_XF = 3;
const FIRST_CUSTOM_NUMFMT = 164;
const DATE_TIME_NUMFMT = FIRST_CUSTOM_NUMFMT;

const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Unpaired UTF-16 surrogates are not valid XML characters. */
function dropLoneSurrogates(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text.slice(i, i + 2);
        i += 1;
      }
    } else if (code < 0xdc00 || code > 0xdfff) {
      out += text[i];
    }
  }
  return out;
}

export function escapeXml(text: string): string {
  return dropLoneSurrogates(text.replace(INVALID_XML_CHARS, ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Excel date serial (1900 system) for the date's local wall-clock time. */
export function excelDateSerial(date: Date): number {
  const wallClockUtc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
  return (wallClockUtc - Date.UTC(1899, 11, 30)) / 86_400_000;
}

export function sanitizeSheetName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[[\]:*?/\\]/g, ' ')
    .replace(/^'+|'+$/g, '')
    .trim()
    .slice(0, MAX_SHEET_NAME_LENGTH)
    .trim();
  return cleaned || fallback;
}

function decimalsFormat(decimals: XlsxDecimals): string {
  return decimals === 0 ? '#,##0' : `#,##0.${'0'.repeat(decimals)}`;
}

function styleIndex(style: XlsxCellStyle | undefined): number {
  if (!style) return 0;
  switch (style.kind) {
    case 'header':
      return HEADER_XF;
    case 'dateTime':
      return DATE_TIME_XF;
    case 'number':
      return FIRST_NUMBER_XF + DECIMALS.indexOf(style.decimals);
    default: {
      const unreachable: never = style;
      throw new Error(`Unknown cell style ${JSON.stringify(unreachable)}`);
    }
  }
}

class SharedStrings {
  private readonly index = new Map<string, number>();
  readonly values: string[] = [];
  count = 0;

  add(text: string): number {
    this.count += 1;
    const existing = this.index.get(text);
    if (existing !== undefined) return existing;
    const id = this.values.length;
    this.values.push(text);
    this.index.set(text, id);
    return id;
  }
}

function cellXml(ref: string, cell: XlsxCell, strings: SharedStrings): string {
  const s = styleIndex(cell.style);
  const styleAttr = s === 0 ? '' : ` s="${s}"`;
  const { value } = cell;
  if (value === null || value === '') {
    return s === 0 ? '' : `<c r="${ref}"${styleAttr}/>`;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const dateStyle = cell.style ? styleAttr : ` s="${DATE_TIME_XF}"`;
    return `<c r="${ref}"${dateStyle}><v>${excelDateSerial(value)}</v></c>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  const id = strings.add(value.slice(0, MAX_CELL_LENGTH));
  return `<c r="${ref}"${styleAttr} t="s"><v>${id}</v></c>`;
}

function sheetXml(sheet: XlsxSheet, strings: SharedStrings): string {
  const columnCount = Math.max(1, ...sheet.rows.map((r) => r.length));
  const lastRef = `${columnName(columnCount - 1)}${Math.max(1, sheet.rows.length)}`;

  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(`${columnName(c)}${r + 1}`, cell, strings));
      return `<row r="${r + 1}">${cells.join('')}</row>`;
    })
    .join('');

  const view = sheet.headerRow
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  const cols = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const filter =
    sheet.headerRow && sheet.rows.length > 0 ? `<autoFilter ref="A1:${lastRef}"/>` : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:${lastRef}"/>${view}<sheetFormatPr defaultRowHeight="15"/>${cols}` +
    `<sheetData>${rowsXml}</sheetData>${filter}` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  );
}

function stylesXml(): string {
  const numberFormats = DECIMALS.map(
    (d, i) =>
      `<numFmt numFmtId="${FIRST_CUSTOM_NUMFMT + 1 + i}" formatCode="${decimalsFormat(d)}"/>`,
  );
  const numberXfs = DECIMALS.map(
    (_, i) =>
      `<xf numFmtId="${FIRST_CUSTOM_NUMFMT + 1 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
  );
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${numberFormats.length + 1}"><numFmt numFmtId="${DATE_TIME_NUMFMT}" formatCode="yyyy-mm-dd hh:mm"/>${numberFormats.join('')}</numFmts>` +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${FIRST_NUMBER_XF + numberXfs.length}">` +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    `<xf numFmtId="${DATE_TIME_NUMFMT}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `${numberXfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

function sharedStringsXml(strings: SharedStrings): string {
  const items = strings.values
    .map((v) => `<si><t xml:space="preserve">${escapeXml(v)}</t></si>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.count}" uniqueCount="${strings.values.length}">${items}</sst>`
  );
}

function uniqueSheetNames(sheets: readonly XlsxSheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, i) => {
    const base = sanitizeSheetName(sheet.name, `Sheet${i + 1}`);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      const suffix = ` (${n})`;
      name = `${base.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length)}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

export function buildXlsx(sheets: readonly XlsxSheet[], now: Date = new Date()): Uint8Array {
  if (sheets.length === 0) throw new Error('A workbook needs at least one sheet');
  const names = uniqueSheetNames(sheets);
  const strings = new SharedStrings();
  const worksheets = sheets.map((sheet) => sheetXml(sheet, strings));

  const sheetEntries = names
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const filterNames = sheets
    .map((sheet, i) => {
      if (!sheet.headerRow || sheet.rows.length === 0) return '';
      const columnCount = Math.max(1, ...sheet.rows.map((r) => r.length));
      const quoted = `'${(names[i] ?? '').replace(/'/g, "''")}'`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(quoted)}!$A$1:$${columnName(columnCount - 1)}$${sheet.rows.length}</definedName>`;
    })
    .join('');

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView/></bookViews>' +
    `<sheets>${sheetEntries}</sheets>` +
    (filterNames ? `<definedNames>${filterNames}</definedNames>` : '') +
    '</workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    names
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${names.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    '</Relationships>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    names
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const created = `${now.toISOString().slice(0, 19)}Z`;
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>` +
    '</cp:coreProperties>';
  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Pocket Ledger</Application></Properties>';

  const files: Zippable = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(stylesXml()),
    'xl/sharedStrings.xml': strToU8(sharedStringsXml(strings)),
  };
  worksheets.forEach((xml, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml);
  });
  return zipSync(files, { level: 6, mtime: now });
}
