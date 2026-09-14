/**
 * CommandCategories - 命令分类系统
 *
 * 对标 Loucode 的命令分类功能
 * 提供分类管理、排序和显示功能
 */

import type { SlashCommand } from '../../commands/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 命令分类
 */
export interface CommandCategory {
  /** 分类 ID */
  id: string;
  /** 显示名称 */
  label: string;
  /** 图标 */
  icon: string;
  /** 描述 */
  description?: string;
  /** 优先级 */
  priority: number;
  /** 排序顺序 */
  sortOrder?: number;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认展开状态 */
  defaultExpanded?: boolean;
  /** 分类颜色 */
  color?: string;
}

/**
 * 分类统计
 */
export interface CategoryStats {
  categoryId: string;
  label: string;
  count: number;
  percentage: number;
  hasCommands: boolean;
}

/**
 * 分类显示选项
 */
export interface CategoryDisplayOptions {
  /** 显示图标 */
  showIcons?: boolean;
  /** 显示计数 */
  showCounts?: boolean;
  /** 显示描述 */
  showDescriptions?: boolean;
  /** 排序方式 */
  sortBy?: 'priority' | 'count' | 'name' | 'custom';
  /** 是否只显示有命令的分类 */
  hideEmpty?: boolean;
}

// ============================================================================
// Default Categories
// ============================================================================

export const DEFAULT_COMMAND_CATEGORIES: CommandCategory[] = [
  {
    id: 'core',
    label: 'Core Commands',
    icon: '⚡',
    description: 'Core functionality and essential commands',
    priority: 100,
    sortOrder: 1,
    collapsible: true,
    defaultExpanded: true,
    color: 'yellow',
  },
  {
    id: 'system',
    label: 'System',
    icon: '⚙️',
    description: 'System operations and configuration',
    priority: 90,
    sortOrder: 2,
    collapsible: true,
    defaultExpanded: true,
    color: 'cyan',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    icon: '🔐',
    description: 'Permission and access control',
    priority: 85,
    sortOrder: 3,
    collapsible: true,
    defaultExpanded: false,
    color: 'red',
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: '🤖',
    description: 'Agent commands and controls',
    priority: 70,
    sortOrder: 4,
    collapsible: true,
    defaultExpanded: true,
    color: 'green',
  },
  {
    id: 'plan',
    label: 'Planning',
    icon: '📋',
    description: 'Planning and task management',
    priority: 60,
    sortOrder: 5,
    collapsible: true,
    defaultExpanded: true,
    color: 'blue',
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: '🛠️',
    description: 'Tool commands and utilities',
    priority: 50,
    sortOrder: 6,
    collapsible: true,
    defaultExpanded: false,
    color: 'magenta',
  },
  {
    id: 'mcp',
    label: 'MCP Tools',
    icon: '🔧',
    description: 'MCP integration tools',
    priority: 40,
    sortOrder: 7,
    collapsible: true,
    defaultExpanded: false,
    color: 'yellow',
  },
  {
    id: 'git',
    label: 'Git',
    icon: '📦',
    description: 'Git operations and version control',
    priority: 30,
    sortOrder: 8,
    collapsible: true,
    defaultExpanded: false,
    color: 'red',
  },
  {
    id: 'skill',
    label: 'Skills',
    icon: '✨',
    description: 'Skill commands and management',
    priority: 20,
    sortOrder: 9,
    collapsible: true,
    defaultExpanded: true,
    color: 'cyan',
  },
  {
    id: 'bundled',
    label: 'Bundled',
    icon: '📦',
    description: 'Bundled features and integrations',
    priority: 10,
    sortOrder: 10,
    collapsible: true,
    defaultExpanded: false,
    color: 'green',
  },
  {
    id: 'other',
    label: 'Other',
    icon: '📁',
    description: 'Other commands',
    priority: 0,
    sortOrder: 99,
    collapsible: false,
    defaultExpanded: true,
    color: 'white',
  },
];

// ============================================================================
// CategoryManager
// ============================================================================

export class CategoryManager {
  private categories: Map<string, CommandCategory> = new Map();
  private expandedCategories: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();

  constructor(initialCategories?: CommandCategory[]) {
    // 初始化默认分类
    for (const cat of initialCategories || DEFAULT_COMMAND_CATEGORIES) {
      this.categories.set(cat.id, { ...cat });
      if (cat.defaultExpanded) {
        this.expandedCategories.add(cat.id);
      }
    }
  }

