/**
 * UpUp Memory Manager
 *
 * Based on Claude Code's memory system:
 * - 4-type classification (user, feedback, project, reference)
 * - AI-Selector primary recall
 * - Memvid MV2 storage + BM25 search (no embedding API dependency)
 * - 2-phase extraction (per-turn + consolidation)
 */

import { MemoryDatabase } from './database';
import { MemoryIndexer } from './indexer';
import { scanSearch } from './search';
import { MemoryStore } from './store';
import { getMemvidStore } from './memvid-store';
import { ensureMemoryIndex } from './scanner';
import type { MemoryEmbeddingClient } from './types';
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
} from './types';
import { createEmbeddingClient, type EmbeddingAuthResolver, type EmbeddingTransport } from './embeddings';
import { getSetting, type PromptRunner } from '@upup/utils';
import { resolveMemvidRagSettings, type MemvidRagFlag, type ResolvedMemvidRagSettings } from './memvid-rag';
import { getApiKeyNameForProvider } from '@upup/utils';
import { getConfiguredModelId, getConfiguredProvider } from '@upup/utils';

// Re-export AI Memory Selector
export {
  findRelevantMemories,
  findAndLoadRelevantMemories,
  verifyMemory,
  type SelectedMemory,
  type SelectedMemoryWithContent,
  type FindRelevantMemoriesOptions,
} from './ai-selector';

// Re-export types
export { MEMORY_TYPES } from './types';
export type { MemoryType, MemoryWriteRequest } from './types';

// Re-export extraction
export {
  extractMemories,
  hasToolCalls,
  createExtractionHook,
  type ExtractionResult,
} from './extraction';

// Re-export consolidation
export {
  consolidateMemories,
  shouldConsolidate,
} from './consolidation';

// Re-export scanner
export {
  scanMemoryFiles,
  scanTypedMemoryFiles,
  scanScopedMemoryFiles,
  filterByType,
  groupByType,
  buildManifest,
  buildTypedManifest,
  buildScopedManifest,
  ensureMemoryIndex,
  type ScannerOptions,
} from './scanner';

// Re-export scope types
export {
  MEMORY_SCOPES,
  MEMORY_SCOPE_PRIORITY,
  getDefaultScopeForType,
} from './types';
export type { MemoryScope, ScopedScanOptions, ScopedSearchResult } from './types';

// Re-export project paths
export {
  getProjectMemoryPaths,
  encodeProjectSlug,
  decodeProjectSlug,
  getGlobalMemoryDir,
  isProjectMemoryPath,
  extractProjectSlug,
} from './project-paths';

// Re-export daily log
export {
  getDailyLogManager,
  appendToDailyLog,
  startSessionLog,
  endSessionLog,
  type DailyLogEntry,
  type DailyLogStats,
} from './daily-log';

// Re-export access control
export {
  getMemoryAccessControl,
  canReadMemory,
  determineMemoryScope,
  type AccessContext,
  type AccessPermission,
} from './access-control';

// Re-export prompts
export {
  EXTRACTION_SYSTEM_PROMPT,
  CONSOLIDATION_SYSTEM_PROMPT,
  SELECT_SYSTEM_PROMPT,
} from './prompts';

// Re-export memvid store
export {
  getMemvidStore,
  type MemvidSearchResult,
  type MemvidStats,
} from './memvid-store';
export {
  resolveMemvidRagSettings,
  toMemvidModelSpec,
  type MemvidRagFlag,
  type ResolvedMemvidRagSettings,
} from './memvid-rag';
export { migrateLegacyMemories, inferMemoryType, type MigrationResult } from './migration';

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
// Embeddings bridge (Pi provider registry + Pi-provided transport)
// ============================================================================

/**
 * Embedding bridge injected by the Pi host.
 *
 * Pi owns provider credentials and endpoints, but ships no embedding API, so
 * the host hands memory a credential resolver built from its `ModelRuntime`
 * (see `@upup/pi-runtime/embedding-provider`) plus the transport that performs
 * the request. Without a bridge, memory stays on BM25 and never touches the
 * network, which is the default configuration.
 */
