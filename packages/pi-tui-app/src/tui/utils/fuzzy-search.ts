/**
 * Fuzzy Search Utility for Commands
 *
 * 基于 Claude Code 的 commandSuggestions.ts 设计
 * 提供 Fuse.js 模糊搜索和命令匹配功能
 */

import Fuse, { type IFuseOptions } from 'fuse.js';
import type { SlashCommand } from '@upup/commands';

// 扩展 SlashCommand 类型以支持 aliases
interface ExtendedSlashCommand extends SlashCommand {
  aliases?: string[];
}

// 搜索配置
const FUSE_OPTIONS: IFuseOptions<FuseSearchItem> = {
  includeScore: true,
  threshold: 0.3,
  location: 0,
  distance: 100,
  keys: [
    { name: 'name', weight: 3 },
    { name: 'aliases', weight: 2 },
    { name: 'description', weight: 0.5 },
    { name: 'category', weight: 0.3 },
  ],
};

interface FuseSearchItem {
  name: string;
  aliases?: string[];
  description: string;
  category: string;
  command: ExtendedSlashCommand;
}

/**
 * 命令模糊搜索器
 * 使用 Fuse.js 提供高性能的命令匹配
 */
export class CommandFuzzySearch {
  private _commands: ExtendedSlashCommand[] = [];
  private _fuse: Fuse<FuseSearchItem> | null = null;
  private _usageCount: Map<string, number> = new Map();

  /**
   * 更新命令列表
   * 会触发重新构建 Fuse 索引
   */
  setCommands(commands: SlashCommand[]): void {
    this._commands = commands as ExtendedSlashCommand[];
    this._buildIndex();
  }

  /**
   * 记录命令使用
   * 影响搜索排序
   */
  recordUsage(commandName: string): void {
    const count = (this._usageCount.get(commandName) || 0) + 1;
    this._usageCount.set(commandName, count);
  }

  /**
   * 获取命令使用次数
   */
  getUsageCount(commandName: string): number {
    return this._usageCount.get(commandName) || 0;
  }

  /**
   * 搜索命令
   * @param query 搜索查询
   * @param limit 返回结果数量限制
   */
  search(query: string, limit: number = 10): SlashCommand[] {
    if (!this._fuse) return [];

    const trimmedQuery = query.startsWith('/') ? query.slice(1).trim() : query;

    if (!trimmedQuery) {
      // 无查询时返回所有命令，按使用频率排序
      return this._sortByUsage(this._commands.slice(0, limit));
    }

    const results = this._fuse.search(trimmedQuery);

    // 转换为 SlashCommand 并应用使用频率排序
    const commands = results
      .slice(0, limit)
      .map(result => result.item.command as SlashCommand);

    return this._sortByUsage(commands);
  }

  /**
   * 获取精确匹配
   * @param query 查询字符串
   */
  exactMatch(query: string): SlashCommand | null {
    const trimmedQuery = query.startsWith('/') ? query.slice(1).trim().toLowerCase() : query.toLowerCase();

    for (const cmd of this._commands) {
      if (cmd.name.toLowerCase() === trimmedQuery) {
        return cmd as SlashCommand;
      }
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          if (alias.toLowerCase() === trimmedQuery) {
            return cmd as SlashCommand;
          }
        }
      }
    }
    return null;
  }

  /**
   * 前缀匹配
   * @param prefix 前缀
   */
  prefixMatch(prefix: string): SlashCommand[] {
    const trimmedPrefix = prefix.startsWith('/') ? prefix.slice(1).trim().toLowerCase() : prefix.toLowerCase();

    return this._commands
      .filter(cmd => {
        if (cmd.name.toLowerCase().startsWith(trimmedPrefix)) return true;
        if (cmd.aliases) {
          for (const alias of cmd.aliases) {
            if (alias.toLowerCase().startsWith(trimmedPrefix)) return true;
          }
        }
        return false;
      })
      .map(cmd => cmd as SlashCommand);
  }

  /**
   * 构建 Fuse 索引
   */
  private _buildIndex(): void {
    const items: FuseSearchItem[] = this._commands.map(cmd => ({
      name: cmd.name,
      aliases: cmd.aliases,
      description: cmd.description || '',
      category: cmd.category || 'other',
      command: cmd,
    }));

    this._fuse = new Fuse(items, FUSE_OPTIONS);
  }

  /**
   * 按使用频率排序
   */
  private _sortByUsage(commands: SlashCommand[]): SlashCommand[] {
    return [...commands].sort((a, b) => {
      const usageA = this.getUsageCount(a.name);
      const usageB = this.getUsageCount(b.name);
      return usageB - usageA; // 降序
    });
  }

  /**
   * 获取命令数量
   */
  get size(): number {
    return this._commands.length;
  }

  /**
   * 检查是否为空
   */
  get isEmpty(): boolean {
    return this._commands.length === 0;
  }
}

// ==================== Singleton Instance ====================

let instance: CommandFuzzySearch | null = null;

/**
 * 获取 CommandFuzzySearch 单例
 */
export function getCommandFuzzySearch(): CommandFuzzySearch {
  if (!instance) {
    instance = new CommandFuzzySearch();
  }
  return instance;
}

/**
 * 重置 CommandFuzzySearch 单例
 */
export function resetCommandFuzzySearch(): void {
  instance = null;
}