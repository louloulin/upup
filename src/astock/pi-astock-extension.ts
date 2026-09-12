/**
 * Astock extension — registers the migrated astock tools against the
 * upup extension contract (`PiUpupExtensionApi`).
 *
 * Pass 9 (Batch 2 / astock): validates S2 composite-object schemas
 * with required string + optional enum + optional dates pattern at
 * scale. Two prototype tools registered in this pass:
 *   - get_astock_price     (S2: required code + optional enum period + 2 optional dates)
 *   - get_market_structure (S2: required enum type + 3 optional dates)
 *
 * Future Pass 10+ will add the remaining 5 astock tools
 * (get_astock_financials, get_astock_news, get_sector_data,
 * get_technical_data, screen_astocks) once the prototype patterns
 * are validated.
 */

import type { PiUpupExtensionApi } from '../pi-main.js';
import {
  createGetAStockPriceTool,
  createGetMarketStructureTool,
} from './pi-astock-tool.js';

export type AstockExtensionApi = PiUpupExtensionApi;

export function registerAstockExtension(pi: PiUpupExtensionApi): void {
  // Two prototype tools for Batch 2 / Pass 9. Each is a strict pi
  // `ToolDefinition` with TypeBox schema, promptSnippet + promptGuidelines.
  pi.registerTool(createGetAStockPriceTool());
  pi.registerTool(createGetMarketStructureTool());

  // No slash command for astock in this pass — tool surface is sufficient
  // for the LLM. Future passes can add `pi.registerCommand('astock', ...)`
  // if a slash command UX is needed.
}