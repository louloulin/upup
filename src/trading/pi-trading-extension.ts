/**
 * Trading extension — registers the migrated sandbox trading tools
 * against the upup extension contract (`PiUpupExtensionApi`).
 *
 * Pass 11 / Batch 3 (trading prototype): 5 tools covering paper trading
 * and account state. Two are side-effecting (place/cancel orders) and
 * THROW on error per pi's recommended pattern for side-effecting tools.
 * Three are read-only (positions / balance / quote) and use the
 * catch-and-return-text pattern from earlier passes.
 */

import type { PiUpupExtensionApi } from '../pi-main.js';
import {
  createPlaceTradeOrderTool,
  createCancelTradeOrderTool,
  createGetTradingPositionsTool,
  createGetTradingBalanceTool,
  createGetTradeQuoteTool,
} from './pi-trading-tool.js';

export type TradingExtensionApi = PiUpupExtensionApi;

export function registerTradingExtension(pi: PiUpupExtensionApi): void {
  // Side-effecting tools first — they mutate singleton broker state.
  pi.registerTool(createPlaceTradeOrderTool());
  pi.registerTool(createCancelTradeOrderTool());

  // Read-only account state.
  pi.registerTool(createGetTradingPositionsTool());
  pi.registerTool(createGetTradingBalanceTool());
  pi.registerTool(createGetTradeQuoteTool());

  // No slash command for trading in this pass — tool surface is
  // sufficient. Future passes can add `pi.registerCommand('trading', ...)`
  // if a UX hook is needed.
}
