import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSetting, type PromptRunner } from '@upup/utils';
import type { MemoryType, MemoryWriteRequest, MemoryFileMeta } from './types.js';
import { getUpupDir } from '@upup/utils';

const MEMORY_DIRNAME = 'memory';
const STORE_FILENAME = 'memories.jsonl';
const DEFAULT_K = 10;
const SNIPPET_CHARS = 500;

interface StoredMemory {
  id: number;
  title: string;
  type: MemoryType;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

export interface MemvidSearchResult {
  memory: MemoryFileMeta;
  snippet: string;
  score: number;
}

export interface MemvidStats {
  totalFrames: number;
  hasLexIndex: boolean;
  hasVecIndex: boolean;
  capacityBytes: number;
}

export class MemvidStore {
  private readonly storePath: string;
  private records = new Map<number, StoredMemory>();
  private nextId = 1;
  private initialized = false;

  constructor(private readonly baseDir: string = getUpupDir()) {
    this.storePath = join(baseDir, MEMORY_DIRNAME, STORE_FILENAME);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(join(this.baseDir, MEMORY_DIRNAME), { recursive: true });
    if (existsSync(this.storePath)) {
      const contents = await readFile(this.storePath, 'utf8');
      for (const line of contents.split('\n')) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as StoredMemory;
          if (this.isStoredMemory(record)) {
            this.records.set(record.id, record);
            this.nextId = Math.max(this.nextId, record.id + 1);
          }
        } catch {
          continue;
        }
      }
    }
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  async getStats(): Promise<MemvidStats> {
    await this.ensureInitialized();
    const file = await stat(this.storePath).catch(() => ({ size: 0 }));
    return {
      totalFrames: this.records.size,
      hasLexIndex: true,
      hasVecIndex: false,
      capacityBytes: file.size,
    };
  }

  async putMemory(request: MemoryWriteRequest): Promise<string> {
    await this.ensureInitialized();
    const now = Date.now();
    const record: StoredMemory = {
      id: this.nextId++,
      title: request.name,
      type: request.type,
      content: request.content,
      createdAt: now,
      updatedAt: now,
      tags: [request.type, request.name],
    };
    this.records.set(record.id, record);
    await appendFile(this.storePath, `${JSON.stringify(record)}\n`, 'utf8');
    return String(record.id);
  }

  async putMemories(requests: MemoryWriteRequest[]): Promise<string[]> {
    const ids: string[] = [];
    for (const request of requests) ids.push(await this.putMemory(request));
    return ids;
  }

  async search(query: string, k: number = DEFAULT_K, typeFilter?: MemoryType): Promise<MemvidSearchResult[]> {
    await this.ensureInitialized();
    return this.rank(query, k, typeFilter);
  }

  async semanticSearch(query: string, k: number = DEFAULT_K, typeFilter?: MemoryType): Promise<MemvidSearchResult[]> {
    await this.ensureInitialized();
    return this.rank(query, k, typeFilter);
  }

  async ask(
    question: string,
    options: { model?: string; apiKey?: string; contextOnly?: boolean; mode?: 'auto' | 'lex' | 'sem'; k?: number; runner?: PromptRunner } = {},
  ): Promise<string> {
    if (!options.apiKey) throw new Error('LLM API key required for RAG synthesis');
    const results = await this.search(question, options.k ?? DEFAULT_K);
    const context = results.map((result) => `[${result.memory.name}] ${result.snippet}`).join('\n');
    if (options.contextOnly) return context;
    if (!context) return 'No relevant memory was found.';
    if (!options.runner) throw new Error('Pi prompt runner must be injected for memory RAG synthesis');
    const model = options.model ?? `${getSetting('provider', 'deepseek')}:${getSetting('modelId', 'deepseek-v4-flash')}`;
    return options.runner(`Answer the question using only the memory context below. Cite the memory names.\n\nQuestion: ${question}\n\nContext:\n${context}`, {
      model,
      sessionKey: `memory-rag:${createHash('sha256').update(question).digest('hex').slice(0, 16)}`,
    });
  }

  maskPii(text: string): string {
    return text
      .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b(?:\+?86[- ]?)?1[3-9]\d{9}\b/g, '[PHONE]')
      .replace(/\b\d{15,19}\b/g, '[NUMBER]');
  }

  async getTimeline(limit = 50): Promise<{ frameId: number; title: string; timestamp: number }[]> {
    await this.ensureInitialized();
    return [...this.records.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .map((record) => ({ frameId: record.id, title: record.title, timestamp: record.createdAt }));
  }

  async viewFrame(frameId: number): Promise<string> {
    await this.ensureInitialized();
    const record = this.records.get(frameId);
    if (!record) throw new Error(`Memory frame not found: ${frameId}`);
    return record.content;
  }

  async close(): Promise<void> {
    this.records.clear();
    this.initialized = false;
  }

  private rank(query: string, k: number, typeFilter?: MemoryType): MemvidSearchResult[] {
    const terms = tokenize(query);
    return [...this.records.values()]
      .filter((record) => !typeFilter || record.type === typeFilter)
      .map((record) => ({ record, score: scoreRecord(record, terms) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || right.record.updatedAt - left.record.updatedAt)
      .slice(0, k)
      .map(({ record, score }) => ({
        memory: {
          filename: `${record.type}_${record.title}.md`,
          type: record.type,
          description: record.title,
          name: record.title,
          filePath: join(this.baseDir, MEMORY_DIRNAME, record.type, `${record.title}.md`),
          mtimeMs: record.updatedAt,
        },
        snippet: record.content.slice(0, SNIPPET_CHARS) + (record.content.length > SNIPPET_CHARS ? '...' : ''),
        score,
      }));
  }

  private isStoredMemory(value: unknown): value is StoredMemory {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<StoredMemory>;
    return typeof record.id === 'number' && typeof record.title === 'string' && typeof record.content === 'string' && typeof record.createdAt === 'number';
  }
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1);
}

function scoreRecord(record: StoredMemory, terms: readonly string[]): number {
  if (terms.length === 0) return 0;
  const title = tokenize(record.title).join(' ');
  const content = tokenize(record.content).join(' ');
  const tags = tokenize(record.tags.join(' ')).join(' ');
  return terms.reduce((score, term) => score + (title.includes(term) ? 3 : 0) + (tags.includes(term) ? 2 : 0) + (content.includes(term) ? 1 : 0), 0) / terms.length;
}

let globalStore: MemvidStore | null = null;

export async function getMemvidStore(): Promise<MemvidStore> {
  if (!globalStore) {
    globalStore = new MemvidStore();
    await globalStore.initialize();
  }
  return globalStore;
}
