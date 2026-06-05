/**
 * CommandGroups - 分组命令列表
 *
 * 对标 Loucode 的分类命令列表
 * 按分类显示命令，支持展开/折叠
 */

import { Container, Text, Box } from '@earendil-works/pi-tui';
import { theme } from '@upup/theme';
import type { SlashCommand } from '@upup/commands/index';

// ============================================================================
// Types
// ============================================================================

/**
 * 命令分组
 */
export interface CommandGroup {
  /** 分组名称 */
  name: string;
  /** 显示名称 */
  displayName: string;
  /** 分类图标 */
  icon?: string;
  /** 命令列表 */
  commands: SlashCommand[];
  /** 是否展开 */
  expanded?: boolean;
  /** 排序优先级 */
  priority?: number;
}

/**
 * 分组命令列表配置
 */
export interface CommandGroupsConfig {
  /** 最大可见命令数 */
  maxVisible?: number;
  /** 是否显示图标 */
  showIcons?: boolean;
  /** 是否支持展开/折叠 */
  collapsible?: boolean;
  /** 初始展开所有分组 */
  expandAll?: boolean;
  /** 自定义分类映射 */
  categoryLabels?: Record<string, string>;
}

// ============================================================================
// Category Definitions
// ============================================================================

const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  core: 'Core Commands',
  plan: 'Planning',
  agent: 'Agent',
  mcp: 'MCP Tools',
  permissions: 'Permissions',
  system: 'System',
  git: 'Git',
  tools: 'Tools',
  skill: 'Skills',
  bundled: 'Bundled',
  other: 'Other',
};

const CATEGORY_ICONS: Record<string, string> = {
  core: '⚡',
  plan: '📋',
  agent: '🤖',
  mcp: '🔧',
  permissions: '🔐',
  system: '⚙️',
  git: '📦',
  tools: '🛠️',
  skill: '✨',
  bundled: '📦',
  other: '📁',
};

const CATEGORY_PRIORITY: Record<string, number> = {
  core: 100,
  system: 90,
  permissions: 80,
  agent: 70,
  plan: 60,
  tools: 50,
  mcp: 40,
  git: 30,
  skill: 20,
  bundled: 10,
  other: 0,
};

// ============================================================================
// CommandGroups
// ============================================================================

export class CommandGroups extends Container {
  private config: CommandGroupsConfig;
  private groups: Map<string, CommandGroup> = new Map();
  private orderedCategories: string[] = [];
  private selectedIndex: number = 0;
  private globalIndex: number = 0; // 全局索引（跨分组）
  private allCommands: SlashCommand[] = [];
  private maxVisible: number = 10;

  constructor(config: CommandGroupsConfig = {}) {
    super();

    this.config = {
      maxVisible: 10,
      showIcons: true,
      collapsible: true,
      expandAll: true,
      categoryLabels: DEFAULT_CATEGORY_LABELS,
      ...config,
    };

    this.maxVisible = this.config.maxVisible || 10;
  }

  // ============================================================================
  // Update Methods
  // ============================================================================

  /**
   * 设置命令列表（按分组自动组织）
   */
  setCommands(commands: SlashCommand[]): void {
    this.allCommands = commands;
    this.groups.clear();
    this.orderedCategories = [];

    // 按分类分组
    for (const cmd of commands) {
      const category = cmd.category || 'other';

      if (!this.groups.has(category)) {
        const displayName = this.config.categoryLabels?.[category] || DEFAULT_CATEGORY_LABELS[category] || category;
        const icon = CATEGORY_ICONS[category];
        const priority = CATEGORY_PRIORITY[category] || 0;

        this.groups.set(category, {
          name: category,
          displayName,
          icon,
          commands: [],
          expanded: this.config.expandAll,
          priority,
        });

        this.orderedCategories.push(category);
      }

      this.groups.get(category)!.commands.push(cmd);
    }

    // 按优先级排序
    this.orderedCategories.sort((a, b) => {
      const priorityA = this.groups.get(a)?.priority || 0;
      const priorityB = this.groups.get(b)?.priority || 0;
      return priorityB - priorityA;
    });

    // 重置选择
    this.selectedIndex = 0;
    this.globalIndex = 0;

    this._updateRender();
  }

  /**
   * 设置选中索引
   */
  setSelectedIndex(index: number): void {
    this.globalIndex = Math.max(0, Math.min(index, this.allCommands.length - 1));
    this._updateRender();
  }

  /**
   * 获取选中索引
   */
  getSelectedIndex(): number {
    return this.globalIndex;
  }

  /**
   * 获取选中的命令
   */
  getSelectedCommand(): SlashCommand | null {
    if (this.globalIndex < 0 || this.globalIndex >= this.allCommands.length) {
      return null;
    }
    return this.allCommands[this.globalIndex];
  }

  /**
   * 展开/折叠分组
   */
  toggleGroup(category: string): void {
    const group = this.groups.get(category);
    if (group) {
      group.expanded = !group.expanded;
      this._updateRender();
    }
  }

  /**
   * 展开所有分组
   */
  expandAll(): void {
    for (const group of this.groups.values()) {
      group.expanded = true;
    }
    this._updateRender();
  }

