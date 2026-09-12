import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { formatToolResult, parseSearchResults } from '../types.js';
import { logger } from '@/utils';

// Lazily initialized to avoid errors when API key is not set
let exaTool: { invoke: (query: string) => Promise<unknown> } | null = null;

function getExaTool(): { invoke: (query: string) => Promise<unknown> } {
  if (!exaTool) {
    exaTool = { invoke: async (query) => {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.EXASEARCH_API_KEY ?? '' },
        body: JSON.stringify({ query, numResults: 5, contents: { highlights: true } }),
      });
      if (!response.ok) throw new Error(`Exa request failed with ${response.status}`);
      return response.json();
    }};
  }
  return exaTool!;
}

export const exaSearch = new PiTool({
  name: 'web_search',
  description:
    'Search the web for current information on any topic. Returns relevant search results with URLs and content snippets.',
  schema: z.object({
    query: z.string().describe('The search query to look up on the web'),
  }),
  func: async (input) => {
    try {
      const result = await getExaTool().invoke(input.query);
      const { parsed, urls } = parseSearchResults(result);
      return formatToolResult(parsed, urls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[Exa API] error: ${message}`);
      throw new Error(`[Exa API] ${message}`);
    }
  },
});
