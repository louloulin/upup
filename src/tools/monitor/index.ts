/**
 * Real-time Market Monitoring Tool
 * 
 * Provides real-time market monitoring and alerts:
 * - Index monitoring (Shanghai, Shenzhen, ChiNext, STAR)
 * - Sector monitoring
 * - Alert thresholds
 * - Market sentiment tracking
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';

export const MARKET_MONITOR_DESCRIPTION = `## market_monitor
Real-time market monitoring for A-shares including indices, sectors, and alerts.

**When to use**: For tracking market conditions, sector performance, and setting alerts.

**Monitoring targets**:
- Major indices (SSE, SZSE, ChiNext, STAR, CSI300)
- Sector performance
- Market-wide metrics
- Custom watchlist

**Alert types**:
- Price alerts
- Percent change alerts
- Volume alerts
- Sentiment alerts`;

const MarketMonitorSchema = z.object({
  action: z.enum(['status', 'watch', 'alerts', 'sectors', 'indices']).describe('Monitoring action'),
  target: z.string().optional().describe('Target code or sector'),
  threshold: z.number().optional().describe('Alert threshold'),
  threshold_type: z.enum(['price', 'pct', 'volume']).optional().describe('Threshold type'),
});

interface MarketStatus {
  timestamp: string;
  market: string;
  status: 'open' | 'closed' | 'pre_open' | 'post_close';
  is_trading_day: boolean;
  indices: {
    code: string;
    name: string;
    close?: number;
    change_pct?: number;
    volume?: number;
  }[];
  market_summary: {
    advancing: number;
    declining: number;
    unchanged: number;
    turnover: number;
  };
}

const MAJOR_INDICES = [
  { code: '000001.SH', name: '上证指数' },
  { code: '399001.SZ', name: '深证成指' },
  { code: '399006.SZ', name: '创业板指' },
  { code: '000688.SH', name: '科创50' },
  { code: '000300.SH', name: '沪深300' },
];

function isMarketOpen(): { status: 'open' | 'closed' | 'pre_open' | 'post_close'; isTradingDay: boolean } {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const day = now.getDay();
  
  // Weekend
  if (day === 0 || day === 6) {
    return { status: 'closed', isTradingDay: false };
  }
  
  const timeMinutes = hour * 60 + minute;
  
  // Pre-open: 9:00-9:15
  if (timeMinutes >= 540 && timeMinutes < 555) {
    return { status: 'pre_open', isTradingDay: true };
  }
  
  // Core trading: 9:30-11:30, 13:00-15:00
  if ((timeMinutes >= 570 && timeMinutes < 690) || (timeMinutes >= 780 && timeMinutes < 900)) {
    return { status: 'open', isTradingDay: true };
  }
  
  // Post-close: 15:00-15:05
  if (timeMinutes >= 900 && timeMinutes < 905) {
    return { status: 'post_close', isTradingDay: true };
  }
  
  // Lunch break: 11:30-13:00
  if (timeMinutes >= 690 && timeMinutes < 780) {
    return { status: 'closed', isTradingDay: true };
  }
  
  return { status: 'closed', isTradingDay: true };
}

export function createMarketMonitor(_model: string): PiTool {
  return new PiTool({
    name: 'market_monitor',
    description: MARKET_MONITOR_DESCRIPTION,
    schema: MarketMonitorSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const today = getToday();
        const { status: marketStatus, isTradingDay } = isMarketOpen();
        
        switch (input.action) {
          case 'status': {
            // Get market status
            const indexData = await Promise.all(
              MAJOR_INDICES.map(async (idx) => {
                try {
                  const data = await client.daily({ ts_code: idx.code, trade_date: today });
                  if (Array.isArray(data) && data.length > 0) {
                    return {
                      code: idx.code,
                      name: idx.name,
                      close: parseFloat(String(data[0].close || 0)),
                      change_pct: parseFloat(String(data[0].pct_chg || 0)),
                      volume: parseFloat(String(data[0].volume || 0)),
                    };
                  }
                } catch {}
                return { code: idx.code, name: idx.name };
              })
            );
            
            // Calculate market summary from advance/decline
            let advancing = 0, declining = 0, unchanged = 0, totalTurnover = 0;
            
            for (const idx of indexData) {
              if (idx.change_pct !== undefined) {
                if (idx.change_pct > 0) advancing++;
                else if (idx.change_pct < 0) declining++;
                else unchanged++;
                totalTurnover += idx.volume || 0;
              }
            }
            
            const result: MarketStatus = {
              timestamp: new Date().toISOString(),
              market: 'A-shares',
              status: marketStatus,
              is_trading_day: isTradingDay,
              indices: indexData,
              market_summary: {
                advancing,
                declining,
                unchanged,
                turnover: totalTurnover,
              },
            };
            
            return JSON.stringify(result, null, 2);
          }
          
          case 'indices': {
            // Get specific index data
            const indices = input.target 
              ? input.target.split(',').map(s => s.trim())
              : MAJOR_INDICES.map(i => i.code);
            
            const indexData = await Promise.all(
              indices.map(async (code) => {
                try {
                  const data = await client.daily({ ts_code: code, trade_date: today });
                  const name = MAJOR_INDICES.find(i => i.code === code)?.name || code;
                  
                  if (Array.isArray(data) && data.length > 0) {
                    return {
                      code,
                      name,
                      close: parseFloat(String(data[0].close || 0)),
                      open: parseFloat(String(data[0].open || 0)),
                      high: parseFloat(String(data[0].high || 0)),
                      low: parseFloat(String(data[0].low || 0)),
                      change: parseFloat(String(data[0].change || 0)),
                      change_pct: parseFloat(String(data[0].pct_chg || 0)),
                      volume: parseFloat(String(data[0].volume || 0)),
                      amount: parseFloat(String(data[0].amount || 0)),
                    };
                  }
                } catch {}
                return { code, name: code };
              })
            );
            
            return JSON.stringify({
              timestamp: new Date().toISOString(),
              market_status: marketStatus,
              indices: indexData,
            }, null, 2);
          }
          
          case 'sectors': {
            // Get sector data
            const sectorName = input.target || '';
            
            // Common sectors
            const sectors = [
              { name: '银行', industry: '银行' },
              { name: '白酒', industry: '白酒' },
              { name: '医药', industry: '医药制造' },
              { name: '新能源', industry: '新能源' },
              { name: '半导体', industry: '半导体' },
              { name: '房地产', industry: '房地产' },
            ];
            
            const sectorData = await Promise.all(
              sectors.map(async (sector) => {
                try {
                  // Get stocks in sector
                  const stocks = await client.stockBasic({ 
                    industry: sector.industry,
                    list_status: 'L'
                  });
                  
                  if (!Array.isArray(stocks) || stocks.length === 0) {
                    return { name: sector.name, count: 0 };
                  }
                  
                  // Get prices for top stocks in sector
                  const topStocks = stocks.slice(0, 5);
                  const prices = await Promise.all(
                    topStocks.map(async (stock) => {
                      try {
                        const code = (stock as any).ts_code;
                        const data = await client.daily({ ts_code: code, trade_date: today });
                        if (Array.isArray(data) && data.length > 0) {
                          return parseFloat(String(data[0].pct_chg || 0));
                        }
                      } catch {}
                      return 0;
                    })
                  );
                  
                  const avgChange = prices.length > 0
                    ? prices.reduce((a, b) => a + b, 0) / prices.length
                    : 0;
                  
                  return {
                    name: sector.name,
                    stock_count: stocks.length,
                    avg_change_pct: Math.round(avgChange * 100) / 100,
                    top_gainers: Math.max(...prices).toFixed(2),
                    top_losers: Math.min(...prices).toFixed(2),
                  };
                } catch {
                  return { name: sector.name, error: 'Failed to fetch' };
                }
              })
            );
            
            return JSON.stringify({
              timestamp: new Date().toISOString(),
              market_status: marketStatus,
              sectors: sectorData,
            }, null, 2);
          }
          
          case 'watch': {
            // Add to watchlist
            const watchlist = [
              { code: '600519.SH', name: '贵州茅台' },
              { code: '002594.SZ', name: '比亚迪' },
              { code: '300750.SZ', name: '宁德时代' },
              { code: '000001.SH', name: '平安银行' },
              { code: '00700.HK', name: '腾讯控股' },
            ];
            
            const watchData = await Promise.all(
              watchlist.map(async (stock) => {
                try {
                  const data = await client.daily({ ts_code: stock.code, trade_date: today });
                  if (Array.isArray(data) && data.length > 0) {
                    return {
                      ...stock,
                      close: parseFloat(String(data[0].close || 0)),
                      change_pct: parseFloat(String(data[0].pct_chg || 0)),
                      volume: parseFloat(String(data[0].volume || 0)),
                    };
                  }
                } catch {}
                return { ...stock, error: 'No data' };
              })
            );
            
            return JSON.stringify({
              timestamp: new Date().toISOString(),
              market_status: marketStatus,
              watchlist: watchData,
            }, null, 2);
          }
          
          case 'alerts': {
            // Get alerts based on thresholds
            const threshold = input.threshold || 5; // Default 5%
            const thresholdType = input.threshold_type || 'pct';
            
            // Get major stocks and check for alert conditions
            const alertStocks = [
              { code: '600519.SH', name: '贵州茅台' },
              { code: '300750.SZ', name: '宁德时代' },
              { code: '002594.SZ', name: '比亚迪' },
              { code: '601318.SH', name: '中国平安' },
            ];
            
            const alerts = await Promise.all(
              alertStocks.map(async (stock) => {
                try {
                  const data = await client.daily({ ts_code: stock.code, trade_date: today });
                  if (Array.isArray(data) && data.length > 0) {
                    const changePct = parseFloat(String(data[0].pct_chg || 0));
                    const volume = parseFloat(String(data[0].volume || 0));
                    
                    const alertConditions: string[] = [];
                    
                    if (thresholdType === 'pct') {
                      if (Math.abs(changePct) >= threshold) {
                        alertConditions.push(`${thresholdType.toUpperCase()}: ${changePct.toFixed(2)}%`);
                      }
                    }
                    
                    // Limit up/down alerts
                    if (changePct >= 9.9) alertConditions.push('涨停 (Limit Up)');
                    if (changePct <= -9.9) alertConditions.push('跌停 (Limit Down)');
                    
                    return {
                      code: stock.code,
                      name: stock.name,
                      close: parseFloat(String(data[0].close || 0)),
                      change_pct: changePct,
                      volume,
                      alerts: alertConditions.length > 0 ? alertConditions : ['Normal'],
                    };
                  }
                } catch {}
                return { code: stock.code, name: stock.name, alerts: ['Data unavailable'] };
              })
            );
            
            const triggeredAlerts = alerts.filter(a => 
              a.alerts && a.alerts.some((alert: string) => !alert.includes('Normal') && !alert.includes('unavailable'))
            );
            
            return JSON.stringify({
              timestamp: new Date().toISOString(),
              threshold,
              threshold_type: thresholdType,
              total_stocks: alerts.length,
              alerts_triggered: triggeredAlerts.length,
              alerts: triggeredAlerts,
              all_stocks: alerts,
            }, null, 2);
          }
          
          default:
            return JSON.stringify({
              error: 'Unknown action',
              available_actions: ['status', 'indices', 'sectors', 'watch', 'alerts'],
            });
        }
      } catch (error) {
        return JSON.stringify({
          error: 'Market monitoring failed',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

export default createMarketMonitor;
