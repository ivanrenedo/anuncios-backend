/**
 * Tiny RFC-4180 CSV writer. No dependency because the escaping rules are
 * short and streaming is trivial:
 *   - fields containing `,` `"` `\n` `\r` are wrapped in double quotes
 *   - inner `"` becomes `""`
 *   - rows end with CRLF (Excel-friendly)
 *   - callers prepend a UTF-8 BOM so Excel on Windows renders accents right
 */
export type CsvCell = string | number | boolean | null | undefined | Date;

export const UTF8_BOM = '﻿';

export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const needsQuoting = /[",\r\n]/.test(raw);
  const escaped = raw.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

export function csvRow(cells: CsvCell[]): string {
  return cells.map(csvEscape).join(',') + '\r\n';
}
