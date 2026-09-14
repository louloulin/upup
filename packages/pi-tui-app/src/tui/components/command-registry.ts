/**
 * CommandRegistry - 统一命令注册中心
 *
 * 对标 Loucode 的 CommandRegistry
 * 提供集中的命令注册、分类和查询功能
 */

import type { SlashCommand } from '@upup/commands';

// ============================================================================
// Types
// ============================================================================

/**
 * 命令类别配置
 */
export interface CommandCategoryConfig {
  /** 分类 ID */
  id: string;
  /** 显示名称 */
  label: string;
  /** 图标 */
  icon?: string;
  /** 描述 */
  description?: string;
  /** 优先级（数值越大排越前） */
  priority: number;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认展开 */
  defaultExpanded?: boolean;
}

/**
 * 命令注册选项
 */
export interface CommandRegistrationOptions {
  /** 命令名称 */
  name: string;
  /** 命令描述 */
  description: string;
  /** 分类 ID */
  category: string;
  /** 别名 */
  aliases?: string[];
  /** 是否隐藏（不显示在列表中） */
  hidden?: boolean;
  /** 优先级 */
  priority?: number;
  /** 执行函数 */
  handler?: (args: string, context: CommandContext) => Promise<CommandResult>;
  /** 权限级别 */
  permission?: 'admin' | 'user' | 'readonly';
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 命令上下文
 */
export interface CommandContext {
  /** 当前工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 用户信息 */
  user?: { name: string; roles: string[] };
  /** 时间戳 */
  timestamp: number;
}

/**
 * 命令执行结果
 */
export interface CommandResult {
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 额外数据 */
  data?: unknown;
}

// ============================================================================
// Default Categories
// ============================================================================

export const DEFAULT_CATEGORIES: CommandCategoryConfig[] = [
  { id: 'core', label: 'Core Commands', icon: '⚡', description: 'Core functionality', priority: 100 },
  { id: 'system', label: 'System', icon: '⚙️', description: 'System operations', priority: 90 },
  { id: 'permissions', label: 'Permissions', icon: '🔐', description: 'Permission management', priority: 85 },
  { id: 'agent', label: 'Agent', icon: '🤖', description: 'Agent commands', priority: 70 },
  { id: 'plan', label: 'Planning', icon: '📋', description: 'Planning commands', priority: 60 },
  { id: 'tools', label: 'Tools', icon: '🛠️', description: 'Tool commands', priority: 50 },
  { id: 'mcp', label: 'MCP Tools', icon: '🔧', description: 'MCP integration', priority: 40 },
  { id: 'git', label: 'Git', icon: '📦', description: 'Git operations', priority: 30 },
  { id: 'skill', label: 'Skills', icon: '✨', description: 'Skill commands', priority: 20 },
  { id: 'bundled', label: 'Bundled', icon: '📦', description: 'Bundled features', priority: 10 },
  { id: 'other', label: 'Other', icon: '📁', description: 'Other commands', priority: 0 },
];

// ============================================================================
// UnifiedCommandRegistry
// ============================================================================

export class UnifiedCommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();
  private aliasMap: Map<string, string> = new Map();
  private categories: Map<string, CommandCategoryConfig> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    // 初始化默认分类
    for (const cat of DEFAULT_CATEGORIES) {
      this.categories.set(cat.id, cat);
    }
  }

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * 注册命令
   */
  register(command: SlashCommand): void {
    const name = command.name.toLowerCase();

    // 如果已存在，先注销
    if (this.commands.has(name)) {
      console.warn(`[UnifiedCommandRegistry] Command '${name}' already registered, replacing`);
    }

    this.commands.set(name, { ...command, name });

    // 注册别名
    const aliases = (command as { aliases?: string[] }).aliases;
    if (aliases && Array.isArray(aliases)) {
      for (const alias of aliases) {
        this.aliasMap.set(alias.toLowerCase(), name);
      }
    }

    this.notifyListeners();
  }

  /**
   * 批量注册命令
   */
  registerBatch(commands: SlashCommand[]): void {
    for (const cmd of commands) {
      this.register(cmd);
    }
  }

  /**
   * 注销命令
   */
  unregister(name: string): boolean {
    const lowerName = name.toLowerCase();
    const command = this.commands.get(lowerName);

    if (!command) return false;

    // 注销别名
    const aliases = (command as { aliases?: string[] }).aliases;
    if (aliases && Array.isArray(aliases)) {
      for (const alias of aliases) {
        this.aliasMap.delete(alias.toLowerCase());
      }
    }

    this.commands.delete(lowerName);
    this.notifyListeners();

    return true;
  }

  /**
   * 注册别名
   */
  registerAlias(commandName: string, alias: string): void {
    const name = commandName.toLowerCase();
    if (this.commands.has(name)) {
      this.aliasMap.set(alias.toLowerCase(), name);
    }
  }

  // ============================================================================
  // Query
  // ============================================================================

  /**
   * 获取命令
   */
  get(name: string): SlashCommand | null {
    const lowerName = name.toLowerCase();
    return this.commands.get(lowerName) || null;
  }

  /**
   * 按名称或别名获取命令
   */
  getByNameOrAlias(nameOrAlias: string): SlashCommand | null {
    const lower = nameOrAlias.toLowerCase();

    // 先尝试直接名称
    if (this.commands.has(lower)) {
      return this.commands.get(lower)!;
    }

    // 再尝试别名
    const resolvedName = this.aliasMap.get(lower);
    if (resolvedName) {
      return this.commands.get(resolvedName) || null;
    }

    return null;
  }

  /**
   * 获取所有命令
   */
  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * 获取可见命令（不包含隐藏的）
   */
  getVisible(): SlashCommand[] {
    return Array.from(this.commands.values()).filter((cmd) => !(cmd as { hidden?: boolean }).hidden);
  }

  /**
   * 按分类获取命令
   */
  getByCategory(category: string): SlashCommand[] {
    return Array.from(this.commands.values()).filter((cmd) => cmd.category === category);
  }

  /**
   * 检查命令是否存在
   */
  has(name: string): boolean {
    return this.commands.has(name.toLowerCase()) || this.aliasMap.has(name.toLowerCase());
  }

  // ============================================================================
  // Search & Match
  // ============================================================================

  /**
   * 模糊搜索命令
   */
  search(query: string, maxResults: number = 10): SlashCommand[] {
    const lowerQuery = query.toLowerCase().replace(/^\//, '');
    const results: Array<{ command: SlashCommand; score: number }> = [];

    for (const cmd of this.commands.values()) {
      if ((cmd as { hidden?: boolean }).hidden) continue;

      const name = cmd.name.toLowerCase();
      let score = 0;

      // 精确前缀匹配 - 最高分
      if (name === lowerQuery) {
        score = 100;
      } else if (name.startsWith(lowerQuery)) {
        score = 90;
      }

      // 别名前缀匹配
      const aliases = (cmd as { aliases?: string[] }).aliases;
      if (score === 0 && aliases?.some((a: string) => a.toLowerCase().startsWith(lowerQuery))) {
        score = 80;
      }

      // 子串匹配
      if (score === 0 && name.includes(lowerQuery)) {
        score = 60;
      }

      // 模糊匹配
      if (score === 0 && this.fuzzyMatch(lowerQuery, name)) {
        score = 40;
      }

      // 描述匹配
      if (score === 0 && cmd.description?.toLowerCase().includes(lowerQuery)) {
        score = 20;
      }

      if (score > 0) {
        results.push({ command: cmd, score });
      }
    }

    // 按分数排序并限制结果数
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults).map((r) => r.command);
  }

  /**
   * 获取自动完成建议
   */
  autocomplete(partial: string, maxResults: number = 5): SlashCommand[] {
    if (!partial || partial.length === 0) {
      // 无输入时返回常用命令
      return this.getVisible().slice(0, maxResults);
    }

    return this.search(partial, maxResults);
  }

  /**
   * 模糊匹配
   */
  private fuzzyMatch(query: string, target: string): boolean {
    let qi = 0;
    for (let i = 0; i < target.length && qi < query.length; i++) {
      if (target[i] === query[qi]) {
        qi++;
      }
    }
    return qi === query.length;
  }

  // ============================================================================
  // Categories
  // ============================================================================

  /**
   * 获取所有分类
   */
  getCategories(): CommandCategoryConfig[] {
    return Array.from(this.categories.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * 获取分类配置
   */
  getCategoryConfig(categoryId: string): CommandCategoryConfig | null {
    return this.categories.get(categoryId) || null;
  }

  /**
   * 注册自定义分类
   */
  registerCategory(config: CommandCategoryConfig): void {
    this.categories.set(config.id, config);
  }

  /**
   * 按分类分组获取命令
   */
  getGroupedByCategory(): Map<string, SlashCommand[]> {
    const groups = new Map<string, SlashCommand[]>();

    for (const cmd of this.getVisible()) {
      const category = cmd.category || 'other';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(cmd);
    }

    // 按分类优先级排序
    const sortedGroups = new Map<string, SlashCommand[]>();
    for (const cat of this.getCategories()) {
      const commands = groups.get(cat.id);
      if (commands && commands.length > 0) {
        sortedGroups.set(cat.id, commands);
      }
    }

    return sortedGroups;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    visible: number;
    hidden: number;
    byCategory: Record<string, number>;
    aliases: number;
  } {
    const byCategory: Record<string, number> = {};

    for (const cmd of this.commands.values()) {
      const category = cmd.category || 'other';
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    return {
      total: this.commands.size,
      visible: this.getVisible().length,
      hidden: this.commands.size - this.getVisible().length,
      byCategory,
      aliases: this.aliasMap.size,
    };
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
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('[UnifiedCommandRegistry] Listener error:', e);
      }
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * 清空所有命令
   */
  clear(): void {
    this.commands.clear();
    this.aliasMap.clear();
    this.notifyListeners();
  }

  /**
   * 重置为初始状态
   */
  reset(): void {
    this.clear();
    // 重新初始化默认分类
    this.categories.clear();
    for (const cat of DEFAULT_CATEGORIES) {
      this.categories.set(cat.id, cat);
    }
  }

  /**
   * 导出所有命令
   */
  export(): string {
    return JSON.stringify(Array.from(this.commands.values()), null, 2);
  }

  /**
   * 从导出导入命令
   */
  import(data: string): number {
    try {
      const commands = JSON.parse(data) as SlashCommand[];
      this.registerBatch(commands);
      return commands.length;
    } catch (e) {
      console.error('[UnifiedCommandRegistry] Import failed:', e);
      return 0;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: UnifiedCommandRegistry | null = null;

/**
 * 获取 UnifiedCommandRegistry 单例
 */
export function getUnifiedCommandRegistry(): UnifiedCommandRegistry {
  if (!instance) {
    instance = new UnifiedCommandRegistry();
  }
  return instance;
}

/**
 * 重置 UnifiedCommandRegistry 单例
 */
export function resetUnifiedCommandRegistry(): void {
  if (instance) {
    instance.reset();
    instance = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建命令注册选项
 */
export function createCommandRegistration(options: CommandRegistrationOptions): SlashCommand {
  return {
    name: options.name,
    description: options.description,
    category: options.category,
    aliases: options.aliases,
    hidden: options.hidden,
    ...(options.metadata && { metadata: options.metadata }),
  } as SlashCommand;
}

/**
 * 创建命令注册器实例
 */
export function createCommandRegistry(): UnifiedCommandRegistry {
  return new UnifiedCommandRegistry();
}