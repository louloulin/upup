/**
 * Data Export Tools
 *
 * Export investment data to CSV/JSON format for sharing and analysis:
 * - Portfolio export
 * - Watchlist export
 * - Analysis results export
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { formatToolResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface ExportData {
  headers: string[];
  rows: (string | number | boolean | null)[][];
  filename: string;
  format: 'csv' | 'json';
}

// ============================================================================
// CSV Formatting
// ============================================================================

function escapeCSV(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  // Escape quotes and wrap in quotes if contains special chars
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(data: ExportData): string {
  const lines: string[] = [];

  // Header row
  lines.push(data.headers.map(h => escapeCSV(h)).join(','));

  // Data rows
  for (const row of data.rows) {
    lines.push(row.map(cell => escapeCSV(cell)).join(','));
  }

  return lines.join('\n');
}

// ============================================================================
// JSON Formatting
// ============================================================================

function toJSON(data: ExportData): string {
  const objects = data.rows.map(row => {
    const obj: Record<string, string | number | boolean | null> = {};
    data.headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

// ============================================================================
// File Writing
// ============================================================================

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeExportFile(data: ExportData): string {
  const exportDir = '.dexter/exports';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeFilename = data.filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fullPath = path.join(exportDir, `${safeFilename}_${timestamp}.${data.format}`);

  ensureDir(fullPath);

  const content = data.format === 'csv' ? toCSV(data) : toJSON(data);
  fs.writeFileSync(fullPath, content, 'utf-8');

  return fullPath;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const exportPortfolioSchema = z.object({
  format: z.enum(['csv', 'json']).default('csv').describe('Export format'),
  includeTransactions: z.boolean().default(false).describe('Include transaction history'),
});

const exportWatchlistSchema = z.object({
  format: z.enum(['csv', 'json']).default('csv').describe('Export format'),
  includeAlerts: z.boolean().default(true).describe('Include alert configuration'),
});

const exportAnalysisSchema = z.object({
  data: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))).describe('Array of data objects to export'),
  filename: z.string().default('analysis').describe('Output filename (without extension)'),
  format: z.enum(['csv', 'json']).default('csv').describe('Export format'),
});

// ============================================================================
// Data Loaders (lazy imports)
// ============================================================================

async function loadPortfolioData(): Promise<{ entries: Record<string, any>; updatedAt: string }> {
  const { getPositions } = await import('../portfolio/index.js');
  const positions = getPositions();
  const entries: Record<string, any> = {};
  for (const pos of positions) {
    entries[pos.symbol] = pos;
  }
  return { entries, updatedAt: new Date().toISOString() };
}

async function loadWatchlistData(): Promise<{ entries: Record<string, any>; updatedAt: string }> {
  // Dynamic import to avoid circular dependency
  const { getEntries } = await import('../watchlist/watchlist-tools.js');
  return { entries: getEntries(), updatedAt: new Date().toISOString() };
}

// ============================================================================
// Tools
// ============================================================================

/**
 * Export portfolio data to CSV/JSON
 */
