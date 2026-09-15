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

import { buildSnippet } from './chunker';
import { getMemvidStore } from './memvid-store';
import { scanTypedMemoryFiles } from './scanner';
import type { MemoryDatabase } from './database';
import type {
  MemorySearchOptions,
  MemorySearchResult,
  MemoryEmbeddingClient,
  TemporalDecayConfig,
  MMRConfig,
} from './types';
import { applyTemporalDecay } from './temporal-decay';
import { applyMMRToHybridResults } from './mmr';
import { warn, error } from '@upup/utils/logging';

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

// ============================================================================
// TF-IDF In-Memory Search (No External Dependencies)
// ============================================================================

const TFIDF_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
]);

/**
 * Simple TF-IDF embedder for in-memory search.
 * No external embedding API required.
 */
class TFIDFEmbedder {
  private vocabulary = new Map<string, number>();
  private maxDim = 128;

  private tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !TFIDF_STOP_WORDS.has(w));
  }

  buildVocabulary(texts: string[]): void {
    const allTokens = new Set<string>();
    for (const text of texts) {
      for (const t of this.tokenize(text)) allTokens.add(t);
    }
    const tokens = Array.from(allTokens).slice(0, this.maxDim);
    this.vocabulary.clear();
    tokens.forEach((t, i) => this.vocabulary.set(t, i));
  }

  embed(text: string): number[] {
    const tokens = this.tokenize(text);
    const freq = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    for (const [t, c] of freq) freq.set(t, c / Math.max(1, tokens.length));
    const vec = new Array(this.vocabulary.size).fill(0);
    for (const [token, tf] of freq) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) vec[idx] = tf;
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (mag > 0) for (let i = 0; i < vec.length; i++) vec[i] /= mag;
    return vec;
  }

  cosineSim(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  }
}

/** In-memory TF-IDF search engine */
class TFIDFSearchEngine {
  private embedder = new TFIDFEmbedder();
  private docs: Array<{ id: string; text: string; name: string; path: string; vector: number[] }> = [];

  index(memories: Array<{ id: string; text: string; name: string; path: string }>): void {
    this.embedder.buildVocabulary(memories.map(m => m.text));
    this.docs = memories.map(m => ({ id: m.id, text: m.text, name: m.name, path: m.path, vector: this.embedder.embed(m.text) }));
  }

  search(query: string, k = 10): MemorySearchResult[] {
    if (this.docs.length === 0) return [];
    const qv = this.embedder.embed(query);
    return this.docs
      .map(d => ({ ...d, score: this.embedder.cosineSim(qv, d.vector) }))
      .filter(d => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(d => ({
        snippet: buildSnippet(d.text, 700),
        path: d.path,
        startLine: 1,
        endLine: 1,
        score: d.score,
        source: 'tfidf' as const,
        contentSource: 'memory' as const,
        updatedAt: Date.now(),
      }));
  }

  clear(): void { this.docs = []; }
  size(): number { return this.docs.length; }
}

const tfidfEngine = new TFIDFSearchEngine();
let tfidfIndexed = false;

/**
 * TF-IDF search using in-memory similarity.
 * No external API or memvid dependency.
 */
export async function tfidfSearch(
  query: string,
  options: { maxResults?: number } = {},
): Promise<MemorySearchResult[]> {
  const maxResults = options.maxResults ?? 10;

  // Index memories on first use
  if (!tfidfIndexed) {
    const memories = await scanTypedMemoryFiles();
    tfidfEngine.index(memories.map(m => ({ id: m.filePath, text: m.description, name: m.name, path: m.filePath })));
    tfidfIndexed = true;
  }

  return tfidfEngine.search(query, maxResults);
}
