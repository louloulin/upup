/**
 * Memvid Store - MV2 storage + BM25 search for Dexter Memory
 *
 * Uses @memvid/sdk for:
 * - MV2 single-file storage (append-optimized, versioned)
 * - BM25 keyword search (mode: 'lex') - prebuilt binary available
 * - RAG synthesis (mode: 'ask') - requires LLM API key
 *
 * Note: Vector search (mode: 'sem') requires compiling memvid-core from source
 * with 'vec' feature. Prebuilt binary has no text embeddings.
 */

import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { create, use, maskPii } from '@memvid/sdk';
import type { Memvid } from '@memvid/sdk';
import type { MemoryType, MemoryWriteRequest, MemoryFileMeta } from './types.js';
import { getDexterDir } from '../utils/paths.js';

// ============================================================================
// Constants
// ============================================================================

const MEMORY_DIRNAME = 'memory';
const MV2_FILENAME = 'memories.mv2';

/** Default number of search results */
const DEFAULT_K = 10;

/** Snippet character limit for search results */
const SNIPPET_CHARS = 500;

// ============================================================================
// Types
// ============================================================================

export interface MemvidSearchResult {
  /** Memory metadata */
  memory: MemoryFileMeta;
  /** Snippet from search result */
  snippet: string;
  /** Relevance score */
  score: number;
}

export interface MemvidStats {
  totalFrames: number;
  hasLexIndex: boolean;
  hasVecIndex: boolean;
  capacityBytes: number;
}

// ============================================================================
// MemvidStore
// ============================================================================

export class MemvidStore {
  private mv: Memvid | null = null;
  private readonly mv2Path: string;

  constructor(private readonly baseDir: string = getDexterDir()) {
    this.mv2Path = join(baseDir, MEMORY_DIRNAME, MV2_FILENAME);
  }

  /**
   * Initialize the Memvid store.
   * Creates MV2 file if it doesn't exist.
   */
  async initialize(): Promise<void> {
    if (this.mv) return;

    // Ensure directory exists
    await mkdir(join(this.baseDir, MEMORY_DIRNAME), { recursive: true });

    // Check if MV2 file exists
    if (!existsSync(this.mv2Path)) {
      // Create new MV2 file
      this.mv = await create(this.mv2Path, 'basic');
      await this.mv.enableLex(); // Ensure BM25 index is enabled
    } else {
      // Open existing MV2 file
      this.mv = await use('basic', this.mv2Path, { mode: 'auto' });
    }
  }

  /**
   * Get or create the Memvid instance.
   */
  private async getMv(): Promise<Memvid> {
    if (!this.mv) {
      await this.initialize();
    }
    return this.mv!;
  }

  /**
   * Get store statistics.
   */
  async getStats(): Promise<MemvidStats> {
    const mv = await this.getMv();
    const stats = await mv.stats();

    return {
      totalFrames: (stats.total_frames as number) || 0,
      hasLexIndex: (stats.has_lex_index as boolean) || false,
      hasVecIndex: (stats.has_vec_index as boolean) || false,
      capacityBytes: (stats.capacity_bytes as number) || 0,
    };
  }

  /**
   * Store a memory in MV2 format.
   */
  async putMemory(request: MemoryWriteRequest): Promise<string> {
    const mv = await this.getMv();

    const frameId = await mv.put({
      title: request.name,
      label: request.type,
      text: request.content,
      tags: [request.type, request.name],
      // enableEmbedding: true, // Note: prebuilt binary ignores this
    });

    return frameId;
  }

  /**
   * Store multiple memories in batch (more efficient).
   */
  async putMemories(requests: MemoryWriteRequest[]): Promise<string[]> {
    const mv = await this.getMv();

    const frameIds = await mv.putMany(
      requests.map(req => ({
        title: req.name,
        text: req.content,
        labels: [req.type],
        tags: [req.type, req.name],
      })),
    );

    return frameIds;
  }

  /**
   * Search memories using BM25 (prebuilt binary available).
   *
   * @param query - Search query
   * @param k - Number of results to return
   * @param typeFilter - Optional memory type filter
   */
  async search(
    query: string,
    k: number = DEFAULT_K,
    typeFilter?: MemoryType,
  ): Promise<MemvidSearchResult[]> {
    const mv = await this.getMv();

    const results = await mv.find(query, {
      k,
      snippetChars: SNIPPET_CHARS,
    });

    // Parse and filter results
    const parsed = this.parseSearchResults(results, typeFilter);
    return parsed.slice(0, k);
  }

