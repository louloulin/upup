/**
 * ModelSelector Component
 *
 * 对标 Loucode ModelSelector
 * AI模型选择浮层
 */

import { matchesKey, Key } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export interface Model {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
  supportedTools?: string[];
}

export interface ModelSelectorProps {
  /** 可用模型列表 */
  models: Model[];
  /** 当前选中模型 */
  currentModel?: string;
  /** 是否可见 */
  visible: boolean;
  /** 选择回调 */
  onSelect: (modelId: string) => void;
  /** 关闭回调 */
  onClose: () => void;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEME = {
  border: '\x1b[1;35m',        // 紫色边框
  title: '\x1b[1;37m',          // 白色标题
  modelName: '\x1b[1;36m',      // 青色模型名
  provider: '\x1b[0;90m',        // 灰色提供商
  selected: '\x1b[1;32m',        // 绿色选中
  selectedBg: '\x1b[42m',        // 绿色背景
  description: '\x1b[0;37m',      // 白色描述
  contextWindow: '\x1b[0;33m',    // 黄色上下文窗口
  reset: '\x1b[0m',
  indicator: '\x1b[1;32m',       // 绿色指示器
};

// ============================================================================
// Component
// ============================================================================

export class ModelSelector {
  private models: Model[];
  private currentModel?: string;
  private visible: boolean;
  private selectedIndex: number = 0;

  private onSelect: (modelId: string) => void;
  private onClose: () => void;

  constructor(props: ModelSelectorProps) {
    this.models = props.models;
    this.currentModel = props.currentModel;
    this.visible = props.visible;
    this.onSelect = props.onSelect;
    this.onClose = props.onClose;

    // 设置默认选中
    if (this.currentModel) {
      const idx = this.models.findIndex(m => m.id === this.currentModel);
      if (idx >= 0) this.selectedIndex = idx;
    }
  }

  /**
   * 更新模型列表
   */
  updateModels(models: Model[]): void {
    this.models = models;
    if (this.selectedIndex >= models.length) {
      this.selectedIndex = Math.max(0, models.length - 1);
    }
  }

  /**
   * 设置当前模型
   */
  setCurrentModel(modelId: string): void {
    this.currentModel = modelId;
    const idx = this.models.findIndex(m => m.id === modelId);
    if (idx >= 0) this.selectedIndex = idx;
  }

