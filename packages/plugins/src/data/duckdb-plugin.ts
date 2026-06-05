/**
 * UpUp Plugin System — DuckDB Data Source Plugin
 *
 * DuckDB provides fast in-process SQL analytics for investment data.
 * Supports CSV, Parquet, and direct data ingestion.
 *
 * Value for UpUp:
 * - Fast SQL queries on financial data
 * - Parquet file analysis (A-share data, portfolio data)
 * - Time series aggregation and analysis
 * - Memory-efficient analytical queries
 * - Cross-dataset JOIN operations
 */

import { resolve } from 'path';
import { info, warn } from '@upup/utils/logging';
import type {
  PluginAdapter,
  PluginManifest,
  LoadedPlugin,
  UpUpPluginApi,
  PluginService,
  AgentTool,
  HookHandler,
} from '@upup/types';

// Lazy load duckdb-wasm
let duckdbModule: any = null;

async function getDuckDB() {
  if (!duckdbModule) {
    try {
      // Try duckdb-wasm first (browser and Node.js compatible)
      const duckdb = await import('@duckdb/duckdb-wasm');
      duckdbModule = duckdb;
    } catch (err) {
      warn('default', `DuckDB not available: ${(err as Error).message}`);
      return null;
    }
  }
  return duckdbModule;
}

// ============================================================================
// DuckDB Plugin Types
// ============================================================================

export interface DuckDBConfig {
  /** Data directory for DuckDB files */
  dataDir?: string;
  /** Enable persistence */
  persistent?: boolean;
}

export interface QueryResult {
  /** Query results as array of objects */
  data: Record<string, unknown>[];
  /** Number of rows returned */
  rowCount: number;
  /** Query execution time in ms */
  duration: number;
  /** Column names */
  columns: string[];
}

export interface TableInfo {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
  rowCount: number;
}

// ============================================================================
// DuckDB Service (background service for DuckDB connection)
// ============================================================================

export class DuckDBService implements PluginService {
  name = 'duckdb-service';
  private db: any = null;
  private conn: any = null;
  private config: DuckDBConfig = {};

  async start(ctx: any): Promise<void> {
    info('default', `Starting DuckDB service with config: ${JSON.stringify(ctx.config)}`);
    this.config = ctx.config as DuckDBConfig;

    try {
      // Initialize DuckDB
      const duckdb = await getDuckDB();
      if (!duckdb) {
        warn('default', 'DuckDB not available, service will be stub');
        return;
      }

      // Get bundle for WASM
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      // Create database
      const worker_url = URL.createObjectURL(
        new Blob([`importScripts('${bundle.mainWorker}');`], { type: 'text/javascript' })
      );
      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);

      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(worker_url);

      this.db = db;
      this.conn = await db.connect();

      info('default', 'DuckDB service started successfully');
    } catch (err) {
      warn('default', `Failed to start DuckDB: ${(err as Error).message}`);
    }
  }

  async stop(ctx: any): Promise<void> {
    if (this.conn) {
      await this.conn.close();
    }
    if (this.db) {
      await this.db.terminate();
    }
    info('default', 'DuckDB service stopped');
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.conn) {
      return { data: [], rowCount: 0, duration: 0, columns: [] };
    }

    const start = Date.now();
    const result = await this.conn.query(sql);
    const duration = Date.now() - start;

    // Convert arrow table to objects
    const data: Record<string, unknown>[] = [];
    const columns = result.schema.fields.map((f: any) => f.name);

    for (let i = 0; i < result.numRows; i++) {
      const row: Record<string, unknown> = {};
      for (const col of columns) {
        row[col] = result.getChild(col).get(i);
      }
      data.push(row);
    }

    return {
      data,
      rowCount: result.numRows,
      duration,
      columns,
    };
  }

  async registerParquet(path: string, tableName: string): Promise<void> {
    if (!this.conn) return;
    await this.conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${path}'`);
  }

  async listTables(): Promise<TableInfo[]> {
    if (!this.conn) return [];

    const result = await this.conn.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    );

    const tables: TableInfo[] = [];
    for (let i = 0; i < result.numRows; i++) {
      const name = result.getChild('table_name').get(i);
      const columnsResult = await this.conn.query(`DESCRIBE ${name}`);

      const columns: TableInfo['columns'] = [];
      for (let j = 0; j < columnsResult.numRows; j++) {
        columns.push({
          name: columnsResult.getChild('column_name').get(j),
          type: columnsResult.getChild('column_type').get(j),
          nullable: columnsResult.getChild('null').get(j) === 'YES',
        });
      }

      tables.push({
        name,
        columns,
        rowCount: 0, // Would need separate query
      });
    }

    return tables;
  }
}

// ============================================================================
// DuckDB Plugin
// ============================================================================

export class DuckDBPlugin {
  private service: DuckDBService;
  private tools: AgentTool[] = [];

  constructor() {
    this.service = new DuckDBService();
    this.tools = this.createTools();
  }

