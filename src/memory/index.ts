/**
 * UpUp Memory Manager
 *
 * Based on Claude Code's memory system:
 * - 4-type classification (user, feedback, project, reference)
 * - AI-Selector primary recall
 * - Memvid MV2 storage + BM25 search (no embedding API dependency)
 * - 2-phase extraction (per-turn + consolidation)
 */

import { MemoryDatabase } from './database.js';
import { MemoryIndexer } from './indexer.js';
import { scanSearch } from './search.js';
import { MemoryStore } from './store.js';
import { getMemvidStore } from './memvid-store.js';
import { ensureMemoryIndex } from './scanner.js';
import type { MemoryEmbeddingClient } from './types.js';
import type {
  MemoryReadOptions,
  MemoryReadResult,
  MemoryRuntimeConfig,
  MemorySearchOptions,
  MemorySearchResult,
  MemorySessionContext,
  TemporalDecayConfig,
  MMRConfig,
  MemoryType,
  MemoryWriteRequest,
} from './types.js';
import { getSetting } from '../utils/config.js';
import { resolveMemvidRagSettings, type MemvidRagFlag, type ResolvedMemvidRagSettings } from './memvid-rag.js';
import { getApiKeyNameForProvider } from '../utils/env.js';
import { getConfiguredModelId, getConfiguredProvider } from '../utils/config.js';

// Re-export AI Memory Selector
export {
  findRelevantMemories,
  findAndLoadRelevantMemories,
  verifyMemory,
  type SelectedMemory,
  type SelectedMemoryWithContent,
  type FindRelevantMemoriesOptions,
} from './ai-selector.js';

// Re-export types
export { MEMORY_TYPES } from './types.js';
export type { MemoryType, MemoryWriteRequest } from './types.js';

// Re-export extraction
export {
  extractMemories,
  hasToolCalls,
  createExtractionHook,
  type ExtractionResult,
} from './extraction.js';

// Re-export consolidation
export {
  consolidateMemories,
  shouldConsolidate,
} from './consolidation.js';

// Re-export scanner
export {
  scanMemoryFiles,
  scanTypedMemoryFiles,
  filterByType,
  groupByType,
  buildManifest,
  buildTypedManifest,
  ensureMemoryIndex,
  type ScannerOptions,
} from './scanner.js';

// Re-export prompts
export {
  EXTRACTION_SYSTEM_PROMPT,
  CONSOLIDATION_SYSTEM_PROMPT,
  SELECT_SYSTEM_PROMPT,
} from './prompts.js';

// Re-export memvid store
export {
  getMemvidStore,
  type MemvidSearchResult,
  type MemvidStats,
} from './memvid-store.js';
export {
  resolveMemvidRagSettings,
  toMemvidModelSpec,
  type MemvidRagFlag,
  type ResolvedMemvidRagSettings,
} from './memvid-rag.js';
export { migrateLegacyMemories, inferMemoryType, type MigrationResult } from './migration.js';

// ============================================================================
// Config
// ============================================================================

const DEFAULT_CONFIG: MemoryRuntimeConfig = {
  enabled: true,
  embeddingProvider: 'auto',
  embeddingModel: undefined,
  maxSessionContextTokens: 2000,
  chunkTokens: 400,
  chunkOverlapTokens: 80,
  maxResults: 6,
  minScore: 0.1,
  vectorWeight: 0.7,
  textWeight: 0.3,
  watchDebounceMs: 1500,
  temporalDecay: { enabled: true, halfLifeDays: 30 },
  mmr: { enabled: true, lambda: 0.7 },
  indexSessions: true,
  memvidRag: false,
};

type MemorySettings = {
  enabled?: boolean;
  embeddingProvider?: MemoryRuntimeConfig['embeddingProvider'];
  embeddingModel?: string;
  maxSessionContextTokens?: number;
  temporalDecay?: Partial<TemporalDecayConfig>;
  mmr?: Partial<MMRConfig>;
  indexSessions?: boolean;
  memvidRag?: MemvidRagFlag;
};

function resolveConfig(): MemoryRuntimeConfig {
  const settings = getSetting<MemorySettings | undefined>('memory', undefined);
  return {
    ...DEFAULT_CONFIG,
    ...(settings ?? {}),
    temporalDecay: { ...DEFAULT_CONFIG.temporalDecay, ...(settings?.temporalDecay ?? {}) },
    mmr: { ...DEFAULT_CONFIG.mmr, ...(settings?.mmr ?? {}) },
  };
}

// ============================================================================
// Memory Manager
// ============================================================================

export class MemoryManager {
  private static instance: MemoryManager | null = null;

  static async get(): Promise<MemoryManager> {
    if (!MemoryManager.instance) {
      const instance = new MemoryManager(resolveConfig());
      await instance.initialize();
      MemoryManager.instance = instance;
    }
    return MemoryManager.instance;
  }

  private readonly store = new MemoryStore();
  private db: MemoryDatabase | null = null;
  private indexer: MemoryIndexer | null = null;
  private initError: string | null = null;

  private constructor(private readonly config: MemoryRuntimeConfig) {}

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    if (this.db) {
      return;
    }

