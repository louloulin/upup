/**
 * Agent Memory - Per-Agent Independent Memory System
 *
 * Provides isolated memory storage for each subagent, enabling:
 * - Agent-specific memory that persists across sessions
 * - Memory sharing within agent teams
 * - Memory inheritance from parent agents
 *
 * Reference: Loucode's AgentTool/agentMemory.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { upupPath } from '@upup/utils/paths';
import { info, warn, debug } from '@upup/utils/logging';

// ============================================================================
// Types
// ============================================================================

export interface AgentMemoryEntry {
  /** Memory ID */
  id: string;
  /** Agent ID this memory belongs to */
  agentId: string;
  /** Memory type */
  type: 'knowledge' | 'context' | 'preference' | 'state' | 'summary';
  /** Memory content */
  content: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  accessedAt: number;
  /** Memory metadata */
  metadata?: Record<string, unknown>;
}

export interface AgentMemory {
  /** Agent ID */
  agentId: string;
  /** Agent name */
  agentName: string;
  /** Parent agent ID (if forked) */
  parentAgentId?: string;
  /** Child agent IDs */
  childAgentIds: string[];
  /** Memory entries */
  entries: AgentMemoryEntry[];
  /** Memory statistics */
  stats: {
    totalEntries: number;
    totalSize: number;
    lastUpdated: number;
  };
}

export interface AgentMemoryOptions {
  /** Agent ID */
  agentId: string;
  /** Agent name */
  agentName: string;
  /** Parent agent ID for inheritance */
  parentAgentId?: string;
  /** Custom memory directory */
  memoryDir?: string;
  /** Maximum memory entries */
  maxEntries?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_ENTRIES = 1000;
const MEMORY_FILE_VERSION = 1;

// ============================================================================
// Agent Memory Store
// ============================================================================

/**
 * Agent Memory Store - manages all agent memories
 */
export class AgentMemoryStore {
  private memoryDir: string;
  private agentMemories: Map<string, AgentMemory> = new Map();
  private maxEntries: number;

