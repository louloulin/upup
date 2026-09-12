export type { MemoryEntry, SearchResult, SearchOptions } from '@upup/types';

import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryEntry, SearchResult, SearchOptions } from '@upup/types';

export interface MemoryOptions { path?: string; maxSize?: number; enableLex?: boolean }
export interface PutOptions { type?: 'user' | 'feedback' | 'project' | 'reference'; name?: string; metadata?: Record<string, unknown> }
export interface SemanticSearchOptions extends SearchOptions { minScore?: number }
export interface AskOptions { model?: string; apiKey?: string; contextOnly?: boolean; mode?: 'auto' | 'lex' | 'sem'; k?: number }

interface StoredMemory extends MemoryEntry { tags: string[] }

export class MemoryStore {
  private readonly filePath: string;
  private records = new Map<string, StoredMemory>();
  private initialized = false;

  constructor(options: MemoryOptions = {}) { this.filePath = join(options.path ?? './memory', 'memories.jsonl'); }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(join(this.filePath, '..'), { recursive: true });
    if (existsSync(this.filePath)) {
      const contents = await readFile(this.filePath, 'utf8');
      for (const line of contents.split('\n')) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as StoredMemory;
          if (record.id && record.content) this.records.set(record.id, record);
        } catch { continue; }
      }
    }
    this.initialized = true;
  }

  private async ensure(): Promise<void> { if (!this.initialized) await this.initialize(); }

  async put(content: string, options: PutOptions = {}): Promise<string> {
    await this.ensure();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const record: StoredMemory = { id, content, type: options.type ?? 'user', name: options.name, createdAt: now, updatedAt: now, metadata: options.metadata, tags: [options.type ?? 'user', options.name ?? ''] };
    this.records.set(id, record);
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return id;
  }

  async putMany(entries: Array<{ content: string; options?: PutOptions }>): Promise<string[]> { const ids: string[] = []; for (const entry of entries) ids.push(await this.put(entry.content, entry.options)); return ids; }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    await this.ensure();
    const terms = query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1);
    return [...this.records.values()].map((record) => ({ record, score: terms.reduce((total, term) => total + (record.content.toLowerCase().includes(term) ? 1 : 0) + (record.name?.toLowerCase().includes(term) ? 2 : 0), 0) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, options.maxResults ?? 10)
      .map(({ record, score }) => ({ id: record.id, content: record.content.slice(0, 700), score, type: record.type }));
  }

  async semanticSearch(query: string, options: SemanticSearchOptions = {}): Promise<SearchResult[]> {
    return (await this.search(query, options)).filter((result) => result.score >= (options.minScore ?? 0.1));
  }

  async ask(question: string, options: AskOptions = {}): Promise<string> {
    if (!options.apiKey) throw new Error('LLM API key required for ask()');
    const results = await this.search(question, { maxResults: options.k ?? 10 });
    const context = results.map((result) => `[${result.id}] ${result.content}`).join('\n');
    if (options.contextOnly) return context;
    return context || 'No relevant memory was found.';
  }

  maskPii(text: string): string { return text.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]').replace(/\b(?:\+?86[- ]?)?1[3-9]\d{9}\b/g, '[PHONE]').replace(/\b\d{15,19}\b/g, '[NUMBER]'); }

  async timeline(limit = 50): Promise<Array<{ id: string; title: string; timestamp: number }>> { await this.ensure(); return [...this.records.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map((record) => ({ id: record.id, title: record.name ?? '', timestamp: record.createdAt })); }
  async view(id: string): Promise<string> { await this.ensure(); const record = this.records.get(id); if (!record) throw new Error(`Memory not found: ${id}`); return record.content; }
  async close(): Promise<void> { this.records.clear(); this.initialized = false; }
  async stats(): Promise<{ totalFrames: number; hasLexIndex: boolean; hasVecIndex: boolean }> { await this.ensure(); await stat(this.filePath).catch(() => undefined); return { totalFrames: this.records.size, hasLexIndex: true, hasVecIndex: false }; }
}

export function createMemoryStore(options?: MemoryOptions): MemoryStore { return new MemoryStore(options); }
export default MemoryStore;
