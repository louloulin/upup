/**
 * CommandHistory - 命令使用历史
 *
 * 对标 Loucode 的命令历史功能
 * 追踪命令使用频率，支持最近使用的命令排序
 */

import type { SlashCommand } from '@upup/commands/index';

// ============================================================================
// Types
// ============================================================================

/**
 * 命令使用记录
 */
export interface CommandUsage {
  /** 命令名称 */
  name: string;
  /** 使用次数 */
  count: number;
  /** 最后使用时间 */
  lastUsed: number;
  /** 首次使用时间 */
  firstUsed: number;
  /** 命令对象（可选） */
  command?: SlashCommand;
  /** 标签/分类 */
  tags?: string[];
}

/**
 * 命令历史配置
 */
export interface CommandHistoryConfig {
  /** 最大记录数 */
  maxEntries?: number;
  /** 保留最近使用天数 */
  retentionDays?: number;
  /** 是否持久化存储 */
  persistent?: boolean;
  /** 最小使用次数（计入热门） */
  minCountForHot?: number;
}

/**
 * 排序方式
 */
export type SortOrder = 'recent' | 'frequent' | 'alphabetical' | 'name';

/**
 * 过滤条件
 */
export interface FilterOptions {
  /** 分类过滤 */
  category?: string;
  /** 搜索文本 */
  search?: string;
  /** 最小使用次数 */
  minCount?: number;
  /** 时间范围 */
  timeRange?: {
    start: number;
    end: number;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CommandHistoryConfig = {
  maxEntries: 100,
  retentionDays: 30,
  persistent: false,
  minCountForHot: 2,
};

// ============================================================================
// CommandHistory
// ============================================================================

export class CommandHistory {
  private config: CommandHistoryConfig;
  private usageMap: Map<string, CommandUsage> = new Map();
  private commandCache: Map<string, SlashCommand> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor(config: Partial<CommandHistoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._loadFromStorage();
  }

  // ============================================================================
  // Recording
  // ============================================================================

  /**
   * 记录命令使用
   */
  recordUsage(command: SlashCommand): void {
    const name = command.name.toLowerCase();

    const existing = this.usageMap.get(name);
    const now = Date.now();

    if (existing) {
      existing.count++;
      existing.lastUsed = now;
      // 更新缓存的命令对象
      if (command) {
        existing.command = command;
      }
    } else {
      // 新命令
      this.usageMap.set(name, {
        name: command.name,
        count: 1,
        lastUsed: now,
        firstUsed: now,
        command,
        tags: command.category ? [command.category] : [],
      });

      // 如果超过最大记录数，删除最少使用的
      if (this.usageMap.size > this.config.maxEntries!) {
        this._evictLeastUsed();
      }
    }

    // 缓存命令引用
    this.commandCache.set(name, command);

    // 触发更新通知
    this._notifyListeners();

    // 保存到存储
    this._saveToStorage();
  }

  /**
   * 记录命令别名使用
   */
  recordAliasUsage(aliasName: string, resolvedCommand: SlashCommand): void {
    // 别名也记录到主命令
    this.recordUsage(resolvedCommand);
  }

  /**
   * 删除使用记录
   */
  removeUsage(commandName: string): void {
    const name = commandName.toLowerCase();
    this.usageMap.delete(name);
    this.commandCache.delete(name);
    this._saveToStorage();
  }

  /**
   * 清空所有使用记录
   */
  clear(): void {
    this.usageMap.clear();
    this.commandCache.clear();
    this._saveToStorage();
    this._notifyListeners();
  }

  // ============================================================================
  // Querying
  // ============================================================================

  /**
   * 获取命令使用记录
   */
  getUsage(commandName: string): CommandUsage | null {
    return this.usageMap.get(commandName.toLowerCase()) || null;
  }

  /**
   * 获取使用次数
   */
  getUsageCount(commandName: string): number {
    return this.usageMap.get(commandName.toLowerCase())?.count || 0;
  }

  /**
   * 获取最近使用的命令
   *
   * @param limit 返回数量限制
   * @param filter 过滤条件
   */
  getRecent(limit: number = 10, filter?: FilterOptions): CommandUsage[] {
    let results = Array.from(this.usageMap.values());

    // 应用过滤
    if (filter) {
      results = this._applyFilter(results, filter);
    }

    // 按最后使用时间排序
    results.sort((a, b) => b.lastUsed - a.lastUsed);

    return results.slice(0, limit);
  }

  /**
   * 获取最常用的命令
   *
   * @param limit 返回数量限制
   * @param filter 过滤条件
   */
  getFrequent(limit: number = 10, filter?: FilterOptions): CommandUsage[] {
    let results = Array.from(this.usageMap.values());

    // 应用过滤
    if (filter) {
      results = this._applyFilter(results, filter);
    }

    // 按使用次数排序
    results.sort((a, b) => b.count - a.count);

    return results.slice(0, limit);
  }

  /**
   * 获取热门命令（使用次数超过阈值）
   */
  getHot(limit: number = 10): CommandUsage[] {
    const threshold = this.config.minCountForHot || 2;
    return this.getFrequent(limit, { minCount: threshold });
  }

  /**
   * 搜索命令使用历史
   */
  search(query: string, limit: number = 10): CommandUsage[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.usageMap.values())
      .filter((usage) => {
        const name = usage.name.toLowerCase();
        const category = usage.tags?.join(' ') || '';
        return (
          name.includes(lowerQuery) ||
          category.includes(lowerQuery) ||
          usage.command?.description?.toLowerCase().includes(lowerQuery)
        );
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * 获取分类使用统计
   */
  getCategoryStats(): Record<string, { count: number; totalUses: number }> {
    const stats: Record<string, { count: number; totalUses: number }> = {};

    for (const usage of this.usageMap.values()) {
      const category = usage.command?.category || 'other';
      if (!stats[category]) {
        stats[category] = { count: 0, totalUses: 0 };
      }
      stats[category].count++;
      stats[category].totalUses += usage.count;
    }

    return stats;
  }

  /**
   * 获取所有使用记录
   */
  getAll(): CommandUsage[] {
    return Array.from(this.usageMap.values());
  }

  /**
   * 获取记录总数
   */
  getSize(): number {
    return this.usageMap.size;
  }

  /**
   * 检查是否有记录
   */
  isEmpty(): boolean {
    return this.usageMap.size === 0;
  }

  // ============================================================================
  // Sorting
  // ============================================================================

  /**
   * 获取排序后的命令列表
   *
   * @param sortOrder 排序方式
   * @param commands 命令列表
   * @param filter 过滤条件
   */
  sortCommands(
    sortOrder: SortOrder,
    commands: SlashCommand[],
    filter?: FilterOptions,
  ): SlashCommand[] {
    let results = [...commands];

    // 应用过滤
    if (filter) {
      results = this._applyFilter(
        results.map((cmd) => ({
          name: cmd.name.toLowerCase(),
          count: 0,
          lastUsed: 0,
          firstUsed: 0,
          command: cmd,
        })),
        filter,
      ).map((u) => u.command!).filter(Boolean);
    }

    // 应用排序
    switch (sortOrder) {
      case 'recent':
        return this._sortByRecent(results);
      case 'frequent':
        return this._sortByFrequency(results);
      case 'alphabetical':
        return this._sortAlphabetically(results);
      case 'name':
        return this._sortByName(results);
      default:
        return results;
    }
  }

  /**
   * 按最近使用排序
   */
  private _sortByRecent(commands: SlashCommand[]): SlashCommand[] {
    return commands.sort((a, b) => {
      const usageA = this.usageMap.get(a.name.toLowerCase());
      const usageB = this.usageMap.get(b.name.toLowerCase());

      if (!usageA && !usageB) return 0;
      if (!usageA) return 1;
      if (!usageB) return -1;

      return usageB.lastUsed - usageA.lastUsed;
    });
  }

  /**
   * 按使用频率排序
   */
  private _sortByFrequency(commands: SlashCommand[]): SlashCommand[] {
    return commands.sort((a, b) => {
      const usageA = this.usageMap.get(a.name.toLowerCase());
      const usageB = this.usageMap.get(b.name.toLowerCase());

      const countA = usageA?.count || 0;
      const countB = usageB?.count || 0;

      return countB - countA;
    });
  }

  /**
   * 按字母顺序排序
   */
  private _sortAlphabetically(commands: SlashCommand[]): SlashCommand[] {
    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 按名称排序（与字母顺序相同）
   */
  private _sortByName(commands: SlashCommand[]): SlashCommand[] {
    return this._sortAlphabetically(commands);
  }

  // ============================================================================
  // Filtering
  // ============================================================================

  /**
   * 应用过滤条件
   */
  private _applyFilter(usageList: CommandUsage[], filter: FilterOptions): CommandUsage[] {
    return usageList.filter((usage) => {
      // 分类过滤
      if (filter.category) {
        const cmdCategory = usage.command?.category || 'other';
        if (cmdCategory !== filter.category) {
          return false;
        }
      }

      // 搜索文本
      if (filter.search) {
        const query = filter.search.toLowerCase();
        const name = usage.name.toLowerCase();
        const description = usage.command?.description || '';
        if (!name.includes(query) && !description.toLowerCase().includes(query)) {
          return false;
        }
      }

      // 最小使用次数
      if (filter.minCount !== undefined && usage.count < filter.minCount) {
        return false;
      }

      // 时间范围
      if (filter.timeRange) {
        if (usage.lastUsed < filter.timeRange.start || usage.lastUsed > filter.timeRange.end) {
          return false;
        }
      }

      return true;
    });
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * 订阅变更通知
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 通知所有监听器
   */
  private _notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('[CommandHistory] Listener error:', e);
      }
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * 保存到存储
   */
  private _saveToStorage(): void {
    if (!this.config.persistent) return;

    try {
      const data = JSON.stringify(Array.from(this.usageMap.entries()));
      localStorage?.setItem('upup_command_history', data);
    } catch (e) {
      console.error('[CommandHistory] Failed to save:', e);
    }
  }

  /**
   * 从存储加载
   */
  private _loadFromStorage(): void {
    if (!this.config.persistent) return;

    try {
      const data = localStorage?.getItem('upup_command_history');
      if (data) {
        const entries = JSON.parse(data) as [string, CommandUsage][];
        for (const [name, usage] of entries) {
          this.usageMap.set(name, usage);
          if (usage.command) {
            this.commandCache.set(name, usage.command);
          }
        }
      }
    } catch (e) {
      console.error('[CommandHistory] Failed to load:', e);
    }
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  /**
   * 清理过期记录
   */
  cleanup(): number {
    const retentionMs = (this.config.retentionDays || 30) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;

    let removed = 0;
    for (const [name, usage] of this.usageMap.entries()) {
      if (usage.lastUsed < cutoff) {
        this.usageMap.delete(name);
        this.commandCache.delete(name);
        removed++;
      }
    }

    if (removed > 0) {
      this._saveToStorage();
      this._notifyListeners();
    }

    return removed;
  }

  /**
   * 重置为默认状态
   */
  reset(): void {
    this.usageMap.clear();
    this.commandCache.clear();
    this._saveToStorage();
    this._notifyListeners();
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * 删除最少使用的记录
   */
  private _evictLeastUsed(): void {
    // 找出最少使用的记录
    let leastUsed: [string, CommandUsage] | null = null;

    for (const entry of this.usageMap.entries()) {
      if (!leastUsed || entry[1].count < leastUsed[1].count) {
        leastUsed = entry;
      }
    }

    if (leastUsed) {
      this.usageMap.delete(leastUsed[0]);
      this.commandCache.delete(leastUsed[0]);
    }
  }

  /**
   * 获取统计数据
   */
  getStats(): {
    totalCommands: number;
    totalUsages: number;
    avgUsagePerCommand: number;
    mostUsedCommand: string | null;
    newestCommand: string | null;
    oldestCommand: string | null;
  } {
    if (this.usageMap.size === 0) {
      return {
        totalCommands: 0,
        totalUsages: 0,
        avgUsagePerCommand: 0,
        mostUsedCommand: null,
        newestCommand: null,
        oldestCommand: null,
      };
    }

    let totalUsages = 0;
    let mostUsed: CommandUsage | null = null;
    let newest: CommandUsage | null = null;
    let oldest: CommandUsage | null = null;

    for (const usage of this.usageMap.values()) {
      totalUsages += usage.count;

      if (!mostUsed || usage.count > mostUsed.count) {
        mostUsed = usage;
      }

      if (!newest || usage.lastUsed > newest.lastUsed) {
        newest = usage;
      }

      if (!oldest || usage.firstUsed < oldest.firstUsed) {
        oldest = usage;
      }
    }

    return {
      totalCommands: this.usageMap.size,
      totalUsages,
      avgUsagePerCommand: Math.round(totalUsages / this.usageMap.size * 10) / 10,
      mostUsedCommand: mostUsed?.name || null,
      newestCommand: newest?.name || null,
      oldestCommand: oldest?.name || null,
    };
  }

  /**
   * 导出数据
   */
  export(): string {
    return JSON.stringify(Array.from(this.usageMap.entries()), null, 2);
  }

  /**
   * 导入数据
   */
  import(data: string): boolean {
    try {
      const entries = JSON.parse(data) as [string, CommandUsage][];
      this.usageMap.clear();
      this.commandCache.clear();

      for (const [name, usage] of entries) {
        this.usageMap.set(name, usage);
        if (usage.command) {
          this.commandCache.set(name, usage.command);
        }
      }

      this._saveToStorage();
      this._notifyListeners();
      return true;
    } catch (e) {
      console.error('[CommandHistory] Failed to import:', e);
      return false;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: CommandHistory | null = null;

/**
 * 获取 CommandHistory 单例
 */
export function getCommandHistory(): CommandHistory {
  if (!instance) {
    instance = new CommandHistory({ persistent: true });
  }
  return instance;
}

/**
 * 重置 CommandHistory 单例
 */
export function resetCommandHistory(): void {
  if (instance) {
    instance.reset();
    instance = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建 CommandHistory 实例
 */
export function createCommandHistory(config?: CommandHistoryConfig): CommandHistory {
  return new CommandHistory(config);
}