    await this.store.ensureDirectoryExists();

    // Ensure MEMORY.md index exists (creates if not found)
    await ensureMemoryIndex();

    // Don't create embedding client - use Memvid BM25 instead (no API dependency)
    const client: MemoryEmbeddingClient | null = null;

    try {
      this.db = await MemoryDatabase.create(`${this.store.getMemoryDir()}/index.sqlite`);
    } catch (error) {
      this.initError = error instanceof Error ? error.message : String(error);
      this.db = null;
      this.indexer = null;
      return;
    }

    this.indexer = new MemoryIndexer(this.store, this.db, {
      chunkTokens: this.config.chunkTokens,
      overlapTokens: this.config.chunkOverlapTokens,
      watchDebounceMs: this.config.watchDebounceMs,
      embeddingClient: client, // null = skip embedding, use Memvid BM25
      indexSessions: this.config.indexSessions,
    });
    this.indexer.startWatching();
    // Skip sync - Memvid BM25 doesn't need pre-indexing
  }

  isAvailable(): boolean {
    return this.config.enabled && Boolean(this.db);
  }

  getUnavailableReason(): string | null {
    if (!this.config.enabled) {
      return 'Memory is disabled in settings.';
    }
    return this.initError;
  }

  async sync(options?: { force?: boolean }): Promise<void> {
    await this.initialize();
    if (!this.indexer) {
      return;
    }
    await this.indexer.sync(options);
  }

  getMemvidRagSettings(): ResolvedMemvidRagSettings {
    const providerId = getConfiguredProvider();
    const modelId = getConfiguredModelId();
    return resolveMemvidRagSettings({
      flag: this.config.memvidRag,
      providerId,
      modelId,
    });
  }

  async askMemory(query: string): Promise<string | null> {
    await this.initialize();

    const rag = this.getMemvidRagSettings();
    if (!rag.enabled || !rag.supported) {
      return null;
    }

    const apiKeyEnvVar = rag.apiKeyEnvVar ?? getApiKeyNameForProvider(rag.providerId);
    const apiKey = apiKeyEnvVar ? process.env[apiKeyEnvVar] : undefined;
    if (!apiKey) {
      return null;
    }

    const memvidStore = await getMemvidStore();
    return memvidStore.ask(query, {
      model: rag.model,
      apiKey,
      contextOnly: rag.contextOnly,
      mode: rag.mode,
      k: rag.k,
    });
  }

  async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
    await this.initialize();

    // Use Memvid BM25 search directly - no embedding API needed
    const memvidStore = await getMemvidStore();
    try {
      const memvidResults = await memvidStore.search(
        query,
        options?.maxResults ?? this.config.maxResults,
      );

      return memvidResults.map((r: { snippet: string; memory: { filePath: string; mtimeMs: number }; score: number }) => ({
        snippet: r.snippet,
        path: r.memory.filePath,
        startLine: 1,
        endLine: 1,
        score: r.score,
        source: 'keyword' as const,
        contentSource: 'memory' as const,
        updatedAt: r.memory.mtimeMs,
      }));
    } catch {
      // Fall back to scan-based search
      const { scanSearch } = await import('./search.js');
      return scanSearch(query, { maxResults: options?.maxResults ?? this.config.maxResults });
    }
  }

  async get(options: MemoryReadOptions): Promise<MemoryReadResult> {
    await this.initialize();
    return this.store.readLines(options);
  }

  async appendLongTermMemory(text: string): Promise<void> {
    await this.initialize();
    await this.store.appendMemoryFile('MEMORY.md', text);
    this.indexer?.markDirty();
  }

  async appendDailyMemory(text: string): Promise<void> {
    await this.initialize();
    await this.store.appendMemoryFile(this.getTodayFileName(), text);
    this.indexer?.markDirty();
  }

  async editMemory(file: string, oldText: string, newText: string): Promise<boolean> {
    await this.initialize();
    const resolved = this.resolveFileAlias(file);
    const result = await this.store.editInMemoryFile(resolved, oldText, newText);
    if (result) {
      this.indexer?.markDirty();
    }
    return result;
  }

  async deleteMemory(file: string, textToDelete: string): Promise<boolean> {
    await this.initialize();
    const resolved = this.resolveFileAlias(file);
    const result = await this.store.deleteFromMemoryFile(resolved, textToDelete);
    if (result) {
      this.indexer?.markDirty();
    }
    return result;
  }

  async appendMemory(file: string, content: string): Promise<void> {
    await this.initialize();
    const resolved = this.resolveFileAlias(file);
    await this.store.appendMemoryFile(resolved, content);
    this.indexer?.markDirty();
  }

  async listFiles(): Promise<string[]> {
    await this.initialize();
    return this.store.listMemoryFiles();
  }

  async loadSessionContext(): Promise<MemorySessionContext> {
    await this.initialize();
    return this.store.loadSessionContext(this.config.maxSessionContextTokens);
  }

  private resolveFileAlias(file: string): string {
    if (file === 'long_term') return 'MEMORY.md';
    if (file === 'daily') return this.getTodayFileName();
    return file;
  }

  private getTodayFileName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}.md`;
  }
}
