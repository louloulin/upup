/**
 * Web, search, and browser tool registrations.
 */

import type { RegisteredTool } from './types.js';
import { networkMetadata } from './types.js';
import { webFetchTool, WEB_FETCH_DESCRIPTION } from ('@upup/./web-fetch');
import { browserTool, BROWSER_DESCRIPTION } from './browser';
import { exaSearch, perplexitySearch, tavilySearch, WEB_SEARCH_DESCRIPTION, xSearchTool, X_SEARCH_DESCRIPTION } from './index';
import { skillTool, SKILL_TOOL_DESCRIPTION } from '@upup/skill';
import { discoverSkills } from '@upup/skills/index';

/** Check if playwright is available. Cached for performance. */
let playwrightAvailableCache: boolean | null = null;
async function isPlaywrightAvailable(): Promise<boolean> {
  if (playwrightAvailableCache !== null) return playwrightAvailableCache;
  try {
    await import('playwright');
    playwrightAvailableCache = true;
  } catch {
    playwrightAvailableCache = false;
  }
  return playwrightAvailableCache;
}

export async function loadWebSearchTools(): Promise<RegisteredTool[]> {
  const tools: RegisteredTool[] = [
    {
      name: 'web_fetch',
      tool: webFetchTool,
      description: WEB_FETCH_DESCRIPTION,
      compactDescription: 'Fetch and extract content from a URL as markdown. Use when you need full article text beyond headlines.',
      concurrencySafe: true,
      concurrencyMetadata: networkMetadata(),
    },
    // Browser tool - conditionally registered only when playwright is available
    ...(await isPlaywrightAvailable()
      ? [{
          name: 'browser' as const,
          tool: browserTool,
          description: BROWSER_DESCRIPTION,
          compactDescription: 'JavaScript-rendered pages and interactive navigation. Actions: navigate, snapshot, act, read, close.',
          concurrencySafe: true,
        }]
      : []),
  ];

  // Include web_search if API key is configured (Exa → Perplexity → Tavily)
  if (process.env.EXASEARCH_API_KEY) {
    tools.push({ name: 'web_search', tool: exaSearch, description: WEB_SEARCH_DESCRIPTION, compactDescription: 'Search the web for current information. Returns titles, URLs, and highlights.', concurrencySafe: true });
  } else if (process.env.PERPLEXITY_API_KEY) {
    tools.push({ name: 'web_search', tool: perplexitySearch, description: WEB_SEARCH_DESCRIPTION, compactDescription: 'Search the web for current information. Returns an answer with citations.', concurrencySafe: true });
  } else if (process.env.TAVILY_API_KEY) {
    tools.push({ name: 'web_search', tool: tavilySearch, description: WEB_SEARCH_DESCRIPTION, compactDescription: 'Search the web for current information. Returns titles, URLs, and snippets.', concurrencySafe: true });
  }

  if (process.env.X_BEARER_TOKEN) {
    tools.push({ name: 'x_search', tool: xSearchTool, description: X_SEARCH_DESCRIPTION, compactDescription: 'Search X/Twitter for tweets, profiles, and threads.', concurrencySafe: true });
  }

  const availableSkills = discoverSkills();
  if (availableSkills.length > 0) {
    tools.push({ name: 'skill', tool: skillTool, description: SKILL_TOOL_DESCRIPTION, compactDescription: 'Invoke a specialized skill workflow (e.g., DCF valuation).', concurrencySafe: false });
  }

  return tools;
}
