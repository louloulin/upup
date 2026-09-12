/**
 * Investment Knowledge Tools Loader
 */

import type { PiTool } from '../../runtime/pi/tool.js';
import type { RegisteredTool } from './types.js';
import { investmentKnowledgeTools } from '../../runtime/pi/investment-knowledge-tools.js';

/**
 * Load investment knowledge management tools.
 */
export function loadInvestmentKnowledgeTools(): RegisteredTool[] {
  return investmentKnowledgeTools.map((tool: PiTool) => ({
    name: tool.name,
    description: tool.description,
    compactDescription: tool.description.slice(0, 150) + '...',
    tool,
    safetyLevel: 'safe' as const,
    category: 'memory' as const,
    sideEffects: 'none' as const,
    concurrencySafe: true,
  }));
}
