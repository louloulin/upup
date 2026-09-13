import { access } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export interface DuckDBQueryResult {
  readonly data: readonly Record<string, unknown>[];
  readonly rowCount: number;
  readonly duration: number;
  readonly columns: readonly string[];
  readonly truncated?: boolean;
}

export interface DuckDBTableColumn {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
}

export interface DuckDBTableInfo {
  readonly name: string;
  readonly columns: readonly DuckDBTableColumn[];
  readonly rowCount: number;
}

export interface DuckDBConnection {
  query(sql: string): Promise<unknown>;
  close?(): Promise<void>;
}

export type DuckDBConnectionFactory = (signal: AbortSignal) => Promise<DuckDBConnection>;

export interface DuckDBClientOptions {
  readonly connection?: DuckDBConnection;
  readonly connectionFactory?: DuckDBConnectionFactory;
  readonly allowedRoots?: readonly string[];
  readonly maxRows?: number;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const READ_QUERY = /^(?:select|with|show|describe|explain|values)\b/i;
const FORBIDDEN_QUERY_OPERATIONS = /\b(?:insert|update|delete|merge|create|drop|alter|truncate|copy|attach|detach|install|load|export|call|pragma|set|reset)\b/i;
const FORBIDDEN_FILE_FUNCTIONS = /\b(?:read_csv|read_csv_auto|read_parquet|read_json|read_json_auto|glob|parquet_scan|csv_scan)\s*\(/i;
const DEFAULT_MAX_ROWS = 1_000;

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('duckdb request aborted');
}

function quoteIdentifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`${label} must be a valid SQL identifier`);
  return `"${value}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function validateDate(value: string, label: string): void {
  if (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`${label} must be YYYY-MM-DD`);
}

function tableNameFromPath(path: string): string {
  const filename = path.split(/[\\/]/).pop() ?? '';
  const stem = filename.replace(/\.(?:csv|parquet)$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
  return stem && /^[A-Za-z_]/.test(stem) ? stem.slice(0, 128) : `imported_${stem}`.slice(0, 128);
}

function rowsFromResult(result: unknown): { rows: Record<string, unknown>[]; columns: string[] } {
  if (result && typeof result === 'object' && 'data' in result && Array.isArray((result as { data: unknown }).data)) {
    const rows = (result as { data: Record<string, unknown>[] }).data;
    return { rows, columns: rows.length > 0 ? Object.keys(rows[0]!) : [] };
  }
  const table = result as {
    numRows?: number;
    schema?: { fields?: readonly { name: string }[] };
    getChild?: (name: string) => { get(index: number): unknown };
  };
  const columns = table.schema?.fields?.map((field) => field.name) ?? [];
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < (table.numRows ?? 0); index += 1) {
    const row: Record<string, unknown> = {};
    for (const column of columns) row[column] = table.getChild?.(column)?.get(index);
    rows.push(row);
  }
  return { rows, columns };
}

async function createWasmConnection(signal: AbortSignal): Promise<DuckDBConnection> {
  abortIfNeeded(signal);
  const duckdb = await import('@duckdb/duckdb-wasm');
  abortIfNeeded(signal);
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  abortIfNeeded(signal);
  const workerUrl = URL.createObjectURL(new Blob([`importScripts('${bundle.mainWorker}');`], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);
  try {
    const database = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return await database.connect();
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

export class DuckDBClient {
  private readonly allowedRoots: readonly string[];
  private readonly maxRows: number;
  private connection?: DuckDBConnection;
  private readonly connectionFactory: DuckDBConnectionFactory;

  constructor(options: DuckDBClientOptions = {}) {
    this.connection = options.connection;
    this.connectionFactory = options.connectionFactory ?? createWasmConnection;
    this.allowedRoots = (options.allowedRoots ?? [process.cwd()]).map((root) => resolve(root));
    this.maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
    if (!Number.isInteger(this.maxRows) || this.maxRows < 1 || this.maxRows > 100_000) throw new Error('maxRows must be between 1 and 100000');
  }

  async close(): Promise<void> {
    await this.connection?.close?.();
    this.connection = undefined;
  }

  async query(sql: string, signal: AbortSignal): Promise<DuckDBQueryResult> {
    abortIfNeeded(signal);
    const normalized = sql.trim().replace(/;+$/, '');
    if (!normalized || normalized.length > 100_000 || normalized.includes(';') || !READ_QUERY.test(normalized) || FORBIDDEN_QUERY_OPERATIONS.test(normalized) || FORBIDDEN_FILE_FUNCTIONS.test(normalized)) throw new Error('duckdb-query only accepts one read-only SQL statement');
    const connection = await this.getConnection(signal);
    const started = Date.now();
    const result = rowsFromResult(await connection.query(normalized));
    abortIfNeeded(signal);
    const data = result.rows.slice(0, this.maxRows);
    return { data, rowCount: result.rows.length, duration: Date.now() - started, columns: result.columns, ...(data.length < result.rows.length ? { truncated: true } : {}) };
  }

  async registerParquet(path: string, tableName: string, signal: AbortSignal): Promise<{ tableName: string; path: string }> {
    const safePath = await this.validateDataPath(path, ['.parquet']);
    const safeTable = quoteIdentifier(tableName, 'tableName');
    const connection = await this.getConnection(signal);
    await connection.query(`CREATE TABLE ${safeTable} AS SELECT * FROM read_parquet(${quoteLiteral(safePath)})`);
    return { tableName, path: safePath };
  }

  async importCsv(path: string, tableName: string, header: boolean, delimiter: string, signal: AbortSignal): Promise<{ tableName: string; path: string }> {
    const safePath = await this.validateDataPath(path, ['.csv']);
    if (delimiter.length !== 1 || delimiter === "'") throw new Error('delimiter must be one character and cannot be a quote');
    const safeTable = quoteIdentifier(tableName, 'tableName');
    const connection = await this.getConnection(signal);
    await connection.query(`CREATE TABLE ${safeTable} AS SELECT * FROM read_csv_auto(${quoteLiteral(safePath)}, HEADER=${header ? 'true' : 'false'}, DELIM=${quoteLiteral(delimiter)})`);
    return { tableName, path: safePath };
  }

  async listTables(signal: AbortSignal): Promise<{ tables: readonly DuckDBTableInfo[] }> {
    const result = await this.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name", signal);
    const tables: DuckDBTableInfo[] = [];
    for (const row of result.data) {
      abortIfNeeded(signal);
      const name = String(row.table_name ?? '');
      if (!IDENTIFIER.test(name)) continue;
      const columns = await this.query(`DESCRIBE ${quoteIdentifier(name, 'table')}`, signal);
      tables.push({ name, columns: columns.data.map((column) => ({ name: String(column.column_name ?? ''), type: String(column.column_type ?? ''), nullable: String(column.null ?? '').toUpperCase() === 'YES' })), rowCount: 0 });
    }
    return { tables };
  }

  async timeseries(input: { table: string; dateColumn: string; valueColumn: string; interval: 'day' | 'week' | 'month' | 'quarter' | 'year'; aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'std' | 'var'; startDate?: string; endDate?: string }, signal: AbortSignal): Promise<DuckDBQueryResult> {
    const conditions: string[] = [];
    if (input.startDate) { validateDate(input.startDate, 'startDate'); conditions.push(`${quoteIdentifier(input.dateColumn, 'dateColumn')} >= DATE ${quoteLiteral(input.startDate)}`); }
    if (input.endDate) { validateDate(input.endDate, 'endDate'); conditions.push(`${quoteIdentifier(input.dateColumn, 'dateColumn')} <= DATE ${quoteLiteral(input.endDate)}`); }
    const dateColumn = quoteIdentifier(input.dateColumn, 'dateColumn');
    const valueColumn = quoteIdentifier(input.valueColumn, 'valueColumn');
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    return this.query(`SELECT DATE_TRUNC(${quoteLiteral(input.interval)}, ${dateColumn}) AS period, ${input.aggregation.toUpperCase()}(${valueColumn}) AS value FROM ${quoteIdentifier(input.table, 'table')}${where} GROUP BY period ORDER BY period`, signal);
  }

  async portfolioAnalysis(input: { table: string; returnsColumn?: string; weightsColumn?: string; analysisType: 'returns' | 'volatility' | 'correlation' | 'sharpe' | 'var' }, signal: AbortSignal): Promise<DuckDBQueryResult> {
    const table = quoteIdentifier(input.table, 'table');
    const returns = quoteIdentifier(input.returnsColumn ?? '', 'returnsColumn');
    let expression: string;
    if (input.analysisType === 'returns') expression = `SUM(${returns}) AS total_return, AVG(${returns}) AS avg_return`;
    else if (input.analysisType === 'volatility') expression = `STDDEV_SAMP(${returns}) AS volatility`;
    else if (input.analysisType === 'sharpe') expression = `AVG(${returns}) / NULLIF(STDDEV_SAMP(${returns}), 0) * SQRT(252) AS sharpe_ratio`;
    else if (input.analysisType === 'var') expression = `PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY ${returns}) AS var_95`;
    else expression = `CORR(${returns}, ${quoteIdentifier(input.weightsColumn ?? '', 'weightsColumn')}) AS correlation`;
    return this.query(`SELECT ${expression} FROM ${table}`, signal);
  }

  private async getConnection(signal: AbortSignal): Promise<DuckDBConnection> {
    abortIfNeeded(signal);
    this.connection ??= await this.connectionFactory(signal);
    if (!this.connection) throw new Error('DuckDB connection unavailable');
    return this.connection;
  }

  private async validateDataPath(path: string, extensions: readonly string[]): Promise<string> {
    if (!path || !isAbsolute(path)) throw new Error('data path must be absolute');
    const safePath = resolve(path);
    if (!extensions.some((extension) => safePath.toLowerCase().endsWith(extension))) throw new Error(`data path must end with ${extensions.join(' or ')}`);
    if (!this.allowedRoots.some((root) => { const relativePath = relative(root, safePath); return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath)); })) throw new Error('data path is outside configured DuckDB roots');
    await access(safePath);
    return safePath;
  }
}

export function defaultDuckDBTableName(path: string): string { return tableNameFromPath(path); }
