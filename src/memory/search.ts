/**
 * Memory Search - Hybrid search using Memvid + FTS5 fallback
 *
 * Based on Claude Code's memory architecture:
 * - Primary: AI-Selector (LLM semantic selection)
 * - Secondary: Memvid.find(mode: 'lex') BM25 search
 * - Fallback: SQLite FTS5 keyword search
 *
 * No external embedding API dependency.
 */

import { buildSnippet } from './chunker.js';
import { getMemvidStore } from './memvid-store.js';
import { scanTypedMemoryFiles } from './scanner.js';
import type { MemoryDatabase } from './database.js';
import type {
  MemorySearchOptions,
  MemorySearchResult,
  MemoryEmbeddingClient,
  TemporalDecayConfig,
  MMRConfig,
} from './types.js';
import { applyTemporalDecay } from './temporal-decay.js';
import { applyMMRToHybridResults } from './mmr.js';
import { warn, error } from '../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

interface SearchParams {
  db?: MemoryDatabase | null;
  query: string;
  options?: MemorySearchOptions;
  defaults: {
    maxResults: number;
    minScore: number;
    vectorWeight?: number;
    textWeight?: number;
  };
  temporalDecay?: TemporalDecayConfig;
  mmr?: MMRConfig;
  embeddingClient?: MemoryEmbeddingClient | null;
}

// ============================================================================
// Hybrid Search
// ============================================================================

/**
 * Hybrid search using Memvid BM25 + FTS5 fallback.
 *
 * Search order:
 * 1. Try Memvid BM25 search (fastest, no API)
 * 2. Fall back to SQLite FTS5 if Memvid unavailable
 * 3. Apply temporal decay and MMR re-ranking
 */
export async function hybridSearch(params: SearchParams): Promise<MemorySearchResult[]> {
  const maxResults = Math.max(1, params.options?.maxResults ?? params.defaults.maxResults);
  const minScore = params.options?.minScore ?? params.defaults.minScore;

  let results: MemorySearchResult[] = [];

  // Try Memvid BM25 search first (no API dependency)
  try {
    const memvidStore = await getMemvidStore();
    const memvidResults = await memvidStore.search(params.query, maxResults * 2);

    results = memvidResults.map(r => ({
      snippet: r.snippet,
      path: r.memory.filePath,
      startLine: 1,
      endLine: 1,
      score: r.score,
      source: 'keyword' as const,
      contentSource: 'memory' as const,
      updatedAt: r.memory.mtimeMs,
    }));
  } catch (e) {
    warn('memory', 'Memvid search failed, falling back to FTS5');

    // Fall back to SQLite FTS5
    if (params.db) {
      const fts5Results = params.db.searchKeyword(params.query, maxResults * 2);
      results = fts5Results
        .map(r => {
          const detail = params.db!.loadResultsByIds([r.chunkId])[0];
          if (!detail) return null;
          const result: MemorySearchResult = {
            snippet: detail.snippet,
            path: detail.path,
            startLine: detail.startLine,
            endLine: detail.endLine,
            score: r.score,
            source: 'keyword',
            contentSource: detail.contentSource,
            updatedAt: detail.updatedAt,
          };
          return result;
        })
        .filter((r): r is MemorySearchResult => r !== null);
    }
  }

  // Apply temporal decay
  if (params.temporalDecay?.enabled && results.length > 0) {
    results = applyTemporalDecay({
      results,
      config: params.temporalDecay,
    });
    results.sort((a, b) => b.score - a.score);
  }

  // Apply MMR re-ranking for diversity
  if (params.mmr?.enabled && results.length > 0) {
    const mmrInput = results.slice(0, maxResults * 2);
    results = applyMMRToHybridResults(mmrInput, params.mmr);
  }

  // Final top-K selection with snippet building
  return results
    .slice(0, maxResults)
    .map(r => ({
      ...r,
      snippet: buildSnippet(r.snippet, 700),
    }));
}

/**
 * Simple keyword search using Memvid BM25.
 * No embedding API dependency.
 */
export async function keywordSearch(
  query: string,
  options: {
    maxResults?: number;
    typeFilter?: 'user' | 'feedback' | 'project' | 'reference';
  } = {},
): Promise<MemorySearchResult[]> {
  const maxResults = options.maxResults ?? 10;

  try {
    const memvidStore = await getMemvidStore();
    const results = await memvidStore.search(query, maxResults, options.typeFilter);

    return results.map(r => ({
      snippet: buildSnippet(r.snippet, 700),
      path: r.memory.filePath,
      startLine: 1,
      endLine: 1,
      score: r.score,
      source: 'keyword' as const,
      contentSource: 'memory' as const,
      updatedAt: r.memory.mtimeMs,
    }));
  } catch (e) {
    error('memory', 'Keyword search failed', e instanceof Error ? e : undefined);
    return [];
  }
}

/**
 * Semantic search using Memvid's semantic search.
 * No external embedding API needed - uses memvid's built-in ranking.
 */
export async function vectorSearch(
  query: string,
  options: {
    maxResults?: number;
    minScore?: number;
  } = {},
): Promise<MemorySearchResult[]> {
  const maxResults = options.maxResults ?? 10;
  const minScore = options.minScore ?? 0.1;

  try {
    const memvidStore = await getMemvidStore();
    const results = await memvidStore.semanticSearch(query, maxResults);

    return results
      .filter(r => r.score >= minScore)
      .map(r => ({
        snippet: buildSnippet(r.snippet, 700),
        path: r.memory.filePath,
        startLine: 1,
        endLine: 1,
        score: r.score,
        source: 'vector' as const,
        contentSource: 'memory' as const,
        updatedAt: r.memory.mtimeMs,
      }));
  } catch (e) {
    error('memory', 'Semantic search failed, falling back to BM25', e instanceof Error ? e : undefined);
    return keywordSearch(query, { maxResults });
  }
}

/**
 * Search using scanner + simple text matching.
 * No external dependencies.
 */
export async function scanSearch(
  query: string,
  options: {
    maxResults?: number;
    typeFilter?: 'user' | 'feedback' | 'project' | 'reference';
  } = {},
): Promise<MemorySearchResult[]> {
  const maxResults = options.maxResults ?? 10;
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  const memories = await scanTypedMemoryFiles();
  const filtered = options.typeFilter
    ? memories.filter(m => m.type === options.typeFilter)
    : memories;

  const scored = filtered.map(m => {
    let score = 0;
    const nameLower = m.name.toLowerCase();
    const descLower = m.description.toLowerCase();

    // Exact match in name
    if (nameLower === queryLower) score += 100;
    // Partial match in name
    else if (nameLower.includes(queryLower)) score += 50;
    // Word matches in name
    else if (queryWords.every(w => nameLower.includes(w))) score += 30;

    // Description matches
    if (descLower.includes(queryLower)) score += 20;
    else if (queryWords.some(w => descLower.includes(w))) score += 10;

    return { memory: m, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => ({
      snippet: buildSnippet(s.memory.description, 700),
      path: s.memory.filePath,
      startLine: 1,
      endLine: 1,
      score: s.score,
      source: 'keyword' as const,
      contentSource: 'memory' as const,
      updatedAt: s.memory.mtimeMs,
    }));
}
