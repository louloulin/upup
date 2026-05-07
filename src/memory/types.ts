// ============================================================================
// 4-type Memory Classification (Claude Code)
// ============================================================================

export const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export function parseMemoryType(raw: unknown): MemoryType | undefined {
  if (typeof raw !== 'string') return undefined;
  return MEMORY_TYPES.find(t => t === raw);
}

export function isValidMemoryType(type: string): type is MemoryType {
  return MEMORY_TYPES.includes(type as MemoryType);
}

// ============================================================================
// Embedding / Provider Types (legacy, being phased out)
// ============================================================================

export type EmbeddingProviderId = 'openai' | 'gemini' | 'ollama' | 'auto' | 'none';

export type ContentSource = 'memory' | 'sessions';

export type TemporalDecayConfig = {
  enabled: boolean;
  halfLifeDays: number;
};

export type MMRConfig = {
  enabled: boolean;
  lambda: number;
};

// ============================================================================
// Memory Runtime Configuration
// ============================================================================

export interface MemoryRuntimeConfig {
  enabled: boolean;
  embeddingProvider: EmbeddingProviderId;
  embeddingModel?: string;
  maxSessionContextTokens: number;
  chunkTokens: number;
  chunkOverlapTokens: number;
  maxResults: number;
  minScore: number;
  vectorWeight: number;
  textWeight: number;
  watchDebounceMs: number;
  temporalDecay: TemporalDecayConfig;
  mmr: MMRConfig;
  indexSessions: boolean;
}

// ============================================================================
// Memory File Types (4-type with frontmatter)
// ============================================================================

export interface MemoryFileMeta {
  /** File name (relative to memory dir) */
  filename: string;
  /** Memory type from frontmatter */
  type: MemoryType;
  /** One-line description from frontmatter */
  description: string;
  /** Name from frontmatter */
  name: string;
  /** Full file path */
  filePath: string;
  /** File modification time */
  mtimeMs: number;
}

export interface MemoryWriteRequest {
  /** Memory type */
  type: MemoryType;
  /** Short kebab-case name for the file */
  name: string;
  /** One-line description for AI selection */
  description: string;
  /** Memory body content */
  content: string;
}

// ============================================================================
// Search Types
// ============================================================================

export interface MemoryChunk {
  id?: number;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  source?: ContentSource;
}

export interface MemoryVectorCandidate {
  chunkId: number;
  score: number;
}

export interface MemoryKeywordCandidate {
  chunkId: number;
  score: number;
}

export interface MemorySearchResult {
  snippet: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  source: 'vector' | 'keyword' | 'both';
  contentSource?: ContentSource;
  updatedAt?: number;
}

export interface MemorySearchOptions {
  maxResults?: number;
  minScore?: number;
}

export interface MemoryReadOptions {
  path: string;
  from?: number;
  lines?: number;
}

export interface MemoryReadResult {
  path: string;
  text: string;
}

export interface MemorySessionContext {
  filesLoaded: string[];
  text: string;
  tokenEstimate: number;
}

export interface MemorySyncStats {
  indexedFiles: number;
  indexedChunks: number;
  updatedChunks: number;
  removedChunks: number;
}

export interface MemoryEmbeddingClient {
  provider: Exclude<EmbeddingProviderId, 'auto' | 'none'>;
  model: string;
  dimensions?: number;
  embed(texts: string[]): Promise<number[][]>;
}
