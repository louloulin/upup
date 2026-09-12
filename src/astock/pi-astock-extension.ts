/**
 * Astock extension — registers the migrated astock tools against the
 * upup extension contract (`PiUpupExtensionApi`).
 *
 * Pass 9 (Batch 2 / astock): full migration of the 7-tool astock family
 * to strict pi `ToolDefinition` + TypeBox schemas. The tools cover S1
 * (single optional string — get_astock_news / get_sector_data) and S2
 * (composite object with required + optional + Literal union — the rest)
 * schema shapes.
 *
 * Tool inventory:
 *   - get_astock_price       (S2: required code + optional enum period + 2 optional dates)
 *   - get_astock_financials  (S2: required code + 3 optional fields)
 *   - get_astock_news        (S1: optional code + 2 optional dates + optional limit)
 *   - get_market_structure   (S2: required enum type + 3 optional dates)
 *   - get_sector_data        (S1: optional code + optional enum type)
 *   - get_technical_data     (S2: required code + optional enum period + 2 optional dates)
 *   - screen_astocks         (S2: optional sector + optional exchange + optional numerics)
 */

import type { PiUpupExtensionApi } from '../pi-main.js';
import {
  createGetAStockPriceTool,
  createGetAStockFinancialsTool,
  createGetAStockNewsTool,
  createGetMarketStructureTool,
  createGetSectorDataTool,
  createGetTechnicalDataTool,
  createScreenAStocksTool,
} from './pi-astock-tool.js';

export type AstockExtensionApi = PiUpupExtensionApi;

export function registerAstockExtension(pi: PiUpupExtensionApi): void {
  // All 7 astock tools — strict pi `ToolDefinition` with TypeBox schema,
  // promptSnippet + promptGuidelines per pi docs/extensions.md.
  pi.registerTool(createGetAStockPriceTool());
  pi.registerTool(createGetAStockFinancialsTool());
  pi.registerTool(createGetAStockNewsTool());
  pi.registerTool(createGetMarketStructureTool());
  pi.registerTool(createGetSectorDataTool());
  pi.registerTool(createGetTechnicalDataTool());
  pi.registerTool(createScreenAStocksTool());

  // No slash command for astock in this pass — tool surface is sufficient
  // for the LLM. Future passes can add `pi.registerCommand('astock', ...)`
  // if a slash command UX is needed.
}
