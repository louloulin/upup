/**
 * Portfolio extension — registers the migrated portfolio tools against
 * the upup extension contract (`PiUpupExtensionApi`).
 *
 * Pass 12 / Batch 3 (portfolio): 6 tools covering portfolio tracking.
 * 4 are side-effecting (`add_position`, `update_position`,
 * `remove_position`, `set_cash`) and THROW on error per Pass 11's
 * pattern for file-mutating tools.
 * 2 are read-only (`get_portfolio`, `get_transactions`) and use the
 * catch-and-return-text pattern.
 *
 * Side-effecting tools declare `executionMode: 'sequential'` so the pi
 * runtime never invokes two of them concurrently — portfolio file
 * mutations must be serialized.
 */

import type { PiUpupExtensionApi } from '../pi-main.js';
import {
  createAddPositionTool,
  createUpdatePositionTool,
  createRemovePositionTool,
  createSetCashTool,
  createGetTransactionsTool,
  createGetPortfolioTool,
} from './pi-portfolio-tool.js';

export type PortfolioExtensionApi = PiUpupExtensionApi;

export function registerPortfolioExtension(pi: PiUpupExtensionApi): void {
  // Side-effecting tools first — they mutate the portfolio JSON file.
  pi.registerTool(createAddPositionTool());
  pi.registerTool(createUpdatePositionTool());
  pi.registerTool(createRemovePositionTool());
  pi.registerTool(createSetCashTool());

  // Read-only portfolio queries.
  pi.registerTool(createGetTransactionsTool());
  pi.registerTool(createGetPortfolioTool());
}