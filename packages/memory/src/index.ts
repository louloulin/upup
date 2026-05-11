/**
 * @upup/memory - UpUp Memory SDK
 *
 * Memvid-based storage with BM25 search.
 * No external embedding API dependency.
 *
 * @example
 * ```typescript
 * import { MemoryStore } from '@upup/memory';
 *
 * const store = new MemoryStore({ path: './memory' });
 * await store.put('Hello world', { name: 'greeting' });
 * const results = await store.search('hello');
 * console.log(results);
 * ```
 */

// Re-export types from @upup/types
export type {
  MemoryEntry,
  SearchResult,
  SearchOptions,
} from '@upup/types';

import { create, use, maskPii } from '@memvid/sdk';
import type { Memvid } from '@memvid/sdk';
import type { MemoryEntry, SearchResult, SearchOptions } from '@upup/types';

// ===== Configuration =====

export interface MemoryOptions {
  /** Directory to store memory files */
  path?: string;
  /** Maximum size in bytes */
  maxSize?: number;
  /** Enable BM25 index (default: true) */
  enableLex?: boolean;
}

export interface PutOptions {
  /** Memory type */
  type?: 'user' | 'feedback' | 'project' | 'reference';
  /** Memory name */
  name?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchOptions extends SearchOptions {
  /** Minimum relevance score (0-1) */
  minScore?: number;
}

export interface AskOptions {
  /** Model to use */
  model?: string;
  /** API key for LLM */
  apiKey?: string;
  /** Return only context without answer */
  contextOnly?: boolean;
  /** Search mode */
  mode?: 'auto' | 'lex' | 'sem';
  /** Number of results */
  k?: number;
}

// ===== MemoryStore =====

/**
 * Memory store using Memvid MV2 storage
 */
export class MemoryStore {
  private mv: Memvid | null = null;
  private readonly path: string;
  private readonly enableLex: boolean;
  private initialized = false;

  constructor(options: MemoryOptions = {}) {
    this.path = options.path || './memory';
    this.enableLex = options.enableLex ?? true;
  }

  /**
   * Initialize the memory store
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const fs = await import('node:fs');
    await fs.promises.mkdir(this.path, { recursive: true });

    const mv2Path = `${this.path}/memories.mv2`;

    if (!fs.existsSync(mv2Path)) {
      this.mv = await create(mv2Path, 'basic');
      if (this.enableLex) {
        await this.mv.enableLex();
      }
    } else {
      this.mv = await use('basic', mv2Path, { mode: 'auto' });
    }

    this.initialized = true;
  }

  /**
   * Ensure store is initialized
   */
  private async ensure(): Promise<Memvid> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.mv!;
  }

  /**
   * Store a memory entry
   */
  async put(
    content: string,
    options: PutOptions = {}
  ): Promise<string> {
    const mv = await this.ensure();

    const frameId = await mv.put({
      title: options.name || 'Untitled',
      label: options.type || 'user',
      text: content,
      tags: [options.type || 'user', options.name || ''],
    });

    return String(frameId);
  }

  /**
   * Store multiple memories in batch
   */
  async putMany(
    entries: Array<{ content: string; options?: PutOptions }>
  ): Promise<string[]> {
    const mv = await this.ensure();

    const frameIds = await mv.putMany(
      entries.map((entry) => ({
        title: entry.options?.name || 'Untitled',
        text: entry.content,
        labels: [entry.options?.type || 'user'],
        tags: [entry.options?.type || 'user'],
      }))
    );

    return frameIds.map(String);
  }

  /**
   * Search memories using BM25
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const mv = await this.ensure();
    const maxResults = options.maxResults ?? 10;

    const results = await mv.find(query, { k: maxResults });

    return this.parseSearchResults(results, options);
  }

  /**
   * Semantic search using relevance ranking
   */
  async semanticSearch(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SearchResult[]> {
    const mv = await this.ensure();
    const maxResults = options.maxResults ?? 10;
    const minScore = options.minScore ?? 0.1;

    const results = await mv.find(query, { k: maxResults * 2 });

    const parsed = this.parseSearchResults(results, { maxResults });
    return parsed.filter((r) => r.score >= minScore);
  }

  /**
   * RAG-style question answering
   * Requires LLM API key
   */
  async ask(question: string, options: AskOptions = {}): Promise<string> {
    const mv = await this.ensure();

    if (!options.apiKey) {
      throw new Error('LLM API key required for ask()');
    }

    const result = await mv.ask(question, {
      model: options.model || 'openai:gpt-4o-mini',
      modelApiKey: options.apiKey,
      contextOnly: options.contextOnly ?? false,
      mode: options.mode ?? 'lex',
      k: options.k ?? 10,
    });

    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>;
      if (typeof r.answer === 'string') return r.answer;
      if (typeof r.context === 'string') return r.context;
    }

    return JSON.stringify(result);
  }

  /**
   * Mask PII in text
   */
  maskPii(text: string): string {
    return maskPii(text);
  }

  /**
   * Get timeline of memories
   */
  async timeline(limit = 50): Promise<Array<{
    id: string;
    title: string;
    timestamp: number;
  }>> {
    const mv = await this.ensure();

    const timeline = await mv.timeline({ limit, reverse: true });

    if (!timeline || typeof timeline !== 'object') return [];

    const entries = (timeline as Record<string, unknown>).entries;
    if (!Array.isArray(entries)) return [];

    return entries
      .filter((e) => e && typeof e === 'object')
      .map((e: Record<string, unknown>) => ({
        id: String(e.frame_id || ''),
        title: String(e.title || ''),
        timestamp: Number(e.timestamp || 0),
      }));
  }

  /**
   * View full content of a memory
   */
  async view(id: string): Promise<string> {
    const mv = await this.ensure();
    return mv.view(Number(id));
  }

  /**
   * Close the store
   */
  async close(): Promise<void> {
    if (this.mv) {
      await this.mv.seal();
      this.mv = null;
      this.initialized = false;
    }
  }

  /**
   * Get store statistics
   */
  async stats(): Promise<{
    totalFrames: number;
    hasLexIndex: boolean;
    hasVecIndex: boolean;
  }> {
    const mv = await this.ensure();
    const stats = await mv.stats();

    return {
      totalFrames: Number(stats.total_frames) || 0,
      hasLexIndex: Boolean(stats.has_lex_index),
      hasVecIndex: Boolean(stats.has_vec_index),
    };
  }

  // ===== Private helpers =====

  private parseSearchResults(
    raw: unknown,
    options: SearchOptions
  ): SearchResult[] {
    if (!raw || typeof raw !== 'object') return [];

    const results: SearchResult[] = [];
    const maxResults = options.maxResults ?? 10;
    const hits = (raw as Record<string, unknown>).hits;

    if (Array.isArray(hits)) {
      for (const hit of hits) {
        if (hit && typeof hit === 'object' && 'frame_id' in hit) {
          const h = hit as Record<string, unknown>;
          const preview = h.preview || h.text;

          results.push({
            id: String(h.frame_id || ''),
            content: typeof preview === 'string' ? preview.slice(0, 700) : '',
            score: Number(h.hit_count) || 0,
          });

          if (results.length >= maxResults) break;
        }
      }
    }

    return results;
  }
}

// ===== Factory =====

/**
 * Create a new memory store
 */
export function createMemoryStore(options?: MemoryOptions): MemoryStore {
  return new MemoryStore(options);
}

// ===== Default export =====

export default MemoryStore;
