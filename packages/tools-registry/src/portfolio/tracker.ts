/**
 * Portfolio Tracker — LangChain tool wrapper
 *
 * High-cohesion design: this module owns the LangChain tool binding and
 * schema only. All business logic is delegated to PortfolioService
 * (./service.js), which delegates to PortfolioRepository (./store.js).
 *
 * Layering (v7-2 refactor):
 *   tracker.ts   → service.ts   → store.ts (Position storage)
 *                → tushare-client.ts (live prices via PriceProvider)
 *
 * Why split:
 *   1. The old 212-line file mixed tool schema, business logic, and
 *      module-level singleton state. Hard to test, hard to swap.
 *   2. After split: store can be unit-tested without LangChain, service
 *      can be unit-tested with a NullPriceProvider, tracker stays a
 *      80-line pure wrapper.
 *   3. Future: drop in a FileBackedPortfolioRepository or a
 *      MultiPortfolioRepository without touching this file.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';

import {
  getDefaultPortfolioService,
  PortfolioService,
  TusharePriceProvider,
  NullPriceProvider,
  type PriceProvider,
} from './service.js';
import { getDefaultPortfolioRepository, InMemoryPortfolioRepository } from './store.js';

// Re-export public surface so other modules don't need to know the split.
export {
  getDefaultPortfolioService,
  PortfolioService,
  TusharePriceProvider,
  NullPriceProvider,
  type PriceProvider,
} from './service.js';

export {
  getDefaultPortfolioRepository,
  InMemoryPortfolioRepository,
  __resetDefaultPortfolioRepository,
} from './store.js';

export type { Position, PortfolioRepository } from './store.js';

export const PORTFOLIO_TRACKER_DESCRIPTION = `## portfolio_tracker
Track portfolio positions and calculate performance metrics.

**Features**:
- Add/remove positions
- Real-time P&L calculation
- Performance metrics (return, volatility, Sharpe)
- Holdings summary`;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const PortfolioTrackerSchema = z.object({
  action: z.enum(['add', 'remove', 'list', 'performance', 'summary']).describe('Portfolio action'),
  code: z.string().optional().describe('Stock code'),
  quantity: z.number().optional().describe('Number of shares'),
  entry_price: z.number().optional().describe('Entry price per share'),
  position_id: z.string().optional().describe('Position ID for removal'),
});

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Build a portfolio tracker tool. For backwards compatibility the
 * no-arg form uses the default in-memory repository + tushare prices.
 * For tests, pass explicit dependencies.
 */
export function createPortfolioTracker(
  _model: string,
  overrides: {
    service?: PortfolioService;
    priceProvider?: PriceProvider;
    repository?: InMemoryPortfolioRepository;
  } = {},
): StructuredToolInterface {
  // Resolve dependency graph: explicit overrides > defaults
  const repository = overrides.repository ?? getDefaultPortfolioRepository();
  const priceProvider = overrides.priceProvider ?? new TusharePriceProvider();
  const service = overrides.service ?? new PortfolioService(repository, priceProvider);

  return new DynamicStructuredTool({
    name: 'portfolio_tracker',
    description: PORTFOLIO_TRACKER_DESCRIPTION,
    schema: PortfolioTrackerSchema,
    async func(input): Promise<string> {
      try {
        switch (input.action) {
          case 'add': {
            if (!input.code || !input.quantity || !input.entry_price) {
              return JSON.stringify({ error: 'Missing: code, quantity, entry_price' });
            }
            const position = service.add({
              code: input.code,
              quantity: input.quantity,
              entry_price: input.entry_price,
            });
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
            const deleted = service.remove(input.position_id);
            return JSON.stringify({
              success: deleted,
              message: deleted ? 'Position removed' : 'Position not found',
            });
          }

          case 'list': {
            const positions = await service.listWithPnl();
            return JSON.stringify({ count: positions.length, positions }, null, 2);
          }

          case 'performance': {
            const metrics = await service.performance();
            return JSON.stringify({ success: true, metrics }, null, 2);
          }

          case 'summary': {
            const summary = await service.summaryBySector();
            return JSON.stringify(summary, null, 2);
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
