/**
 * CommandPreviewPanel - 命令预览面板
 *
 * 对标 Loucode 的命令预览功能
 * 显示选中命令的详细信息：名称、描述、分类、别名、使用方法等
 */

import { Container, Text, Box } from '@earendil-works/pi-tui';
import { theme } from '@upup/utils';
import type { SlashCommand } from '../../commands/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 命令预览配置
 */
export interface CommandPreviewConfig {
  /** 标题文本 */
  title?: string;
  /** 是否显示边框 */
  bordered?: boolean;
  /** 最大高度（行数） */
  maxLines?: number;
  /** 是否显示快捷键提示 */
  showShortcuts?: boolean;
  /** 是否显示使用统计 */
  showUsageStats?: boolean;
}

/**
 * 命令预览数据
 */
export interface CommandPreviewData {
  name: string;
  description: string;
  category: string;
  aliases?: string[];
  usage?: string;
  examples?: string[];
  shortcuts?: Array<{ key: string; description: string }>;
  relatedCommands?: string[];
  usageCount?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CommandPreviewConfig = {
  title: 'Command Preview',
  bordered: true,
  maxLines: 20,
  showShortcuts: true,
  showUsageStats: true,
};

// ============================================================================
// CommandPreviewPanel
// ============================================================================

export class CommandPreviewPanel extends Container {
  private config: CommandPreviewConfig;
  private currentCommand: SlashCommand | null = null;
  private titleText: Text;
  private contentLines: Text[] = [];
  private showPreview: boolean = true;

  constructor(config: Partial<CommandPreviewConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.titleText = new Text('', 0, 0);
    this.addChild(this.titleText);
  }

  /**
   * 启用/禁用预览面板
   */
  setPreviewEnabled(enabled: boolean): void {
    this.showPreview = enabled;
  }

  // ============================================================================
  // Update Methods
  // ============================================================================

  /**
   * 设置当前命令
   */
  setCommand(command: SlashCommand | null): void {
    this.currentCommand = command;
    this._updateContent();
  }

  /**
   * 更新预览配置
   */
  updateConfig(config: Partial<CommandPreviewConfig>): void {
    this.config = { ...this.config, ...config };
    this._updateContent();
  }

  /**
   * 获取当前命令
   */
  getCommand(): SlashCommand | null {
    return this.currentCommand;
  }

  // ============================================================================
  // Content Generation
  // ============================================================================

  /**
   * 生成命令预览内容
   */
  private _updateContent(): void {
    // 清除旧内容
    this.clear();

    if (!this.currentCommand) {
      this.titleText.setText(theme.muted('No command selected'));
      this.addChild(this.titleText);
      return;
    }

    const cmd = this.currentCommand;
    const data = this._extractPreviewData(cmd);

    // 标题
    const title = this.config.title || 'Command Preview';
    this.titleText.setText(theme.primary(title));
    this.addChild(this.titleText);

    // 分隔线
    this.addChild(new Text(theme.muted('─'.repeat(30)), 0, 0));

    // 命令名称
    this.addChild(new Text(theme.primary(`/${cmd.name}`), 0, 0));

    // 描述
    if (data.description) {
      this.addChild(new Text(theme.muted(data.description), 0, 0));
    }

    // 分类
    this._addLine('Category:', this._formatCategory(data.category));

    // 别名
    if (data.aliases && data.aliases.length > 0) {
      const aliasStr = data.aliases.map((a) => `/${a}`).join(', ');
      this._addLine('Aliases:', theme.info(aliasStr));
    }

    // 使用方法
    if (data.usage) {
      this.addChild(new Text('', 0, 0));
      this.addChild(new Text(theme.info(data.usage), 0, 0));
    }

    // 示例
    if (data.examples && data.examples.length > 0) {
      this.addChild(new Text('', 0, 0));
      this.addChild(new Text(theme.muted('Examples:'), 0, 0));
      for (const example of data.examples) {
        this.addChild(new Text(theme.muted(`  ${example}`), 0, 0));
      }
    }

    // 快捷键
    if (this.config.showShortcuts && data.shortcuts && data.shortcuts.length > 0) {
      this.addChild(new Text('', 0, 0));
      this.addChild(new Text(theme.muted('Shortcuts:'), 0, 0));
      for (const shortcut of data.shortcuts) {
        const keyStr = theme.key(`[${shortcut.key}]`);
        this.addChild(new Text(`${keyStr} ${theme.muted(shortcut.description)}`, 0, 0));
      }
    }

    // 相关命令
    if (data.relatedCommands && data.relatedCommands.length > 0) {
      this.addChild(new Text('', 0, 0));
      this.addChild(new Text(theme.muted('Related:'), 0, 0));
      const related = data.relatedCommands.map((c) => theme.info(`/${c}`)).join(' ');
      this.addChild(new Text(related, 0, 0));
    }

    // 使用统计
    if (this.config.showUsageStats && data.usageCount !== undefined) {
      this.addChild(new Text('', 0, 0));
      this.addChild(
        new Text(theme.muted(`Used ${data.usageCount} time${data.usageCount !== 1 ? 's' : ''}`), 0, 0),
      );
    }

    // 底部提示
    this.addChild(new Text('', 0, 0));
    this.addChild(new Text(theme.muted('Press Enter to execute · Esc to dismiss'), 0, 0));
  }

  /**
   * 添加带标签的行
   */
  private _addLine(label: string, value: string): void {
    this.addChild(new Text(`${theme.muted(label)} ${value}`, 0, 0));
  }