  // ============================================================================
  // Category Management
  // ============================================================================

  /**
   * 添加分类
   */
  addCategory(category: CommandCategory): void {
    this.categories.set(category.id, { ...category });
    if (category.defaultExpanded) {
      this.expandedCategories.add(category.id);
    }
    this.notifyListeners();
  }

  /**
   * 更新分类
   */
  updateCategory(id: string, updates: Partial<CommandCategory>): void {
    const existing = this.categories.get(id);
    if (existing) {
      this.categories.set(id, { ...existing, ...updates });
      this.notifyListeners();
    }
  }

  /**
   * 删除分类
   */
  removeCategory(id: string): boolean {
    const result = this.categories.delete(id);
    this.expandedCategories.delete(id);
    if (result) {
      this.notifyListeners();
    }
    return result;
  }

  /**
   * 获取分类
   */
  getCategory(id: string): CommandCategory | null {
    return this.categories.get(id) || null;
  }

  /**
   * 获取所有分类
   */
  getAllCategories(): CommandCategory[] {
    return Array.from(this.categories.values());
  }

  /**
   * 检查分类是否存在
   */
  hasCategory(id: string): boolean {
    return this.categories.has(id);
  }

  // ============================================================================
  // Expansion State
  // ============================================================================

  /**
   * 展开分类
   */
  expand(id: string): void {
    this.expandedCategories.add(id);
    this.notifyListeners();
  }

  /**
   * 折叠分类
   */
  collapse(id: string): void {
    this.expandedCategories.delete(id);
    this.notifyListeners();
  }

  /**
   * 切换分类展开状态
   */
  toggle(id: string): void {
    if (this.expandedCategories.has(id)) {
      this.collapse(id);
    } else {
      this.expand(id);
    }
  }

  /**
   * 检查分类是否展开
   */
  isExpanded(id: string): boolean {
    return this.expandedCategories.has(id);
  }

  /**
   * 展开所有分类
   */
  expandAll(): void {
    for (const cat of this.categories.values()) {
      if (cat.collapsible) {
        this.expandedCategories.add(cat.id);
      }
    }
    this.notifyListeners();
  }

  /**
   * 折叠所有分类
   */
  collapseAll(): void {
    for (const cat of this.categories.values()) {
      if (cat.collapsible) {
        this.expandedCategories.delete(cat.id);
      }
    }
    this.notifyListeners();
  }

  /**
   * 获取展开的分类列表
   */
  getExpandedCategories(): string[] {
    return Array.from(this.expandedCategories);
  }

  // ============================================================================
  // Sorting
  // ============================================================================

