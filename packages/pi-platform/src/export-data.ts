import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type PlatformExportCell = string | number | boolean | null;
export type PlatformExportRow = Readonly<Record<string, PlatformExportCell>>;
export type PlatformExportFormat = 'csv' | 'json';

export interface PlatformExportOptions {
  readonly data: readonly PlatformExportRow[];
  readonly filename?: string;
  readonly format?: PlatformExportFormat;
  readonly outputDirectory?: string;
}

export interface PlatformExportResult {
  readonly status: 'success' | 'empty';
  readonly format: PlatformExportFormat;
  readonly filePath?: string;
  readonly rows: number;
  readonly columns: number;
  readonly message?: string;
}

const MAX_ROWS = 10_000;
const MAX_COLUMNS = 200;

function escapeCsv(value: PlatformExportCell): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeCsv(headers: readonly string[], rows: readonly PlatformExportRow[]): string {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) lines.push(headers.map((header) => escapeCsv(row[header] ?? null)).join(','));
  return lines.join('\n');
}

function serializeJson(headers: readonly string[], rows: readonly PlatformExportRow[]): string {
  return JSON.stringify(rows.map((row) => Object.fromEntries(headers.map((header) => [header, row[header] ?? null]))), null, 2);
}

function safeFilename(filename: string): string {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^\.+/, '');
  return normalized.slice(0, 120) || 'analysis';
}

export async function exportPlatformData(options: PlatformExportOptions): Promise<PlatformExportResult> {
  const format = options.format ?? 'csv';
  const rows = options.data.slice(0, MAX_ROWS);
  if (rows.length === 0) return { status: 'empty', format, rows: 0, columns: 0, message: 'No data to export' };
  const headers = Object.keys(rows[0]).slice(0, MAX_COLUMNS);
  if (headers.length === 0) return { status: 'empty', format, rows: rows.length, columns: 0, message: 'No columns to export' };
  const outputDirectory = options.outputDirectory ?? join(process.cwd(), '.upup', 'exports');
  await mkdir(outputDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-').slice(0, 19);
  const filePath = join(outputDirectory, `${safeFilename(options.filename ?? 'analysis')}_${timestamp}.${format}`);
  const content = format === 'csv' ? serializeCsv(headers, rows) : serializeJson(headers, rows);
  await writeFile(filePath, content, 'utf8');
  return { status: 'success', format, filePath, rows: rows.length, columns: headers.length };
}