export interface MemoryEmbeddingBridge {
  readonly authResolver?: EmbeddingAuthResolver;
  readonly transport?: EmbeddingTransport;
}

let embeddingBridge: MemoryEmbeddingBridge | null = null;

/** Configure the Pi-backed embedding bridge; applies to the next `MemoryManager.initialize()`. */
export function configureMemoryEmbeddingBridge(bridge: MemoryEmbeddingBridge | null): void {
  embeddingBridge = bridge;
}

export function getMemoryEmbeddingBridge(): MemoryEmbeddingBridge | null {
  return embeddingBridge;
}

function resolveEmbeddingClient(config: MemoryRuntimeConfig): MemoryEmbeddingClient | null {
  if (config.embeddingProvider === 'none') return null;
  if (!embeddingBridge?.transport) return null;
  return createEmbeddingClient({
    provider: config.embeddingProvider,
    ...(config.embeddingModel ? { model: config.embeddingModel } : {}),
    ...(embeddingBridge.authResolver ? { authResolver: embeddingBridge.authResolver } : {}),
    transport: embeddingBridge.transport,
  });
}

// ============================================================================
// Memory Manager
// ============================================================================


// =============================================================================
// Storage / Search / Dossier re-exports
// =============================================================================
export { scanSearch, hybridSearch, keywordSearch, vectorSearch, tfidfSearch } from './search';
export { MemoryStore } from './store';
export { MemoryDatabase } from './database';
export { MemoryIndexer } from './indexer';
export { DossierStore } from './dossier';
export { EncryptedMemoryStore } from './encrypted-store';
export { AuditChain } from './audit-signing';
export { MemoryAuditLogger, getAuditLogger, readAuditLog } from './memory-audit';
export { resetNestedMemoryPaths } from './nested-paths';
export { resetTeamMemoryPaths } from './team-paths';
export { dossierPostPhase, dossierPrePhase, canonicalJson, hashDossier } from '@upup/pi-storage';
export type { AuditRecord } from './audit-signing';
export { NestedMemoryPaths, getNestedMemoryPaths } from './nested-paths';
export { getTeamMemoryPaths } from './team-paths';
export { StrategyStore, computeStrategyPrevHash } from './strategy-store';
export { createEmbeddingClient, embedSingleQuery } from './embeddings';
export type {
  EmbeddingAuthResolver,
  EmbeddingProviderAuth,
  EmbeddingProviderPiId,
  EmbeddingTransport,
} from './embeddings';

export { MemoryDenyManager, getMemoryDenyManager, isMemoryDenied, getDenialReason, resetMemoryDenyManager, memoryDeny } from './memory-deny';

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

    // Default stays BM25 (no embedding API dependency). A Pi host may inject a
    // `ModelRuntime`-backed bridge to enable vector search instead.
    const client = resolveEmbeddingClient(this.config);

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

  async askMemory(query: string, runner: PromptRunner): Promise<string | null> {
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
      runner,
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
      const { scanSearch } = await import('./search');
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

// Phase 12: Re-export symbols needed by tests that were missing from index.ts
export { registerDefaultMemoryPaths } from './nested-paths';
export { generateTeamPrompt } from './team-paths';
export { __resetInvestmentMemory } from './investment-memory';
export { MEMORY_DENY_RULES } from './memory-deny';
export type { MemoryDenyRule, MemoryDenyResult } from './memory-deny';
export { resetAuditLogger } from './memory-audit';



// Types needed by external tests
export type { StrategyRecordInput } from './strategy-store';
export type { TeamMemoryPaths } from './team-paths';

// Phase 12: Investment memory, observation buffer, session files
export type {
  InvestmentMemoryItem,
  InvestmentDecision,
  RecordDecisionInput,
  InvestmentMemoryOptions,
  TradeAction,
} from './investment-memory';
export { InvestmentMemory, useInvestmentMemory } from './investment-memory';
export { getObservationBuffer } from './observation-buffer';
export type { ToolObservation } from './observation-buffer';
export { shouldUpdateSessionMemory, updateSessionMemory } from './session-files';
export type { UpdateResult, SessionMemoryFile } from './session-files';
