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
// Memory Scope - 四层隔离作用域
// ============================================================================

export const MEMORY_SCOPES = ['global', 'project', 'team', 'private'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export function isValidMemoryScope(scope: string): scope is MemoryScope {
  return MEMORY_SCOPES.includes(scope as MemoryScope);
}

export function parseMemoryScope(raw: unknown): MemoryScope | undefined {
  if (typeof raw !== 'string') return undefined;
  return MEMORY_SCOPES.find(s => s === raw) ?? 'private'; // default to 'private'
}

// MemoryScope 优先级 (数字越大优先级越高)
export const MEMORY_SCOPE_PRIORITY: Record<MemoryScope, number> = {
  private: 4,   // 最高优先级
  team: 3,
  project: 2,
  global: 1,     // 最低优先级
};

// 获取默认作用域 (基于 MemoryType)
export function getDefaultScopeForType(type: MemoryType): MemoryScope {
  switch (type) {
    case 'user':
      return 'private';
    case 'feedback':
      return 'private'; // 默认私人，可显式设置为 team
    case 'project':
      return 'project'; // 默认项目级
    case 'reference':
      return 'project'; // 默认项目级
    default:
      return 'private';
  }
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
  memvidRag?: boolean | {
    enabled?: boolean;
    model?: string;
    mode?: 'auto' | 'lex' | 'sem';
    k?: number;
    contextOnly?: boolean;
  };
}

// ============================================================================
// Memory File Types (4-type with frontmatter + scope)
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
  /** Memory scope - 四层隔离作用域 */
  scope?: MemoryScope;
  /** Team identifier (when scope is 'team') */
  teamId?: string;
  /** Project identifier (when scope is 'project') */
  projectId?: string;
  /** Creator identifier */
  createdBy?: string;
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
  /** Memory scope - optional, defaults based on type */
  scope?: MemoryScope;
  /** Team identifier (when scope is 'team') */
  teamId?: string;
  /** Project identifier (when scope is 'project') */
  projectId?: string;
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
  source: 'vector' | 'keyword' | 'both' | 'hybrid' | 'tfidf';
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

// ============================================================================
// Scoped Memory Search Options
// ============================================================================

export interface ScopedScanOptions {
  /** Filter by scope - single or multiple scopes */
  scope?: MemoryScope | MemoryScope[];
  /** Filter by team ID (when scope includes 'team') */
  teamId?: string;
  /** Filter by project ID (when scope includes 'project') */
  projectId?: string;
  /** Filter by memory type */
  type?: MemoryType | MemoryType[];
  /** Maximum age in milliseconds (filter by mtimeMs) */
  maxAge?: number;
  /** Include private memories from current user */
  includePrivate?: boolean;
}

export interface ScopedSearchResult extends MemorySearchResult {
  /** The scope of this memory */
  scope: MemoryScope;
  /** Team ID if scope is 'team' */
  teamId?: string;
  /** Project ID if scope is 'project' */
  projectId?: string;
}
