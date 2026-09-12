import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { formatToolResult, parseSearchResults } from '../types.js';
import { logger } from '../../utils/logger.js';

// Lazily initialized to avoid errors when API key is not set
let tavilyClient: { invoke: (input: { query: string }) => Promise<unknown> } | null = null;

function getTavilyClient(): { invoke: (input: { query: string }) => Promise<unknown> } {
  if (!tavilyClient) {
    tavilyClient = { invoke: async ({ query }) => {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 5 }),
      });
      if (!response.ok) throw new Error(`Tavily request failed with ${response.status}`);
      return response.json();
    }};
  }
  return tavilyClient;
}

export const tavilySearch = new PiTool({
  name: 'web_search',
  description:
    'Search the web for current information on any topic. Returns relevant search results with URLs and content snippets.',
  schema: z.object({
    query: z.string().describe('The search query to look up on the web'),
  }),
  func: async (input) => {
    try {
      const result = await getTavilyClient().invoke({ query: input.query });
      const { parsed, urls } = parseSearchResults(result);
      return formatToolResult(parsed, urls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[Tavily API] error: ${message}`);
      throw new Error(`[Tavily API] ${message}`);
    }
  },
});