  /**
   * RAG synthesis using Memvid ask.
   * Requires LLM API key.
   */
  async ask(
    question: string,
    options: {
      model?: string;
      apiKey?: string;
      contextOnly?: boolean;
    } = {},
  ): Promise<string> {
    const mv = await this.getMv();

    if (!options.apiKey) {
      throw new Error('LLM API key required for RAG synthesis');
    }

    const result = await mv.ask(question, {
      model: options.model || 'openai:gpt-4o-mini',
      modelApiKey: options.apiKey,
      contextOnly: options.contextOnly ?? true,
      k: 10,
      snippetChars: 1000,
    });

    return this.parseAskResult(result);
  }

  /**
   * Mask PII in text using Memvid's built-in masking.
   */
  maskPii(text: string): string {
    return maskPii(text);
  }

  /**
   * Get timeline of memories (chronological order).
   */
  async getTimeline(
    limit: number = 50,
  ): Promise<{ frameId: number; title: string; timestamp: number }[]> {
    const mv = await this.getMv();

    const timeline = await mv.timeline({ limit, reverse: true });

    return this.parseTimeline(timeline);
  }

  /**
   * View full content of a frame.
   */
  async viewFrame(frameId: number): Promise<string> {
    const mv = await this.getMv();
    return mv.view(frameId);
  }

  /**
   * Close the MV2 file (flush writes).
   */
  async close(): Promise<void> {
    if (this.mv) {
      await this.mv.seal();
      this.mv = null;
    }
  }

  // ============================================================================
  // Private parsing helpers
  // ============================================================================

  private parseSearchResults(
    raw: unknown,
    typeFilter?: MemoryType,
  ): MemvidSearchResult[] {
    if (!raw || typeof raw !== 'object') return [];

    const results: MemvidSearchResult[] = [];

    // Handle different result formats
    const hits = (raw as Record<string, unknown>).hits;
    if (Array.isArray(hits)) {
      for (const hit of hits) {
        if (this.isValidHit(hit)) {
          const frameId = hit.frame_id as number;
          const title = (hit.title as string) || '';
          const type = this.extractTypeFromHit(hit) as MemoryType;
          const snippet = this.extractSnippet(hit);

          if (typeFilter && type !== typeFilter) continue;

          results.push({
            memory: {
              filename: `${type}_${title}.md`,
              type,
              description: title,
              name: title,
              filePath: join(this.baseDir, MEMORY_DIRNAME, type, `${title}.md`),
              mtimeMs: Date.now(),
            },
            snippet,
            score: (hit.hit_count as number) || 0,
          });
        }
      }
    }

    return results;
  }

  private isValidHit(hit: unknown): hit is Record<string, unknown> {
    return (
      typeof hit === 'object' &&
      hit !== null &&
      'frame_id' in hit
    );
  }

  private extractTypeFromHit(hit: Record<string, unknown>): string {
    // Try to extract type from labels or tags
    const labels = hit.labels;
    if (Array.isArray(labels) && labels.length > 0) {
      return String(labels[0]);
    }

    const tags = hit.tags;
    if (Array.isArray(tags)) {
      const type = tags.find((t: unknown) =>
        ['user', 'feedback', 'project', 'reference'].includes(String(t))
      );
      if (type) return String(type);
    }

    return 'project'; // Default type
  }

  private extractSnippet(hit: Record<string, unknown>): string {
    const preview = hit.preview;
    if (typeof preview === 'string' && preview.length > 0) {
      return preview;
    }

    const text = hit.text;
    if (typeof text === 'string') {
      return text.slice(0, SNIPPET_CHARS) + (text.length > SNIPPET_CHARS ? '...' : '');
    }

    return '';
  }

  private parseAskResult(raw: unknown): string {
    if (!raw || typeof raw !== 'object') return '';

    const answer = (raw as Record<string, unknown>).answer;
    if (typeof answer === 'string') return answer;

    const context = (raw as Record<string, unknown>).context;
    if (typeof context === 'string') return context;

    return JSON.stringify(raw);
  }

  private parseTimeline(
    raw: unknown,
  ): { frameId: number; title: string; timestamp: number }[] {
    if (!raw || typeof raw !== 'object') return [];

    const entries = (raw as Record<string, unknown>).entries;
    if (!Array.isArray(entries)) return [];

    return entries
      .filter(e => e && typeof e === 'object')
      .map((e: Record<string, unknown>) => ({
        frameId: (e.frame_id as number) || 0,
        title: (e.title as string) || '',
        timestamp: (e.timestamp as number) || 0,
      }));
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let globalStore: MemvidStore | null = null;

export async function getMemvidStore(): Promise<MemvidStore> {
  if (!globalStore) {
    globalStore = new MemvidStore();
    await globalStore.initialize();
  }
  return globalStore;
}
