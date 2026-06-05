/**
 * Agent Persistence - Agent持久化支持 (v1.0)
 * 
 * 持久化Agent状态和历史:
 * - Agent状态快照
 * - 事件历史持久化
 * - 会话恢复
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getUpupDir } from '@upup/utils/storage-paths';
import { info, warn, error as logError } from '@upup/utils/logging';

export interface AgentSnapshot {
  /** Snapshot ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Agent name */
  name: string;
  /** Agent state */
  state: string;
  /** Snapshot timestamp */
  timestamp: number;
  /** Agent data */
  data: Record<string, unknown>;
}

export interface PersistenceConfig {
  /** Persistence directory */
  dir: string;
  /** Auto-save interval (ms) */
  autoSaveIntervalMs: number;
  /** Maximum snapshots to keep */
  maxSnapshots: number;
  /** Enable compression */
  enableCompression: boolean;
}

const DEFAULT_CONFIG: PersistenceConfig = {
  dir: '',
  autoSaveIntervalMs: 30000, // 30 seconds
  maxSnapshots: 100,
  enableCompression: false,
};

/**
 * Agent Persistence Manager
 */
export class AgentPersistence {
  private static instance: AgentPersistence | null = null;
  private config: PersistenceConfig;
  private snapshots: Map<string, AgentSnapshot> = new Map();
  private autoSaveTimer?: ReturnType<typeof setInterval>;
  private dirty: Set<string> = new Set();

  private constructor(config: Partial<PersistenceConfig> = {}) {
    const baseConfig = { ...DEFAULT_CONFIG };
    if (config.dir) {
      baseConfig.dir = config.dir;
    }
    this.config = baseConfig;
    
    // Set default directory
    if (!this.config.dir) {
      this.config.dir = join(getUpupDir(), 'agent-snapshots');
    }
    
    // Ensure directory exists
    if (!existsSync(this.config.dir)) {
      mkdirSync(this.config.dir, { recursive: true });
    }
  }

  static getInstance(config?: Partial<PersistenceConfig>): AgentPersistence {
    if (!AgentPersistence.instance) {
      AgentPersistence.instance = new AgentPersistence(config);
    }
    return AgentPersistence.instance;
  }

  /**
   * Save agent snapshot
   */
  saveSnapshot(
    agentId: string,
    name: string,
    state: string,
    data: Record<string, unknown> = {}
  ): AgentSnapshot {
    const snapshot: AgentSnapshot = {
      id: crypto.randomUUID(),
      agentId,
      name,
      state,
      timestamp: Date.now(),
      data,
    };

    this.snapshots.set(agentId, snapshot);
    this.dirty.add(agentId);
    
    info('persistence', `Snapshot saved: ${agentId} (${state})`);
    
    return snapshot;
  }

  /**
   * Load agent snapshot
   */
  loadSnapshot(agentId: string): AgentSnapshot | undefined {
    return this.snapshots.get(agentId);
  }

  /**
   * Delete snapshot
   */
  deleteSnapshot(agentId: string): boolean {
    const deleted = this.snapshots.delete(agentId);
    if (deleted) {
      this.dirty.delete(agentId);
      
      // Also delete from disk
      const filePath = this.getSnapshotPath(agentId);
      try {
        if (existsSync(filePath)) {
          const { unlinkSync } = require('fs');
          unlinkSync(filePath);
        }
      } catch (e) {
        warn('persistence', `Failed to delete snapshot file: ${agentId}`);
      }
    }
    return deleted;
  }

  /**
   * Get snapshot path
   */
  private getSnapshotPath(agentId: string): string {
    const safeName = agentId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return join(this.config.dir, `${safeName}.json`);
  }

  /**
   * Persist snapshot to disk
   */
  async persistToDisk(agentId?: string): Promise<void> {
    const toPersist = agentId 
      ? (this.dirty.has(agentId) ? [agentId] : [])
      : Array.from(this.dirty);

    for (const id of toPersist) {
      const snapshot = this.snapshots.get(id);
      if (!snapshot) continue;

      try {
        const filePath = this.getSnapshotPath(id);
        writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
        this.dirty.delete(id);
        info('persistence', `Persisted: ${id}`);
      } catch (e) {
        logError('persistence', `Failed to persist: ${id}`, e instanceof Error ? e : undefined);
      }
    }
  }

  /**
   * Load snapshots from disk
   */
  loadFromDisk(): number {
    if (!existsSync(this.config.dir)) {
      return 0;
    }

    const { readdirSync } = require('fs');
    let loaded = 0;

    try {
      const files = readdirSync(this.config.dir).filter((f: string) => f.endsWith('.json'));
      
      for (const file of files) {
        try {
          const content = readFileSync(join(this.config.dir, file), 'utf8');
          const snapshot: AgentSnapshot = JSON.parse(content);
          
          this.snapshots.set(snapshot.agentId, snapshot);
          loaded++;
        } catch (e) {
          warn('persistence', `Failed to load snapshot: ${file}`);
        }
      }
    } catch (e) {
      logError('persistence', 'Failed to read snapshots directory', e instanceof Error ? e : undefined);
    }

    info('persistence', `Loaded ${loaded} snapshots from disk`);
    return loaded;
  }

  /**
   * Start auto-save
   */
  startAutoSave(): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(() => {
      this.persistToDisk().catch(e => {
        logError('persistence', 'Auto-save failed', e instanceof Error ? e : undefined);
      });
    }, this.config.autoSaveIntervalMs);

    info('persistence', `Auto-save started (${this.config.autoSaveIntervalMs}ms)`);
  }

  /**
   * Stop auto-save
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
      info('persistence', 'Auto-save stopped');
    }
  }

  /**
   * Get all snapshots
   */
  getAllSnapshots(): AgentSnapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get snapshots by state
   */
  getSnapshotsByState(state: string): AgentSnapshot[] {
    return this.getAllSnapshots().filter(s => s.state === state);
  }

  /**
   * Cleanup old snapshots
   */
  cleanup(maxToKeep?: number): number {
    const max = maxToKeep || this.config.maxSnapshots;
    const snapshots = this.getAllSnapshots();
    
    let deleted = 0;
    for (let i = max; i < snapshots.length; i++) {
      if (this.deleteSnapshot(snapshots[i].agentId)) {
        deleted++;
      }
    }
    
    return deleted;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    byState: Record<string, number>;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    dirtyCount: number;
  } {
    const snapshots = this.getAllSnapshots();
    const byState: Record<string, number> = {};
    
    for (const s of snapshots) {
      byState[s.state] = (byState[s.state] || 0) + 1;
    }
    
    return {
      total: snapshots.length,
      byState,
      oldestTimestamp: snapshots.length > 0 ? snapshots[snapshots.length - 1].timestamp : null,
      newestTimestamp: snapshots.length > 0 ? snapshots[0].timestamp : null,
      dirtyCount: this.dirty.size,
    };
  }

  /**
   * Update config
   */
  updateConfig(updates: Partial<PersistenceConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Reset persistence
   */
  reset(): void {
    this.stopAutoSave();
    this.snapshots.clear();
    this.dirty.clear();
    info('persistence', 'Persistence reset');
  }

  /**
   * Static reset
   */
  static reset(): void {
    if (AgentPersistence.instance) {
      AgentPersistence.instance.reset();
    }
    AgentPersistence.instance = null;
  }
}

/**
 * Get persistence manager
 */
export function getAgentPersistence(): AgentPersistence {
  return AgentPersistence.getInstance();
}