  /**
   * 格式化分类名称
   */
  private _formatCategory(category: string): string {
    const labels: Record<string, string> = {
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
    return labels[category] || category;
  }

  /**
   * 从命令提取预览数据
   */
  private _extractPreviewData(cmd: SlashCommand): CommandPreviewData {
    // 尝试从命令中提取别名
    const extendedCmd = cmd as { aliases?: string[]; usage?: string; examples?: string[] };

    return {
      name: cmd.name,
      description: cmd.description || 'No description',
      category: cmd.category || 'other',
      aliases: extendedCmd.aliases,
      usage: extendedCmd.usage,
      examples: extendedCmd.examples,
      shortcuts: this._getCommandShortcuts(cmd.name),
      relatedCommands: this._getRelatedCommands(cmd.name, cmd.category),
    };
  }

  /**
   * 获取命令的快捷键
   */
  private _getCommandShortcuts(commandName: string): Array<{ key: string; description: string }> {
    const shortcuts: Array<{ key: string; description: string }> = [];

    // 根据命令名称添加特定快捷键
    switch (commandName.toLowerCase()) {
      case 'help':
        shortcuts.push({ key: '/h', description: 'Show help' });
        break;
      case 'session':
        shortcuts.push({ key: '/s', description: 'Switch session' });
        break;
      case 'model':
        shortcuts.push({ key: '/m', description: 'Change model' });
        break;
      case 'clear':
        shortcuts.push({ key: '/c', description: 'Clear chat' });
        break;
      case 'settings':
        shortcuts.push({ key: '/set', description: 'Open settings' });
        break;
    }

    // 添加通用快捷键
    shortcuts.push({ key: 'Enter', description: 'Execute command' });
    shortcuts.push({ key: '↑↓', description: 'Navigate options' });
    shortcuts.push({ key: 'Esc', description: 'Dismiss' });

    return shortcuts;
  }

  /**
   * 获取相关命令
   */
  private _getRelatedCommands(
    currentName: string,
    category?: string,
  ): string[] {
    const allCommands: Record<string, string[]> = {
      core: ['help', 'clear', 'settings', 'exit'],
      plan: ['plan', 'task', 'subagent'],
      agent: ['agent', 'spawn', 'kill'],
      mcp: ['mcp', 'tools', 'status'],
      permissions: ['bypass', 'default', 'reset'],
      system: ['doctor', 'config', 'version'],
    };

    const categoryCommands = category ? allCommands[category] || [] : [];
    return categoryCommands.filter((name) => name !== currentName).slice(0, 3);
  }

  // ============================================================================
  // Render
  // ============================================================================

  render(width: number): string[] {
    // 如果没有命令，显示占位符
    if (!this.currentCommand) {
      const placeholder = theme.muted('Select a command to preview');
      return [placeholder.padEnd(width)];
    }

    return super.render(width);
  }
}

// ============================================================================
// Side-by-Side Preview Panel
// ============================================================================

/**
 * 带侧边预览的命令面板
 *
 * 左侧显示命令列表，右侧显示选中命令的预览
 */
export class CommandPaletteWithPreview extends Container {
  private commandList: Container;
  private previewPanel: CommandPreviewPanel;
  private width: number = 80;
  private showPreview: boolean = true;

  constructor(showPreview: boolean = true) {
    super();
    this.showPreview = showPreview;

    // 命令列表区域
    this.commandList = new Container();
    this.addChild(this.commandList);

    // 预览面板
    this.previewPanel = new CommandPreviewPanel({ maxLines: 30 });
    this.addChild(this.previewPanel);
  }

  /**
   * 更新命令列表
   */
  setCommands(commands: SlashCommand[], selectedIndex: number): void {
    this.commandList.clear();

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const isSelected = i === selectedIndex;

      const nameText = isSelected ? theme.primary(`/${cmd.name}`) : `/${cmd.name}`;
      const desc = cmd.description?.slice(0, 30) || '';
      const line = `${nameText}  ${theme.muted(desc)}`;

      this.commandList.addChild(new Text(line, 0, 0));
    }

    // 更新预览
    if (commands.length > 0 && selectedIndex >= 0 && selectedIndex < commands.length) {
      this.previewPanel.setCommand(commands[selectedIndex]);
    }
  }

  /**
   * 设置预览面板命令
   */
  setSelectedCommand(command: SlashCommand | null): void {
    this.previewPanel.setCommand(command);
  }

  /**
   * 更新预览配置
   */
  updatePreviewConfig(config: Partial<CommandPreviewConfig>): void {
    this.previewPanel.updateConfig(config);
  }

  /**
   * 启用/禁用预览
   */
  setShowPreview(show: boolean): void {
    this.showPreview = show;
    this.previewPanel.setPreviewEnabled(show);
  }

  render(width: number): string[] {
    if (this.showPreview) {
      // 计算分割宽度
      const listWidth = Math.floor(width * 0.5);
      const previewWidth = width - listWidth - 1; // 减去分割线

      // 渲染左侧命令列表
      const listLines = this.commandList.render(listWidth);

      // 渲染右侧预览
      const previewLines = this.previewPanel.render(previewWidth);

      // 合并行
      const result: string[] = [];
      const maxLines = Math.max(listLines.length, previewLines.length);

      for (let i = 0; i < maxLines; i++) {
        const listLine = (listLines[i] || '').padEnd(listWidth);
        const previewLine = previewLines[i] || '';
        result.push(`${listLine}│${previewLine}`);
      }

      return result;
    } else {
      return this.commandList.render(width);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建默认的命令预览面板
 */
export function createCommandPreviewPanel(
  config?: Partial<CommandPreviewConfig>,
): CommandPreviewPanel {
  return new CommandPreviewPanel(config);
}

/**
 * 创建带预览的命令面板
 */
export function createCommandPaletteWithPreview(
  showPreview: boolean = true,
): CommandPaletteWithPreview {
  return new CommandPaletteWithPreview(showPreview);
}