export function createExportPortfolioTool() {
  return new DynamicStructuredTool({
    name: 'export_portfolio',
    description: 'Export portfolio positions and P&L data to CSV or JSON format for sharing and backup.',
    schema: exportPortfolioSchema,
    func: async ({ format, includeTransactions }) => {
      try {
        const portfolio = await loadPortfolioData();

        if (!portfolio.entries || Object.keys(portfolio.entries).length === 0) {
          return formatToolResult({
            type: 'Export Result',
            status: 'empty',
            message: 'No portfolio data to export',
          });
        }

        // Build export data
        const headers = ['Symbol', 'Quantity', 'Avg Cost', 'Current Price', 'Market Value', 'Unrealized P&L', 'P&L %', 'Added At'];
        const rows: (string | number | boolean | null)[][] = [];

        for (const [symbol, entry] of Object.entries(portfolio.entries)) {
          const costBasis = entry.avgCost * entry.quantity;
          const marketValue = entry.currentPrice * entry.quantity;
          const pnl = marketValue - costBasis;
          const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

          rows.push([
            symbol,
            entry.quantity,
            entry.avgCost,
            entry.currentPrice || 0,
            marketValue,
            pnl,
            pnlPercent,
            entry.addedAt || '',
          ]);
        }

        const exportData: ExportData = {
          headers,
          rows,
          filename: 'portfolio_export',
          format,
        };

        const filePath = writeExportFile(exportData);

        return formatToolResult({
          type: 'Portfolio Export',
          status: 'success',
          format,
          filePath,
          symbols: rows.length,
          summary: {
            totalSymbols: rows.length,
            totalMarketValue: rows.reduce((sum, r) => sum + (r[4] as number || 0), 0),
            totalPnL: rows.reduce((sum, r) => sum + (r[5] as number || 0), 0),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolResult({
          type: 'Export Result',
          status: 'error',
          message: `Failed to export portfolio: ${message}`,
        });
      }
    },
  });
}

/**
 * Export watchlist data to CSV/JSON
 */
export function createExportWatchlistTool() {
  return new DynamicStructuredTool({
    name: 'export_watchlist',
    description: 'Export watchlist with symbols, notes, and alerts to CSV or JSON format.',
    schema: exportWatchlistSchema,
    func: async ({ format, includeAlerts }) => {
      try {
        const watchlist = await loadWatchlistData();

        if (!watchlist.entries || Object.keys(watchlist.entries).length === 0) {
          return formatToolResult({
            type: 'Export Result',
            status: 'empty',
            message: 'No watchlist data to export',
          });
        }

        // Build export data
        const headers = includeAlerts
          ? ['Symbol', 'Added At', 'Notes', 'Tags', 'Alert Type', 'Alert Value', 'Alert Triggered']
          : ['Symbol', 'Added At', 'Notes', 'Tags'];

        const rows: (string | number | boolean | null)[][] = [];

        for (const [symbol, entry] of Object.entries(watchlist.entries)) {
          if (includeAlerts && entry.alerts && entry.alerts.length > 0) {
            // One row per alert
            for (const alert of entry.alerts) {
              rows.push([
                symbol,
                entry.addedAt || '',
                entry.notes || '',
                entry.tags?.join(';') || '',
                alert.type,
                alert.value,
                alert.triggered,
              ]);
            }
          } else {
            rows.push([
              symbol,
              entry.addedAt || '',
              entry.notes || '',
              entry.tags?.join(';') || '',
            ]);
          }
        }

        const exportData: ExportData = {
          headers,
          rows,
          filename: 'watchlist_export',
          format,
        };

        const filePath = writeExportFile(exportData);

        return formatToolResult({
          type: 'Watchlist Export',
          status: 'success',
          format,
          filePath,
          symbols: Object.keys(watchlist.entries).length,
          alerts: rows.filter(r => includeAlerts && r.length > 5).length,
          summary: {
            totalSymbols: Object.keys(watchlist.entries).length,
            totalAlerts: rows.filter(r => includeAlerts && r.length > 5).length,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolResult({
          type: 'Export Result',
          status: 'error',
          message: `Failed to export watchlist: ${message}`,
        });
      }
    },
  });
}

/**
 * Export arbitrary analysis data to CSV/JSON
 */
export function createExportDataTool() {
  return new DynamicStructuredTool({
    name: 'export_data',
    description: 'Export arbitrary analysis results or data tables to CSV or JSON format.',
    schema: exportAnalysisSchema,
    func: async ({ data, filename, format }) => {
      try {
        if (!data || data.length === 0) {
          return formatToolResult({
            type: 'Export Result',
            status: 'empty',
            message: 'No data to export',
          });
        }

        // Extract headers from first object keys
        const headers = Object.keys(data[0]);

        // Build rows
        const rows: (string | number | boolean | null)[][] = data.map(obj =>
          headers.map(h => obj[h] ?? null)
        );

        const exportData: ExportData = {
          headers,
          rows,
          filename,
          format,
        };

        const filePath = writeExportFile(exportData);

        return formatToolResult({
          type: 'Data Export',
          status: 'success',
          format,
          filePath,
          rows: data.length,
          columns: headers.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolResult({
          type: 'Export Result',
          status: 'error',
          message: `Failed to export data: ${message}`,
        });
      }
    },
  });
}

export const exportTools = [
  createExportPortfolioTool(),
  createExportWatchlistTool(),
  createExportDataTool(),
];