  private createTools(): AgentTool[] {
    return [
      // SQL Query Tool
      {
        name: 'duckdb-query',
        description: 'Execute SQL query on DuckDB in-process analytics database',
        schema: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'SQL query to execute',
            },
          },
          required: ['sql'],
        },
        execute: async (args: Record<string, unknown>) => {
          const sql = args.sql as string;
          const result = await this.service.query(sql);
          return result;
        },
      },

      // Register Parquet File
      {
        name: 'duckdb-register-parquet',
        description: 'Register a Parquet file as a DuckDB table for analysis',
        schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to Parquet file',
            },
            tableName: {
              type: 'string',
              description: 'Name for the table',
            },
          },
          required: ['path', 'tableName'],
        },
        execute: async (args: Record<string, unknown>) => {
          const path = args.path as string;
          const tableName = args.tableName as string;
          await this.service.registerParquet(path, tableName);
          return { success: true, tableName };
        },
      },

      // List Tables
      {
        name: 'duckdb-list-tables',
        description: 'List all tables in DuckDB database',
        execute: async (_args: Record<string, unknown>) => {
          const tables = await this.service.listTables();
          return { tables };
        },
      },

      // Time Series Query (common financial operation)
      {
        name: 'duckdb-timeseries',
        description: 'Execute time series query with common financial aggregations',
        schema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            dateColumn: { type: 'string', description: 'Date/timestamp column' },
            valueColumn: { type: 'string', description: 'Value column to aggregate' },
            interval: {
              type: 'string',
              description: 'Aggregation interval (day, week, month, quarter, year)',
              enum: ['day', 'week', 'month', 'quarter', 'year'],
            },
            aggregation: {
              type: 'string',
              description: 'Aggregation function',
              enum: ['sum', 'avg', 'min', 'max', 'count', 'std', 'var'],
            },
            startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          },
          required: ['table', 'dateColumn', 'valueColumn', 'interval'],
        },
        execute: async (args: Record<string, unknown>) => {
          const {
            table,
            dateColumn,
            valueColumn,
            interval,
            aggregation = 'sum',
            startDate,
            endDate,
          } = args as any;

          let sql = `SELECT DATE_TRUNC('${interval}', ${dateColumn}) as period, `;
          sql += `${aggregation.toUpperCase()}(${valueColumn}) as value `;
          sql += `FROM ${table} `;

          const conditions: string[] = [];
          if (startDate) conditions.push(`${dateColumn} >= '${startDate}'`);
          if (endDate) conditions.push(`${dateColumn} <= '${endDate}'`);
          if (conditions.length) {
            sql += `WHERE ${conditions.join(' AND ')} `;
          }

          sql += `GROUP BY period ORDER BY period`;

          const result = await this.service.query(sql);
          return result;
        },
      },

      // Portfolio Analysis
      {
        name: 'duckdb-portfolio-analysis',
        description: 'Run portfolio analysis queries (returns, correlation, volatility)',
        schema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Portfolio data table' },
            returnsColumn: { type: 'string', description: 'Returns column' },
            weightsColumn: { type: 'string', description: 'Weights column' },
            analysisType: {
              type: 'string',
              enum: ['returns', 'volatility', 'correlation', 'sharpe', 'var'],
              description: 'Type of analysis',
            },
          },
          required: ['table', 'analysisType'],
        },
        execute: async (args: Record<string, unknown>) => {
          const { table, returnsColumn, weightsColumn, analysisType } = args as any;

          let sql = '';
          switch (analysisType) {
            case 'returns':
              sql = `SELECT SUM(${returnsColumn}) as total_return, AVG(${returnsColumn}) as avg_return FROM ${table}`;
              break;
            case 'volatility':
              sql = `SELECT STDDEV(${returnsColumn}) as volatility FROM ${table}`;
              break;
            case 'sharpe':
              sql = `SELECT AVG(${returnsColumn}) / STDDEV(${returnsColumn}) * SQRT(252) as sharpe_ratio FROM ${table}`;
              break;
            case 'var':
              sql = `SELECT PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY ${returnsColumn}) as var_95 FROM ${table}`;
              break;
            default:
              throw new Error(`Unknown analysis type: ${analysisType}`);
          }

          const result = await this.service.query(sql);
          return result;
        },
      },

      // Data Import
      {
        name: 'duckdb-import-csv',
        description: 'Import CSV file into DuckDB table',
        schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to CSV file' },
            tableName: { type: 'string', description: 'Target table name' },
            header: { type: 'boolean', description: 'CSV has header row', default: true },
            delimiter: { type: 'string', description: 'CSV delimiter', default: ',' },
          },
          required: ['path', 'tableName'],
        },
        execute: async (args: Record<string, unknown>) => {
          const { path, tableName, header = true, delimiter = ',' } = args as any;
          const headerOption = header ? 'HEADER' : '';
          const sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${path}', DELIMITER='${delimiter}', ${headerOption})`;
          await this.service.query(sql);
          return { success: true, tableName };
        },
      },
    ];
  }

  /**
   * Get all tools from this plugin
   */
  getTools(): AgentTool[] {
    return this.tools;
  }

  /**
   * Get the DuckDB service
   */
  getService(): DuckDBService {
    return this.service;
  }
}

// ============================================================================
// DuckDB Adapter (Plugin Adapter Implementation)
// ============================================================================

export class DuckDBAdapter implements PluginAdapter {
  readonly runtime = 'bun' as const;
  private plugin: DuckDBPlugin;

  constructor() {
    this.plugin = new DuckDBPlugin();
  }

  canLoad(manifest: PluginManifest): boolean {
    return manifest.id === 'duckdb-analytics' || manifest.capabilities.includes('data-source');
  }

  async load(manifest: PluginManifest, api: UpUpPluginApi): Promise<LoadedPlugin> {
    info('default', `Loading DuckDB plugin: ${manifest.name}`);

    // Register tools with API
    const tools = this.plugin.getTools();
    for (const tool of tools) {
      api.registerTool(tool);
    }

    // Register service
    const service = this.plugin.getService();
    api.registerService(service);

    return {
      id: manifest.id,
      runtime: this.runtime,
      manifest,
      instance: this.plugin,
      services: [service],
      tools,
      hooks: new Map(),
    };
  }

  async unload(_plugin: LoadedPlugin): Promise<void> {
    // Cleanup handled by service stop
  }
}