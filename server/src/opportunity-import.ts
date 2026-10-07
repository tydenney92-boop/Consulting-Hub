import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

export const importFields = ['company', 'roleTitle', 'location', 'deadline', 'jobUrl', 'requisitionId', 'eligibility', 'compensation', 'employmentType', 'recruitingSeason', 'priority', 'notes'] as const;
export type ImportField = typeof importFields[number];
export type ImportMapping = Partial<Record<ImportField, string>>;
export type SheetSnapshot = { name: string; rows: unknown[][] };
export type WorkbookSnapshot = { sheets: SheetSnapshot[]; preferredSheet: string; supplementalSheet?: string };

const aliases: Record<ImportField, string[]> = {
  company: ['company', 'firm', 'employer', 'organization', 'organisation'],
  roleTitle: ['role', 'role title', 'job title', 'position', 'opportunity', 'internship'],
  location: ['location', 'office', 'city', 'target office'],
  deadline: ['deadline', 'application deadline', 'apply by', 'due date', 'close date'],
  jobUrl: ['url', 'job url', 'posting url', 'application url', 'apply link', 'job posting'],
  requisitionId: ['requisition id', 'req id', 'job id', 'posting id', 'requisition'],
  eligibility: ['eligibility', 'eligible', 'requirements', 'class year'],
  compensation: ['pay', 'compensation', 'salary', 'hourly rate'],
  employmentType: ['employment type', 'job type', 'type'],
  recruitingSeason: ['season', 'recruiting season', 'internship season', 'term'],
  priority: ['priority'],
  notes: ['notes', 'note', 'description', 'context']
};

export const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/https?:\/\/(?:www\.)?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const canonicalUrl = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|source$|ref$|trk$|tracking)/i.test(key)) url.searchParams.delete(key);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString().replace(/\?$/, '');
  } catch { return ''; }
};

const cellValue = (cell: ExcelJS.Cell): unknown => {
  const value: any = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return value.result instanceof Date ? value.result.toISOString() : value.result ?? '';
    if ('text' in value) return value.text;
    if ('richText' in value) return value.richText.map((x: any) => x.text).join('');
  }
  return value;
};

const snapshotSheet = (sheet: ExcelJS.Worksheet): SheetSnapshot => {
  if (sheet.actualRowCount > 2000 || sheet.actualColumnCount > 60) throw new Error('Each sheet must contain no more than 2,000 rows and 60 columns.');
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    const values: unknown[] = [];
    for (let index = 1; index <= Math.min(sheet.actualColumnCount, 60); index++) values.push(cellValue(row.getCell(index)));
    while (rows.length < row.number - 1) rows.push([]);
    rows.push(values);
  });
  return { name: sheet.name, rows };
};

export async function parseWorkbook(buffer: Buffer, fileName: string): Promise<WorkbookSnapshot> {
  const extension = fileName.toLowerCase().split('.').pop();
  if (!['xlsx', 'csv'].includes(extension || '')) throw new Error('Choose a CSV or XLSX file. Macro-enabled and legacy Excel files are not accepted.');
  const workbook = new ExcelJS.Workbook();
  if (extension === 'csv') await workbook.csv.read(Readable.from(buffer));
  else await workbook.xlsx.load(buffer as any);
  const sheets = workbook.worksheets.map(snapshotSheet).filter(sheet => sheet.rows.length);
  if (!sheets.length) throw new Error('The spreadsheet does not contain any readable rows.');
  const source = sheets.find(x => normalized(x.name) === 'open opportunities') || sheets.filter(x => !['hub inventory', 'location applications'].includes(normalized(x.name))).sort((a, b) => headerScore(b) - headerScore(a))[0];
  if (!source) throw new Error('No opportunity source sheet was found. Hub inventory and Location applications are supporting sheets only.');
  const supplemental = sheets.find(x => normalized(x.name) === 'location applications');
  return { sheets, preferredSheet: source.name, supplementalSheet: supplemental?.name };
}

const headerScore = (sheet: SheetSnapshot) => {
  let best = 0;
  for (const row of sheet.rows.slice(0, 25)) {
    const values = row.map(normalized);
    const score = importFields.filter(field => aliases[field].some(alias => values.includes(alias))).length;
    best = Math.max(best, score);
  }
  return best;
};

export function detectHeaders(sheet: SheetSnapshot) {
  let headerIndex = 0, best = -1;
  sheet.rows.slice(0, 25).forEach((row, index) => {
    const values = row.map(normalized), score = importFields.filter(field => aliases[field].some(alias => values.includes(alias))).length;
    if (score > best) { best = score; headerIndex = index; }
  });
  const headers = sheet.rows[headerIndex].map((value, index) => String(value || '').trim() || `Column ${index + 1}`);
  const mapping: ImportMapping = {};
  for (const field of importFields) {
    const index = headers.findIndex(header => aliases[field].includes(normalized(header)));
    if (index >= 0) mapping[field] = headers[index];
  }
  return { headerIndex, headers, mapping };
}

