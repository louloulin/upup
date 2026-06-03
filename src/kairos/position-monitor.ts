/**
 * Position Monitor — kairos sub-system that watches open positions and
 * emits events on stop-loss / take-profit / risk-budget breaches.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      (Requirement: Position Monitor)
 *
 * Pure logic + injectable market data + event bus. No side effects
 * beyond emitting on the bus, so it can run inside the agent loop or
 * in a standalone cron job.
 */

import type { EventBus } from '../core/event-bus.js';

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  /** Stop-loss level. Undefined disables stop-loss monitoring. */
  stopLoss?: number;
  /** Take-profit level. Undefined disables take-profit monitoring. */
  takeProfit?: number;
  /** Optional risk budget in currency units (e.g. max loss = 10000 CNY). */
  riskBudget?: number;
}

export interface QuoteProvider {
  getQuote(symbol: string): Promise<{ symbol: string; last: number }>;
}

export interface PositionMonitorConfig {
  /** Event topic prefix. Default 'kairos.position'. */
  topicPrefix?: string;
  /** Optional clock for tests. */
  now?: () => number;
}

export interface PositionAlert {
  symbol: string;
  kind: 'stop-loss' | 'take-profit' | 'risk-budget';
  position: Position;
  lastPrice: number;
  unrealizedPnl: number;
  recommendation: string;
  detectedAt: number;
}

export interface PositionMonitorDeps {
  bus: EventBus;
  positions: () => Position[] | Promise<Position[]>;
  quotes: QuoteProvider;
  config?: PositionMonitorConfig;
}

export interface MonitorResult {
  scanned: number;
  alerts: PositionAlert[];
}

export function createPositionMonitor(deps: PositionMonitorDeps) {
  const cfg = { topicPrefix: 'kairos.position', ...deps.config };
  const now = cfg.now ?? (() => Date.now());

  return {
    async tick(): Promise<MonitorResult> {
      const positions = await deps.positions();
      const alerts: PositionAlert[] = [];
      const ts = now();

      for (const pos of positions) {
        const q = await deps.quotes.getQuote(pos.symbol);
        const direction = pos.quantity >= 0 ? 1 : -1;
        const unrealizedPnl = (q.last - pos.avgCost) * pos.quantity;
        const unrealizedPnlPct = pos.avgCost > 0 ? (q.last - pos.avgCost) / pos.avgCost : 0;

        // Stop-loss
        if (pos.stopLoss !== undefined) {
          const triggered =
            direction > 0 ? q.last <= pos.stopLoss : q.last >= pos.stopLoss;
          if (triggered) {
            const alert: PositionAlert = {
              symbol: pos.symbol,
              kind: 'stop-loss',
              position: pos,
              lastPrice: q.last,
              unrealizedPnl,
              recommendation:
                direction > 0
                  ? `市价卖出 ${pos.symbol} 以限制损失`
                  : `市价买入平仓 ${pos.symbol} 以限制损失`,
              detectedAt: ts,
            };
            deps.bus.emit(`${cfg.topicPrefix}.alert`, alert);
            alerts.push(alert);
          }
        }

        // Take-profit
        if (pos.takeProfit !== undefined) {
          const triggered =
            direction > 0 ? q.last >= pos.takeProfit : q.last <= pos.takeProfit;
          if (triggered) {
            const alert: PositionAlert = {
              symbol: pos.symbol,
              kind: 'take-profit',
              position: pos,
              lastPrice: q.last,
              unrealizedPnl,
              recommendation: `止盈 ${pos.symbol},锁定收益 (${(unrealizedPnlPct * 100).toFixed(2)}%)`,
              detectedAt: ts,
            };
            deps.bus.emit(`${cfg.topicPrefix}.alert`, alert);
            alerts.push(alert);
          }
        }

        // Risk budget
        if (pos.riskBudget !== undefined && unrealizedPnl < -pos.riskBudget) {
          const alert: PositionAlert = {
            symbol: pos.symbol,
            kind: 'risk-budget',
            position: pos,
            lastPrice: q.last,
            unrealizedPnl,
            recommendation: `${pos.symbol} 已亏损 ${(-unrealizedPnl).toFixed(0)} 超过风险预算 ${pos.riskBudget}`,
            detectedAt: ts,
          };
          deps.bus.emit(`${cfg.topicPrefix}.alert`, alert);
          alerts.push(alert);
        }
      }

      return { scanned: positions.length, alerts };
    },
  };
}

export const _internal = { createPositionMonitor };
