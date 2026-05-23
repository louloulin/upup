/**
 * Data Export Tool
 * 
 * Export financial data in various formats:
 * - CSV format
 * - JSON format
 * - Markdown tables
 * - Excel-ready data
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';
import type { StructuredToolInterface } from '@langchain/core/tools';

export const DATA_EXPORT_DESCRIPTION = `## data_export
Export financial data in various formats.

**Supported Formats**:
- csv: Comma-separated values
- json: JSON array format
- markdown: Markdown table
- excel: Excel-ready array

**Data Types**:
- price: Historical price data
- financials: Financial statements
- fundamentals: Key ratios
- combined: All available data`;

const DataExportSchema = z.object({
  format: z.enum(['csv', 'json', 'markdown', 'excel']).describe('Export format'),
  data_type: z.enum(['price', 'financials', 'fundamentals', 'combined']).describe('Data type to export'),
  code: z.string().describe('Stock code'),
  start_date: z.string().optional().describe('Start date (YYYYMMDD)'),
  end_date: z.string().optional().describe('End date (YYYYMMDD)'),
  limit: z.number().optional().describe('Max records'),
});

/**
 * Convert array of objects to CSV string
 */
function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(h => {
      const val = row[h];
      const str = String(val ?? '');
      // Escape quotes and wrap in quotes if contains comma
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Convert array of objects to Markdown table
 */
function toMarkdown(data: Record<string, unknown>[], title?: string): string {
  if (data.length === 0) return 'No data available';
  
  const headers = Object.keys(data[0]);
  const colWidths = headers.map(h => Math.max(h.length, ...data.map(d => String(d[h] ?? '').length)));
  
  const headerRow = `| ${headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ')} |`;
  const separatorRow = `| ${colWidths.map(w => '-'.repeat(w)).join(' | ')} |`;
  const dataRows = data.map(row => 
    `| ${headers.map((h, i) => String(row[h] ?? '').padEnd(colWidths[i])).join(' | ')} |`
  );
  
  let result = '';
  if (title) result += `## ${title}\n\n`;
  result += headerRow + '\n';
  result += separatorRow + '\n';
  result += dataRows.join('\n');
  
  return result;
}

/**
 * Format number for display
 */
function formatNumber(val: unknown): string {
  if (val === null || val === undefined) return '';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return String(val);
  if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(2) + '亿';
  if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(2) + '万';
  return num.toFixed(2);
}

export function createDataExport(_model: string): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'data_export',
    description: DATA_EXPORT_DESCRIPTION,
    schema: DataExportSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const today = input.end_date || getToday();
        const startDate = input.start_date || (() => {
          const d = new Date();
          d.setMonth(d.getMonth() - 3);
          return d.toISOString().split('T')[0].replace(/-/g, '');
        })();
        
        const limit = input.limit || 100;
        let data: Record<string, unknown>[] = [];
        
        switch (input.data_type) {
          case 'price': {
            const priceData = await client.daily({
              ts_code: input.code,
              start_date: startDate,
              end_date: today,
            });
            
            data = (Array.isArray(priceData) ? priceData : []).slice(-limit).map((d: any) => ({
              date: d.trade_date,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
              volume: d.volume,
              amount: d.amount,
              pct_chg: d.pct_chg,
              change: d.change,
            }));
            break;
          }
          
          case 'financials': {
            const [income, balance, cashflow] = await Promise.all([
              client.income({ ts_code: input.code }).catch(() => []),
              client.balancesheet({ ts_code: input.code }).catch(() => []),
              client.cashflow({ ts_code: input.code }).catch(() => []),
            ]);
            
            data = (Array.isArray(income) ? income : []).slice(0, limit).map((d: any) => ({
              report_date: d.ann_date || d.end_date,
              revenue: formatNumber(d.revenue),
              net_profit: formatNumber(d.n_p || d.net_profit),
              total_assets: formatNumber(d.total_assets),
              total_liab: formatNumber(d.total_liab),
              operating_cf: formatNumber(d.cfo || d.operating_cash_flow),
            }));
            break;
          }
          
          case 'fundamentals': {
            const weeklyData = await client.weekly({
              ts_code: input.code,
            }).catch(() => []);
            
            data = (Array.isArray(weeklyData) ? weeklyData : []).slice(0, limit).map((d: any) => ({
              date: d.trade_date,
              close: d.close,
              pe: d.pe,
              pb: d.pb,
              ps: d.ps,
              turnover_rate: d.turnover_rate,
            }));
            break;
          }
          
          case 'combined':
          default: {
            const [priceData, income] = await Promise.all([
              client.daily({ ts_code: input.code, start_date: startDate, end_date: today }).catch(() => []),
              client.income({ ts_code: input.code }).catch(() => []).then(r => Array.isArray(r) ? r[0] : null),
            ]);
            
            const latestPrice = (Array.isArray(priceData) ? priceData : []).slice(-1)[0] || {};
            const latestIncome = income;
            
            data = [{
              code: input.code,
              date: today,
              close: latestPrice.close || 'N/A',
              pct_chg: latestPrice.pct_chg || 'N/A',
              revenue: formatNumber(latestIncome?.revenue),
              net_profit: formatNumber(latestIncome?.n_p || latestIncome?.net_profit),
            }];
            break;
          }
        }
        
        // Format output based on requested type
        switch (input.format) {
          case 'csv':
            return toCSV(data);
          
          case 'json':
            return JSON.stringify({
              code: input.code,
              format: 'json',
              count: data.length,
              data,
            }, null, 2);
          
          case 'excel':
            return JSON.stringify({
              code: input.code,
              format: 'excel-ready',
              headers: data.length > 0 ? Object.keys(data[0]) : [],
              rows: data.map(d => Object.values(d)),
              count: data.length,
            }, null, 2);
          
          case 'markdown':
          default:
            return toMarkdown(data, `${input.code} - ${input.data_type.toUpperCase()} Data`);
        }
      } catch (error) {
        return JSON.stringify({
          error: 'Data export failed',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

export default createDataExport;

// Placeholder exports for domain-tools.ts compatibility
// These tools are planned for future implementation
export const EXPORT_PORTFOLIO_DESCRIPTION = `## export_portfolio
Export portfolio data in various formats.
Note: This feature is planned for future implementation.`;

export const EXPORT_WATCHLIST_DESCRIPTION = `## export_watchlist
Export watchlist data in various formats.
Note: This feature is planned for future implementation.`;

export const EXPORT_DATA_DESCRIPTION = `## export_data
Export financial data in various formats.
Note: This feature is planned for future implementation.`;

export function createExportPortfolioTool() {
  return null as any;
}

export function createExportWatchlistTool() {
  return null as any;
}

export function createExportDataTool() {
  return null as any;
}