  constructor(memoryDir?: string, maxEntries?: number) {
    this.memoryDir = memoryDir || upupPath('agent-memory');
    this.maxEntries = maxEntries || DEFAULT_MAX_ENTRIES;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  private getMemoryPath(agentId: string): string {
    return join(this.memoryDir, `${agentId}.json`);
  }

  /**
   * Get or create memory for an agent
   */
  getAgentMemory(options: AgentMemoryOptions): AgentMemory {
    const existing = this.agentMemories.get(options.agentId);
    if (existing) {
      return existing;
    }

    // Try to load from disk
    const memory = this.loadFromDisk(options);
    this.agentMemories.set(options.agentId, memory);
    return memory;
  }

  private loadFromDisk(options: AgentMemoryOptions): AgentMemory {
    const path = this.getMemoryPath(options.agentId);

    if (existsSync(path)) {
      try {
        const data = readFileSync(path, 'utf-8');
        const memory = JSON.parse(data) as AgentMemory;
        info('agent-memory', `Loaded memory for agent ${options.agentId}`);
        return memory;
      } catch (err) {
        warn('agent-memory', `Failed to load memory from disk: ${err}`);
      }
    }

    // Create new memory
    const memory: AgentMemory = {
      agentId: options.agentId,
      agentName: options.agentName,
      parentAgentId: options.parentAgentId,
      childAgentIds: [],
      entries: [],
      stats: {
        totalEntries: 0,
        totalSize: 0,
        lastUpdated: Date.now(),
      },
    };

    // Register with parent if exists
    if (options.parentAgentId) {
      const parent = this.agentMemories.get(options.parentAgentId);
      if (parent) {
        parent.childAgentIds.push(options.agentId);
      }
    }

    return memory;
  }

  /**
   * Save agent memory to disk
   */
  saveAgentMemory(memory: AgentMemory): void {
    const path = this.getMemoryPath(memory.agentId);

    try {
      writeFileSync(path, JSON.stringify(memory, null, 2), 'utf-8');
      memory.stats.lastUpdated = Date.now();
      debug('agent-memory', `Saved memory for agent ${memory.agentId}`);
    } catch (err) {
      warn('agent-memory', `Failed to save memory: ${err}`);
    }
  }

  /**
   * Add a memory entry
   */
  addEntry(
    agentId: string,
    type: AgentMemoryEntry['type'],
    content: string,
    metadata?: Record<string, unknown>
  ): AgentMemoryEntry | null {
    const memory = this.agentMemories.get(agentId);
    if (!memory) {
      warn('agent-memory', `Agent ${agentId} not found`);
      return null;
    }

    // Check max entries
    if (memory.entries.length >= this.maxEntries) {
      // Remove oldest entry
      memory.entries.shift();
    }

    const entry: AgentMemoryEntry = {
      id: createHash('sha256')
        .update(`${agentId}-${Date.now()}-${Math.random()}`)
        .digest('hex')
        .slice(0, 16),
      agentId,
      type,
      content,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      metadata,
    };

    memory.entries.push(entry);
    this.updateStats(memory);
    this.saveAgentMemory(memory);

    return entry;
  }

  /**
   * Get memory entries
   */
  getEntries(
    agentId: string,
    options?: {
      type?: AgentMemoryEntry['type'];
      limit?: number;
      since?: number;
    }
  ): AgentMemoryEntry[] {
    const memory = this.agentMemories.get(agentId);
    if (!memory) {
      return [];
    }

    let entries = memory.entries;

    if (options?.type) {
      entries = entries.filter((e) => e.type === options.type);
    }

    if (options?.since) {
      entries = entries.filter((e) => e.createdAt >= options.since!);
    }

    // Update access times
    entries.forEach((e) => {
      e.accessedAt = Date.now();
    });

    if (options?.limit) {
      entries = entries.slice(-options.limit);
    }

    return entries;
  }

  /**
   * Search memory content
   */
  searchMemory(agentId: string, query: string): AgentMemoryEntry[] {
    const memory = this.agentMemories.get(agentId);
    if (!memory) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    return memory.entries.filter((e) => e.content.toLowerCase().includes(lowerQuery));
  }

  /**
   * Clear memory entries
   */
  clearMemory(agentId: string, type?: AgentMemoryEntry['type']): number {
    const memory = this.agentMemories.get(agentId);
    if (!memory) {
      return 0;
    }

    const initialCount = memory.entries.length;

    if (type) {
      memory.entries = memory.entries.filter((e) => e.type !== type);
    } else {
      memory.entries = [];
    }

    this.updateStats(memory);
    this.saveAgentMemory(memory);

    return initialCount - memory.entries.length;
  }

  /**
   * Delete agent memory
   */
  deleteAgentMemory(agentId: string): boolean {
    const memory = this.agentMemories.get(agentId);
    if (!memory) {
      return false;
    }

    // Remove from parent's child list
    if (memory.parentAgentId) {
      const parent = this.agentMemories.get(memory.parentAgentId);
      if (parent) {
        parent.childAgentIds = parent.childAgentIds.filter((id) => id !== agentId);
      }
    }

    // Delete child memories
    for (const childId of memory.childAgentIds) {
      this.deleteAgentMemory(childId);
    }

    // Remove from store
    this.agentMemories.delete(agentId);

    // Delete file
    const path = this.getMemoryPath(agentId);
    if (existsSync(path)) {
      const { unlinkSync } = require('fs');
      unlinkSync(path);
    }

    return true;
  }

  /**
   * Inherit memory from parent
   */
  inheritFromParent(childAgentId: string, types?: AgentMemoryEntry['type'][]): number {
    const child = this.agentMemories.get(childAgentId);
    if (!child || !child.parentAgentId) {
      return 0;
    }

    const parent = this.agentMemories.get(child.parentAgentId);
    if (!parent) {
      return 0;
    }

    const inheritedTypes = types || ['knowledge', 'context', 'preference'];
    let count = 0;

    for (const entry of parent.entries) {
      if (inheritedTypes.includes(entry.type)) {
        child.entries.push({
          ...entry,
          id: createHash('sha256')
            .update(`${childAgentId}-${Date.now()}-${Math.random()}`)
            .digest('hex')
            .slice(0, 16),
          agentId: childAgentId,
          accessedAt: Date.now(),
        });
        count++;
      }
    }

    this.updateStats(child);
    this.saveAgentMemory(child);

    return count;
  }

  private updateStats(memory: AgentMemory): void {
    memory.stats.totalEntries = memory.entries.length;
    memory.stats.totalSize = JSON.stringify(memory.entries).length;
    memory.stats.lastUpdated = Date.now();
  }

  /**
   * Get memory summary
   */
  getSummary(agentId: string): {
    agentId: string;
    entryCount: number;
    types: Record<string, number>;
    lastUpdated: number;
  } | null {
    const memory = this.agentMemories.get(agentId);
    if (!memory) {
      return null;
    }

    const types: Record<string, number> = {};
    for (const entry of memory.entries) {
      types[entry.type] = (types[entry.type] || 0) + 1;
    }

    return {
      agentId,
      entryCount: memory.entries.length,
      types,
      lastUpdated: memory.stats.lastUpdated,
    };
  }
}

// ============================================================================
// Singleton Store
// ============================================================================

let storeInstance: AgentMemoryStore | null = null;

export function getAgentMemoryStore(): AgentMemoryStore {
  if (!storeInstance) {
    storeInstance = new AgentMemoryStore();
  }
  return storeInstance;
}

export function resetAgentMemoryStore(): void {
  storeInstance = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a new agent memory
 */
export function createAgentMemory(options: AgentMemoryOptions): AgentMemory {
  const store = getAgentMemoryStore();
  return store.getAgentMemory(options);
}

/**
 * Add knowledge to agent memory
 */
export function addAgentKnowledge(
  agentId: string,
  content: string,
  metadata?: Record<string, unknown>
): AgentMemoryEntry | null {
  const store = getAgentMemoryStore();
  return store.addEntry(agentId, 'knowledge', content, metadata);
}

/**
 * Add context to agent memory
 */
export function addAgentContext(
  agentId: string,
  content: string,
  metadata?: Record<string, unknown>
): AgentMemoryEntry | null {
  const store = getAgentMemoryStore();
  return store.addEntry(agentId, 'context', content, metadata);
}

/**
 * Get agent knowledge
 */
export function getAgentKnowledge(
  agentId: string,
  options?: { limit?: number; since?: number }
): AgentMemoryEntry[] {
  const store = getAgentMemoryStore();
  return store.getEntries(agentId, { type: 'knowledge', ...options });
}

/**
 * Search agent memory
 */
export function searchAgentMemory(agentId: string, query: string): AgentMemoryEntry[] {
  const store = getAgentMemoryStore();
  return store.searchMemory(agentId, query);
}

/**
 * Get memory summary
 */
export function getAgentMemorySummary(
  agentId: string
): ReturnType<AgentMemoryStore['getSummary']> {
  const store = getAgentMemoryStore();
  return store.getSummary(agentId);
}