  /**
   * 设置可见性
   */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible && this.currentModel) {
      const idx = this.models.findIndex(m => m.id === this.currentModel);
      if (idx >= 0) this.selectedIndex = idx;
    }
  }

  /**
   * 获取当前选中模型
   */
  getSelectedModel(): Model | undefined {
    return this.models[this.selectedIndex];
  }

  /**
   * 处理输入
   */
  handleInput(data: string): void {
    if (!this.visible) return;

    // 上方向键
    if (matchesKey(data, Key.up)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      return;
    }

    // 下方向键
    if (matchesKey(data, Key.down)) {
      this.selectedIndex = Math.min(this.models.length - 1, this.selectedIndex + 1);
      return;
    }

    // Page Up
    if (matchesKey(data, Key.pageUp)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 5);
      return;
    }

    // Page Down
    if (matchesKey(data, Key.pageDown)) {
      this.selectedIndex = Math.min(this.models.length - 1, this.selectedIndex + 5);
      return;
    }

    // Enter - 确认选择
    if (matchesKey(data, Key.enter)) {
      const model = this.models[this.selectedIndex];
      if (model) {
        this.onSelect(model.id);
      }
      return;
    }

    // Escape - 关闭
    if (matchesKey(data, Key.escape)) {
      this.onClose();
      return;
    }

    // 数字键快速选择
    const num = parseInt(data);
    if (!isNaN(num) && num >= 1 && num <= this.models.length) {
      this.selectedIndex = num - 1;
      const model = this.models[this.selectedIndex];
      if (model) {
        this.onSelect(model.id);
      }
    }
  }

  /**
   * 截断文本
   */
  private truncate(text: string, maxLen: number): string {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + '...';
  }

  /**
   * 渲染模型项
   */
  private renderModel(model: Model, index: number, width: number): string {
    const isSelected = index === this.selectedIndex;
    const isCurrent = model.id === this.currentModel;

    const indicator = isSelected ? `${THEME.indicator}▶${THEME.reset} ` : '  ';
    const currentMark = isCurrent ? ` ${THEME.selected}(current)${THEME.reset}` : '';
    const name = `${THEME.modelName}${model.name}${THEME.reset}`;
    const provider = `${THEME.provider}(${model.provider})${THEME.reset}`;

    const header = `${indicator}${index + 1}. ${name} ${provider}${currentMark}`;

    if (!isSelected) {
      return header + ' '.repeat(Math.max(0, width - header.length - 2)) + ' ';
    }

    // 选中时显示详细信息
    const lines: string[] = [header];

    if (model.description) {
      const desc = `     ${THEME.description}${this.truncate(model.description, width - 10)}${THEME.reset}`;
      lines.push(desc);
    }

    if (model.contextWindow) {
      const contextStr = `     Context: ${THEME.contextWindow}${this.formatContextWindow(model.contextWindow)}${THEME.reset}`;
      lines.push(contextStr);
    }

    return lines.join('\n');
  }

  /**
   * 格式化上下文窗口
   */
  private formatContextWindow(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M tokens`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}K tokens`;
    }
    return `${tokens} tokens`;
  }

  /**
   * 渲染组件
   */
  render(width: number): string[] {
    if (!this.visible) {
      return [];
    }

    const lines: string[] = [];
    const innerWidth = Math.min(width, 70);
    const padding = Math.floor((width - innerWidth) / 2);

    // 标题
    lines.push(' '.repeat(padding) + `${THEME.border}┌${'─'.repeat(innerWidth - 2)}┐${THEME.reset}`);
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset} ${THEME.title}🤖 Select Model${THEME.reset}${' '.repeat(Math.max(0, innerWidth - 18))}${THEME.border}│${THEME.reset}`);
    lines.push(' '.repeat(padding) + `${THEME.border}├${'─'.repeat(innerWidth - 2)}┤${THEME.reset}`);

    // 模型列表
    const maxVisibleItems = 8;
    let startIndex = 0;

    if (this.models.length > maxVisibleItems) {
      // 居中显示选中项
      startIndex = Math.max(0, Math.min(
        this.selectedIndex - Math.floor(maxVisibleItems / 2),
        this.models.length - maxVisibleItems
      ));
    }

    const visibleModels = this.models.slice(startIndex, startIndex + maxVisibleItems);

    for (let i = 0; i < visibleModels.length; i++) {
      const modelIndex = startIndex + i;
      const model = visibleModels[i];
      const isSelected = modelIndex === this.selectedIndex;

      if (isSelected) {
        lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}${THEME.selectedBg}${' '.repeat(innerWidth - 2)}${THEME.reset}${THEME.border}│${THEME.reset}`);
      }

      const modelLine = this.renderModel(model, modelIndex, innerWidth - 4);
      for (const line of modelLine.split('\n')) {
        const content = line.padEnd(innerWidth - 4);
        if (isSelected) {
          lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}${THEME.selectedBg}${content}${THEME.reset}${THEME.border}│${THEME.reset}`);
        } else {
          lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset} ${content} ${THEME.border}│${THEME.reset}`);
        }
      }

      if (isSelected) {
        lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}${THEME.selectedBg}${' '.repeat(innerWidth - 2)}${THEME.reset}${THEME.border}│${THEME.reset}`);
      }
    }

    // 滚动提示
    if (this.models.length > maxVisibleItems) {
      const scrollInfo = `  ↑↓ Navigate  Enter Select  Esc Close`;
      lines.push(' '.repeat(padding) + `${THEME.border}├${'─'.repeat(innerWidth - 2)}┤${THEME.reset}`);
      lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}${THEME.provider}${scrollInfo}${' '.repeat(Math.max(0, innerWidth - 4 - scrollInfo.length))}${THEME.border}│${THEME.reset}`);
    }

    // 底部
    lines.push(' '.repeat(padding) + `${THEME.border}└${'─'.repeat(innerWidth - 2)}┘${THEME.reset}`);

    return lines;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createModelSelector(props: ModelSelectorProps): ModelSelector {
  return new ModelSelector(props);
}

// DEFAULT_MODELS removed: hand-rolled provider/model data. The active model
// selector (packages/pi-tui-app/src/components/select-list.ts) reads
// directly from @upup/utils PROVIDERS, which is now Pi-catalog-derived.
