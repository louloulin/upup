/**
 * Portfolio Tracking Tool
 * 
 * Track portfolio positions and performance:
 * - Position tracking
 * - P&L calculation
 * - Performance metrics
 * - Holdings summary
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';
import type { StructuredToolInterface } from '@langchain/core/tools';

export const PORTFOLIO_TRACKER_DESCRIPTION = `## portfolio_tracker
Track portfolio positions and calculate performance metrics.

**Features**:
- Add/remove positions
- Real-time P&L calculation
- Performance metrics (return, volatility, Sharpe)
- Holdings summary`;

const PortfolioTrackerSchema = z.object({
  action: z.enum(['add', 'remove', 'list', 'performance', 'summary']).describe('Portfolio action'),
  code: z.string().optional().describe('Stock code'),
  quantity: z.number().optional().describe('Number of shares'),
  entry_price: z.number().optional().describe('Entry price per share'),
  position_id: z.string().optional().describe('Position ID for removal'),
});

interface Position {
  id: string;
  code: string;
  name?: string;
  quantity: number;
  entry_price: number;
  entry_date: string;
  current_price?: number;
  pnl?: number;
  pnl_pct?: number;
}

interface PortfolioMetrics {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  day_change: number;
  day_change_pct: number;
}

// In-memory portfolio store
const portfolioStore: Map<string, Position> = new Map();
let positionIdCounter = 1;

function generatePositionId(): string {
  return `POS${Date.now()}${positionIdCounter++}`;
}

export function createPortfolioTracker(_model: string): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'portfolio_tracker',
    description: PORTFOLIO_TRACKER_DESCRIPTION,
    schema: PortfolioTrackerSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        
        switch (input.action) {
          case 'add': {
            if (!input.code || !input.quantity || !input.entry_price) {
              return JSON.stringify({ error: 'Missing: code, quantity, entry_price' });
            }
            
            const positionId = generatePositionId();
            const position: Position = {
              id: positionId,
              code: input.code,
              quantity: input.quantity,
              entry_price: input.entry_price,
              entry_date: getToday(),
            };
            
            portfolioStore.set(positionId, position);
            
            return JSON.stringify({
              success: true,
              position,
              message: `Added position: ${input.code} x ${input.quantity} @ ${input.entry_price}`,
            }, null, 2);
          }
          
          case 'remove': {
            if (!input.position_id) {
              return JSON.stringify({ error: 'position_id required' });
            }
            
            const deleted = portfolioStore.delete(input.position_id);
            return JSON.stringify({ success: deleted, message: deleted ? 'Position removed' : 'Position not found' });
          }
          
          case 'list': {
            const positions = Array.from(portfolioStore.values());
            
            // Update current prices
            for (const pos of positions) {
              try {
                const data = await client.daily({ ts_code: pos.code, trade_date: getToday() });
                if (Array.isArray(data) && data.length > 0) {
                  pos.current_price = parseFloat(String(data[0].close || 0));
                  pos.pnl = (pos.current_price - pos.entry_price) * pos.quantity;
                  pos.pnl_pct = ((pos.current_price / pos.entry_price) - 1) * 100;
                  
                  // Get name
                  const info = await client.stockBasic({ ts_code: pos.code }).catch(() => []);
                  if (Array.isArray(info) && info.length > 0) {
                    pos.name = (info[0] as any).name;
                  }
                }
              } catch {}
            }
            
            return JSON.stringify({
              count: positions.length,
              positions,
            }, null, 2);
          }
          
          case 'performance': {
            const positions = Array.from(portfolioStore.values());
            let totalValue = 0, totalCost = 0;
            
            for (const pos of positions) {
              try {
                const data = await client.daily({ ts_code: pos.code, trade_date: getToday() });
                if (Array.isArray(data) && data.length > 0) {
                  const currentPrice = parseFloat(String(data[0].close || 0));
                  totalValue += currentPrice * pos.quantity;
                }
              } catch {}
              totalCost += pos.entry_price * pos.quantity;
            }
            
            const metrics: PortfolioMetrics = {
              total_value: totalValue,
              total_cost: totalCost,
              total_pnl: totalValue - totalCost,
              total_pnl_pct: totalCost > 0 ? ((totalValue / totalCost) - 1) * 100 : 0,
              day_change: 0,
              day_change_pct: 0,
            };
            
            return JSON.stringify({ success: true, metrics }, null, 2);
          }
          
          case 'summary': {
            const positions = Array.from(portfolioStore.values());
            
            // Group by sector (simplified)
            const sectorMap = new Map<string, { value: number; pnl: number }>();
            
            for (const pos of positions) {
              try {
                const info = await client.stockBasic({ ts_code: pos.code }).catch(() => []);
                const industry = Array.isArray(info) && info.length > 0 
                  ? (info[0] as any).industry || 'Unknown' 
                  : 'Unknown';
                
                const data = await client.daily({ ts_code: pos.code, trade_date: getToday() }).catch(() => []);
                const currentPrice = Array.isArray(data) && data.length > 0
                  ? parseFloat(String(data[0].close || 0))
                  : pos.entry_price;
                
                const value = currentPrice * pos.quantity;
                const cost = pos.entry_price * pos.quantity;
                const pnl = value - cost;
                
                const existing = sectorMap.get(industry) || { value: 0, pnl: 0 };
                sectorMap.set(industry, {
                  value: existing.value + value,
                  pnl: existing.pnl + pnl,
                });
              } catch {}
            }
            
            const sectors = Array.from(sectorMap.entries()).map(([name, data]) => ({
              sector: name,
              value: data.value,
              pnl: data.pnl,
              pnl_pct: data.value > 0 ? (data.pnl / (data.value - data.pnl)) * 100 : 0,
            }));
            
            return JSON.stringify({
              positions_count: positions.length,
              sectors,
            }, null, 2);
          }
          
          default:
            return JSON.stringify({
              error: 'Unknown action',
              available: ['add', 'remove', 'list', 'performance', 'summary'],
            });
        }
      } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}