  /**
   * 折叠所有分组
   */
  collapseAll(): void {
    for (const group of this.groups.values()) {
      group.expanded = false;
    }
    this._updateRender();
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  /**
   * 导航到下一个命令
   */
  navigateDown(): boolean {
    if (this.globalIndex < this.allCommands.length - 1) {
      this.globalIndex++;
      this._ensureSelectedVisible();
      return true;
    }
    return false;
  }

  /**
   * 导航到上一个命令
   */
  navigateUp(): boolean {
    if (this.globalIndex > 0) {
      this.globalIndex--;
      this._ensureSelectedVisible();
      return true;
    }
    return false;
  }

  /**
   * 导航到下一个分组
   */
  navigateToNextGroup(): boolean {
    const currentGroup = this._getGroupAtIndex(this.globalIndex);
    const currentGroupIndex = this.orderedCategories.indexOf(currentGroup);

    if (currentGroupIndex < this.orderedCategories.length - 1) {
      const nextCategory = this.orderedCategories[currentGroupIndex + 1];
      const nextGroup = this.groups.get(nextCategory);
      if (nextGroup) {
        // 找到该分组的第一条命令
        let index = 0;
        for (let i = 0; i < currentGroupIndex + 1; i++) {
          const cat = this.orderedCategories[i];
          index += this.groups.get(cat)?.commands.length || 0;
        }
        this.globalIndex = index;
        return true;
      }
    }
    return false;
  }

  /**
   * 导航到上一个分组
   */
  navigateToPrevGroup(): boolean {
    const currentGroup = this._getGroupAtIndex(this.globalIndex);
    const currentGroupIndex = this.orderedCategories.indexOf(currentGroup);

    if (currentGroupIndex > 0) {
      const prevCategory = this.orderedCategories[currentGroupIndex - 1];
      const prevGroup = this.groups.get(prevCategory);
      if (prevGroup) {
        // 找到该分组的最后一条命令
        let index = 0;
        for (let i = 0; i < currentGroupIndex - 1; i++) {
          const cat = this.orderedCategories[i];
          index += this.groups.get(cat)?.commands.length || 0;
        }
        index += (prevGroup.commands.length - 1);
        this.globalIndex = index;
        return true;
      }
    }
    return false;
  }

  /**
   * 展开/折叠当前分组
   */
  toggleCurrentGroup(): void {
    const currentGroup = this._getGroupAtIndex(this.globalIndex);
    this.toggleGroup(currentGroup);
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * 获取指定全局索引处的分组
   */
  private _getGroupAtIndex(globalIndex: number): string {
    let index = 0;
    for (const category of this.orderedCategories) {
      const group = this.groups.get(category);
      if (group) {
        if (index + group.commands.length > globalIndex) {
          return category;
        }
        index += group.commands.length;
      }
    }
    return 'other';
  }

  /**
   * 确保选中的项在可见范围内
   */
  private _ensureSelectedVisible(): void {
    // 更新渲染以反映新选择
    this._updateRender();
  }

  /**
   * 更新渲染内容
   */
  private _updateRender(): void {
    this.clear();

    const availableLines = this.maxVisible;
    let renderedLines = 0;

    for (const category of this.orderedCategories) {
      if (renderedLines >= availableLines) break;

      const group = this.groups.get(category)!;

      // 分组标题行
      const icon = this.config.showIcons ? (group.icon || '📁') : '';
      const titleLine = group.expanded
        ? `${icon} ${theme.info('▼')} ${theme.primary(group.displayName)}`
        : `${icon} ${theme.info('▶')} ${theme.primary(group.displayName)} (${group.commands.length})`;

      this.addChild(new Text(titleLine, 0, 0));
      renderedLines++;

      // 如果展开，显示命令列表
      if (group.expanded) {
        for (const cmd of group.commands) {
          if (renderedLines >= availableLines) break;

          // 计算全局索引
          const globalIdx = this._getGlobalIndex(category, group.commands.indexOf(cmd));
          const isSelected = globalIdx === this.globalIndex;

          const prefix = isSelected ? theme.primary('▶ ') : '  ';
          const nameText = isSelected ? theme.primary(`/${cmd.name}`) : `/${cmd.name}`;
          const desc = cmd.description?.slice(0, 25) || '';
          const descText = desc ? `  ${theme.muted(desc)}` : '';

          this.addChild(new Text(`${prefix}${nameText}${descText}`, 0, 0));
          renderedLines++;
        }
      }
    }

    // 显示更多提示
    const totalCommands = this.allCommands.length;
    if (renderedLines < totalCommands) {
      this.addChild(new Text(theme.muted(`... and ${totalCommands - renderedLines} more`), 0, 0));
    }
  }

  /**
   * 获取命令的全局索引
   */
  private _getGlobalIndex(category: string, localIndex: number): number {
    let index = 0;
    for (const cat of this.orderedCategories) {
      if (cat === category) {
        return index + localIndex;
      }
      const group = this.groups.get(cat);
      if (group) {
        index += group.commands.length;
      }
    }
    return index;
  }

  // ============================================================================
  // Render
  // ============================================================================

  render(width: number): string[] {
    if (this.allCommands.length === 0) {
      return [theme.muted('No commands available')];
    }
    return super.render(width);
  }

  // ============================================================================
  // Info Methods
  // ============================================================================

  /**
   * 获取分组信息
   */
  getGroupInfo(): Array<{ name: string; displayName: string; count: number; expanded: boolean }> {
    return this.orderedCategories.map((category) => {
      const group = this.groups.get(category)!;
      return {
        name: group.name,
        displayName: group.displayName,
        count: group.commands.length,
        expanded: group.expanded || false,
      };
    });
  }

  /**
   * 获取所有命令
   */
  getAllCommands(): SlashCommand[] {
    return this.allCommands;
  }

  /**
   * 获取分组数量
   */
  getGroupCount(): number {
    return this.groups.size;
  }

  /**
   * 获取命令总数
   */
  getCommandCount(): number {
    return this.allCommands.length;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建分组命令列表
 */
export function createCommandGroups(config?: CommandGroupsConfig): CommandGroups {
  return new CommandGroups(config);
}

/**
 * 创建可展开的分组命令列表
 */
export function createExpandableCommandGroups(): CommandGroups {
  return new CommandGroups({
    collapsible: true,
    expandAll: false,
    showIcons: true,
  });
}