export type MappedImportRow = Record<ImportField, string> & { rowNumber: number; deadlineType: 'DATE' | 'ROLLING' | 'PRIORITY' | 'UNKNOWN'; deadlineDate: string; supplemental: string[] };

const excelDate = (value: unknown) => {
  if (typeof value !== 'number' || value < 1 || value > 100000) return '';
  return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000)).toISOString().slice(0, 10);
};
export function parseDeadline(value: unknown) {
  const raw = String(value ?? '').trim(), word = normalized(raw);
  if (!raw || ['unknown', 'tbd', 'n a', 'na'].includes(word)) return { deadlineType: 'UNKNOWN' as const, deadlineDate: '' };
  if (/rolling|until filled|ongoing/.test(word)) return { deadlineType: 'ROLLING' as const, deadlineDate: '' };
  if (/priority/.test(word) && !/\d/.test(raw)) return { deadlineType: 'PRIORITY' as const, deadlineDate: '' };
  const serial = excelDate(value); if (serial) return { deadlineType: 'DATE' as const, deadlineDate: serial };
  const iso = raw.match(/\b(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)\b/); if (iso) {
    const day = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`, parsed = new Date(`${day}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? { deadlineType: 'UNKNOWN' as const, deadlineDate: '' } : { deadlineType: /priority/.test(word) ? 'PRIORITY' as const : 'DATE' as const, deadlineDate: day };
  }
  if (!/\b20\d{2}\b/.test(raw)) return { deadlineType: 'UNKNOWN' as const, deadlineDate: '' };
  const date = new Date(raw.replace(/priority(?: deadline)?[: ]*/i, '')); return Number.isNaN(date.getTime()) ? { deadlineType: 'UNKNOWN' as const, deadlineDate: '' } : { deadlineType: /priority/.test(word) ? 'PRIORITY' as const : 'DATE' as const, deadlineDate: date.toISOString().slice(0, 10) };
}

const rowsByHeaders = (sheet: SheetSnapshot, headerIndex: number, headers: string[]) => sheet.rows.slice(headerIndex + 1).map((row, offset) => ({ rowNumber: headerIndex + offset + 2, values: Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])) })).filter(row => Object.values(row.values).some(value => String(value).trim()));

export function mapRows(snapshot: WorkbookSnapshot, sheetName: string, mapping: ImportMapping, headerIndex?: number): MappedImportRow[] {
  if (['hub inventory', 'location applications'].includes(normalized(sheetName))) throw new Error('Choose an opportunity source sheet; inventory and location sheets are supporting data only.');
  const sheet = snapshot.sheets.find(x => x.name === sheetName); if (!sheet) throw new Error('Choose a sheet from this workbook.');
  const detected = detectHeaders(sheet), index = headerIndex ?? detected.headerIndex, headers = sheet.rows[index].map((value, column) => String(value || '').trim() || `Column ${column + 1}`);
  const supplementalSheet = snapshot.supplementalSheet ? snapshot.sheets.find(x => x.name === snapshot.supplementalSheet) : undefined;
  const supplements = new Map<string, string[]>();
  if (supplementalSheet) {
    const found = detectHeaders(supplementalSheet), supplementRows = rowsByHeaders(supplementalSheet, found.headerIndex, found.headers);
    for (const row of supplementRows) {
      const get = (field: ImportField) => String(row.values[found.mapping[field] || ''] ?? '').trim();
      const requisitionKey = normalized(get('requisitionId')), roleKey = `${normalized(get('company'))}|${normalized(get('roleTitle'))}`;
      const context = [get('location'), canonicalUrl(get('jobUrl'))].filter(Boolean).join(' — ');
      for (const key of [requisitionKey, roleKey].filter(Boolean)) if (context) supplements.set(key, [...new Set([...(supplements.get(key) || []), context])]);
    }
  }
  return rowsByHeaders(sheet, index, headers).map(row => {
    const value = (field: ImportField) => String(row.values[mapping[field] || ''] ?? '').trim(), deadline = parseDeadline(row.values[mapping.deadline || '']);
    const requisitionId = value('requisitionId'), roleKey = `${normalized(value('company'))}|${normalized(value('roleTitle'))}`;
    return { ...Object.fromEntries(importFields.map(field => [field, value(field)])) as Record<ImportField, string>, rowNumber: row.rowNumber, ...deadline, jobUrl: value('jobUrl'), supplemental: supplements.get(normalized(requisitionId)) || supplements.get(roleKey) || [] };
  });
}

export const rowFingerprint = (row: MappedImportRow) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
export const workbookFingerprint = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