  /**
   * 按优先级排序
   */
  getSortedByPriority(): CommandCategory[] {
    return Array.from(this.categories.values()).sort((a, b) => {
      // 先按优先级
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 再按排序顺序
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  }

  /**
   * 按命令数量排序
   */
  getSortedByCount(commands: SlashCommand[]): CommandCategory[] {
    const countMap = new Map<string, number>();

    for (const cmd of commands) {
      const category = cmd.category || 'other';
      countMap.set(category, (countMap.get(category) || 0) + 1);
    }

    return this.getSortedByPriority().sort((a, b) => {
      const countA = countMap.get(a.id) || 0;
      const countB = countMap.get(b.id) || 0;
      return countB - countA;
    });
  }

  /**
   * 按名称排序
   */
  getSortedByName(): CommandCategory[] {
    return Array.from(this.categories.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * 获取分类统计
   */
  getStats(commands: SlashCommand[]): CategoryStats[] {
    const total = commands.length;
    const countMap = new Map<string, number>();

    for (const cmd of commands) {
      const category = cmd.category || 'other';
      countMap.set(category, (countMap.get(category) || 0) + 1);
    }

    return this.getSortedByPriority().map((cat) => {
      const count = countMap.get(cat.id) || 0;
      return {
        categoryId: cat.id,
        label: cat.label,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        hasCommands: count > 0,
      };
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
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('[CategoryManager] Listener error:', e);
      }
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * 重置为默认分类
   */
  reset(): void {
    this.categories.clear();
    this.expandedCategories.clear();

    for (const cat of DEFAULT_COMMAND_CATEGORIES) {
      this.categories.set(cat.id, { ...cat });
      if (cat.defaultExpanded) {
        this.expandedCategories.add(cat.id);
      }
    }

    this.notifyListeners();
  }

  /**
   * 导出分类配置
   */
  export(): string {
    return JSON.stringify({
      categories: Array.from(this.categories.values()),
      expanded: Array.from(this.expandedCategories),
    }, null, 2);
  }

  /**
   * 从配置导入
   */
  import(config: string): boolean {
    try {
      const { categories, expanded } = JSON.parse(config);
      this.categories.clear();
      this.expandedCategories.clear();

      for (const cat of categories) {
        this.categories.set(cat.id, cat);
      }

      for (const id of expanded) {
        this.expandedCategories.add(id);
      }

      this.notifyListeners();
      return true;
    } catch (e) {
      console.error('[CategoryManager] Import failed:', e);
      return false;
    }
  }
}

// ============================================================================
// CategoryDisplay
// ============================================================================

/**
 * 分类显示组件
 */
export class CategoryDisplay {
  private manager: CategoryManager;
  private options: CategoryDisplayOptions;

  constructor(
    manager: CategoryManager,
    options: CategoryDisplayOptions = {},
  ) {
    this.manager = manager;
    this.options = {
      showIcons: true,
      showCounts: true,
      showDescriptions: false,
      sortBy: 'priority',
      hideEmpty: false,
      ...options,
    };
  }

  /**
   * 更新选项
   */
  updateOptions(options: Partial<CategoryDisplayOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 获取排序后的分类
   */
  getSortedCategories(): CommandCategory[] {
    switch (this.options.sortBy) {
      case 'priority':
        return this.manager.getSortedByPriority();
      case 'count':
        // 需要命令列表才能按数量排序
        return this.manager.getSortedByPriority();
      case 'name':
        return this.manager.getSortedByName();
      default:
        return this.manager.getSortedByPriority();
    }
  }

  /**
   * 生成分类选择器选项
   */
  generateSelectorOptions(
    commands: SlashCommand[],
    selectedCategory?: string,
  ): Array<{ value: string; label: string; icon?: string }> {
    const stats = this.manager.getStats(commands);
    const categories = this.getSortedCategories();

    const options: Array<{ value: string; label: string; icon?: string }> = [];

    for (const cat of categories) {
      const stat = stats.find((s) => s.categoryId === cat.id);

      // 跳过空的分类（如果设置hideEmpty）
      if (this.options.hideEmpty && stat && !stat.hasCommands) {
        continue;
      }

      const label = this.options.showCounts && stat
        ? `${cat.label} (${stat.count})`
        : cat.label;

      options.push({
        value: cat.id,
        label,
        icon: this.options.showIcons ? cat.icon : undefined,
      });
    }

    return options;
  }

  /**
   * 生成分类标题行
   */
  generateCategoryHeader(category: CommandCategory, commands: SlashCommand[]): string {
    const parts: string[] = [];

    if (this.options.showIcons && category.icon) {
      parts.push(category.icon);
    }

    parts.push(category.label);

    if (this.options.showDescriptions && category.description) {
      parts.push(`- ${category.description}`);
    }

    if (this.options.showCounts) {
      const count = commands.filter((c) => c.category === category.id).length;
      parts.push(`(${count})`);
    }

    return parts.join(' ');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: CategoryManager | null = null;

/**
 * 获取 CategoryManager 单例
 */
export function getCategoryManager(): CategoryManager {
  if (!instance) {
    instance = new CategoryManager();
  }
  return instance;
}

/**
 * 重置 CategoryManager 单例
 */
export function resetCategoryManager(): void {
  if (instance) {
    instance.reset();
    instance = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建分类管理器
 */
export function createCategoryManager(categories?: CommandCategory[]): CategoryManager {
  return new CategoryManager(categories);
}

/**
 * 创建分类显示
 */
export function createCategoryDisplay(
  manager: CategoryManager,
  options?: CategoryDisplayOptions,
): CategoryDisplay {
  return new CategoryDisplay(manager, options);
}

/**
 * 创建默认分类
 */
export function createDefaultCategory(id: string): CommandCategory {
  const defaultCat = DEFAULT_COMMAND_CATEGORIES.find((c) => c.id === id);
  return defaultCat ? { ...defaultCat } : {
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    icon: '📁',
    priority: 0,
  };
}